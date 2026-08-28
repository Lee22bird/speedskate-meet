package com.speedskatemeet.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.speedskatemeet.android.ui.nav.SsmNavHost
import com.speedskatemeet.android.ui.theme.SpeedSkateMeetTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SpeedSkateMeetTheme {
                SsmNavHost()
            }
        }
    }
}
