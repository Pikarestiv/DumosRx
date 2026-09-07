package com.dumostech.dumosrx

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.dumostech.dumosrx.widget.TokenStore
import com.dumostech.dumosrx.widget.WidgetSnapshotStore
import com.dumostech.dumosrx.widget.DumosRxWidgetProvider
import com.dumostech.dumosrx.widget.WidgetRefreshScheduler
import org.json.JSONObject

class MainActivity : TauriActivity() {
  companion object {
    const val EXTRA_WIDGET_DEEPLINK = "widget_deeplink"
    private const val COLD_START_DISPATCH_DELAY_MS = 800L
  }

  private var capturedWebView: WebView? = null
  private var pendingDeeplinkPath: String? = null

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
    WidgetRefreshScheduler.schedulePeriodic(applicationContext)
    intent?.getStringExtra(EXTRA_WIDGET_DEEPLINK)?.let { pendingDeeplinkPath = it }
  }

  // Cold-tap case handled in onCreate above (this Activity is
  // launchMode="singleTask", so Android only calls one of onCreate/
  // onNewIntent per launch). This handles the warm-tap case: the app's task
  // already exists, so the WebView and its JS listener are already up and
  // we can dispatch immediately.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    intent.getStringExtra(EXTRA_WIDGET_DEEPLINK)?.let { path -> dispatchDeeplinkEvent(path) }
  }

  // TauriActivity/WryActivity keep their WebView field (mWebView) private,
  // so this is the only available extension point to reach it.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    capturedWebView = webView

    pendingDeeplinkPath?.let { path ->
      pendingDeeplinkPath = null
      Handler(Looper.getMainLooper()).postDelayed({ dispatchDeeplinkEvent(path) }, COLD_START_DISPATCH_DELAY_MS)
    }
  }

  private fun dispatchDeeplinkEvent(path: String) {
    // JSONObject.quote() both quotes and escapes the string, so it's safe
    // to splice directly into the JS snippet below.
    val jsLiteral = JSONObject.quote(path)
    runOnUiThread {
      capturedWebView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('widget-deeplink', { detail: $jsLiteral }))",
        null,
      )
    }
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

  // Called from Rust (mirror_auth_token) on every login/token refresh, so
  // the WorkManager background refresh (RefreshWorker) can authenticate
  // without touching WebView-internal localStorage.
  fun mirrorAuthToken(token: String) {
    TokenStore.save(applicationContext, token)
  }

  // Called from Rust (clear_mirrored_auth_token) on logout.
  fun clearMirroredAuthToken() {
    TokenStore.clear(applicationContext)
  }

  // Called from Rust (write_widget_snapshot) whenever the app finishes a
  // successful widget-snapshot fetch (see use-widget-snapshot-sync.ts).
  fun writeWidgetSnapshot(snapshotJson: String) {
    WidgetSnapshotStore.write(applicationContext, snapshotJson)
    DumosRxWidgetProvider.requestUpdateAll(applicationContext)
  }
}
