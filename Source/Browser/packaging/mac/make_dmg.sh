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

cp assets/icon.icns "$STAGE/.VolumeIcon.icns"
mkdir -p "$STAGE/.background"
cp packaging/mac/background.png "$STAGE/.background/background.png"

SIZE_MB=$(( $(du -sm "$STAGE" | cut -f1) + 140 ))
hdiutil create -volname "Sreon" -srcfolder "$STAGE" -ov -format UDRW -size "${SIZE_MB}m" "$DMG_RAW"
MOUNT="$(hdiutil attach -readwrite -noverify -noautoopen "$DMG_RAW" | grep '/Volumes/Sreon' | sed 's/[[:space:]]*$//;s/^.*\(\/Volumes\/Sreon\).*$/\1/')"
VOLNAME="$(basename "$MOUNT")"
sleep 2

# Keep background daemons from holding the volume busy during layout.
mkdir -p "$MOUNT/.fseventsd" 2>/dev/null || true
: > "$MOUNT/.fseventsd/no_log" 2>/dev/null || true
: > "$MOUNT/.metadata_never_index" 2>/dev/null || true
sync

# Place icons on the painted seats inside the installer window.
# Finder coordinates are bottom-left origin; the window is 660x400 points.
APPLESCRIPT=$(mktemp /tmp/sreon-dmg-XXXX.scpt)
cat > "$APPLESCRIPT" <<'EOS'
on run argv
  tell application "Finder"
    tell disk (item 1 of argv)
      open
      set current view of container window to icon view
      set toolbar visible of container window to false
      set statusbar visible of container window to false
      set the bounds of container window to {200, 120, 860, 520}
      set theViewOptions to the icon view options of container window
      set arrangement of theViewOptions to not arranged
      set icon size of theViewOptions to 96
      set background picture of theViewOptions to file ".background:background.png"
      set position of item "Sreon.app" of container window to {165, 69}
      set position of item "Applications" of container window to {495, 69}
      close
    end tell
  end tell
end run
EOS
osascript "$APPLESCRIPT" "$VOLNAME" || echo "DMG icon layout skipped (osascript refused)"
rm -f "$APPLESCRIPT"

SetFile -a C "$MOUNT" || true
sync

DETACHED=0
for attempt in $(seq 1 15); do
  if hdiutil detach "$MOUNT" >/dev/null 2>&1; then DETACHED=1; break; fi
  if diskutil eject "$MOUNT" >/dev/null 2>&1; then DETACHED=1; break; fi
  if hdiutil detach "$MOUNT" -force >/dev/null 2>&1; then DETACHED=1; break; fi
  if diskutil eject "$MOUNT" -force >/dev/null 2>&1; then DETACHED=1; break; fi
  sync
  sleep 4
done
if [ "$DETACHED" != "1" ]; then
  echo "::error::could not detach the installer image"
  exit 1
fi

CONVERTED=0
for attempt in 1 2 3; do
  if hdiutil convert "$DMG_RAW" -format UDZO -imagekey zlib-level=9 -o "$DMG" >/dev/null 2>&1; then CONVERTED=1; break; fi
  sleep 5
done
if [ "$CONVERTED" != "1" ]; then
  echo "::error::could not compress the installer image"
  exit 1
fi
rm -f "$DMG_RAW"
echo "DMG ready: $DMG"
