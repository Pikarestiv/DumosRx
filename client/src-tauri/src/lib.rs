#[cfg(target_os = "android")]
#[tauri::command]
fn set_nav_bar_light(window: tauri::WebviewWindow, is_light: bool) {
  use jni::objects::JValue;

  let _ = window.with_webview(move |webview| {
    webview.jni_handle().exec(move |env, activity, _webview| {
      if let Err(e) = env.call_method(
        activity,
        "setNavigationBarLight",
        "(Z)V",
        &[JValue::Bool(is_light as u8)],
      ) {
        log::error!("Failed to set navigation bar appearance: {:?}", e);
      }
    });
  });
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn set_nav_bar_light(is_light: bool) {
  let _ = is_light;
}

#[cfg(target_os = "android")]
#[tauri::command]
fn mirror_auth_token(window: tauri::WebviewWindow, token: String) {
  use jni::objects::JValue;

  let _ = window.with_webview(move |webview| {
    webview.jni_handle().exec(move |env, activity, _webview| {
      let jtoken = match env.new_string(&token) {
        Ok(s) => s,
        Err(e) => {
          log::error!("Failed to build JNI string for token mirror: {:?}", e);
          return;
        }
      };
      if let Err(e) = env.call_method(
        activity,
        "mirrorAuthToken",
        "(Ljava/lang/String;)V",
        &[JValue::Object(&jtoken)],
      ) {
        log::error!("Failed to mirror auth token: {:?}", e);
      }
    });
  });
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn mirror_auth_token(token: String) {
  let _ = token;
}

#[cfg(target_os = "android")]
#[tauri::command]
fn clear_mirrored_auth_token(window: tauri::WebviewWindow) {
  let _ = window.with_webview(move |webview| {
    webview.jni_handle().exec(move |env, activity, _webview| {
      if let Err(e) = env.call_method(activity, "clearMirroredAuthToken", "()V", &[]) {
        log::error!("Failed to clear mirrored auth token: {:?}", e);
      }
    });
  });
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn clear_mirrored_auth_token() {}

#[cfg(target_os = "android")]
#[tauri::command]
fn write_widget_snapshot(window: tauri::WebviewWindow, snapshot_json: String) {
  use jni::objects::JValue;

  let _ = window.with_webview(move |webview| {
    webview.jni_handle().exec(move |env, activity, _webview| {
      let jjson = match env.new_string(&snapshot_json) {
        Ok(s) => s,
        Err(e) => {
          log::error!("Failed to build JNI string for widget snapshot: {:?}", e);
          return;
        }
      };
      if let Err(e) = env.call_method(
        activity,
        "writeWidgetSnapshot",
        "(Ljava/lang/String;)V",
        &[JValue::Object(&jjson)],
      ) {
        log::error!("Failed to write widget snapshot: {:?}", e);
      }
    });
  });
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn write_widget_snapshot(snapshot_json: String) {
  let _ = snapshot_json;
}

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
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![set_nav_bar_light, mirror_auth_token, clear_mirrored_auth_token, write_widget_snapshot])
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
