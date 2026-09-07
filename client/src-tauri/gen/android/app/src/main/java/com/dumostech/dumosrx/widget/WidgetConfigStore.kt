package com.dumostech.dumosrx.widget

import android.content.Context

enum class WidgetMode { FLEET, STORE }

data class WidgetConfig(
    val mode: WidgetMode,
    val storeId: String?,
    val storeName: String?,
)

/** Per-widget-instance config (single-store vs fleet-wide), set once at
 * add-time via DumosRxWidgetConfigureActivity. Keyed by appWidgetId since a
 * user can add multiple widget instances with different scopes. */
object WidgetConfigStore {
    private const val PREFS_NAME = "dumosrx_widget_config"

    fun write(context: Context, appWidgetId: Int, mode: WidgetMode, storeId: String?, storeName: String?) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString("mode_$appWidgetId", mode.name)
            .putString("storeId_$appWidgetId", storeId)
            .putString("storeName_$appWidgetId", storeName)
            .apply()
    }

    fun read(context: Context, appWidgetId: Int): WidgetConfig {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val modeName = prefs.getString("mode_$appWidgetId", WidgetMode.FLEET.name)
        return WidgetConfig(
            mode = runCatching { WidgetMode.valueOf(modeName ?: WidgetMode.FLEET.name) }.getOrDefault(WidgetMode.FLEET),
            storeId = prefs.getString("storeId_$appWidgetId", null),
            storeName = prefs.getString("storeName_$appWidgetId", null),
        )
    }

    fun clear(context: Context, appWidgetId: Int) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove("mode_$appWidgetId")
            .remove("storeId_$appWidgetId")
            .remove("storeName_$appWidgetId")
            .apply()
    }
}
