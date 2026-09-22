from datetime import datetime
from pathlib import Path
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QCheckBox, QComboBox, QFileDialog, QFormLayout, QFrame, QHBoxLayout, QLabel,
    QLineEdit, QListWidget, QListWidgetItem, QMenu, QMessageBox, QPushButton, QScrollArea,
    QSpinBox, QVBoxLayout, QWidget,
)
from .model import PRESETS, clean_settings, export_theme, generate_password, import_theme, origin_of
from .paths import ASSETS

def card(title, body=""):
    frame = QFrame()
    frame.setObjectName("card")
    layout = QVBoxLayout(frame)
    heading = QLabel(title)
    heading.setObjectName("title")
    heading.setWordWrap(True)
    layout.addWidget(heading)
    if body:
        note = QLabel(body)
        note.setObjectName("muted")
        note.setWordWrap(True)
        layout.addWidget(note)
    return frame, layout

def wrap(widget):
    area = QScrollArea()
    area.setWidgetResizable(True)
    area.setFrameShape(QFrame.Shape.NoFrame)
    area.setWidget(widget)
    return area

class NewTabPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.window = window
        root = QVBoxLayout(self)
        root.setContentsMargins(48, 36, 48, 36)
        self.mark = QLabel()
        self.mark.setAlignment(Qt.AlignmentFlag.AlignCenter)
        pixmap = QPixmap(str(ASSETS / "mark.png"))
        if not pixmap.isNull():
            self.mark.setPixmap(pixmap.scaledToHeight(72, Qt.TransformationMode.SmoothTransformation))
        root.addWidget(self.mark)
        self.heading = QLabel("Sreon")
        self.heading.setObjectName("title")
        self.heading.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.heading)
        self.tag = QLabel("Search privately. Browse freely.")
        self.tag.setObjectName("muted")
        self.tag.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.tag)
        self.clock = QLabel()
        self.clock.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.clock)
        self.photo = QLabel()
        self.photo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.photo)
        self.links = QListWidget()
        self.links.itemActivated.connect(self._open)
        root.addWidget(self.links)
        timer = QTimer(self)
        timer.timeout.connect(self.refresh)
        timer.start(1000)
        self.refresh()

    def refresh(self):
        settings = self.window.session.settings
        self.clock.setVisible(settings["clock"])
        self.clock.setText(datetime.now().strftime("%A, %B %d  ·  %H:%M"))
        self.tag.setVisible(settings["greeting"])
        name = settings["photo"]
        path = ASSETS / name if name != "None" else None
        if path and path.is_file():
            pix = QPixmap(str(path))
            self.photo.setPixmap(pix.scaledToWidth(720, Qt.TransformationMode.SmoothTransformation))
            self.photo.show()
        else:
            self.photo.hide()
        self.links.clear()
        for row in self.window.session.store.bookmarks(self.window.workspace)[:8]:
            item = QListWidgetItem(row["title"] or row["url"])
            item.setData(Qt.ItemDataRole.UserRole, row["url"])
            self.links.addItem(item)
        for row in self.window.session.store.frequent():
            item = QListWidgetItem(row["title"] or row["url"])
            item.setData(Qt.ItemDataRole.UserRole, row["url"])
            self.links.addItem(item)

    def _open(self, item):
        self.window.open_url(item.data(Qt.ItemDataRole.UserRole))

