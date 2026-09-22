fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new()
                .commands(&["search", "open_page", "navigate"]),
        ),
    )
    .expect("Could not prepare Sreon desktop permissions");
}
