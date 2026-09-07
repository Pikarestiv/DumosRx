package com.dumostech.dumosrx.widget

import android.content.Context

enum class WidgetMode { FLEET, STORE }

data class WidgetConfig(
    val mode: WidgetMode,
    val storeId: String?,
    val storeName: String?,
)

// Stub for Task 9 - always fleet mode. Replaced in Task 10 with a real
// per-appWidgetId-backed implementation (same read() signature, so
// DumosRxWidgetContent.kt's call site doesn't change).
object WidgetConfigStore {
    fun read(context: Context, appWidgetId: Int): WidgetConfig =
        WidgetConfig(mode = WidgetMode.FLEET, storeId = null, storeName = null)
}