class SearchPage(QWidget):
    def __init__(self, window, query):
        super().__init__()
        self.window = window
        self.query = query
        self.cursor = None
        self.identity = ""
        root = QVBoxLayout(self)
        self.status = QLabel(f"Searching “{query}”")
        self.status.setWordWrap(True)
        root.addWidget(self.status)
        self.results = QListWidget()
        self.results.itemActivated.connect(self._open)
        root.addWidget(self.results)
        self.more = QPushButton("More results")
        self.more.clicked.connect(self._more)
        self.more.hide()
        root.addWidget(self.more)
        window.session.search.signals.done.connect(self._done)
        self._run()

    def _run(self, cursor=None):
        import uuid
        self.identity = uuid.uuid4().hex
        self.window.session.search.search(self.identity, self.query, "web", cursor)

    def _more(self):
        if self.cursor:
            self._run(self.cursor)

    def _done(self, identity, result, error):
        if identity != self.identity:
            return
        if error:
            self.status.setText(error)
            self.more.hide()
            return
        rows = result.get("results") if isinstance(result, dict) else None
        if not isinstance(rows, list):
            self.status.setText("The search engine returned an unexpected response.")
            return
        self.status.setText(f"Results for “{self.query}”")
        if not rows and self.results.count() == 0:
            self.status.setText("No results.")
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("url"), str):
                continue
            title = str(row.get("title") or row["url"])
            snippet = str(row.get("content") or "")
            item = QListWidgetItem(f"{title}\n{row['url']}\n{snippet}")
            item.setData(Qt.ItemDataRole.UserRole, row["url"])
            self.results.addItem(item)
        self.cursor = result.get("nextCursor")
        self.more.setVisible(bool(self.cursor))

    def _open(self, item):
        self.window.open_url(item.data(Qt.ItemDataRole.UserRole))

class ErrorPage(QWidget):
    def __init__(self, window, message):
        super().__init__()
        layout = QVBoxLayout(self)
        layout.setContentsMargins(48, 48, 48, 48)
        frame, body = card("This page didn’t load", message)
        retry = QPushButton("Try again")
        retry.setObjectName("accent")
        retry.clicked.connect(window.reload_tab)
        body.addWidget(retry)
        layout.addWidget(frame)
        layout.addStretch()

class ListPage(QWidget):
    def __init__(self, window, kind):
        super().__init__()
        self.window = window
        self.kind = kind
        root = QVBoxLayout(self)
        heading = QLabel(kind)
        heading.setObjectName("title")
        root.addWidget(heading)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Search")
        self.search.textChanged.connect(self.refresh)
        root.addWidget(self.search)
        self.list = QListWidget()
        self.list.itemActivated.connect(self._open)
        root.addWidget(self.list)
        row = QHBoxLayout()
        if kind == "History":
            clear = QPushButton("Clear history")
            clear.clicked.connect(self._clear)
            row.addWidget(clear)
        if kind == "Downloads":
            folder = QPushButton("Open folder")
            folder.clicked.connect(window.open_download_folder)
            row.addWidget(folder)
        row.addStretch()
        root.addLayout(row)
        self.refresh()

    def refresh(self):
        self.list.clear()
        query = self.search.text().strip()
        store = self.window.session.store
        if self.kind == "Bookmarks":
            rows = store.bookmarks(self.window.workspace, query)
            for row in rows:
                item = QListWidgetItem(f"{row['title']}\n{row['url']}")
                item.setData(Qt.ItemDataRole.UserRole, ("open", row["url"]))
                self.list.addItem(item)
        elif self.kind == "History":
            for row in store.history(query):
                item = QListWidgetItem(f"{row['title']}\n{row['url']}")
                item.setData(Qt.ItemDataRole.UserRole, ("open", row["url"]))
                self.list.addItem(item)
        elif self.kind == "Reading list":
            for row in store.reading(query):
                mark = "Read · " if row["is_read"] else ""
                item = QListWidgetItem(f"{mark}{row['title']}\n{row['url']}")
                item.setData(Qt.ItemDataRole.UserRole, ("open", row["url"]))
                self.list.addItem(item)
        elif self.kind == "Downloads":
            if self.list.contextMenuPolicy() != Qt.ContextMenuPolicy.CustomContextMenu:
                self.list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
                self.list.customContextMenuRequested.connect(self._download_menu)
            for row in self.window.session.downloads:
                item = QListWidgetItem(row["label"])
                req = row.get("item")
                item.setData(Qt.ItemDataRole.UserRole, ("download", id(req) if req is not None else 0, row.get("path", "")))
                self.list.addItem(item)
        elif self.kind == "Passwords":
            if not self.window.session.vault.unlocked:
                item = QListWidgetItem("Unlock Sreon to see saved passwords.")
                item.setData(Qt.ItemDataRole.UserRole, ("lock", ""))
                self.list.addItem(item)
                return
            for row in self.window.session.vault.items(query):
                item = QListWidgetItem(f"{row['title'] or row['origin']}\n{row['username']}")
                item.setData(Qt.ItemDataRole.UserRole, ("fill", row["id"]))
                self.list.addItem(item)

    def _open(self, item):
        data = item.data(Qt.ItemDataRole.UserRole)
        action = data[0]
        if action == "open":
            self.window.open_url(data[1])
        elif action == "file" and data[1]:
            from .web import open_path
            open_path(data[1])
        elif action == "download" and data[2]:
            from .web import open_path
            open_path(data[2])
        elif action == "lock":
            self.window.lock_window()
        elif action == "fill":
            self.window.fill_password(data[1])

    def _download_menu(self, pos):
        item = self.list.itemAt(pos)
        if not item:
            return
        data = item.data(Qt.ItemDataRole.UserRole)
        if not data or data[0] != "download":
            return
        identity = data[1]
        menu = QMenu(self)
        menu.addAction("Pause", lambda: self.window.download_action(identity, "pause"))
        menu.addAction("Resume", lambda: self.window.download_action(identity, "resume"))
        menu.addAction("Cancel", lambda: self.window.download_action(identity, "cancel"))
        menu.addAction("Open", lambda: self.window.download_action(identity, "open"))
        menu.addAction("Show in folder", lambda: self.window.download_action(identity, "show"))
        menu.exec(self.list.mapToGlobal(pos))
        self.refresh()

    def _clear(self):
        if QMessageBox.question(self, "Clear history", "Remove saved history from this computer?") == QMessageBox.StandardButton.Yes:
            self.window.session.store.clear_history(0)
            self.refresh()

