# Midi Stroke on Android and iOS

> The phone and tablet apps: the same web app as the browser and the desktop, in Tauri 2's mobile
> shell, with the platform's own MIDI. How they are built, what the native side does, and how a
> release reaches Google Play and the App Store.

| | Android | iOS / iPadOS |
|---|---|---|
| Application ID | `com.vibetuned.midi_stroke` (Android allows no `-`) | `com.vibetuned.midi-stroke` |
| Team / signing | the upload key in `keystore.properties` | team `47D2CT68R2` (Vibetuned) |
| Minimum | Android 8.0 (API 26), target API 36 | iOS 15 |
| Project | `src-tauri/gen/android` (Gradle) | `src-tauri/gen/apple` (XcodeGen → Xcode) |
| Config over `tauri.conf.json` | `src-tauri/tauri.android.conf.json` | `src-tauri/tauri.ios.conf.json` |

The desktop app keeps its own identifier (`dev.midistroke.app`): its saved data — statistics,
settings, imported scores — lives under it. The version (`tauri.conf.json`) gives Android's
`versionCode` (1.0.1 → 1000001) and iOS's `CFBundleShortVersionString`.

## 1. What runs where

- **The web app**, unchanged: the phone layout on a phone held sideways
  (`components/mobile/`), the desktop layout on a tablet. Verovio runs as its WebAssembly build
  in the system webview (WKWebView, Android WebView), loaded from the app's own files — never
  linked into the native binary.
- **The shell** (`src-tauri/src/lib.rs`): the same library as on desktop, which the mobile apps
  load (`[lib] crate-type = ["staticlib", "cdylib", "rlib"]`; `main.rs` is only the desktop's
  binary). Desktop MIDI is midir; on a phone, the native-midi plugin.
- **The native-midi plugin** (`src-tauri/plugins/native-midi`): MIDI from the platform —
  CoreMIDI on iOS (`ios/Sources/NativeMidiPlugin.swift`), `android.media.midi` on Android
  (`android/…/NativeMidiPlugin.kt`). It listens to every source (USB, and Bluetooth once
  paired), and its Rust side (`src/mobile.rs`) raises the same events as the desktop bridge:
  `midi-message` `[status, data1, data2]` and `midi-devices` `[names]`. So the web app reads MIDI
  the same way everywhere (`utils/midiInput.ts`); it calls `midi_start` once it listens, which
  starts the native side. MIDI out (`midi_outputs`, `midi_send`: score playback, the ROLI key
  lights) goes to the plugin too.
- **Bluetooth MIDI**: the ᛒ button beside the MIDI status (`BluetoothMidiButton`, only in the
  mobile apps) calls `midi_bluetooth`. iOS shows Apple's own Bluetooth MIDI view
  (`CABTMIDICentralViewController`); Android asks for the *nearby devices* permission (Android
  12+, the location on 8–11), scans for the BLE MIDI service and lists the instruments in range;
  one tapped is connected (`MidiManager.openBluetoothDevice`) and read like any other.
