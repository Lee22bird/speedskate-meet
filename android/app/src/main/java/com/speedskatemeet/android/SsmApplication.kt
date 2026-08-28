package com.speedskatemeet.android

import android.app.Application
import com.speedskatemeet.android.network.SsmApiClient

class SsmApplication : Application() {
    val apiClient: SsmApiClient by lazy { SsmApiClient(this) }
}
