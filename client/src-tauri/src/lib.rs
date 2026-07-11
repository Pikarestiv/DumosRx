#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  std::panic::set_hook(Box::new(|info| {
      log::error!("CRASH_PANIC: {:?}", info);
  }));

  #[cfg(any(target_os = "android", target_os = "ios"))]
  {
      if rustls::crypto::CryptoProvider::get_default().is_none() {
          if let Err(e) = rustls::crypto::ring::default_provider().install_default() {
              log::error!("Failed to install rustls crypto provider: {:?}", e);
          } else {
              log::info!("Successfully installed rustls crypto provider");
          }
      }
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
