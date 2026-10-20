//! MIDI on a phone or tablet, for Midi Stroke's shell (src-tauri/src/lib.rs).
//!
//! The mobile webviews have no Web MIDI, and midir has no Android backend, so
//! the platform's own MIDI does it: CoreMIDI on iOS (ios/), android.media.midi
//! on Android (android/). Every source is listened to — USB, and Bluetooth
//! once paired from `bluetooth()` — and what it plays is raised as the same
//! Tauri events the desktop bridge raises ("midi-message" [status, data1,
//! data2], "midi-devices" [names]), so the web app reads MIDI the same way
//! everywhere. MIDI out (score playback, key lights) goes through `send`.
//!
//! On iOS the plugin also sets the audio session to playback (the app sounds
//! with the silent switch on) and keeps the screen awake while it is open.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
pub use mobile::NativeMidi;

mod error;
pub use error::{Error, Result};

/// The plugin's handle, from the app.
#[cfg(mobile)]
pub trait NativeMidiExt<R: Runtime> {
    fn native_midi(&self) -> &NativeMidi<R>;
}

#[cfg(mobile)]
impl<R: Runtime, T: tauri::Manager<R>> NativeMidiExt<R> for T {
    fn native_midi(&self) -> &NativeMidi<R> {
        self.state::<NativeMidi<R>>().inner()
    }
}

/// The plugin. On a computer it does nothing (the shell has midir there).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-midi")
        .setup(|app, api| {
            #[cfg(mobile)]
            {
                use tauri::Manager;
                let midi = mobile::init(app, api)?;
                app.manage(midi);
            }
            #[cfg(desktop)]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
