#!/bin/bash
# Builds Sreon-linux.deb: native package that installs Sreon to /opt with menu entries.
set -euo pipefail
cd "$(dirname "$0")/../.."

SRC="dist/Sreon"
[ -d "$SRC" ] || { echo "Linux app folder was not built (run tools/build.py first)" >&2; exit 1; }

VERSION="0.5.0"
PKG="dist/sreon_${VERSION}_amd64"
rm -rf "$PKG"
mkdir -p "$PKG/opt/Sreon" "$PKG/usr/bin" "$PKG/usr/share/applications" \
         "$PKG/usr/share/icons/hicolor/256x256/apps" "$PKG/DEBIAN"

cp -R "$SRC/." "$PKG/opt/Sreon/"
chmod 755 "$PKG/opt/Sreon/Sreon"

cat > "$PKG/usr/bin/sreon" <<'EOF'
#!/bin/sh
exec /opt/Sreon/Sreon "$@"
EOF
chmod 755 "$PKG/usr/bin/sreon"

cp assets/icon.png "$PKG/usr/share/icons/hicolor/256x256/apps/sreon.png"

cat > "$PKG/usr/share/applications/sreon.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Sreon
Comment=Search privately. Browse freely.
Exec=/opt/Sreon/Sreon %U
Icon=sreon
Terminal=false
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml_xml;x-scheme-handler/http;x-scheme-handler/https;
StartupWMClass=Sreon
EOF

installed_size=$(du -sk "$PKG" | cut -f1)

cat > "$PKG/DEBIAN/control" <<EOF
Package: sreon
Version: $VERSION
Section: web
Priority: optional
Architecture: amd64
Installed-Size: $installed_size
Maintainer: Sreon <contact@opensreon.com>
Depends: libgl1, libegl1, libxkbcommon0, libdbus-1-3, libfontconfig1, libglib2.0-0, libnss3, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libasound2, libxtst6, libxcb-icccm4, libxcb-image0, libxcb-keysyms1, libxcb-render-util0, libxcb-xinerama0, libxcb-cursor0
Provides: web-browser
Recommends: libqt6svg6
Description: Sreon Browser
 A desktop browser with real tabs, private windows, and the Sreon
 search engine built in. Search privately. Browse freely.
EOF

cat > "$PKG/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q || true; fi
if command -v xdg-desktop-menu >/dev/null 2>&1; then xdg-desktop-menu forceupdate || true; fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -f /usr/share/icons/hicolor || true; fi
EOF
cat > "$PKG/DEBIAN/postrm" <<'EOF'
#!/bin/sh
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q || true; fi
EOF
chmod 755 "$PKG/DEBIAN/postinst" "$PKG/DEBIAN/postrm"

dpkg-deb --root-owner-group --build "$PKG" "dist/Sreon-linux.deb"
rm -rf "$PKG"
echo "DEB ready: dist/Sreon-linux.deb"
