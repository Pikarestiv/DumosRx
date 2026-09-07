package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Mirrors the app's Sanctum auth token into encrypted native storage.
 *
 * The app's own copy lives in localStorage, which under Tauri's Android
 * WebView is backed by the WebView engine's internal storage - unreachable
 * from a WorkManager Worker. This is the only other place the token is
 * allowed to live, kept in sync via MainActivity.mirrorAuthToken /
 * clearMirroredAuthToken, called from client/lib/api/token-manager.ts on
 * every login/logout. See docs/superpowers/specs/2026-09-07-android-glance-widget-design.md.
 */
object TokenStore {
    private const val PREFS_NAME = "dumosrx_widget_auth"
    private const val KEY_TOKEN = "mirrored_token"

    private fun prefs(context: Context) =
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    fun save(context: Context, token: String) {
        prefs(context).edit().putString(KEY_TOKEN, token).apply()
    }

    fun load(context: Context): String? =
        prefs(context).getString(KEY_TOKEN, null)

    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_TOKEN).apply()
    }
}
