package com.speedskatemeet.android.ui.live

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import com.speedskatemeet.android.network.LaneEntry
import com.speedskatemeet.android.network.LiveRaceDayResponse
import com.speedskatemeet.android.network.MeetSummary
import com.speedskatemeet.android.network.RaceDayItem
import com.speedskatemeet.android.ui.meets.MeetsViewModel
import com.speedskatemeet.android.ui.meets.friendlyDate
import com.speedskatemeet.android.ui.theme.SsmBackground
import com.speedskatemeet.android.ui.theme.SsmColors
import com.speedskatemeet.android.ui.theme.SsmSpacing
import com.speedskatemeet.android.ui.theme.SsmType
import com.speedskatemeet.android.ui.theme.ssmBubbleCard
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LiveUiState(
    val data: LiveRaceDayResponse? = null,
    val isLoading: Boolean = true,
    val message: String? = null,
)

class LiveViewModel(app: Application) : AndroidViewModel(app) {
    private val apiClient = (app as SsmApplication).apiClient
    private val _uiState = MutableStateFlow(LiveUiState())
    val uiState: StateFlow<LiveUiState> = _uiState.asStateFlow()
    private var pollJob: Job? = null

    fun start(meetId: String) {
        if (pollJob != null) return
        pollJob = viewModelScope.launch {
            while (true) {
                runCatching { apiClient.api.live(meetId) }
                    .onSuccess { _uiState.value = LiveUiState(data = it, isLoading = false) }
                    .onFailure {
                        if (_uiState.value.data == null) {
                            _uiState.value = LiveUiState(isLoading = false, message = "Live feed unavailable right now.")
                        }
                    }
                delay(10_000)
            }
        }
    }

    fun stop() {
        pollJob?.cancel()
        pollJob = null
    }
}

/**
 * Live tab. With no meetId it lists meets to pick from (like LiveTabRootView on
 * iOS); with a meetId it's the live board: Now Racing + lanes, In Staging,
 * Coming Up (peach), Recent Results (mint titles + dividers).
 */
@Composable
fun LiveScreen(navController: NavHostController, meetId: String?, meetName: String?) {
    if (meetId == null) {
        MeetPickerList(navController, routePrefix = "live", header = "Live")
        return
    }
    val viewModel: LiveViewModel = viewModel()
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
                Text(state.message ?: "Nothing live right now.", style = SsmType.body, color = SsmColors.Muted)
            }
            else -> LiveContent(state.data!!)
        }
    }
}

