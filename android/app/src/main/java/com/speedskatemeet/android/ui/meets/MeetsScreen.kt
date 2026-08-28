package com.speedskatemeet.android.ui.meets

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.speedskatemeet.android.SsmApplication
import com.speedskatemeet.android.network.MeetSummary
import com.speedskatemeet.android.ui.theme.SsmBackground
import com.speedskatemeet.android.ui.theme.SsmColors
import com.speedskatemeet.android.ui.theme.SsmRadius
import com.speedskatemeet.android.ui.theme.SsmSpacing
import com.speedskatemeet.android.ui.theme.SsmType
import com.speedskatemeet.android.ui.theme.ssmBubbleCard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

data class MeetsUiState(
    val meets: List<MeetSummary> = emptyList(),
    val isLoading: Boolean = true,
    val message: String? = null,
)

class MeetsViewModel(app: Application) : AndroidViewModel(app) {
    private val apiClient = (app as SsmApplication).apiClient
    private val _uiState = MutableStateFlow(MeetsUiState())
    val uiState: StateFlow<MeetsUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, message = null)
            runCatching { apiClient.api.meets() }
                .onSuccess { _uiState.value = MeetsUiState(meets = it.meets, isLoading = false) }
                .onFailure {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        message = if (_uiState.value.meets.isEmpty()) "Couldn't load meets. Pull to retry." else null,
                    )
                }
        }
    }
}

/** ISO "2026-10-31" → "Sat, Oct 31" (drops the year for this year) — FriendlyDate on iOS. */
fun friendlyDate(raw: String): String {
    if (raw.isBlank()) return raw
    return runCatching {
        val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(raw) ?: return raw
        val cal = Calendar.getInstance().apply { time = date }
        val sameYear = cal.get(Calendar.YEAR) == Calendar.getInstance().get(Calendar.YEAR)
        val pattern = if (sameYear) "EEE, MMM d" else "MMM d, yyyy"
        SimpleDateFormat(pattern, Locale.getDefault()).format(date)
    }.getOrDefault(raw)
}

@Composable
fun MeetsScreen(navController: NavHostController, viewModel: MeetsViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    SsmBackground {
        when {
            state.isLoading && state.meets.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = SsmColors.Sky)
                }
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(SsmSpacing.md),
                verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
            ) {
                item {
                    Column {
                        Text("SPEED SKATE MEET", style = SsmType.label, color = SsmColors.Sky)
                        Text("Find a Meet", style = SsmType.display)
                        Text(
                            "Live races, results, and what's coming up.",
                            style = SsmType.caption,
                        )
                        Spacer(Modifier.size(SsmSpacing.sm))
                    }
                }
                state.message?.let { msg ->
                    item {
                        Text(msg, style = SsmType.body, color = SsmColors.Muted,
                            modifier = Modifier.clickable { viewModel.load() })
                    }
                }
                items(state.meets, key = { it.id }) { meet ->
                    MeetCard(meet) {
                        navController.navigate("live/${meet.id}?name=${meet.meetName}")
                    }
                }
            }
        }
    }
}

@Composable
private fun MeetCard(meet: MeetSummary, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .ssmBubbleCard(tint = if (meet.isLiveNow) SsmColors.Mint else null)
            .clickable { onClick() }
            .padding(SsmSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SsmSpacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(RoundedCornerShape(SsmRadius.sm))
                .background(SsmColors.CardSoft),
            contentAlignment = Alignment.Center,
        ) {
            Text(meet.initials, style = SsmType.headline, color = SsmColors.Sky)
        }
        Column(Modifier.weight(1f)) {
            if (meet.isLiveNow) {
                Text("LIVE NOW", style = SsmType.label, color = SsmColors.Mint)
            }
            Text(meet.meetName, style = SsmType.headline)
            if (meet.date.isNotBlank()) {
                Text(friendlyDate(meet.date), style = SsmType.caption, color = SsmColors.Sky)
            }
            if (meet.location.isNotBlank()) {
                Text(meet.location, style = SsmType.caption)
            }
            meet.countsLabel?.let { Text(it, style = SsmType.caption) }
        }
    }
}
