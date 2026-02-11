#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(feature = "desktop")]
mod desktop;

#[cfg(feature = "desktop")]
fn main() {
    desktop::run();
}

#[cfg(not(feature = "desktop"))]
fn main() {
    eprintln!("The desktop runtime is disabled. Re-run with --features desktop.");
}
