#!/bin/bash
# Builds Sreon.dmg: a branded, windowed drag-to-Applications installer disk image.
set -euo pipefail
cd "$(dirname "$0")/../.."

APP="dist/Sreon.app"
[ -d "$APP" ] || APP="dist/Sreon/Sreon.app"
[ -d "$APP" ] || { echo "Sreon.app was not built" >&2; exit 1; }

STAGE="dist/dmg"
DMG_RAW="dist/Sreon-raw.dmg"
DMG="dist/Sreon.dmg"
rm -rf "$STAGE" "$DMG_RAW" "$DMG"
mkdir -p "$STAGE"

cp -R "$APP" "$STAGE/Sreon.app"
ln -s /Applications "$STAGE/Applications"

# Branded volume icon (visible in the DMG window title bar and Finder sidebar)
mkdir -p "$STAGE/.VolumeIcon.icns"
cp assets/icon.icns "$STAGE/.VolumeIcon.icns"

# Installer window background
mkdir -p "$STAGE/.background"
cp packaging/mac/background.png "$STAGE/.background/background.png"

hdiutil create -volname "Sreon" -srcfolder "$STAGE" -ov -format UDRW -size 640m "$DMG_RAW"
MOUNT="$(hdiutil attach -readwrite -noverify -noautoopen "$DMG_RAW" | grep '/Volumes/Sreon' | sed 's/[[:space:]]*$//;s/^.*\(\/Volumes\/Sreon\).*$/\1/')"

# Place icons on a grid inside the installer window.
APPLESCRIPT=$(cat <<'EOS'
on run argv
  tell application "Finder"
    tell disk (item 1 of argv)
      open
      set current view of container window to icon view
      set toolbar visible of container window to false
      set statusbar visible of container window to false
      set the bounds of container window to {200, 120, 860, 520}
      set viewpoint size of icon view options of container window to {96, 96}
      set arrangement of icon view options of container window to not arranged
      set background picture of icon view options of container window to file ".background:background.png"
      set position of item "Sreon.app" of container window to {165, 235}
      set position of item "Applications" of container window to {495, 235}
      set position of item ".VolumeIcon.icns" of container window to {900, 900}
      update without registering applications
      delay 2
      close
    end tell
  end tell
end run
EOS
)
echo "$APPLESCRIPT" | osascript - "$MOUNT" || true

SetFile -a C "$MOUNT/.VolumeIcon.icns" || true
touch "$MOUNT/.metadata"
sync
hdiutil detach "$MOUNT" -force || hdiutil detach "$MOUNT" || true
rm -f "$DMG"
hdiutil convert "$DMG_RAW" -format UDZO -imagekey zlib-level=9 -o "$DMG"
rm -f "$DMG_RAW"
echo "DMG ready: $DMG"
