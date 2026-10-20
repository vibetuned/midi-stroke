#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The desktop binary: the shell itself is the library (lib.rs), which the
// mobile apps load too.
fn main() {
    midi_stroke_lib::run()
}
