package com.dumostech.dumosrx

import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    // Fully transparent scrims (not just SystemBarStyle.auto's translucent
    // default) so the app's own background paints all the way under the
    // status/nav bars instead of showing Android's tint as a seam.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
  }

  // Called from Rust (set_nav_bar_light) whenever the web app's resolved
  // theme changes, so the system nav bar icons match the in-app theme
  // instead of the phone's OS-level dark/light setting.
  fun setNavigationBarLight(isLight: Boolean) {
    runOnUiThread {
      val controller = WindowInsetsControllerCompat(window, window.decorView)
      controller.isAppearanceLightNavigationBars = isLight
      controller.isAppearanceLightStatusBars = isLight
    }
  }
}
