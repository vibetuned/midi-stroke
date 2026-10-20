use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    plugin::{PluginApi, PluginHandle},
    AppHandle, Emitter, Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_midi);

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<NativeMidi<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.vibetuned.midistroke.nativemidi", "NativeMidiPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_native_midi)?;
    Ok(NativeMidi { handle, app: app.clone(), started: AtomicBool::new(false) })
}

/// The platform's MIDI.
pub struct NativeMidi<R: Runtime> {
    handle: PluginHandle<R>,
    app: AppHandle<R>,
    started: AtomicBool,
}

/// What `start` hands the native side: where to send each message, and the device list.
#[derive(Serialize)]
struct StartArgs {
    messages: Channel<serde_json::Value>,
    devices: Channel<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SendArgs {
    port_match: String,
    data: Vec<u8>,
}

/// A message from a source: [status, data1, data2] (data2 0 for a two-byte one).
#[derive(Deserialize)]
struct Message {
    m: [u8; 3],
}

/// The sources, by name; or, from `outputs`, the destinations.
#[derive(Deserialize)]
struct Names {
    names: Vec<String>,
}

fn json_of<T: DeserializeOwned>(body: &InvokeResponseBody) -> Option<T> {
    match body {
        InvokeResponseBody::Json(s) => serde_json::from_str(s).ok(),
        InvokeResponseBody::Raw(b) => serde_json::from_slice(b).ok(),
    }
}

impl<R: Runtime> NativeMidi<R> {
    /// Listen to every source, now and as they come and go, raising the
    /// shell's events. Once: later calls only resend the device list.
    pub fn start(&self) -> crate::Result<()> {
        let first = !self.started.swap(true, Ordering::SeqCst);
        let app = self.app.clone();
        let messages = Channel::new(move |body| {
            if let Some(Message { m }) = json_of(&body) {
                let _ = app.emit("midi-message", (m[0], m[1], m[2]));
            }
            Ok(())
        });
        let app = self.app.clone();
        let devices = Channel::new(move |body| {
            if let Some(Names { names }) = json_of(&body) {
                let _ = app.emit("midi-devices", names);
            }
            Ok(())
        });
        let result = self
            .handle
            .run_mobile_plugin::<serde_json::Value>("start", StartArgs { messages, devices })
            .map(|_| ())
            .map_err(Into::into);
        if first && result.is_err() {
            self.started.store(false, Ordering::SeqCst);
        }
        result
    }

    /// The destinations' names.
    pub fn outputs(&self) -> crate::Result<Vec<String>> {
        self.handle
            .run_mobile_plugin::<Names>("outputs", ())
            .map(|n| n.names)
            .map_err(Into::into)
    }

    /// Send raw bytes (a note, a SysEx frame) to the first destination whose
    /// name contains one of `port_match`'s "|"-separated words, as on desktop.
    pub fn send(&self, port_match: String, data: Vec<u8>) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin::<serde_json::Value>("send", SendArgs { port_match, data })
            .map(|_| ())
            .map_err(Into::into)
    }

    /// Pair a Bluetooth MIDI instrument: iOS's own Bluetooth MIDI view; on
    /// Android, a list of the instruments in range.
    pub fn bluetooth(&self) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin::<serde_json::Value>("bluetooth", ())
            .map(|_| ())
            .map_err(Into::into)
    }
}