@Composable
private fun LiveContent(data: LiveRaceDayResponse) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
    ) {
        item {
            val current = data.current
            Column(Modifier.fillMaxWidth().ssmBubbleCard(tint = SsmColors.Mint).padding(SsmSpacing.md)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(SsmColors.Good))
                    Spacer(Modifier.size(SsmSpacing.xs))
                    Text("NOW RACING", style = SsmType.label, color = SsmColors.Orange)
                    Spacer(Modifier.weight(1f))
                    Text(
                        "Race ${minOf(data.progress.completed + 1, maxOf(data.progress.total, 1))} of ${data.progress.total}",
                        style = SsmType.caption,
                    )
                }
                if (current != null) {
                    Text(current.groupLabel, style = SsmType.title)
                    Text(
                        listOfNotNull(
                            current.division?.replaceFirstChar { it.uppercase() },
                            current.distanceLabel,
                            current.stage,
                        ).filter { it.isNotBlank() }.joinToString("  •  "),
                        style = SsmType.caption,
                    )
                    if (current.isMergedPack && !current.packLabel.isNullOrBlank()) {
                        Text("🔗 One pack — ${current.packLabel} (scored separately)",
                            style = SsmType.caption, color = SsmColors.Peach)
                    }
                    Spacer(Modifier.height(SsmSpacing.sm))
                    LaneList(current)
                } else {
                    Text("Stand By", style = SsmType.title, color = SsmColors.Muted)
                    Text("Between races", style = SsmType.caption)
                }
            }
        }

        data.next?.let { next ->
            item {
                Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
                    Text("IN STAGING", style = SsmType.label, color = SsmColors.Sky)
                    Text(next.groupLabel, style = SsmType.headline)
                    Text(
                        listOfNotNull(next.division?.replaceFirstChar { it.uppercase() }, next.distanceLabel)
                            .filter { it.isNotBlank() }.joinToString("  •  "),
                        style = SsmType.caption,
                    )
                }
            }
        }

        if (data.coming.isNotEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
                    Text("AFTER THAT", style = SsmType.label)
                    Spacer(Modifier.height(SsmSpacing.xs))
                    data.coming.forEach { item ->
                        Text("${item.groupLabel} — ${item.distanceLabel}",
                            style = SsmType.body, color = SsmColors.Peach)
                    }
                }
            }
        }

        if (data.recentResults.isNotEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
                    Text("RECENT RESULTS", style = SsmType.label)
                    Spacer(Modifier.height(SsmSpacing.xs))
                    data.recentResults.forEachIndexed { index, race ->
                        if (index > 0) {
                            HorizontalDivider(color = SsmColors.Border, modifier = Modifier.padding(vertical = SsmSpacing.xs))
                        }
                        // Mint titles so the eye finds race boundaries (matches iOS).
                        Text("${race.groupLabel} — ${race.distanceLabel}",
                            style = SsmType.body, color = SsmColors.Mint)
                        race.results.forEach { row ->
                            Row(Modifier.fillMaxWidth()) {
                                Text(row.status ?: row.place ?: "—", style = SsmType.body,
                                    color = SsmColors.Muted, modifier = Modifier.padding(end = SsmSpacing.sm))
                                Text(row.skaterName, style = SsmType.body, modifier = Modifier.weight(1f))
                                Text(row.team, style = SsmType.caption)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LaneList(item: RaceDayItem) {
    Column(verticalArrangement = Arrangement.spacedBy(SsmSpacing.xs)) {
        item.displayLanes.forEach { lane -> LaneRow(item, lane) }
    }
}

@Composable
private fun LaneRow(item: RaceDayItem, lane: LaneEntry) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(30.dp).clip(CircleShape).background(SsmColors.Orange),
            contentAlignment = Alignment.Center,
        ) {
            Text("${lane.lane}", style = SsmType.body)
        }
        Spacer(Modifier.size(SsmSpacing.sm))
        Column(Modifier.weight(1f)) {
            Text(
                if (item.isRelayRace) lane.team.ifBlank { "Lane ${lane.lane}" } else lane.skaterName,
                style = SsmType.body,
            )
            val meta = buildList {
                lane.helmetNumber?.takeIf { it.isNotBlank() }?.let { add("#$it") }
                if (!item.isRelayRace && lane.team.isNotBlank()) add(lane.team)
                lane.division?.takeIf { it.isNotBlank() }?.let { add(it) }
            }.joinToString(" · ")
            if (meta.isNotEmpty()) Text(meta, style = SsmType.caption)
        }
    }
}

/** Shared meet picker used by the Live and Results tabs' root state. */
@Composable
fun MeetPickerList(
    navController: NavHostController,
    routePrefix: String,
    header: String,
    viewModel: MeetsViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    SsmBackground {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(SsmSpacing.md),
            verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
        ) {
            item {
                Text("SPEED SKATE MEET", style = SsmType.label, color = SsmColors.Sky)
                Text(header, style = SsmType.display)
                Spacer(Modifier.height(SsmSpacing.sm))
            }
            items(state.meets, key = { it.id }) { meet ->
                PickerRow(meet) { navController.navigate("$routePrefix/${meet.id}?name=${meet.meetName}") }
            }
            if (!state.isLoading && state.meets.isEmpty()) {
                item { Text("No meets yet.", style = SsmType.caption) }
            }
        }
    }
}

@Composable
private fun PickerRow(meet: MeetSummary, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .ssmBubbleCard(tint = if (meet.isLiveNow) SsmColors.Mint else null)
            .clickable { onClick() }
            .padding(SsmSpacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(meet.meetName, style = SsmType.headline, modifier = Modifier.weight(1f))
            if (meet.isLiveNow) Text("LIVE NOW", style = SsmType.label, color = SsmColors.Mint)
        }
        if (meet.date.isNotBlank()) Text(friendlyDate(meet.date), style = SsmType.caption, color = SsmColors.Sky)
        if (meet.location.isNotBlank()) Text(meet.location, style = SsmType.caption)
    }
}
