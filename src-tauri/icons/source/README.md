# App icon sources

The logo (`logo.svg`, the same as `public/vite.svg`) and the variants the platforms need:

- **Desktop** (`../icon.png`, `.icns`, `.ico`, the Square*Logo PNGs): the logo as it is.
- **iOS** (`ios.svg` → `../ios/` and `gen/apple/Assets.xcassets/AppIcon.appiconset`): full bleed —
  iOS rounds the corners itself, and the App Store refuses an icon with transparency.
- **Android** (`android.json` → `../android/` and `gen/android/app/src/main/res`): an adaptive icon —
  `android-background.svg` (the gradient and its glow) under `android-foreground.svg` (the notes and
  the keys, inside the safe zone the launcher's masks never cut); the logo itself for the older
  launchers.

Regenerate after changing the logo:

```sh
npx tauri icon src-tauri/icons/source/android.json -o /tmp/icons-android
npx tauri icon src-tauri/icons/source/ios.svg -o /tmp/icons-ios
# then copy /tmp/icons-android/android/* and /tmp/icons-ios/ios/* in place (docs/mobile.md)
```
