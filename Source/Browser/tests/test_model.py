import json
from app.model import clean_settings, export_theme, generate_password, import_theme, origin_of, resolve_input

def test_blank_is_new_tab():
    assert resolve_input("  ") == ("internal", "newtab")

def test_keyword_is_search():
    assert resolve_input("YouTube") == ("search", "YouTube")
    assert resolve_input("YouTube videos") == ("search", "YouTube videos")

def test_domain_is_url():
    kind, value = resolve_input("youtube.com")
    assert kind == "url"
    assert value == "https://youtube.com/"

def test_https_url():
    kind, value = resolve_input("https://example.com/path?q=1")
    assert kind == "url"
    assert value.startswith("https://example.com/path")

def test_internal_pages():
    assert resolve_input("sreon://settings") == ("internal", "settings")
    assert resolve_input("sreon://privacy") == ("internal", "privacy")
    assert resolve_input("sreon://ai")[0] == "error"
    assert resolve_input("sreon://games")[0] == "error"

def test_rejects_credentials_and_schemes():
    assert resolve_input("javascript:alert(1)")[0] == "error"
    assert resolve_input("file:///etc/passwd")[0] == "error"
    assert resolve_input("https://user:pass@example.com")[0] == "error"

def test_settings_drop_removed_features():
    values = clean_settings({"blocking": True, "sections": ["AI", "Games", "Bookmarks"], "theme": "Midnight Violet"})
    assert "blocking" not in values
    assert values["sections"] == ["Bookmarks"]
    assert values["background"] == "#19151f"
    assert "AI" not in values["sections"]

def test_theme_roundtrip():
    settings = clean_settings({"theme": "Paper", "font_size": 16})
    loaded = import_theme(export_theme(settings))
    assert loaded["theme"] == "Paper"
    assert loaded["font_size"] == 16

def test_bad_theme_rejected():
    try:
        import_theme("{}")
    except ValueError:
        return
    raise AssertionError("expected ValueError")

def test_password_shape():
    value = generate_password(16)
    assert len(value) == 16
    assert any(char.islower() for char in value)
    assert any(char.isupper() for char in value)
    assert any(char.isdigit() for char in value)

def test_origin():
    assert origin_of("https://Example.COM/x") == "https://example.com"
    assert origin_of("sreon://settings") == ""
