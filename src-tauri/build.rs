fn main() {
    // Android: Google Play requires 64-bit native libraries aligned for 16 KB
    // memory pages (apps targeting Android 15 and later). NDK 27 still links
    // for 4 KB, and the Tauri CLI sets its own RUSTFLAGS (which would override
    // a .cargo/config.toml), so the shell's library asks the linker itself.
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let width = std::env::var("CARGO_CFG_TARGET_POINTER_WIDTH").unwrap_or_default();
    if os == "android" && width == "64" {
        println!("cargo:rustc-link-arg-cdylib=-Wl,-z,max-page-size=16384");
    }
    tauri_build::build()
}
