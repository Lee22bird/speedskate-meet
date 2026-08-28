package com.speedskatemeet.android.ui.staff

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.speedskatemeet.android.network.RaceDayStateResponse
import com.speedskatemeet.android.network.SetCurrentRaceRequest
import com.speedskatemeet.android.network.StepRaceRequest
import com.speedskatemeet.android.network.UnlockRaceRequest
import com.speedskatemeet.android.network.staffRoleDisplayName
import com.speedskatemeet.android.ui.theme.SsmBackground
import com.speedskatemeet.android.ui.theme.SsmColors
import com.speedskatemeet.android.ui.theme.SsmRadius
import com.speedskatemeet.android.ui.theme.SsmSpacing
import com.speedskatemeet.android.ui.theme.SsmType
import com.speedskatemeet.android.ui.theme.ssmBubbleCard
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StaffRaceDayUiState(
    val data: RaceDayStateResponse? = null,
    val isLoading: Boolean = true,
    val isSendingAction: Boolean = false,
    val message: String? = null,
)

class StaffRaceDayViewModel(app: Application) : AndroidViewModel(app) {
    private val apiClient = (app as SsmApplication).apiClient
    private val _uiState = MutableStateFlow(StaffRaceDayUiState())
    val uiState: StateFlow<StaffRaceDayUiState> = _uiState.asStateFlow()
    private var pollJob: Job? = null

    fun start(meetId: String) {
        if (pollJob != null) return
        pollJob = viewModelScope.launch {
            while (true) {
                load(meetId)
                delay(8_000)
            }
        }
    }

    fun stop() { pollJob?.cancel(); pollJob = null }

    private suspend fun load(meetId: String) {
        runCatching { apiClient.api.raceDayState(meetId) }
            .onSuccess { _uiState.value = _uiState.value.copy(data = it, isLoading = false, message = null) }
            .onFailure {
                if (_uiState.value.data == null) {
                    _uiState.value = _uiState.value.copy(isLoading = false, message = "Race day isn't available. Are you staff on this meet?")
                }
            }
    }

    private fun action(meetId: String, block: suspend () -> Unit) {
        if (_uiState.value.isSendingAction) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSendingAction = true)
            runCatching { block() }
                .onFailure { _uiState.value = _uiState.value.copy(message = "That didn't go through — try again.") }
            load(meetId)
            _uiState.value = _uiState.value.copy(isSendingAction = false)
        }
    }

    fun setCurrentRace(meetId: String, raceId: String) =
        action(meetId) { apiClient.api.setCurrentRace(meetId, SetCurrentRaceRequest(raceId)) }

    fun step(meetId: String, direction: Int) =
        action(meetId) { apiClient.api.stepRace(meetId, StepRaceRequest("$direction")) }

    fun togglePause(meetId: String) = action(meetId) { apiClient.api.togglePause(meetId) }

    fun unlockCurrent(meetId: String) {
        val raceId = _uiState.value.data?.current?.id ?: return
        action(meetId) { apiClient.api.unlockRace(meetId, UnlockRaceRequest(raceId)) }
    }
}

/** Phone staff race-day view (StaffRaceDayView.swift): status deck, director
 *  controls when allowed, links to Protests / Live / Results. */
@Composable
fun StaffRaceDayScreen(navController: NavHostController, meetId: String, meetName: String) {
    val viewModel: StaffRaceDayViewModel = viewModel()
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    DisposableEffect(meetId) {
        viewModel.start(meetId)
        onDispose { viewModel.stop() }
    }

    SsmBackground {
        when {
            state.isLoading && state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SsmColors.Sky)
            }
            state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(state.message ?: "Unavailable.", style = SsmType.body, color = SsmColors.Muted)
            }
            else -> Content(navController, meetId, meetName, state, viewModel)
        }
    }
}

