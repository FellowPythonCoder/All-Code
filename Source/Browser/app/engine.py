import threading
from pathlib import Path
from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal
from .paths import engine_binary
from .search_client import Sreon

class Signals(QObject):
    done = Signal(str, object, object)

class Task(QRunnable):
    def __init__(self, manager, identity, query, category, cursor):
        super().__init__()
        self.manager = manager
        self.identity = identity
        self.query = query
        self.category = category
        self.cursor = cursor

    def run(self):
        try:
            with self.manager.lock:
                binary = engine_binary()
                if not Path(binary).is_file():
                    raise FileNotFoundError("The Sreon search engine is not installed with this app.")
                if self.manager.client is None or self.manager.client.failure:
                    if self.manager.client:
                        self.manager.client.close()
                    self.manager.client = Sreon(binary)
                result = self.manager.client.search(self.query, self.category, self.cursor)
            self.manager.signals.done.emit(self.identity, result, None)
        except Exception as error:
            self.manager.signals.done.emit(self.identity, None, str(error))

class SearchManager:
    def __init__(self):
        self.client = None
        self.lock = threading.Lock()
        self.signals = Signals()
        self.pool = QThreadPool()
        self.pool.setMaxThreadCount(1)

    def search(self, identity, query, category="web", cursor=None):
        self.pool.start(Task(self, identity, query, category, cursor))

    def close(self):
        self.pool.clear()
        self.pool.waitForDone(22000)
        with self.lock:
            if self.client:
                self.client.close()
                self.client = None
