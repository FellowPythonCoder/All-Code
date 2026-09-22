from PySide6.QtCore import QStandardPaths, QUrl, Qt
from PySide6.QtGui import QDesktopServices
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMessageBox
from .model import origin_of

SAFE = {"http", "https", "about", "blob"}

def configure_settings(settings):
    settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, False)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, False)
    settings.setAttribute(QWebEngineSettings.WebAttribute.AllowRunningInsecureContent, False)
    settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, False)
    settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.DnsPrefetchEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.ErrorPageEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.FocusOnNavigationEnabled, True)

def make_profile(parent, path, private):
    if private:
        profile = QWebEngineProfile(parent)
    else:
        profile = QWebEngineProfile("sreon", parent)
        profile.setPersistentStoragePath(str(path / "web"))
        profile.setCachePath(str(path / "cache"))
        profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.AllowPersistentCookies)
        profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.DiskHttpCache)
        profile.setHttpCacheMaximumSize(256 * 1024 * 1024)
    downloads = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation)
    if downloads:
        profile.setDownloadPath(downloads)
    configure_settings(profile.settings())
    return profile

class SreonPage(QWebEnginePage):
    def __init__(self, profile, window, parent=None):
        super().__init__(profile, parent)
        self.window = window
        self.certificateError.connect(self._certificate)
        self.permissionRequested.connect(self._permission)
        self.newWindowRequested.connect(self._new_window)
        self.navigationRequested.connect(self._navigation)
        self.fullScreenRequested.connect(self._fullscreen)
        self.renderProcessTerminated.connect(self._crashed)
        self.proxyAuthenticationRequired.connect(self._deny_proxy)
        self.featurePermissionRequested.connect(lambda *_: None)

    def javaScriptConsoleMessage(self, *_):
        return

    def _certificate(self, error):
        error.rejectCertificate()
        self.window.show_error("This site’s certificate could not be trusted. Sreon did not continue.")

    def _deny_proxy(self, _url, authenticator, _proxy):
        authenticator.setUser("")
        authenticator.setPassword("")

    def _navigation(self, request):
        scheme = request.url().scheme().lower()
        if scheme in SAFE:
            request.accept()
        else:
            request.reject()

    def _new_window(self, request):
        url = request.requestedUrl().toString()
        if request.destination() == request.DestinationType.InNewWindow:
            window = self.window.session.open_window(private=self.window.private, url=url or "about:blank")
            tab = window.current()
        else:
            tab = self.window.open_url(url or "about:blank", new_tab=True)
        if tab and tab.view:
            request.openIn(tab.view.page())

    def _permission(self, permission):
        origin = permission.origin().toString()
        kind = permission.permissionType().name
        remembered = self.window.session.store.permission(origin, kind)
        if remembered is True:
            permission.grant()
            return
        if remembered is False:
            permission.deny()
            return
        answer = QMessageBox.question(self.window, "Permission", f"{origin} wants {kind.replace('_', ' ').lower()}. Allow?")
        allow = answer == QMessageBox.StandardButton.Yes
        self.window.session.store.set_permission(origin, kind, allow)
        permission.grant() if allow else permission.deny()

    def _fullscreen(self, request):
        request.accept()
        self.window.setWindowState(self.window.windowState() ^ Qt.WindowState.WindowFullScreen)

    def _crashed(self, status, code):
        self.window.show_error(f"This tab stopped ({status.name}, {code}). Reload to try again.")

    def acceptNavigationRequest(self, url, nav_type, is_main):
        if is_main and url.scheme().lower() not in SAFE:
            return False
        return super().acceptNavigationRequest(url, nav_type, is_main)

class SreonView(QWebEngineView):
    def __init__(self, profile, window, parent=None):
        super().__init__(parent)
        self.window = window
        self.setPage(SreonPage(profile, window, self))
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.DefaultContextMenu)
        self.loadFinished.connect(self._loaded)
        self.titleChanged.connect(lambda title: window.tab_title(self, title))
        self.urlChanged.connect(lambda url: window.tab_url(self, url))
        self.iconChanged.connect(lambda icon: window.tab_icon(self, icon))
        self.loadProgress.connect(lambda value: window.tab_progress(self, value))

    def createWindow(self, kind):
        tab = self.window.open_url("about:blank", new_tab=True)
        return tab.view if tab else None

    def _loaded(self, ok):
        page = self.page()
        url = page.url().toString()
        if not ok and url.startswith(("http://", "https://")):
            self.window.show_error("This page could not be loaded.", view=self)
            return
        if url.startswith(("http://", "https://")):
            self.window.session.store.history_add(page.title() or url, url, self.window.private)

def open_path(path):
    QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))
