from PySide6.QtGui import QGuiApplication, QPalette
from .model import PRESETS

def dark_mode(settings):
    mode = settings.get("mode", "System")
    if mode == "Dark":
        return True
    if mode == "Light":
        return False
    hints = QGuiApplication.styleHints()
    if hasattr(hints, "colorScheme"):
        scheme = hints.colorScheme()
        name = getattr(scheme, "name", lambda: "")()
        if name == "Dark":
            return True
        if name == "Light":
            return False
    return QGuiApplication.palette().color(QPalette.ColorRole.Window).lightness() < 128

def colors(settings):
    theme = settings.get("theme", "Sreon Purple")
    if theme in PRESETS:
        values = dict(PRESETS[theme])
    else:
        values = {
            "background": settings.get("background", "#f8f6f0"),
            "foreground": settings.get("foreground", "#282335"),
            "panel": settings.get("panel", "#eee8f3"),
            "accent": settings.get("accent", "#694694"),
        }
    return values

def stylesheet(settings):
    tone = colors(settings)
    bg, fg, panel, accent = tone["background"], tone["foreground"], tone["panel"], tone["accent"]
    size = settings.get("font_size", 14)
    radius = settings.get("radius", 9)
    pad = 6 if settings.get("density") == "Compact" else 10
    return f"""
    QMainWindow, QDialog, QWidget#root, QStackedWidget, QScrollArea {{ background:{bg}; color:{fg}; }}
    QWidget {{ font-size:{size}px; color:{fg}; }}
    QTabBar {{ background:{bg}; }}
    QTabBar::tab {{ background:{panel}; color:{fg}; padding:{pad}px {pad+8}px; margin:2px; border-radius:{radius}px; }}
    QTabBar::tab:selected {{ background:{accent}; color:{bg}; }}
    QToolBar, QStatusBar {{ background:{bg}; border:0; spacing:6px; padding:4px; }}
    QLineEdit, QPlainTextEdit, QSpinBox, QComboBox {{ background:{panel}; color:{fg}; border:1px solid {accent}; border-radius:{radius}px; padding:{pad-2}px {pad}px; selection-background-color:{accent}; }}
    QPushButton {{ background:{panel}; color:{fg}; border:0; border-radius:{radius}px; padding:{pad-2}px {pad+6}px; }}
    QPushButton:hover {{ background:{accent}; color:{bg}; }}
    QPushButton#accent {{ background:{accent}; color:{bg}; }}
    QListWidget, QTreeWidget {{ background:{panel}; border:0; border-radius:{radius}px; padding:6px; }}
    QListWidget::item {{ padding:{pad-2}px; border-radius:{max(4,radius-4)}px; }}
    QListWidget::item:selected {{ background:{accent}; color:{bg}; }}
    QSplitter::handle {{ background:{panel}; width:2px; height:2px; }}
    QScrollBar:vertical {{ background:{bg}; width:10px; }}
    QScrollBar::handle:vertical {{ background:{accent}; min-height:24px; border-radius:4px; }}
    QMenuBar {{ background:{bg}; color:{fg}; }}
    QMenu {{ background:{panel}; color:{fg}; }}
    QMenu::item:selected {{ background:{accent}; color:{bg}; }}
    QLabel#title {{ font-size:{size+10}px; }}
    QLabel#muted {{ color:{accent}; }}
    QFrame#card {{ background:{panel}; border-radius:{radius+4}px; }}
    QWidget#lock {{ background:{bg}; }}
    """
