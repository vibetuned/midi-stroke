#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Forward webview console/errors to stderr (headless diagnostics).
#[tauri::command]
fn js_log(msg: String) {
    eprintln!("[js] {msg}");
}

/// Native MIDI: the Tauri webview (WKWebView / WebKitGTK) has no Web MIDI
/// API, so the shell bridges it — every input port is connected and each
/// channel-voice message streams to the webview as a Tauri event
/// ("midi-message", payload [status, data1, data2]), with the device list on
/// "midi-devices". A 2s poll handles hot-plug (midir has no callbacks).
///
/// Unlike a note-only bridge, the full 3-byte message is forwarded: the
/// trainer needs velocity (piano/drums), and CC#2/7/11 + channel pressure
/// (saxo breath). System real-time/common messages (status >= 0xF0 — clock,
/// active sensing…) are dropped at the source to avoid event spam.
fn spawn_midi(app: tauri::AppHandle) {
    use tauri::Emitter;
    std::thread::spawn(move || {
        // Smoke-test path: fake a device and a short note without hardware.
        if std::env::var("MIDISTROKE_MIDI_TEST").as_deref() == Ok("1") {
            std::thread::sleep(std::time::Duration::from_millis(4000));
            let _ = app.emit("midi-devices", vec!["Test Piano (fake)".to_string()]);
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let _ = app.emit("midi-message", (0x90u8, 60u8, 100u8));
            std::thread::sleep(std::time::Duration::from_millis(200));
            let _ = app.emit("midi-message", (0x80u8, 60u8, 0u8));
            return;
        }
        let mut connections: Vec<midir::MidiInputConnection<()>> = Vec::new();
        let mut last_names: Vec<String> = Vec::new();
        loop {
            let names = (|| -> Option<Vec<String>> {
                let mut probe = midir::MidiInput::new("midi-stroke-probe").ok()?;
                probe.ignore(midir::Ignore::None);
                Some(probe.ports().iter().filter_map(|p| probe.port_name(p).ok()).collect())
            })()
            .unwrap_or_default();
            if names != last_names {
                connections.clear(); // drop = disconnect
                if let Ok(probe) = midir::MidiInput::new("midi-stroke-probe") {
                    for port in probe.ports() {
                        let Ok(mut input) = midir::MidiInput::new("midi-stroke") else { continue };
                        input.ignore(midir::Ignore::None);
                        let app2 = app.clone();
                        if let Ok(conn) = input.connect(
                            &port,
                            "midi-stroke-in",
                            move |_ts, msg, _| {
                                let Some(&status) = msg.first() else { return };
                                if status >= 0xF0 {
                                    return; // system messages: clock, active sensing…
                                }
                                let d1 = msg.get(1).copied().unwrap_or(0);
                                let d2 = msg.get(2).copied().unwrap_or(0);
                                let _ = app2.emit("midi-message", (status, d1, d2));
                            },
                            (),
                        ) {
                            connections.push(conn);
                        }
                    }
                }
                eprintln!("[shell] midi devices: {names:?}");
                last_names = names;
            }
            // Re-emit every tick: the first scan fires before the webview
            // has subscribed, so a change-only emit is never seen (the
            // frontend dedupes, so steady state is cheap).
            let _ = app.emit("midi-devices", last_names.clone());
            // The poll interval. On macOS a plain sleep would freeze the
            // device list forever: CoreMIDI posts hot-plug notifications to
            // THIS thread's run loop, and enumeration only updates after
            // they are processed — so pump the run loop for the interval
            // (falling back to sleep in the slices where it has no sources
            // and returns immediately).
            #[cfg(target_os = "macos")]
            {
                use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop, CFRunLoopRunResult};
                let deadline = std::time::Instant::now() + std::time::Duration::from_millis(2000);
                while std::time::Instant::now() < deadline {
                    let r = unsafe { CFRunLoop::run_in_mode(kCFRunLoopDefaultMode, std::time::Duration::from_millis(250), false) };
                    if matches!(r, CFRunLoopRunResult::Finished) {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            std::thread::sleep(std::time::Duration::from_millis(2000));
        }
    });
}

fn main() {
    if tauri::is_dev() {
        eprintln!(
            "[shell] mode: DEV SERVER — this build loads http://localhost:5173.\n\
             [shell] start it with `npm run dev:tauri`, or use `npm run tauri dev`\n\
             [shell] which launches both."
        );
    } else {
        eprintln!("[shell] mode: embedded assets (self-contained build) v{}", env!("CARGO_PKG_VERSION"));
    }
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            spawn_midi(app.app_handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![js_log])
        .run(tauri::generate_context!())
        .expect("error while running midi-stroke");
}
