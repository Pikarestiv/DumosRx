package com.dumostech.dumosrx.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.RadioButton
import android.widget.RadioGroup
import com.dumostech.dumosrx.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * Shown once when a widget instance is first added to the home screen.
 * Lets the owner pick "all stores" or one specific store; stored per
 * appWidgetId in WidgetConfigStore. Reconfiguring later means removing and
 * re-adding the widget - the standard Android pattern (see the design
 * spec's "Widget reconfiguration UX" open question).
 */
class DumosRxWidgetConfigureActivity : Activity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(Activity.RESULT_CANCELED)
        setContentView(R.layout.activity_widget_configure)

        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val group = findViewById<RadioGroup>(R.id.widget_scope_group)
        val stores = readStoresFromSnapshot()
        val storeButtonIds = mutableMapOf<Int, JSONObject>()

        stores.forEach { store ->
            val button = RadioButton(this).apply { text = store.getString("name") }
            group.addView(button)
            storeButtonIds[button.id] = store
        }

        findViewById<android.widget.Button>(R.id.widget_scope_confirm).setOnClickListener {
            val checkedId = group.checkedRadioButtonId
            val selectedStore = storeButtonIds[checkedId]

            if (selectedStore != null) {
                WidgetConfigStore.write(
                    this, appWidgetId, WidgetMode.STORE,
                    selectedStore.getString("id"), selectedStore.getString("name"),
                )
            } else {
                WidgetConfigStore.write(this, appWidgetId, WidgetMode.FLEET, null, null)
            }

            DumosRxWidgetProvider.requestUpdateAll(applicationContext)

            val resultValue = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            setResult(Activity.RESULT_OK, resultValue)
            finish()
        }
    }

    private fun readStoresFromSnapshot(): List<JSONObject> {
        val json = WidgetSnapshotStore.read(applicationContext) ?: return emptyList()
        val snapshot = JSONObject(json)
        if (!snapshot.optBoolean("linked", false)) return emptyList()
        val storesArray: JSONArray = snapshot.optJSONArray("stores") ?: JSONArray()
        return (0 until storesArray.length()).map { storesArray.getJSONObject(it) }
    }
}
