import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from .model import clean_settings

class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, theme TEXT NOT NULL DEFAULT 'Sreon Purple');
        CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, folder TEXT NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, visited REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS history_date ON history(visited DESC);
        CREATE TABLE IF NOT EXISTS reading (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, is_read INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sessions (workspace TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS secrets (id INTEGER PRIMARY KEY CHECK(id=1), pin TEXT NOT NULL DEFAULT '', vault TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS permissions (origin TEXT NOT NULL, kind TEXT NOT NULL, allowed INTEGER NOT NULL, PRIMARY KEY(origin, kind));
        """)
        if not self.db.execute("SELECT 1 FROM workspaces").fetchone():
            self.db.execute("INSERT INTO workspaces(id,name,icon) VALUES('personal','Personal','◈')")
        if not self.db.execute("SELECT 1 FROM secrets WHERE id=1").fetchone():
            self.db.execute("INSERT INTO secrets(id,pin,vault) VALUES(1,'','')")
        self.db.commit()

    def settings(self):
        with self.lock:
            row = self.db.execute("SELECT value FROM settings WHERE id=1").fetchone()
            try:
                return clean_settings(json.loads(row[0])) if row else clean_settings({})
            except (ValueError, TypeError):
                return clean_settings({})

    def save_settings(self, value):
        with self.lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO settings VALUES(1,?)", (json.dumps(clean_settings(value)),))

    def workspaces(self):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM workspaces ORDER BY rowid")]

    def add_workspace(self, name):
        name = name.strip()[:60]
        if not name:
            raise ValueError("Enter a workspace name")
        identity = uuid.uuid4().hex
        with self.lock, self.db:
            self.db.execute("INSERT INTO workspaces(id,name,icon) VALUES(?,?,?)", (identity, name, "◈"))
        return identity

    def rename_workspace(self, identity, name):
        with self.lock, self.db:
            if name.strip():
                self.db.execute("UPDATE workspaces SET name=? WHERE id=?", (name.strip()[:60], identity))

    def delete_workspace(self, identity):
        with self.lock, self.db:
            count = self.db.execute("SELECT COUNT(*) FROM workspaces").fetchone()[0]
            if count <= 1 or identity == "personal":
                raise ValueError("Keep at least one workspace")
            self.db.execute("DELETE FROM workspaces WHERE id=?", (identity,))
            self.db.execute("DELETE FROM sessions WHERE workspace=?", (identity,))

    def history_add(self, title, url, private=False):
        if private or not url.startswith(("https://", "http://")):
            return
        with self.lock, self.db:
            self.db.execute("INSERT INTO history(title,url,visited) VALUES(?,?,?)", (title[:500], url[:8192], time.time()))
            self.db.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY visited DESC LIMIT 20000)")

    def history(self, query=""):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM history WHERE title LIKE ? OR url LIKE ? ORDER BY visited DESC LIMIT 500", ("%" + query + "%", "%" + query + "%"))]

    def frequent(self):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT title,url,COUNT(*) AS visits FROM history GROUP BY url ORDER BY visits DESC, MAX(visited) DESC LIMIT 8")]

    def delete_history(self, identity):
        with self.lock, self.db:
            self.db.execute("DELETE FROM history WHERE id=?", (identity,))

    def clear_history(self, since=0):
        with self.lock, self.db:
            self.db.execute("DELETE FROM history WHERE visited>=?", (since,))

    def add_bookmark(self, workspace, title, url, folder=""):
        identity = uuid.uuid4().hex
        with self.lock, self.db:
            self.db.execute("INSERT INTO bookmarks VALUES(?,?,?,?,?,?)", (identity, workspace, title[:500], url[:8192], folder[:100], int(time.time() * 1000)))
        return identity

    def bookmarks(self, workspace, query=""):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM bookmarks WHERE workspace=? AND (title LIKE ? OR url LIKE ? OR folder LIKE ?) ORDER BY folder,position", (workspace, *["%" + query + "%"] * 3))]

    def edit_bookmark(self, identity, title, url, folder):
        with self.lock, self.db:
            self.db.execute("UPDATE bookmarks SET title=?,url=?,folder=? WHERE id=?", (title[:500], url[:8192], folder[:100], identity))

    def delete_bookmark(self, identity):
        with self.lock, self.db:
            self.db.execute("DELETE FROM bookmarks WHERE id=?", (identity,))

    def reorder_bookmarks(self, identities):
        with self.lock, self.db:
            for position, identity in enumerate(identities):
                self.db.execute("UPDATE bookmarks SET position=? WHERE id=?", (position, identity))

    def save_session(self, workspace, tabs, private=False):
        if private:
            return
        safe = [tab for tab in tabs[:100] if isinstance(tab, dict) and isinstance(tab.get("url"), str) and tab["url"].startswith(("https://", "http://", "sreon://"))]
        with self.lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO sessions VALUES(?,?)", (workspace, json.dumps(safe)))

    def session(self, workspace):
        with self.lock:
            row = self.db.execute("SELECT value FROM sessions WHERE workspace=?", (workspace,)).fetchone()
            try:
                return json.loads(row[0])[:100] if row else []
            except (ValueError, TypeError):
                return []

    def reading(self, query=""):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM reading WHERE title LIKE ? OR url LIKE ? ORDER BY rowid DESC", ("%" + query + "%", "%" + query + "%"))]

    def read_add(self, title, url):
        with self.lock, self.db:
            self.db.execute("INSERT OR IGNORE INTO reading(id,title,url) VALUES(?,?,?)", (uuid.uuid4().hex, title[:500], url[:8192]))

    def read_update(self, identity, read):
        with self.lock, self.db:
            self.db.execute("UPDATE reading SET is_read=? WHERE id=?", (int(read), identity))

    def read_remove(self, identity):
        with self.lock, self.db:
            self.db.execute("DELETE FROM reading WHERE id=?", (identity,))

    def pin_record(self):
        with self.lock:
            row = self.db.execute("SELECT pin,vault FROM secrets WHERE id=1").fetchone()
            return (row["pin"] if row else "", row["vault"] if row else "")

    def save_pin(self, pin):
        with self.lock, self.db:
            self.db.execute("UPDATE secrets SET pin=? WHERE id=1", (pin,))

    def save_vault(self, vault):
        with self.lock, self.db:
            self.db.execute("UPDATE secrets SET vault=? WHERE id=1", (vault,))

    def permission(self, origin, kind):
        with self.lock:
            row = self.db.execute("SELECT allowed FROM permissions WHERE origin=? AND kind=?", (origin, kind)).fetchone()
            return None if row is None else bool(row[0])

    def set_permission(self, origin, kind, allowed):
        with self.lock, self.db:
            self.db.execute("INSERT OR REPLACE INTO permissions VALUES(?,?,?)", (origin, kind, int(allowed)))

    def permissions(self):
        with self.lock:
            return [dict(row) for row in self.db.execute("SELECT * FROM permissions ORDER BY origin")]

    def delete_permission(self, origin, kind):
        with self.lock, self.db:
            self.db.execute("DELETE FROM permissions WHERE origin=? AND kind=?", (origin, kind))

    def reset_appearance(self):
        current = self.settings()
        keep = {key: current[key] for key in current if key not in {"theme", "mode", "accent", "background", "foreground", "panel", "radius", "density", "font_size", "photo"}}
        keep.update({"theme": "Sreon Purple", "mode": "System"})
        self.save_settings(keep)

    def reset_layout(self):
        from .model import DEFAULTS
        current = self.settings()
        current.update({"sidebar_width": 220, "sidebar_position": "Left", "sidebar_visible": True, "tab_layout": "Top", "toolbar_position": "Top", "density": "Comfortable", "sections": list(DEFAULTS["sections"])})
        self.save_settings(current)

    def reset_everything(self):
        with self.lock, self.db:
            self.db.execute("DELETE FROM settings")
            self.db.execute("DELETE FROM history")
            self.db.execute("DELETE FROM bookmarks")
            self.db.execute("DELETE FROM reading")
            self.db.execute("DELETE FROM sessions")
            self.db.execute("DELETE FROM permissions")
            self.db.execute("UPDATE secrets SET pin='',vault='' WHERE id=1")

    def close(self):
        with self.lock:
            self.db.close()