@Composable
private fun Content(
    navController: NavHostController,
    meetId: String,
    meetName: String,
    state: StaffRaceDayUiState,
    viewModel: StaffRaceDayViewModel,
) {
    val data = state.data!!
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(staffRoleDisplayName(data.role).uppercase(), style = SsmType.label, color = SsmColors.Sky)
                Spacer(Modifier.weight(1f))
                Text(
                    "${data.progress.completed} / ${data.progress.total} · ${if (data.paused) "Paused" else "Running"}",
                    style = SsmType.caption,
                )
            }
        }
        item {
            Column(Modifier.fillMaxWidth().ssmBubbleCard(tint = SsmColors.Mint).padding(SsmSpacing.md)) {
                Text("CURRENT RACE", style = SsmType.label, color = SsmColors.Orange)
                Text(data.current?.groupLabel ?: "—", style = SsmType.title)
                Text("IN STAGING", style = SsmType.label, color = SsmColors.Sky,
                    modifier = Modifier.padding(top = SsmSpacing.sm))
                Text(data.next?.groupLabel ?: "—", style = SsmType.headline)
            }
        }

        if (data.canControlRaceDay) {
            item { ControlsCard(meetId, data, state, viewModel) }
        } else {
            item {
                Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
                    Text(
                        "${staffRoleDisplayName(data.role)}s have a read-only view here. Open Live Board or Results below to follow along.",
                        style = SsmType.caption,
                    )
                }
            }
        }

        item {
            val protestCount = data.protestUnresolvedCount ?: 0
            LinkRow("Protests${if (protestCount > 0) "  ·  $protestCount open" else ""}",
                tint = if (protestCount > 0) SsmColors.Peach else null) {
                navController.navigate("protests/$meetId?name=$meetName")
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
                Box(Modifier.weight(1f)) {
                    LinkRow("Live Board") { navController.navigate("live/$meetId?name=$meetName") }
                }
                Box(Modifier.weight(1f)) {
                    LinkRow("Results") { navController.navigate("results/$meetId?name=$meetName") }
                }
            }
        }
        state.message?.let { item { Text(it, style = SsmType.caption, color = SsmColors.Danger) } }
    }
}

@Composable
private fun ControlsCard(
    meetId: String,
    data: RaceDayStateResponse,
    state: StaffRaceDayUiState,
    viewModel: StaffRaceDayViewModel,
) {
    var showRacePicker by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
        Text("RACE CONTROLS", style = SsmType.label)
        Row(horizontalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
            ControlButton("← Previous", Modifier.weight(1f), enabled = !state.isSendingAction) {
                viewModel.step(meetId, -1)
            }
            ControlButton("Next →", Modifier.weight(1f), primary = true, enabled = !state.isSendingAction) {
                viewModel.step(meetId, 1)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
            ControlButton(if (data.paused) "Resume" else "Pause", Modifier.weight(1f), enabled = !state.isSendingAction) {
                viewModel.togglePause(meetId)
            }
            if (data.current?.status == "closed") {
                ControlButton("Unlock Race", Modifier.weight(1f), danger = true, enabled = !state.isSendingAction) {
                    viewModel.unlockCurrent(meetId)
                }
            }
        }
        ControlButton(if (showRacePicker) "Hide race list" else "Set current race…", Modifier.fillMaxWidth(),
            enabled = !state.isSendingAction) { showRacePicker = !showRacePicker }
        if (showRacePicker) {
            data.orderedRaces.forEach { race ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(SsmRadius.sm))
                        .background(if (race.isCurrent) SsmColors.CardSoft else SsmColors.Card)
                        .clickable(enabled = !state.isSendingAction) {
                            viewModel.setCurrentRace(meetId, race.id)
                            showRacePicker = false
                        }
                        .padding(SsmSpacing.sm),
                ) {
                    Text(race.label, style = SsmType.caption,
                        color = if (race.isCurrent) SsmColors.Mint else SsmColors.TextPrimary)
                }
            }
        }
    }
}

@Composable
private fun ControlButton(
    label: String,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    danger: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .height(46.dp)
            .clip(RoundedCornerShape(SsmRadius.sm))
            .background(
                when {
                    danger -> SsmColors.Danger
                    primary -> SsmColors.Orange
                    else -> SsmColors.CardSoft
                },
            )
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = SsmType.body)
    }
}

@Composable
fun LinkRow(label: String, tint: androidx.compose.ui.graphics.Color? = null, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .ssmBubbleCard(tint = tint)
            .clickable { onClick() }
            .padding(SsmSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = SsmType.headline, modifier = Modifier.weight(1f))
        Text("→", style = SsmType.headline, color = SsmColors.Muted)
    }
}
