// No commands of its own for the web app: the shell (src-tauri/src/lib.rs)
// calls the plugin from Rust, and the web app calls the shell's commands.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
