package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.FontWeight
import androidx.glance.text.TextStyle
import androidx.glance.color.ColorProvider
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private const val STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000L // 6 hours, per design spec

/**
 * The widget's actual rendering, separated from DumosRxWidgetProvider so it
 * can be reasoned about (and eventually previewed/tested) independent of
 * the AppWidgetProvider plumbing. Reads WidgetSnapshotStore + this
 * instance's WidgetConfigStore entry; renders every state from the design
 * spec's "Widget content & states" section.
 */
@Composable
fun DumosRxWidgetContent(context: Context, appWidgetId: Int) {
    val snapshotJson = WidgetSnapshotStore.read(context)
    val config = WidgetConfigStore.read(context, appWidgetId)

    if (snapshotJson == null) {
        UnlinkedState()
        return
    }

    val snapshot = JSONObject(snapshotJson)
    if (!snapshot.optBoolean("linked", false)) {
        UnlinkedState()
        return
    }

    val scope = if (config.mode == WidgetMode.STORE && config.storeId != null) {
        findStore(snapshot, config.storeId)
    } else {
        snapshot.getJSONObject("fleet")
    }

    if (scope == null) {
        UnlinkedState()
        return
    }

    val headerLabel = if (config.mode == WidgetMode.STORE) config.storeName ?: "Store" else "All stores"
    val updatedAtMs = snapshot.optLong("updatedAtEpochMs", 0L)
    val isStale = updatedAtMs > 0 && (System.currentTimeMillis() - updatedAtMs) > STALE_THRESHOLD_MS

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .padding(12.dp)
            .background(ColorProvider(day = androidx.compose.ui.graphics.Color.White, night = androidx.compose.ui.graphics.Color.Black))
            .clickable(actionStartActivity<com.dumostech.dumosrx.MainActivity>()),
    ) {
        Text(text = headerLabel, style = TextStyle(fontWeight = FontWeight.Bold))
        Text(text = scope.optString("todaySalesFormatted", "-"), style = TextStyle(fontWeight = FontWeight.Bold))

        val lowStock = scope.optInt("lowStockCount", 0)
        if (lowStock > 0) {
            Text(text = "$lowStock items low stock")
        }

        val expiring = scope.optInt("expiringCount", 0)
        if (expiring > 0) {
            Text(text = "$expiring batches expiring soon")
        }

        Text(
            text = if (isStale) "Updated a while ago - open app to refresh" else formatUpdatedAt(updatedAtMs),
            style = TextStyle(color = ColorProvider(day = androidx.compose.ui.graphics.Color.Gray, night = androidx.compose.ui.graphics.Color.LightGray)),
        )
    }
}

@Composable
private fun UnlinkedState() {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .padding(12.dp)
            .clickable(actionStartActivity<com.dumostech.dumosrx.MainActivity>()),
    ) {
        Text(text = "Open DumosRx to connect your account", style = TextStyle(fontWeight = FontWeight.Bold))
    }
}

private fun findStore(snapshot: JSONObject, storeId: String): JSONObject? {
    val stores = snapshot.optJSONArray("stores") ?: return null
    for (i in 0 until stores.length()) {
        val store = stores.getJSONObject(i)
        if (store.optString("id") == storeId) return store
    }
    return null
}

private fun formatUpdatedAt(updatedAtMs: Long): String {
    if (updatedAtMs <= 0L) return "Updated just now"
    val minutesAgo = TimeUnit.MILLISECONDS.toMinutes(System.currentTimeMillis() - updatedAtMs)
    return when {
        minutesAgo < 1 -> "Updated just now"
        minutesAgo < 60 -> "Updated ${minutesAgo}m ago"
        else -> "Updated ${minutesAgo / 60}h ago"
    }
}
