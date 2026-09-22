from pathlib import Path
from app.store import Store

def test_history_skipped_when_private(tmp_path):
    store = Store(tmp_path / "sreon.sqlite")
    store.history_add("YouTube", "https://youtube.com/", private=True)
    store.history_add("YouTube", "https://youtube.com/", private=False)
    rows = store.history()
    assert len(rows) == 1
    store.close()

def test_session_restore_and_private_discard(tmp_path):
    store = Store(tmp_path / "sreon.sqlite")
    store.save_session("personal", [{"url": "https://example.com/", "title": "Example"}], private=False)
    store.save_session("personal", [{"url": "https://secret.example/", "title": "Nope"}], private=True)
    assert store.session("personal")[0]["url"] == "https://example.com/"
    store.close()

def test_bookmarks_and_reading(tmp_path):
    store = Store(tmp_path / "sreon.sqlite")
    identity = store.add_bookmark("personal", "Example", "https://example.com/", "News")
    store.read_add("Example", "https://example.com/")
    assert store.bookmarks("personal")[0]["id"] == identity
    assert store.reading()[0]["url"] == "https://example.com/"
    store.delete_bookmark(identity)
    assert store.bookmarks("personal") == []
    store.close()

def test_reset_everything_clears_pin(tmp_path):
    store = Store(tmp_path / "sreon.sqlite")
    store.save_pin("abc")
    store.save_vault("blob")
    store.reset_everything()
    pin, vault = store.pin_record()
    assert pin == ""
    assert vault == ""
    store.close()
