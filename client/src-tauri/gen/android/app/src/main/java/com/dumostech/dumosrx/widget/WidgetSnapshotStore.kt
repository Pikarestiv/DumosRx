package com.dumostech.dumosrx.widget

import android.content.Context

/**
 * Shared storage for the widget data snapshot (see the "Canonical widget
 * snapshot schema" in docs/superpowers/plans/2026-09-07-android-glance-widget.md).
 * Written by two independent producers - the app's foreground sync
 * (MainActivity.writeWidgetSnapshot, called from Rust) and RefreshWorker's
 * background fetch - and read only by DumosRxWidgetProvider. Neither writer
 * needs to know about the other; they just converge on this one key.
 */
object WidgetSnapshotStore {
    private const val PREFS_NAME = "dumosrx_widget_data"
    private const val KEY_SNAPSHOT = "snapshot_json"

    fun write(context: Context, snapshotJson: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SNAPSHOT, snapshotJson)
            .apply()
    }

    fun read(context: Context): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SNAPSHOT, null)
}
