#!/bin/bash
# Builds Sreon-Installer.pkg: a native macOS installer that puts Sreon.app in /Applications.
set -euo pipefail
cd "$(dirname "$0")/../.."

APP="dist/Sreon.app"
[ -d "$APP" ] || APP="dist/Sreon/Sreon.app"
[ -d "$APP" ] || { echo "Sreon.app was not built" >&2; exit 1; }

IDENTIFIER="com.sreon.browser"
VERSION="0.5.0"
ROOT="dist/pkgroot"
SCRIPTS="dist/pkg-scripts"
rm -rf "$ROOT" "$SCRIPTS" dist/sreon-component.pkg dist/Sreon-Installer.pkg
mkdir -p "$ROOT/Applications" "$SCRIPTS"
cp -R "$APP" "$ROOT/Applications/Sreon.app"

cat > "$SCRIPTS/postinstall" <<'EOF'
#!/bin/bash
LOG="$HOME/Library/Logs/Sreon-install.log"
{
  echo "[$(date)] Sreon postinstall"
  xattr -dr com.apple.quarantine /Applications/Sreon.app 2>/dev/null || true
  chown -R "$(stat -f %Su /dev/console)":staff /Applications/Sreon.app 2>/dev/null || true
} >> "$LOG" 2>&1 || true
exit 0
EOF
chmod +x "$SCRIPTS/postinstall"

cat > "$SCRIPTS/plist.xml" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
  <dict>
    <key>BundleHasStrictIdentifier</key><true/>
    <key>BundleIsRelocatable</key><true/>
    <key>BundleIsVersionChecked</key><false/>
    <key>BundleOverwriteBehavior</key><string>Upgrade</string>
    <key>ChildBundles</key><array/>
  </dict>
</array>
</plist>
EOF

pkgbuild --root "$ROOT" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location "/" \
  --scripts "$SCRIPTS" \
  --component-plist "$SCRIPTS/plist.xml" \
  dist/sreon-component.pkg

productbuild --package dist/sreon-component.pkg \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  dist/Sreon-Installer.pkg

rm -rf "$ROOT" dist/sreon-component.pkg
echo "PKG ready: dist/Sreon-Installer.pkg"
