import json
import time
from pathlib import Path
from PySide6.QtCore import QEvent, QStandardPaths, Qt, QTimer, QUrl
from PySide6.QtGui import QAction, QDesktopServices, QIcon, QKeySequence, QShortcut
from PySide6.QtWebEngineCore import QWebEngineDownloadRequest, QWebEnginePage
from PySide6.QtWidgets import (
    QApplication, QFileDialog, QHBoxLayout, QInputDialog, QLabel, QLineEdit, QListWidget,
    QListWidgetItem, QMainWindow, QMenu, QMessageBox, QPushButton, QSizePolicy, QSplitter,
    QStackedWidget, QTabBar, QToolBar, QVBoxLayout, QWidget,
)
from .model import generate_password, origin_of, resolve_input
from .pages import ErrorPage, ListPage, LockPage, NewTabPage, PrivacyPage, SearchPage, SettingsPage, WelcomePage
from .paths import ASSETS
from .theme import stylesheet
from .web import SreonView, open_path

class Omnibox(QLineEdit):
    def __init__(self, window):
        super().__init__()
        self.window = window
        self.setPlaceholderText("Search or enter address")
        self.setClearButtonEnabled(True)
        self.setObjectName("omnibox")

    def keyPressEvent(self, event):
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self.window.submit(self.text(), bool(event.modifiers() & Qt.KeyboardModifier.ShiftModifier))
            return
        super().keyPressEvent(event)
        self.window.suggest(self.text())

class Tab:
    def __init__(self, window):
        self.window = window
        self.container = QStackedWidget()
        self.view = None
        self.url = "sreon://newtab"
        self.title = "New tab"
        self.pinned = False
        self.muted = False
        self.loading = False
        self.history = []