- **Links** (the About screen's) open in the system browser: `tauri-plugin-opener`,
  `utils/platform.ts` `openExternal`.

## 2. What the projects set

Android (`gen/android`, `src-tauri/build.rs`):

- 64-bit native libraries aligned for **16 KB pages** — Google Play requires it of apps that
  target Android 15+. `build.rs` asks the linker (`-z max-page-size=16384`): the Tauri CLI sets
  its own `RUSTFLAGS`, which would override a `.cargo/config.toml`.
- **Landscape** (`android:screenOrientation="sensorLandscape"`; Android 16 lets tablets turn
  anyway, where the desktop layout follows).
- **Full screen**, the system bars back on a swipe; edge to edge (Android 15 forces it), the page
  kept clear of the camera cut-out by the activity's padding (`MainActivity.kt`) rather than
  relying on CSS `env(safe-area-inset-*)`, which Android's WebView does not report.
- The **screen stays on** while the app is in front: practice is played on the instrument, with
  no touch for minutes.
- No Android TV entry (the app is not usable with a remote).
- Release builds are signed with the upload key named in `gen/android/keystore.properties`
  (git-ignored): `keyAlias`, `password`, `storeFile`. Without it, a release build is unsigned.
  R8 shrinks release builds; Tauri's own rules keep the plugin's classes and commands.

iOS (`gen/apple/project.yml` and `Info.plist` — both, as XcodeGen regenerates the project):

- **Landscape** on an iPhone; any orientation on an iPad (the desktop layout, and iPad
  multitasking wants all four).
- Status bar hidden; `NSBluetoothAlwaysUsageDescription` for the Bluetooth MIDI view;
  `ITSAppUsesNonExemptEncryption = false` (HTTPS only), so App Store Connect asks no export
  question at each upload.
- The plugin sets the **audio session to playback** — the app sounds with the silent switch on —
  and keeps the screen awake.

**Icons** — from the logo (`public/vite.svg`), in the variants each platform needs
(`src-tauri/icons/source/`): full bleed for iOS (it rounds the corners itself, and the App Store
refuses transparency), an adaptive icon for Android (the gradient as the background layer, the
notes and keys as the foreground, inside the safe zone the launchers' masks never cut). How to
regenerate them: `src-tauri/icons/source/README.md`.

## 3. Building and running

You need: Xcode with the **simulator runtime matching its SDK** (Xcode → Settings → Components;
the Tauri CLI refuses an older runtime), the Android SDK with NDK 27, a JDK (21), the Rust
targets (`rustup target add aarch64-apple-ios aarch64-apple-ios-sim aarch64-linux-android
armv7-linux-androideabi i686-linux-android x86_64-linux-android`), and for Android:

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.2.12479018
```

```bash
# Android: a debug APK, installed on a device or emulator (adb devices)
npx tauri android build --debug --apk --target aarch64
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# iOS: a debug build for a connected iPad or iPhone (xcrun devicectl list devices)
npx tauri ios build --debug --target aarch64 --export-method debugging
xcrun devicectl device install app --device <UDID> "src-tauri/gen/apple/build/arm64/Midi Stroke.ipa"

# iOS without signing, to check it builds
npx tauri ios build --debug --target aarch64 --no-sign

# The simulator / emulator with hot reload
npx tauri ios dev "iPhone 17e"
npx tauri android dev
```

Debugging the page: Android — `chrome://inspect` (debug builds enable WebView debugging); iOS —
Safari → Develop → the device (Settings → Safari → Advanced → Web Inspector on the device).

Since Xcode 27 the Simulator app is gone — simulators live in **Device Hub** — and
`tauri ios dev "<simulator>"` cannot start one by itself ("Unable to find application named
'Simulator'"); it then opens Xcode instead. Start the simulator from Device Hub first, or test on
a device: an iPad or iPhone (`xcrun devicectl list devices`) and an Android device or emulator
(`adb devices`) are quicker anyway.

## 4. Releasing

The apps are published from **Xcode** and **Android Studio**. `--open` builds the app, opens the
IDE on its project and keeps the Tauri CLI running — leave that terminal open: the projects' Rust
build step calls back into it.

**App Store** (once: the App ID `com.vibetuned.midi-stroke` registered under Certificates,
Identifiers & Profiles, and the app created in App Store Connect — debug builds so far used the
team's wildcard development profile):

1. `npx tauri ios build --open`
2. In Xcode: the destination *Any iOS Device (arm64)*, then **Product → Archive**.
3. In the Organizer: **Distribute App → App Store Connect**, then TestFlight, then review.

**Google Play** (once: the app created in the Play Console, with Play App Signing):

1. `npx tauri android build --open`
2. In Android Studio: **Build → Generate Signed App Bundle or APK → Android App Bundle**, the
   upload key, the *universalRelease* variant.
3. Upload the `.aab` to the Play Console: internal testing first.

(Without the IDEs: `npx tauri android build --aab` signs with the key in `keystore.properties`;
`npx tauri ios build --export-method app-store-connect` gives an `.ipa` for Transporter.)

The listing texts, the Verovio credit the stores' metadata must carry, and the privacy answers:
[store-listing.md](store-listing.md).

### Before the first submission

- [x] **Game sounds**: three of the games' sample sets (*Nasa Space Pad*, *Space Voices*,
      *The Spellsinger*) were asked about through Pianobook (September 2026) without an answer.
      They stay, credited, and are removed at once if their makers ask
      (`public/games/sounds/CREDITS.md`).
- [x] **Drum pattern collections**: transcribed by hand into MEI from patterns printed in old
      magazines; each collection keeps 50 — the most common styles and their basic patterns, and
      a fill for the most common ([drums-app.md](drums-app.md)).
- [x] **The privacy policy**: <https://ms.vibetuned.com/privacy/> (`site/src/content/docs/privacy.md`).
- [x] **Screenshots**: `npm run store:screenshots` makes every size the stores ask for, into
      `store/screenshots/` ([store-listing.md](store-listing.md)).
- [x] **Real instruments**: MIDI tested on an iPad and an Android tablet.
- [ ] The **audience**, set in the stores: declaring children as the audience brings Google
      Play's Families policy and Apple's Kids category, which forbid links out of the app without
      a parental gate (the About screen's, the YouTube lessons).