class PrivacyPage(QWidget):
    def __init__(self, window):
        super().__init__()
        layout = QVBoxLayout(self)
        frame, body = card(
            "How privacy actually works here.",
            "Sreon does not send browsing data to a Sreon server, sell it, or include telemetry. "
            "Websites you visit still see a normal browser visit. Search queries go only to the live Sreon engine when you search. "
            "Private windows use a separate profile and discard cookies, storage, and history when the window closes. That is isolation, not anonymity.",
        )
        cookies = QLabel("Third-party cookies: " + ("allowed" if window.session.settings["third_party_cookies"] else "blocked for new cookies"))
        cookies.setWordWrap(True)
        body.addWidget(cookies)
        perms = QLabel(f"Remembered site permissions: {len(window.session.store.permissions())}")
        body.addWidget(perms)
        layout.addWidget(frame)
        layout.addStretch()

class SettingsPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.window = window
        inner = QWidget()
        form = QFormLayout(inner)
        settings = window.session.settings
        self.theme = QComboBox()
        self.theme.addItems([*PRESETS, "Custom"])
        self.theme.setCurrentText(settings["theme"])
        self.mode = QComboBox()
        self.mode.addItems(["System", "Light", "Dark"])
        self.mode.setCurrentText(settings["mode"])
        self.tabs = QComboBox()
        self.tabs.addItems(["Top", "Vertical", "Compact"])
        self.tabs.setCurrentText(settings["tab_layout"])
        self.sidebar = QComboBox()
        self.sidebar.addItems(["Left", "Right"])
        self.sidebar.setCurrentText(settings["sidebar_position"])
        self.toolbar = QComboBox()
        self.toolbar.addItems(["Top", "Bottom"])
        self.toolbar.setCurrentText(settings["toolbar_position"])
        self.density = QComboBox()
        self.density.addItems(["Comfortable", "Compact"])
        self.density.setCurrentText(settings["density"])
        self.photo = QComboBox()
        self.photo.addItems(["landscape.webp", "coast.webp", "studio.webp", "None"])
        self.photo.setCurrentText(settings["photo"])
        self.font = QSpinBox()
        self.font.setRange(11, 20)
        self.font.setValue(settings["font_size"])
        self.radius = QSpinBox()
        self.radius.setRange(0, 18)
        self.radius.setValue(settings["radius"])
        self.width = QSpinBox()
        self.width.setRange(170, 340)
        self.width.setValue(settings["sidebar_width"])
        self.clock = QCheckBox("Show clock on new tabs")
        self.clock.setChecked(settings["clock"])
        self.greeting = QCheckBox("Show greeting")
        self.greeting.setChecked(settings["greeting"])
        self.restore = QCheckBox("Restore last tabs")
        self.restore.setChecked(settings["restore_session"])
        self.sidebar_on = QCheckBox("Show sidebar")
        self.sidebar_on.setChecked(settings["sidebar_visible"])
        self.cookies = QCheckBox("Allow third-party cookies")
        self.cookies.setChecked(settings["third_party_cookies"])
        apply = QPushButton("Save")
        apply.setObjectName("accent")
        apply.clicked.connect(self._save)
        export = QPushButton("Export theme")
        export.clicked.connect(self._export)
        load = QPushButton("Import theme")
        load.clicked.connect(self._import)
        appearance = QPushButton("Reset appearance")
        appearance.clicked.connect(lambda: self._reset("appearance"))
        layout_reset = QPushButton("Reset layout")
        layout_reset.clicked.connect(lambda: self._reset("layout"))
        everything = QPushButton("Reset everything")
        everything.clicked.connect(lambda: self._reset("everything"))
        for label, widget in [
            ("Theme", self.theme), ("Mode", self.mode), ("Tabs", self.tabs), ("Sidebar side", self.sidebar),
            ("Toolbar", self.toolbar), ("Density", self.density), ("New tab photo", self.photo),
            ("Text size", self.font), ("Corners", self.radius), ("Sidebar width", self.width),
        ]:
            form.addRow(label, widget)
        for widget in (self.clock, self.greeting, self.restore, self.sidebar_on, self.cookies, apply, export, load, appearance, layout_reset, everything):
            form.addRow(widget)
        pin = QLineEdit()
        pin.setEchoMode(QLineEdit.EchoMode.Password)
        pin.setPlaceholderText("New lock PIN")
        set_pin = QPushButton("Set lock PIN")
        set_pin.clicked.connect(lambda: self._pin(pin.text()))
        form.addRow(pin)
        form.addRow(set_pin)
        layout = QVBoxLayout(self)
        layout.addWidget(wrap(inner))

    def _save(self):
        values = dict(self.window.session.settings)
        values.update({
            "theme": self.theme.currentText(),
            "mode": self.mode.currentText(),
            "tab_layout": self.tabs.currentText(),
            "sidebar_position": self.sidebar.currentText(),
            "toolbar_position": self.toolbar.currentText(),
            "density": self.density.currentText(),
            "photo": self.photo.currentText(),
            "font_size": self.font.value(),
            "radius": self.radius.value(),
            "sidebar_width": self.width.value(),
            "clock": self.clock.isChecked(),
            "greeting": self.greeting.isChecked(),
            "restore_session": self.restore.isChecked(),
            "sidebar_visible": self.sidebar_on.isChecked(),
            "third_party_cookies": self.cookies.isChecked(),
        })
        self.window.session.settings = clean_settings(values)
        self.window.session.store.save_settings(self.window.session.settings)
        self.window.apply_chrome()

    def _export(self):
        path, _ = QFileDialog.getSaveFileName(self, "Export theme", str(Path.home() / "sreon-theme.json"), "JSON (*.json)")
        if path:
            Path(path).write_text(export_theme(self.window.session.settings), encoding="utf-8")

    def _import(self):
        path, _ = QFileDialog.getOpenFileName(self, "Import theme", str(Path.home()), "JSON (*.json)")
        if not path:
            return
        try:
            values = import_theme(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            QMessageBox.warning(self, "Theme", str(error))
            return
        self.window.session.settings = values
        self.window.session.store.save_settings(values)
        self.window.apply_chrome()

    def _reset(self, kind):
        if QMessageBox.question(self, "Reset", "This cannot be undone. Continue?") != QMessageBox.StandardButton.Yes:
            return
        if kind == "appearance":
            self.window.session.store.reset_appearance()
        elif kind == "layout":
            self.window.session.store.reset_layout()
        else:
            self.window.session.store.reset_everything()
            self.window.session.vault.lock()
        self.window.session.settings = self.window.session.store.settings()
        self.window.apply_chrome()

    def _pin(self, pin):
        try:
            self.window.session.vault.set_pin(pin)
            QMessageBox.information(self, "Lock", "PIN saved. Use File → Lock to lock Sreon.")
        except ValueError as error:
            QMessageBox.warning(self, "Lock", str(error))

class LockPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.window = window
        self.setObjectName("lock")
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title = QLabel("Sreon is locked")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.clock = QLabel()
        self.clock.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.pin = QLineEdit()
        self.pin.setEchoMode(QLineEdit.EchoMode.Password)
        self.pin.setPlaceholderText("PIN")
        self.pin.returnPressed.connect(self._unlock)
        button = QPushButton("Unlock")
        button.setObjectName("accent")
        button.clicked.connect(self._unlock)
        layout.addWidget(title)
        layout.addWidget(self.clock)
        layout.addWidget(self.pin)
        layout.addWidget(button)
        timer = QTimer(self)
        timer.timeout.connect(lambda: self.clock.setText(datetime.now().strftime("%A, %B %d  ·  %H:%M")))
        timer.start(1000)
        self.clock.setText(datetime.now().strftime("%A, %B %d  ·  %H:%M"))

    def _unlock(self):
        try:
            self.window.session.vault.unlock(self.pin.text())
            self.pin.clear()
            self.window.unlock_window()
        except ValueError as error:
            QMessageBox.warning(self, "Lock", str(error))

class WelcomePage(QWidget):
    SENTENCES = (
        "Sreon is a desktop browser with real tabs, downloads, and private windows.",
        "Type a website address to open it, or type words to search with the Sreon engine.",
        "Your look, bookmarks, and lock stay on this computer.",
    )
    TOUR = (
        ("Address", "The bar at the top opens websites or searches. Command or Control L jumps there."),
        ("Tabs", "Command or Control T opens a tab. W closes it. Shift T reopens the last one."),
        ("Sidebar", "Bookmarks, history, downloads, reading list, passwords, and settings live here."),
        ("Search", "Words go to the real Sreon engine. youtube.com opens YouTube."),
        ("Privacy", "Private windows discard their profile when closed. Sreon does not sell browsing data."),
        ("Passwords", "Saved passwords stay encrypted behind your PIN. Reveal and fill require unlock."),
        ("Customization", "Themes, tabs, sidebar, and new-tab photos are in Settings and persist."),
        ("New tab", "The start page is Sreon — Search privately. Browse freely."),
        ("Settings", "Reset appearance, layout, or everything from Settings. Destructive actions ask first."),
    )

    def __init__(self, window):
        super().__init__()
        self.window = window
        self.step = 0
        self.muted = False
        self.speech = None
        try:
            from PySide6.QtTextToSpeech import QTextToSpeech
            self.speech = QTextToSpeech(self)
        except Exception:
            self.speech = None
        layout = QVBoxLayout(self)
        layout.setContentsMargins(48, 48, 48, 48)
        self.frame, body = card("Welcome to Sreon")
        self.text = QLabel()
        self.text.setWordWrap(True)
        body.addWidget(self.text)
        row = QHBoxLayout()
        skip = QPushButton("Skip")
        skip.clicked.connect(self._skip)
        self.mute = QPushButton("Mute")
        self.mute.clicked.connect(self._mute)
        replay = QPushButton("Replay")
        replay.clicked.connect(self._show)
        nxt = QPushButton("Next")
        nxt.setObjectName("accent")
        nxt.clicked.connect(self._next)
        for widget in (skip, self.mute, replay, nxt):
            row.addWidget(widget)
        body.addLayout(row)
        layout.addWidget(self.frame)
        layout.addStretch()
        self._show()

    def _speak(self, text):
        if self.speech and not self.muted:
            self.speech.say(text)

    def _show(self):
        if self.step == 0:
            words = " ".join(self.SENTENCES)
            self.text.setText("\n\n".join(self.SENTENCES))
            self._speak(words)
        else:
            title, body = self.TOUR[self.step - 1]
            self.text.setText(f"{title}\n\n{body}")
            self._speak(title + ". " + body)

    def _next(self):
        self.step += 1
        if self.step > len(self.TOUR):
            self._skip()
            return
        self._show()

    def _mute(self):
        self.muted = not self.muted
        self.mute.setText("Unmute" if self.muted else "Mute")
        if self.speech:
            self.speech.stop()

    def _skip(self):
        if self.speech:
            self.speech.stop()
        self.window.finish_welcome()
