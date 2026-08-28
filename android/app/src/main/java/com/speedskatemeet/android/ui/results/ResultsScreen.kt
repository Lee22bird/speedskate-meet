package com.speedskatemeet.android.ui.results

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.speedskatemeet.android.SsmApplication
import com.speedskatemeet.android.network.OpenResultsSection
import com.speedskatemeet.android.network.ResultsResponse
import com.speedskatemeet.android.network.StandardResultsSection
import com.speedskatemeet.android.ui.live.MeetPickerList
import com.speedskatemeet.android.ui.theme.SsmBackground
import com.speedskatemeet.android.ui.theme.SsmColors
import com.speedskatemeet.android.ui.theme.SsmSpacing
import com.speedskatemeet.android.ui.theme.SsmType
import com.speedskatemeet.android.ui.theme.ssmBubbleCard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ResultsUiState(
    val data: ResultsResponse? = null,
    val isLoading: Boolean = true,
    val message: String? = null,
)

class ResultsViewModel(app: Application) : AndroidViewModel(app) {
    private val apiClient = (app as SsmApplication).apiClient
    private val _uiState = MutableStateFlow(ResultsUiState())
    val uiState: StateFlow<ResultsUiState> = _uiState.asStateFlow()

    fun load(meetId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, message = null)
            runCatching { apiClient.api.results(meetId) }
                .onSuccess { _uiState.value = ResultsUiState(data = it, isLoading = false) }
                .onFailure { _uiState.value = ResultsUiState(isLoading = false, message = "Results aren't available yet.") }
        }
    }
}

/** Results tab: meet picker at the root; standings once a meet is chosen. */
@Composable
fun ResultsScreen(navController: NavHostController, meetId: String?, meetName: String?) {
    if (meetId == null) {
        MeetPickerList(navController, routePrefix = "results", header = "Results")
        return
    }
    val viewModel: ResultsViewModel = viewModel()
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(meetId) { viewModel.load(meetId) }

    SsmBackground {
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SsmColors.Sky)
            }
            state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(state.message ?: "No results yet.", style = SsmType.body, color = SsmColors.Muted)
            }
            else -> ResultsContent(state.data!!)
        }
    }
}

@Composable
private fun ResultsContent(data: ResultsResponse) {
    val standardSections = data.standard.filter { it.standings.isNotEmpty() }
    val quadSections = data.quad.filter { it.standings.isNotEmpty() }
    val openSections = data.open.filter { it.results.isNotEmpty() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
    ) {
        if (standardSections.isEmpty() && quadSections.isEmpty() && openSections.isEmpty()) {
            item { Text("No standings yet — check back once racing starts.", style = SsmType.caption) }
        }
        items(standardSections, key = { "s-${it.groupLabel}-${it.division}" }) { StandingsCard(it) }
        if (quadSections.isNotEmpty()) {
            item { Text("QUAD", style = SsmType.label, color = SsmColors.Orange) }
            items(quadSections, key = { "q-${it.groupLabel}-${it.division}" }) { StandingsCard(it) }
        }
        if (openSections.isNotEmpty()) {
            item { Text("OPEN RACES", style = SsmType.label, color = SsmColors.Orange) }
            items(openSections, key = { "o-${it.groupLabel}-${it.distanceLabel}" }) { OpenCard(it) }
        }
    }
}

@Composable
private fun StandingsCard(section: StandardResultsSection) {
    Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
        // Mint titles = race/section boundaries, matching the app-wide pattern.
        Text(
            "${section.groupLabel}${if (section.division.isNotBlank()) " — ${section.division.replaceFirstChar { it.uppercase() }}" else ""}",
            style = SsmType.headline, color = SsmColors.Mint,
        )
        Spacer(Modifier.height(SsmSpacing.xs))
        section.standings.forEach { row ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dpValue())) {
                Text("${row.place}", style = SsmType.body, color = SsmColors.Sky,
                    modifier = Modifier.width(30.dpValue()))
                Text(row.skaterName, style = SsmType.body, modifier = Modifier.weight(1f))
                Text(row.team, style = SsmType.caption, modifier = Modifier.padding(end = SsmSpacing.sm))
                Text(trimPoints(row.totalPoints), style = SsmType.body, color = SsmColors.Peach)
            }
        }
    }
}

@Composable
private fun OpenCard(section: OpenResultsSection) {
    Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
        Text("${section.groupLabel} — ${section.distanceLabel}", style = SsmType.headline, color = SsmColors.Mint)
        Spacer(Modifier.height(SsmSpacing.xs))
        section.results.forEach { row ->
            Row(Modifier.fillMaxWidth()) {
                Text(row.place ?: "—", style = SsmType.body, color = SsmColors.Sky,
                    modifier = Modifier.width(30.dpValue()))
                Text(row.skaterName, style = SsmType.body, modifier = Modifier.weight(1f))
                Text(row.team, style = SsmType.caption)
            }
        }
    }
}

private fun trimPoints(points: Double): String =
    if (points == points.toLong().toDouble()) "${points.toLong()}" else "%.1f".format(points)

private fun Int.dpValue() = androidx.compose.ui.unit.Dp(this.toFloat())
