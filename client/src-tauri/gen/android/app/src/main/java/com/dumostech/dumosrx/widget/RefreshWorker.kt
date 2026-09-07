package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Background counterpart to use-widget-snapshot-sync.ts: runs on a
 * WorkManager schedule (see WidgetRefreshScheduler) so the widget stays
 * roughly fresh even when the app isn't open. Authenticates with the token
 * mirrored into TokenStore at login (the app's own localStorage token is
 * unreachable here - see the design spec's Risks section).
 */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        // Same host resolution the TS API client uses
        // (client/lib/api/base-client.ts) - kept in sync manually since a
        // Worker can't import TS config.
        private const val API_BASE_URL = "https://api.dumosrx.com/api/v1"
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val token = TokenStore.load(applicationContext) ?: run {
            WidgetSnapshotStore.write(applicationContext, unlinkedSnapshotJson())
            return@withContext Result.success()
        }

        var connection: HttpURLConnection? = null
        try {
            connection = URL("$API_BASE_URL/dashboard/widget-snapshot").openConnection() as HttpURLConnection
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000

            if (connection.responseCode == 401) {
                // Not transient: a revoked/expired token will never succeed on
                // retry, so retrying forever just burns battery on exponential
                // backoff. Clear the mirrored token and surface the unlinked
                // state instead.
                TokenStore.clear(applicationContext)
                WidgetSnapshotStore.write(applicationContext, unlinkedSnapshotJson())
                DumosRxWidgetProvider.requestUpdateAll(applicationContext)
                return@withContext Result.success()
            }

            if (connection.responseCode != 200) {
                return@withContext Result.retry()
            }

            val body = connection.inputStream.bufferedReader().use { it.readText() }

            WidgetSnapshotStore.write(applicationContext, reshapeToSnapshotJson(body))
            DumosRxWidgetProvider.requestUpdateAll(applicationContext)
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        } finally {
            connection?.disconnect()
        }
    }

    private fun unlinkedSnapshotJson(): String =
        JSONObject()
            .put("linked", false)
            .put("updatedAtEpochMs", System.currentTimeMillis())
            .toString()

    /** Mirrors buildWidgetSnapshotPayload() in client/lib/utils/widget-snapshot.ts - keep both in sync if the schema changes. */
    private fun reshapeToSnapshotJson(rawBody: String): String {
        val raw = JSONObject(rawBody)
        val fleetIn = raw.getJSONObject("fleet")
        val fleetOut = JSONObject()
            .put("todaySalesFormatted", fleetIn.getString("today_sales_formatted"))
            .put("lowStockCount", fleetIn.getInt("low_stock_alerts"))
            .put("expiringCount", fleetIn.getInt("expiring_items"))

        val storesIn = raw.getJSONArray("stores")
        val storesOut = JSONArray()
        for (i in 0 until storesIn.length()) {
            val s = storesIn.getJSONObject(i)
            storesOut.put(
                JSONObject()
                    .put("id", s.getString("id"))
                    .put("name", s.getString("name"))
                    .put("todaySalesFormatted", s.getString("today_sales_formatted"))
                    .put("lowStockCount", s.getInt("low_stock_alerts"))
                    .put("expiringCount", s.getInt("expiring_items")),
            )
        }

        return JSONObject()
            .put("linked", true)
            .put("updatedAtEpochMs", System.currentTimeMillis())
            .put("fleet", fleetOut)
            .put("stores", storesOut)
            .toString()
    }
}
