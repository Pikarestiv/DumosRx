package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.runBlocking

class DumosRxWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val manager = GlanceAppWidgetManager(context)
        val appWidgetId = manager.getAppWidgetId(id)
        provideContent { DumosRxWidgetContent(context, appWidgetId) }
    }
}

class DumosRxWidgetProvider : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DumosRxWidget()

    companion object {
        fun requestUpdateAll(context: Context) {
            runBlocking { DumosRxWidget().updateAll(context) }
        }
    }
}
