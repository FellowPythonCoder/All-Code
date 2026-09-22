import copy
import ipaddress
import json
import re
import secrets
import string
from urllib.parse import urlsplit, urlunsplit

PRESETS = {
    "Sreon Purple": {"background": "#f8f6f0", "foreground": "#282335", "panel": "#eee8f3", "accent": "#694694"},
    "Cream": {"background": "#faf5e9", "foreground": "#342d27", "panel": "#efe5d0", "accent": "#785a84"},
    "Midnight Violet": {"background": "#19151f", "foreground": "#f1eaf7", "panel": "#292132", "accent": "#c4a4ee"},
    "Lavender": {"background": "#f1edf9", "foreground": "#302438", "panel": "#e1d8ed", "accent": "#714599"},
    "Minimal Black": {"background": "#141414", "foreground": "#f2f2f2", "panel": "#242424", "accent": "#bcb4da"},
    "Paper": {"background": "#fffefa", "foreground": "#2b2b29", "panel": "#edede7", "accent": "#655774"},
}
INTERNAL = {"newtab", "settings", "privacy", "bookmarks", "history", "downloads", "reading", "passwords"}
DEFAULTS = {
    "theme": "Sreon Purple",
    "mode": "System",
    "accent": "#694694",
    "background": "#f8f6f0",
    "foreground": "#282335",
    "panel": "#eee8f3",
    "sidebar_width": 220,
    "sidebar_position": "Left",
    "sidebar_visible": True,
    "tab_layout": "Top",
    "font_size": 14,
    "radius": 9,
    "density": "Comfortable",
    "toolbar_position": "Top",
    "photo": "landscape.webp",
    "clock": True,
    "greeting": True,
    "restore_session": True,
    "third_party_cookies": True,
    "welcome_seen": False,
    "lock_timeout": 0,
    "download_path": "",
    "sections": ["Bookmarks", "History", "Downloads", "Reading list", "Passwords", "Privacy", "Settings"],
}

def resolve_input(value):
    value = value.strip()
    if not value:
        return "internal", "newtab"
    if value.startswith("sreon://"):
        name = value[8:].strip("/").lower().replace("reading list", "reading")
        return ("internal", name) if name in INTERNAL else ("error", "Unknown Sreon page")
    if any(ord(char) < 32 for char in value):
        return "error", "Control characters are not allowed in addresses"
    explicit = bool(re.match(r"^[a-z][a-z0-9+.-]*://", value, re.I))
    if explicit and not value.lower().startswith(("https://", "http://")):
        return "error", "Only HTTP and HTTPS website addresses are supported"
    candidate = value if explicit else "https://" + value
    try:
        url = urlsplit(candidate)
        host = url.hostname or ""
        port = url.port
        is_host = host == "localhost" or "." in host or ":" in host
        if not explicit and (any(char.isspace() for char in value) or not is_host):
            return "search", value
        if not host or url.username is not None or url.password is not None or any(char.isspace() for char in host):
            return "error", "Enter an address without embedded credentials"
        try:
            ipaddress.ip_address(host)
            ascii_host = "[" + host + "]" if ":" in host else host
        except ValueError:
            ascii_host = host.encode("idna").decode("ascii")
            if not re.fullmatch(r"[a-zA-Z0-9.-]+", ascii_host):
                return "error", "Invalid website address"
        netloc = ascii_host + (":" + str(port) if port else "")
        return "url", urlunsplit((url.scheme, netloc, url.path or "/", url.query, url.fragment))
    except (ValueError, UnicodeError):
        return "error", "Invalid website address"

def clean_settings(values):
    output = copy.deepcopy(DEFAULTS)
    if not isinstance(values, dict):
        return output
    choices = {
        "theme": set(PRESETS) | {"Custom"},
        "mode": {"System", "Light", "Dark"},
        "sidebar_position": {"Left", "Right"},
        "tab_layout": {"Top", "Vertical", "Compact"},
        "density": {"Comfortable", "Compact"},
        "toolbar_position": {"Top", "Bottom"},
        "photo": {"landscape.webp", "coast.webp", "studio.webp", "None"},
    }
    for key, allowed in choices.items():
        if isinstance(values.get(key), str) and values[key] in allowed:
            output[key] = values[key]
    for key, low, high in [("sidebar_width", 170, 340), ("font_size", 11, 20), ("radius", 0, 18), ("lock_timeout", 0, 120)]:
        value = values.get(key)
        if type(value) is int:
            output[key] = max(low, min(high, value))
    for key in ["accent", "background", "foreground", "panel"]:
        if isinstance(values.get(key), str) and re.fullmatch(r"#[a-fA-F0-9]{6}", values[key]):
            output[key] = values[key].lower()
    for key in ["sidebar_visible", "clock", "greeting", "restore_session", "third_party_cookies", "welcome_seen"]:
        if type(values.get(key)) is bool:
            output[key] = values[key]
    if isinstance(values.get("download_path"), str) and len(values["download_path"]) < 4096:
        output["download_path"] = values["download_path"]
    if isinstance(values.get("sections"), list):
        output["sections"] = list(dict.fromkeys(item for item in values["sections"] if isinstance(item, str) and item in DEFAULTS["sections"]))
        if not output["sections"]:
            output["sections"] = list(DEFAULTS["sections"])
    if output["theme"] in PRESETS:
        colors = PRESETS[output["theme"]]
        output["background"] = colors["background"]
        output["foreground"] = colors["foreground"]
        output["panel"] = colors["panel"]
        output["accent"] = colors["accent"]
    return output

def export_theme(settings):
    keys = ["theme", "mode", "accent", "background", "foreground", "panel", "radius", "density", "font_size"]
    return json.dumps({"format": "sreon-theme-1", "settings": {key: settings[key] for key in keys}}, indent=2)

def import_theme(text):
    if len(text) > 65536:
        raise ValueError("Theme file is too large")
    data = json.loads(text)
    if not isinstance(data, dict) or data.get("format") != "sreon-theme-1" or not isinstance(data.get("settings"), dict):
        raise ValueError("Choose a Sreon theme file")
    return clean_settings(data["settings"])

def generate_password(length=20):
    length = max(8, min(64, int(length)))
    alphabet = string.ascii_letters + string.digits + "-_!@#$%?"
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(length))
        if (any(char.islower() for char in value) and any(char.isupper() for char in value) and any(char.isdigit() for char in value)):
            return value

def origin_of(url):
    try:
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            return ""
        host = parts.hostname.lower()
        port = parts.port
        default = (parts.scheme == "http" and port in (None, 80)) or (parts.scheme == "https" and port in (None, 443))
        return parts.scheme + "://" + host + ("" if default else ":" + str(port))
    except ValueError:
        return ""
