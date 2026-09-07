package com.dumostech.dumosrx.widget

import android.content.Context
import android.content.Intent
import com.dumostech.dumosrx.MainActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.action.clickable
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.Text
import androidx.glance.text.FontWeight
import androidx.glance.text.TextStyle
import androidx.glance.color.ColorProvider
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private const val STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000L // 6 hours, per design spec

// "Dumos Blue" (client/app/globals.css --primary: oklch(0.55 0.18 250)),
// converted to sRGB since Glance colors need concrete values, not oklch.
private val BrandBlue = ColorProvider(day = Color(0xFF0072D5), night = Color(0xFF4B9EF5))
private val WarningAmber = ColorProvider(day = Color(0xFFB45309), night = Color(0xFFF0A94E))

/** Pre-resolved, render-ready widget state. Parsing/lookup happens in
 * [resolveContentState] (a plain function, so it's free to try/catch) and
 * this composable only ever pattern-matches on the result — Compose
 * disallows try/catch around composable calls, so any exception handling
 * must happen before rendering starts, not around it. */
private sealed interface ContentState {
    data object Unlinked : ContentState
    data class Data(
        val headerLabel: String,
        val salesText: String,
        val lowStockCount: Int,
        val expiringCount: Int,
        val isStale: Boolean,
        val updatedAtMs: Long,
    ) : ContentState
}

/**
 * The widget's actual rendering, separated from DumosRxWidgetProvider so it
 * can be reasoned about (and eventually previewed/tested) independent of
 * the AppWidgetProvider plumbing. Reads WidgetSnapshotStore + this
 * instance's WidgetConfigStore entry; renders every state from the design
 * spec's "Widget content & states" section.
 */
@Composable
fun DumosRxWidgetContent(context: Context, appWidgetId: Int) {
    when (val state = resolveContentState(context, appWidgetId)) {
        is ContentState.Unlinked -> UnlinkedState()
        is ContentState.Data -> DataState(context, state)
    }
}

// Any parse/shape failure here (e.g. a stale or malformed snapshot left
// over from a killed write or an old schema) must never escape to the
// caller: an uncaught exception in provideGlance is exactly what makes
// Android fall back to its system "Can't show content" error view instead
// of anything we render ourselves.
private fun resolveContentState(context: Context, appWidgetId: Int): ContentState {
    return try {
        val snapshotJson = WidgetSnapshotStore.read(context) ?: return ContentState.Unlinked
        val config = WidgetConfigStore.read(context, appWidgetId)

        val snapshot = JSONObject(snapshotJson)
        if (!snapshot.optBoolean("linked", false)) return ContentState.Unlinked

        val scope = if (config.mode == WidgetMode.STORE && config.storeId != null) {
            findStore(snapshot, config.storeId)
        } else {
            snapshot.optJSONObject("fleet")
        } ?: return ContentState.Unlinked

        val updatedAtMs = snapshot.optLong("updatedAtEpochMs", 0L)
        ContentState.Data(
            headerLabel = if (config.mode == WidgetMode.STORE) config.storeName ?: "Store" else "All stores",
            salesText = scope.optString("todaySalesFormatted", "-"),
            lowStockCount = scope.optInt("lowStockCount", 0),
            expiringCount = scope.optInt("expiringCount", 0),
            isStale = updatedAtMs > 0 && (System.currentTimeMillis() - updatedAtMs) > STALE_THRESHOLD_MS,
            updatedAtMs = updatedAtMs,
        )
    } catch (e: Exception) {
        ContentState.Unlinked
    }
}

private val CardBackground = ColorProvider(day = Color(0xFFFFFFFF), night = Color(0xFF1C1C1E))
private val MutedText = ColorProvider(day = Color(0xFF6B7280), night = Color(0xFF9CA3AF))
private val DividerColor = ColorProvider(day = Color(0xFFEDEFF2), night = Color(0xFF2C2C2E))

@Composable
private fun DataState(context: Context, state: ContentState.Data) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(20.dp)
            .background(CardBackground)
            .clickable(actionStartActivity<MainActivity>())
            .padding(16.dp),
    ) {
        Text(
            text = state.headerLabel,
            style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, color = MutedText),
        )

        Spacer(modifier = GlanceModifier.height(6.dp))

        Text(
            text = state.salesText,
            style = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold, color = BrandBlue),
        )

        if (state.lowStockCount > 0 || state.expiringCount > 0) {
            Spacer(modifier = GlanceModifier.height(8.dp))
            Row(modifier = GlanceModifier.fillMaxWidth().height(1.dp).background(DividerColor)) {}
            Spacer(modifier = GlanceModifier.height(8.dp))

            if (state.lowStockCount > 0) {
                TodoRow(
                    text = "${state.lowStockCount} ${if (state.lowStockCount == 1) "item" else "items"} low stock",
                    onClick = actionStartActivity(
                        Intent(context, MainActivity::class.java)
                            .putExtra(MainActivity.EXTRA_WIDGET_DEEPLINK, "/inventory/catalog?status=low_stock"),
                    ),
                )
            }
            if (state.expiringCount > 0) {
                TodoRow(
                    text = "${state.expiringCount} ${if (state.expiringCount == 1) "batch" else "batches"} expiring soon",
                    onClick = actionStartActivity(
                        Intent(context, MainActivity::class.java)
                            .putExtra(MainActivity.EXTRA_WIDGET_DEEPLINK, "/inventory/catalog?status=expiring_soon"),
                    ),
                )
            }
        }

        Spacer(modifier = GlanceModifier.height(8.dp))

        Text(
            text = if (state.isStale) "Updated a while ago — open app to refresh" else formatUpdatedAt(state.updatedAtMs),
            style = TextStyle(
                fontSize = 11.sp,
                color = if (state.isStale) WarningAmber else MutedText,
            ),
        )
    }
}

@Composable
private fun TodoRow(text: String, onClick: androidx.glance.action.Action) {
    Row(
        verticalAlignment = Alignment.Vertical.CenterVertically,
        modifier = GlanceModifier.fillMaxWidth().clickable(onClick).padding(vertical = 2.dp),
    ) {
        Text(text = "•", style = TextStyle(fontSize = 13.sp, color = WarningAmber, fontWeight = FontWeight.Bold))
        Spacer(modifier = GlanceModifier.width(4.dp))
        Text(text = text, style = TextStyle(fontSize = 13.sp, color = WarningAmber))
    }
}

@Composable
private fun UnlinkedState() {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(20.dp)
            .background(CardBackground)
            .clickable(actionStartActivity<MainActivity>())
            .padding(16.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically,
    ) {
        Text(
            text = "DUMOSRX",
            style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Bold, color = BrandBlue),
        )
        Spacer(modifier = GlanceModifier.height(4.dp))
        Text(
            text = "Connect your store",
            style = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(modifier = GlanceModifier.height(2.dp))
        Text(
            text = "Tap to link this device and see today's sales here",
            style = TextStyle(fontSize = 12.sp, color = MutedText),
        )
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