class BrowserWindow(QMainWindow):
    def __init__(self, session, private=False, url=None):
        super().__init__()
        self.session = session
        self.private = private
        self.workspace = session.store.workspaces()[0]["id"]
        self.tabs = []
        self.closed = []
        self.locked = False
        self.welcome = None
        self.setWindowTitle("Sreon" + (" — Private" if private else ""))
        icon = QIcon(str(ASSETS / "mark.png"))
        if not icon.isNull():
            self.setWindowIcon(icon)
        self.resize(1200, 780)
        self._chrome()
        self._menus()
        self._keys()
        self.apply_chrome()
        restored = False
        if not private and session.settings["restore_session"]:
            restored = self._restore()
        if not restored:
            self.open_internal("newtab" if not url else None)
            if url:
                self.open_url(url)
        if not session.settings["welcome_seen"] and not private:
            self._welcome()

    def profile(self):
        return self.session.private_profile if self.private else self.session.profile

    def _chrome(self):
        self.root = QWidget()
        self.root.setObjectName("root")
        self.setCentralWidget(self.root)
        self.shell = QVBoxLayout(self.root)
        self.shell.setContentsMargins(0, 0, 0, 0)
        self.shell.setSpacing(0)
        self.tabbar = QTabBar()
        self.tabbar.setMovable(True)
        self.tabbar.setTabsClosable(True)
        self.tabbar.setExpanding(False)
        self.tabbar.setDocumentMode(True)
        self.tabbar.currentChanged.connect(self._switch)
        self.tabbar.tabCloseRequested.connect(self.close_tab)
        self.tabbar.tabMoved.connect(self._moved)
        self.tabbar.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.tabbar.customContextMenuRequested.connect(self._tab_menu)
        self.toolbar = QToolBar()
        self.toolbar.setMovable(False)
        self.toolbar.setFloatable(False)
        self.back = self.toolbar.addAction("Back", self.back_tab)
        self.forward = self.toolbar.addAction("Forward", self.forward_tab)
        self.reload = self.toolbar.addAction("Reload", self.reload_tab)
        self.omnibox = Omnibox(self)
        self.toolbar.addWidget(self.omnibox)
        self.star = self.toolbar.addAction("Bookmark", self.bookmark_page)
        self.side_btn = self.toolbar.addAction("Sidebar", self.toggle_sidebar)
        self.suggest_list = QListWidget()
        self.suggest_list.hide()
        self.suggest_list.itemActivated.connect(self._pick_suggest)
        self.pages = QStackedWidget()
        self.sidebar = QListWidget()
        self.sidebar.itemActivated.connect(self._side)
        self.sidebar.itemClicked.connect(self._side)
        self.split = QSplitter()
        self.split.addWidget(self.sidebar)
        self.split.addWidget(self.pages)
        self.split.setStretchFactor(1, 1)
        self.findbar = QWidget()
        find = QHBoxLayout(self.findbar)
        find.setContentsMargins(8, 4, 8, 4)
        self.find_input = QLineEdit()
        self.find_input.setPlaceholderText("Find in page")
        self.find_input.returnPressed.connect(self.find_next)
        find.addWidget(self.find_input)
        next_btn = QPushButton("Next")
        next_btn.clicked.connect(self.find_next)
        prev_btn = QPushButton("Previous")
        prev_btn.clicked.connect(self.find_prev)
        close_find = QPushButton("Close")
        close_find.clicked.connect(self.findbar.hide)
        find.addWidget(prev_btn)
        find.addWidget(next_btn)
        find.addWidget(close_find)
        self.findbar.hide()
        self.lock_page = LockPage(self)
        self.stage = QStackedWidget()
        self.work = QWidget()
        work = QVBoxLayout(self.work)
        work.setContentsMargins(0, 0, 0, 0)
        work.setSpacing(0)
        self.top = QWidget()
        self.top_layout = QVBoxLayout(self.top)
        self.top_layout.setContentsMargins(0, 0, 0, 0)
        self.top_layout.setSpacing(0)
        work.addWidget(self.top)
        work.addWidget(self.split, 1)
        work.addWidget(self.findbar)
        work.addWidget(self.suggest_list)
        self.stage.addWidget(self.work)
        self.stage.addWidget(self.lock_page)
        self.shell.addWidget(self.stage)
        self._place_chrome()

    def _place_chrome(self):
        while self.top_layout.count():
            self.top_layout.takeAt(0)
        settings = self.session.settings
        widgets = [self.tabbar, self.toolbar] if settings["toolbar_position"] == "Top" else [self.tabbar]
        if settings["tab_layout"] != "Vertical":
            for widget in widgets:
                self.top_layout.addWidget(widget)
        else:
            self.top_layout.addWidget(self.toolbar)
        if settings["toolbar_position"] == "Bottom" and settings["tab_layout"] != "Vertical":
            self.top_layout.addWidget(self.toolbar)
        self.tabbar.setShape(QTabBar.Shape.RoundedWest if settings["tab_layout"] == "Vertical" else QTabBar.Shape.RoundedNorth)
        self.sidebar.setMaximumWidth(settings["sidebar_width"])
        self.sidebar.setMinimumWidth(120 if settings["sidebar_visible"] else 0)
        self.sidebar.setVisible(settings["sidebar_visible"])
        if settings["sidebar_position"] == "Right":
            self.split.insertWidget(1, self.sidebar)
        else:
            self.split.insertWidget(0, self.sidebar)
        self.sidebar.clear()
        for name in settings["sections"]:
            self.sidebar.addItem(name)

    def _menus(self):
        file_menu = self.menuBar().addMenu("File")
        file_menu.addAction("New tab", "Ctrl+T", lambda: self.open_internal("newtab"))
        file_menu.addAction("New window", "Ctrl+N", lambda: self.session.open_window(False))
        file_menu.addAction("New private window", "Ctrl+Shift+N", lambda: self.session.open_window(True))
        file_menu.addAction("Close tab", "Ctrl+W", lambda: self.close_tab(self.tabbar.currentIndex()))
        file_menu.addSeparator()
        file_menu.addAction("Lock", "Ctrl+Shift+L", self.lock_window)
        file_menu.addAction("Quit", QKeySequence.StandardKey.Quit, QApplication.quit)
        edit = self.menuBar().addMenu("Edit")
        edit.addAction("Find", "Ctrl+F", self.show_find)
        view = self.menuBar().addMenu("View")
        view.addAction("Reload", "Ctrl+R", self.reload_tab)
        view.addAction("Stop", "Esc", self.stop_tab)
        view.addAction("Actual size", "Ctrl+0", lambda: self._zoom(1.0))
        view.addAction("Zoom in", "Ctrl+=", lambda: self._zoom(None, 1.1))
        view.addAction("Zoom out", "Ctrl+-", lambda: self._zoom(None, 0.9))
        view.addAction("Sidebar", "Ctrl+Shift+B", self.toggle_sidebar)
        view.addAction("Full screen", QKeySequence.StandardKey.FullScreen, self.showFullScreen)
        history = self.menuBar().addMenu("History")
        history.addAction("Back", QKeySequence.StandardKey.Back, self.back_tab)
        history.addAction("Forward", QKeySequence.StandardKey.Forward, self.forward_tab)
        history.addAction("Home", "Alt+Home", lambda: self.open_internal("newtab"))
        history.addAction("Show history", "Ctrl+H", lambda: self.open_internal("history"))
        history.addAction("Reopen closed tab", "Ctrl+Shift+T", self.reopen)
        marks = self.menuBar().addMenu("Bookmarks")
        marks.addAction("Bookmark this page", "Ctrl+D", self.bookmark_page)
        marks.addAction("Add to reading list", self.reading_list)
        marks.addAction("Show bookmarks", lambda: self.open_internal("bookmarks"))
        win = self.menuBar().addMenu("Window")
        win.addAction("Downloads", "Ctrl+J", lambda: self.open_internal("downloads"))
        win.addAction("Settings", lambda: self.open_internal("settings"))
        win.addAction("Passwords", lambda: self.open_internal("passwords"))

    def _keys(self):
        for index in range(8):
            QShortcut(QKeySequence(f"Ctrl+{index+1}"), self, lambda i=index: self.tabbar.setCurrentIndex(i))
        QShortcut(QKeySequence("Ctrl+9"), self, lambda: self.tabbar.setCurrentIndex(self.tabbar.count() - 1))
        QShortcut(QKeySequence("Ctrl+L"), self, lambda: self.omnibox.setFocus())
        QShortcut(QKeySequence("Ctrl+M"), self, self.mute_tab)
        QShortcut(QKeySequence("Ctrl+Shift+N"), self, lambda: self.session.open_window(True))

    def apply_chrome(self):
        self.setStyleSheet(stylesheet(self.session.settings))
        self._place_chrome()
        self.omnibox.setMinimumHeight(28 if self.session.settings["density"] == "Compact" else 34)
        self.session.apply_cookies()

    def current(self):
        index = self.tabbar.currentIndex()
        return self.tabs[index] if 0 <= index < len(self.tabs) else None

    def _add(self, tab, title):
        self.tabs.append(tab)
        index = self.tabbar.addTab(title)
        self.pages.addWidget(tab.container)
        self.tabbar.setCurrentIndex(index)
        return tab

    def open_internal(self, name, extra=None):
        if name is None:
            return None
        tab = Tab(self)
        factories = {
            "newtab": lambda: NewTabPage(self),
            "settings": lambda: SettingsPage(self),
            "privacy": lambda: PrivacyPage(self),
            "bookmarks": lambda: ListPage(self, "Bookmarks"),
            "history": lambda: ListPage(self, "History"),
            "downloads": lambda: ListPage(self, "Downloads"),
            "reading": lambda: ListPage(self, "Reading list"),
            "passwords": lambda: ListPage(self, "Passwords"),
        }
        if extra is not None:
            page = extra
        elif name in factories:
            page = factories[name]()
        else:
            page = ErrorPage(self, "Unknown Sreon page")
            name = "error"
        tab.container.addWidget(page)
        tab.url = "sreon://" + ("newtab" if name == "newtab" else name)
        tab.title = {"newtab": "New tab", "settings": "Settings", "privacy": "Privacy", "bookmarks": "Bookmarks", "history": "History", "downloads": "Downloads", "reading": "Reading list", "passwords": "Passwords", "search": extra.query if extra is not None and hasattr(extra, "query") else "Search"}.get(name, "Sreon")
        self._add(tab, tab.title)
        self.omnibox.setText("" if name == "newtab" else tab.url)
        self._persist()
        return tab

    def open_url(self, url, new_tab=False, tab=None):
        kind, value = resolve_input(url) if not url.startswith(("http://", "https://", "about:")) else ("url", url)
        if kind == "search":
            if new_tab or tab is None:
                return self.open_internal("search", SearchPage(self, value))
            return self._replace(tab, SearchPage(self, value), "sreon://search", value)
        if kind == "internal":
            return self.open_internal(value) if new_tab or tab is None else self.open_internal(value)
        if kind == "error":
            return self.show_error(value)
        if kind != "url" and not url.startswith("about:"):
            return self.show_error("This address cannot be opened")
        target = tab or (None if new_tab else self.current())
        if target is None or target.view is None or new_tab:
            tab = Tab(self)
            tab.view = SreonView(self.profile(), self)
            tab.container.addWidget(tab.view)
            tab.url = value
            tab.title = value
            self._add(tab, "Loading")
            tab.view.setUrl(QUrl(value))
            self.omnibox.setText(value)
            self._persist()
            return tab
        target.view.setUrl(QUrl(value))
        target.url = value
        self.omnibox.setText(value)
        return target

    def _replace(self, tab, widget, url, title):
        while tab.container.count():
            old = tab.container.widget(0)
            tab.container.removeWidget(old)
            old.deleteLater()
        tab.view = None
        tab.container.addWidget(widget)
        tab.url = url
        tab.title = title
        self.tabbar.setTabText(self.tabs.index(tab), title[:40])
        self.omnibox.setText(url)
        return tab

    def submit(self, text, force_search=False):
        if force_search and text.strip():
            self.open_internal("search", SearchPage(self, text.strip()))
            return
        kind, value = resolve_input(text)
        if kind == "url":
            self.open_url(value)
        elif kind == "search":
            self.open_internal("search", SearchPage(self, value))
        elif kind == "internal":
            self.open_internal(value)
        else:
            self.show_error(value)
        self.suggest_list.hide()

    def suggest(self, text):
        text = text.strip().lower()
        self.suggest_list.clear()
        if len(text) < 2:
            self.suggest_list.hide()
            return
        seen = set()
        for row in self.session.store.history(text)[:6] + self.session.store.bookmarks(self.workspace, text)[:4]:
            url = row["url"]
            if url in seen:
                continue
            seen.add(url)
            item = QListWidgetItem((row.get("title") or url) + "\n" + url)
            item.setData(Qt.ItemDataRole.UserRole, url)
            self.suggest_list.addItem(item)
        self.suggest_list.setVisible(self.suggest_list.count() > 0)

    def _pick_suggest(self, item):
        self.suggest_list.hide()
        self.open_url(item.data(Qt.ItemDataRole.UserRole))

    def _switch(self, index):
        if 0 <= index < len(self.tabs):
            self.pages.setCurrentWidget(self.tabs[index].container)
            self.omnibox.setText("" if self.tabs[index].url == "sreon://newtab" else self.tabs[index].url)
            self._nav_state()

    def _moved(self, src, dst):
        self.tabs.insert(dst, self.tabs.pop(src))
        self._persist()

    def close_tab(self, index):
        if index < 0 or index >= len(self.tabs):
            return
        tab = self.tabs[index]
        if tab.pinned:
            return
        self.closed.append({"url": tab.url, "title": tab.title})
        self.tabs.pop(index)
        self.tabbar.removeTab(index)
        self.pages.removeWidget(tab.container)
        tab.container.deleteLater()
        if not self.tabs:
            self.open_internal("newtab")
        self._persist()

    def reopen(self):
        if self.closed:
            item = self.closed.pop()
            self.open_url(item["url"], new_tab=True)

    def duplicate_tab(self, index):
        if 0 <= index < len(self.tabs):
            self.open_url(self.tabs[index].url, new_tab=True)

    def pin_tab(self, index):
        if 0 <= index < len(self.tabs):
            tab = self.tabs[index]
            tab.pinned = not tab.pinned
            self.tabbar.setTabButton(index, QTabBar.ButtonPosition.RightSide, None if tab.pinned else self.tabbar.tabButton(index, QTabBar.ButtonPosition.RightSide))
            self.tabbar.setTabText(index, ("• " if tab.pinned else "") + tab.title[:40])

    def mute_tab(self):
        tab = self.current()
        if tab and tab.view:
            tab.muted = not tab.muted
            tab.view.page().setAudioMuted(tab.muted)

    def _tab_menu(self, pos):
        index = self.tabbar.tabAt(pos)
        if index < 0:
            return
        menu = QMenu(self)
        menu.addAction("New tab", lambda: self.open_internal("newtab"))
        menu.addAction("Duplicate", lambda: self.duplicate_tab(index))
        menu.addAction("Pin" if not self.tabs[index].pinned else "Unpin", lambda: self.pin_tab(index))
        menu.addAction("Mute", self.mute_tab)
        menu.addAction("Close", lambda: self.close_tab(index))
        menu.addAction("Reopen closed tab", self.reopen)
        menu.exec(self.tabbar.mapToGlobal(pos))

    def back_tab(self):
        tab = self.current()
        if tab and tab.view:
            tab.view.back()

    def forward_tab(self):
        tab = self.current()
        if tab and tab.view:
            tab.view.forward()

    def reload_tab(self):
        tab = self.current()
        if tab and tab.view:
            tab.view.reload()
        elif tab:
            self.open_url(tab.url)

    def stop_tab(self):
        tab = self.current()
        if tab and tab.view:
            tab.view.stop()

    def _zoom(self, absolute=None, factor=1.0):
        tab = self.current()
        if tab and tab.view:
            tab.view.setZoomFactor(absolute if absolute else max(0.5, min(3.0, tab.view.zoomFactor() * factor)))

    def _nav_state(self):
        tab = self.current()
        history = tab.view.history() if tab and tab.view else None
        self.back.setEnabled(bool(history and history.canGoBack()))
        self.forward.setEnabled(bool(history and history.canGoForward()))

    def tab_title(self, view, title):
        for index, tab in enumerate(self.tabs):
            if tab.view is view:
                tab.title = title or tab.url
                self.tabbar.setTabText(index, ("• " if tab.pinned else "") + tab.title[:40])
                self._persist()

    def tab_url(self, view, url):
        for tab in self.tabs:
            if tab.view is view:
                tab.url = url.toString()
                if tab is self.current():
                    self.omnibox.setText(tab.url)
                    self._nav_state()

    def tab_icon(self, view, icon):
        for index, tab in enumerate(self.tabs):
            if tab.view is view:
                self.tabbar.setTabIcon(index, icon)

    def tab_progress(self, view, value):
        tab = self.current()
        if tab and tab.view is view:
            self.reload.setText("Stop" if 0 < value < 100 else "Reload")

    def show_error(self, message, view=None):
        tab = self.current()
        if view:
            for item in self.tabs:
                if item.view is view:
                    tab = item
        if tab:
            self._replace(tab, ErrorPage(self, message), tab.url, "Error")
        else:
            self.open_internal("error", ErrorPage(self, message))

    def bookmark_page(self):
        tab = self.current()
        if not tab:
            return
        self.session.store.add_bookmark(self.workspace, tab.title, tab.url)
        self.statusBar().showMessage("Bookmarked", 2000)

    def reading_list(self):
        tab = self.current()
        if not tab or not tab.url.startswith(("https://", "http://")):
            return
        self.session.store.read_add(tab.title, tab.url)
        self.statusBar().showMessage("Saved to reading list", 2000)

    def download_action(self, identity, action):
        for record in self.session.downloads:
            item = record.get("item")
            if item is None or id(item) != identity:
                continue
            if action == "pause" and not item.isPaused():
                item.pause()
            elif action == "resume" and item.isPaused():
                item.resume()
            elif action == "cancel":
                item.cancel()
            elif action == "open" and record.get("path"):
                open_path(record["path"])
            elif action == "show" and record.get("path"):
                open_path(Path(record["path"]).parent)
            self._progress(record, item)
            return

    def toggle_sidebar(self):
        self.session.settings["sidebar_visible"] = not self.session.settings["sidebar_visible"]
        self.session.store.save_settings(self.session.settings)
        self.apply_chrome()

    def _side(self, item):
        name = item.text()
        mapping = {"Bookmarks": "bookmarks", "History": "history", "Downloads": "downloads", "Reading list": "reading", "Passwords": "passwords", "Privacy": "privacy", "Settings": "settings"}
        self.open_internal(mapping.get(name, "settings"))

    def show_find(self):
        self.findbar.show()
        self.find_input.setFocus()

    def find_next(self):
        tab = self.current()
        if tab and tab.view:
            tab.view.findText(self.find_input.text())

    def find_prev(self):
        tab = self.current()
        if tab and tab.view:
            tab.view.findText(self.find_input.text(), QWebEnginePage.FindFlag.FindBackward)

    def _download(self, item):
        if item.state() != QWebEngineDownloadRequest.DownloadState.DownloadRequested:
            return
        folder = self.session.settings.get("download_path") or QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation)
        item.setDownloadDirectory(folder)
        item.accept()
        record = {"label": f"{item.downloadFileName()} — starting", "path": str(Path(folder) / item.downloadFileName()), "item": item}
        self.session.downloads.append(record)
        item.receivedBytesChanged.connect(lambda rec=record, req=item: self._progress(rec, req))
        item.isFinishedChanged.connect(lambda rec=record, req=item: self._progress(rec, req))
        self.statusBar().showMessage("Downloading " + item.downloadFileName(), 3000)

    def _progress(self, record, item):
        received = item.receivedBytes()
        total = item.totalBytes()
        state = item.state().name
        speed = ""
        record["label"] = f"{item.downloadFileName()} — {state} {received}/{total if total>0 else '?'}"
        record["path"] = str(Path(item.downloadDirectory()) / item.downloadFileName())

    def open_download_folder(self):
        folder = self.session.settings.get("download_path") or QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation)
        open_path(folder)

    def fill_password(self, identity):
        try:
            row = self.session.vault.reveal(identity)
        except ValueError as error:
            QMessageBox.warning(self, "Passwords", str(error))
            return
        tab = self.current()
        if not tab or not tab.view:
            QMessageBox.information(self, "Passwords", f"{row['username']}\n{row['origin']}")
            return
        user = json.dumps(row["username"])
        password = json.dumps(row["password"])
        tab.view.page().runJavaScript(
            f"(function(){{var u=document.querySelector('input[type=email],input[name=username],input[name=user],input[type=text]');var p=document.querySelector('input[type=password]');if(u){{u.value={user};u.dispatchEvent(new Event('input',{{bubbles:true}}));}}if(p){{p.value={password};p.dispatchEvent(new Event('input',{{bubbles:true}}));}}}})();"
        )

    def lock_window(self):
        if not self.session.vault.has_pin():
            QMessageBox.information(self, "Lock", "Set a PIN in Settings first.")
            return
        self.session.vault.lock()
        self.locked = True
        self.stage.setCurrentWidget(self.lock_page)
        self.menuBar().setEnabled(False)

    def unlock_window(self):
        self.locked = False
        self.stage.setCurrentWidget(self.work)
        self.menuBar().setEnabled(True)

    def eventFilter(self, obj, event):
        if self.locked and event.type() == QEvent.Type.ShortcutOverride:
            event.accept()
            return True
        return super().eventFilter(obj, event)

    def _welcome(self):
        self.welcome = WelcomePage(self)
        self.pages.addWidget(self.welcome)
        self.pages.setCurrentWidget(self.welcome)

    def finish_welcome(self):
        self.session.settings["welcome_seen"] = True
        self.session.store.save_settings(self.session.settings)
        if self.welcome:
            self.pages.removeWidget(self.welcome)
            self.welcome.deleteLater()
            self.welcome = None
        if self.tabs:
            self.pages.setCurrentWidget(self.tabs[self.tabbar.currentIndex()].container)

    def _persist(self):
        if self.private:
            return
        payload = [{"url": tab.url, "title": tab.title, "pinned": tab.pinned} for tab in self.tabs]
        self.session.store.save_session(self.workspace, payload, False)

    def _restore(self):
        rows = self.session.store.session(self.workspace)
        if not rows:
            return False
        for row in rows[:20]:
            url = row.get("url", "sreon://newtab")
            if url.startswith("sreon://"):
                self.open_internal(url.split("://", 1)[-1] or "newtab")
            else:
                self.open_url(url, new_tab=True)
        return True

    def closeEvent(self, event):
        self._persist()
        self.session.forget(self)
        event.accept()
