package com.speedskatemeet.android.ui.coach

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.speedskatemeet.android.SsmApplication
import com.speedskatemeet.android.network.CoachProtestForm
import com.speedskatemeet.android.network.CoachRelayBuilderData
import com.speedskatemeet.android.network.RelayDivision
import com.speedskatemeet.android.network.SaveRelayTeamEntry
import com.speedskatemeet.android.network.SaveRelayTeamsRequest
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

data class CoachToolsUiState(
    val protestForm: CoachProtestForm? = null,
    val relayData: CoachRelayBuilderData? = null,
    /** Local editable teams per divisionId (list of teams; each = member reg ids). */
    val localTeams: Map<String, List<List<String>>> = emptyMap(),
    val isLoading: Boolean = true,
    val isWorking: Boolean = false,
    val message: String? = null,
    val flash: String? = null,
)

class CoachToolsViewModel(app: Application) : AndroidViewModel(app) {
    private val apiClient = (app as SsmApplication).apiClient
    private val _uiState = MutableStateFlow(CoachToolsUiState())
    val uiState: StateFlow<CoachToolsUiState> = _uiState.asStateFlow()

    fun load(meetId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = _uiState.value.protestForm == null)
            val form = runCatching { apiClient.api.coachProtestForm(meetId) }.getOrNull()
            val relay = runCatching { apiClient.api.coachRelayBuilder(meetId) }.getOrNull()
            _uiState.value = _uiState.value.copy(
                protestForm = form,
                relayData = relay,
                localTeams = relay?.divisions?.associate { div ->
                    div.id to div.teams.map { it.memberRegIds }
                } ?: _uiState.value.localTeams,
                isLoading = false,
                message = if (form == null && relay == null) "Coach tools aren't available for you on this meet." else null,
            )
        }
    }

    fun fileProtest(meetId: String, category: String, raceId: String, raceLabel: String,
                    registrationId: String, statement: String, onDone: (Boolean) -> Unit) {
        if (category.isBlank() || statement.isBlank()) {
            _uiState.value = _uiState.value.copy(message = "Pick a category and write your statement.")
            onDone(false); return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isWorking = true, message = null, flash = null)
            val result = runCatching {
                apiClient.api.fileCoachProtest(meetId, category, raceId, raceLabel, registrationId, statement.trim())
            }
            _uiState.value = _uiState.value.copy(isWorking = false)
            if (result.isSuccess) {
                _uiState.value = _uiState.value.copy(flash = "Protest filed — the officials have it.")
                load(meetId); onDone(true)
            } else {
                _uiState.value = _uiState.value.copy(message = "Couldn't file the protest. Check the deadline and try again.")
                onDone(false)
            }
        }
    }

    fun addTeam(divisionId: String, members: List<String>) {
        val current = _uiState.value.localTeams.toMutableMap()
        current[divisionId] = (current[divisionId] ?: emptyList()) + listOf(members)
        _uiState.value = _uiState.value.copy(localTeams = current)
    }

    fun removeTeam(divisionId: String, index: Int) {
        val current = _uiState.value.localTeams.toMutableMap()
        current[divisionId] = (current[divisionId] ?: emptyList()).filterIndexed { i, _ -> i != index }
        _uiState.value = _uiState.value.copy(localTeams = current)
    }

    /** Coach save: posts this club's full team list; the server merges within
     *  the coach's own club only (never touches other clubs' teams). */
    fun saveTeams(meetId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isWorking = true, message = null, flash = null)
            val entries = _uiState.value.localTeams.flatMap { (divisionId, teams) ->
                teams.filter { it.isNotEmpty() }.map { SaveRelayTeamEntry(divisionId, it) }
            }
            val result = runCatching { apiClient.api.saveCoachRelayTeams(meetId, SaveRelayTeamsRequest(entries)) }
            _uiState.value = _uiState.value.copy(isWorking = false)
            result.onSuccess {
                _uiState.value = _uiState.value.copy(flash = "Saved ${it.savedTeams} team${if (it.savedTeams == 1) "" else "s"}.")
                load(meetId)
            }.onFailure {
                _uiState.value = _uiState.value.copy(message = "Couldn't save teams — the relay deadline may have passed.")
            }
        }
    }
}

/** Coach tools for one meet: file a protest + build your club's relay teams. */
@Composable
fun CoachToolsScreen(meetId: String) {
    val viewModel: CoachToolsViewModel = viewModel()
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var tab by remember { mutableIntStateOf(0) }
    LaunchedEffect(meetId) { viewModel.load(meetId) }

    SsmBackground {
        Column(Modifier.fillMaxSize()) {
            TabRow(selectedTabIndex = tab, containerColor = SsmColors.Background, contentColor = SsmColors.Orange) {
                Tab(selected = tab == 0, onClick = { tab = 0 },
                    text = { Text("Protests", style = SsmType.caption) },
                    selectedContentColor = SsmColors.Orange, unselectedContentColor = SsmColors.Muted)
                Tab(selected = tab == 1, onClick = { tab = 1 },
                    text = { Text("Relay Teams", style = SsmType.caption) },
                    selectedContentColor = SsmColors.Orange, unselectedContentColor = SsmColors.Muted)
            }
            when {
                state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = SsmColors.Sky)
                }
                tab == 0 -> ProtestTab(meetId, state, viewModel)
                else -> RelayTab(meetId, state, viewModel)
            }
        }
    }
}

// ── Protest filing ───────────────────────────────────────────────────────

@Composable
private fun ProtestTab(meetId: String, state: CoachToolsUiState, viewModel: CoachToolsViewModel) {
    val form = state.protestForm
    if (form == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(state.message ?: "Unavailable.", style = SsmType.body, color = SsmColors.Muted)
        }
        return
    }
    var category by remember { mutableStateOf("") }
    var raceId by remember { mutableStateOf("") }
    var registrationId by remember { mutableStateOf("") }
    var statement by remember { mutableStateOf("") }
    val selectedCategory = form.categories.firstOrNull { it.name == category }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
    ) {
        item {
            Text(
                "Fee ${"$"}${"%.0f".format(form.protestFee)} · file within ${form.protestDeadlineMinutes} min of the race",
                style = SsmType.caption,
            )
        }
        item {
            Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md),
                verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
                Text("FILE A PROTEST", style = SsmType.label, color = SsmColors.Peach)
                ChipPicker("Category", form.categories.map { it.name to it.name }, category) {
                    category = it
                    if (form.categories.firstOrNull { c -> c.name == it }?.raceSpecific != true) raceId = ""
                }
                if (selectedCategory?.raceSpecific == true) {
                    ChipPicker("Race", form.races.map { it.id to it.label }, raceId) { raceId = it }
                }
                ChipPicker("Skater (optional)", form.skaters.map { it.id to it.name }, registrationId,
                    allowClear = true) { registrationId = it }
                OutlinedTextField(
                    value = statement, onValueChange = { statement = it },
                    label = { Text("What happened?") }, minLines = 3,
                    modifier = Modifier.fillMaxWidth(), colors = coachFieldColors(),
                )
                state.flash?.let { Text("✓ $it", style = SsmType.caption, color = SsmColors.Good) }
                state.message?.let { Text(it, style = SsmType.caption, color = SsmColors.Danger) }
                BigButton("File Protest", enabled = !state.isWorking) {
                    val raceLabel = form.races.firstOrNull { it.id == raceId }?.label ?: ""
                    viewModel.fileProtest(meetId, category, raceId, raceLabel, registrationId, statement) { ok ->
                        if (ok) { category = ""; raceId = ""; registrationId = ""; statement = "" }
                    }
                }
            }
        }
        if (form.myProtests.isNotEmpty()) {
            item { Text("MY PROTESTS", style = SsmType.label) }
            items(form.myProtests, key = { it.id }) { protest ->
                Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
                    Row {
                        Text(protest.category, style = SsmType.headline, modifier = Modifier.weight(1f))
                        Text(protest.state.uppercase(), style = SsmType.label,
                            color = when (protest.state) {
                                "upheld" -> SsmColors.Good
                                "denied" -> SsmColors.Danger
                                else -> SsmColors.Peach
                            })
                    }
                    if (protest.raceLabel.isNotBlank()) Text(protest.raceLabel, style = SsmType.caption)
                    if (protest.ruling.isNotBlank()) {
                        Text("Ruling: ${protest.ruling}", style = SsmType.caption, color = SsmColors.Muted)
                    }
                }
            }
        }
    }
}

// ── Relay builder ────────────────────────────────────────────────────────

@Composable
private fun RelayTab(meetId: String, state: CoachToolsUiState, viewModel: CoachToolsViewModel) {
    val relay = state.relayData
    if (relay == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(state.message ?: "Unavailable.", style = SsmType.body, color = SsmColors.Muted)
        }
        return
    }
    val locked = relay.locked == true

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
    ) {
        item {
            Text(
                if (locked) "Relay entries are locked — the deadline has passed."
                else "Build ${relay.team}'s relay teams. The meet director places them in lanes.",
                style = SsmType.caption,
                color = if (locked) SsmColors.Danger else SsmColors.Muted,
            )
        }
        items(relay.divisions.filter { it.eligible.isNotEmpty() || (state.localTeams[it.id]?.isNotEmpty() == true) },
            key = { it.id }) { division ->
            DivisionCard(division, state, locked, viewModel)
        }
        item {
            state.flash?.let { Text("✓ $it", style = SsmType.caption, color = SsmColors.Good) }
            state.message?.let { Text(it, style = SsmType.caption, color = SsmColors.Danger) }
            if (!locked) {
                BigButton("Save Relay Teams", enabled = !state.isWorking) { viewModel.saveTeams(meetId) }
            }
        }
    }
}

@Composable
private fun DivisionCard(
    division: RelayDivision,
    state: CoachToolsUiState,
    locked: Boolean,
    viewModel: CoachToolsViewModel,
) {
    var building by remember(division.id) { mutableStateOf(false) }
    var selected by remember(division.id) { mutableStateOf(listOf<String>()) }
    val teams = state.localTeams[division.id] ?: emptyList()
    val nameById = division.eligible.associate { it.id to it.name }

    Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.xs)) {
        Text(division.label, style = SsmType.headline, color = SsmColors.Mint)
        Text("${division.size} skaters · ${division.ageRange} · ${division.distance}", style = SsmType.caption)

        teams.forEachIndexed { index, team ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    team.joinToString(", ") { nameById[it] ?: "#$it" },
                    style = SsmType.body, modifier = Modifier.weight(1f),
                )
                if (!locked) {
                    Text("✕", style = SsmType.body, color = SsmColors.Muted,
                        modifier = Modifier.clickable { viewModel.removeTeam(division.id, index) }
                            .padding(SsmSpacing.xs))
                }
            }
        }
        if (teams.isEmpty()) Text("No teams yet.", style = SsmType.caption)

        if (!locked) {
            if (!building) {
                Text("+ New team", style = SsmType.body, color = SsmColors.Sky,
                    modifier = Modifier.clickable { building = true; selected = emptyList() }
                        .padding(vertical = SsmSpacing.xs))
            } else {
                Text("Pick ${division.size} skaters (${selected.size}/${division.size}):", style = SsmType.caption)
                division.eligible.forEach { skater ->
                    val isPicked = skater.id in selected
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(SsmRadius.sm))
                            .background(if (isPicked) SsmColors.CardSoft else Color.Transparent)
                            .clickable {
                                selected = if (isPicked) selected - skater.id
                                else if (selected.size < division.size) selected + skater.id
                                else selected
                            }
                            .padding(SsmSpacing.xs),
                    ) {
                        Text(if (isPicked) "☑ ${skater.name}" else "☐ ${skater.name}",
                            style = SsmType.body,
                            color = if (isPicked) SsmColors.Mint else SsmColors.TextPrimary)
                        skater.age?.let {
                            Spacer(Modifier.weight(1f))
                            Text("age $it", style = SsmType.caption)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
                    Box(Modifier.weight(1f)) {
                        BigButton("Add Team", enabled = selected.size == division.size) {
                            viewModel.addTeam(division.id, selected)
                            building = false
                        }
                    }
                    Text("Cancel", style = SsmType.body, color = SsmColors.Muted,
                        modifier = Modifier.clickable { building = false }.padding(SsmSpacing.sm))
                }
            }
        }
    }
}

// ── Shared bits ──────────────────────────────────────────────────────────

@Composable
private fun ChipPicker(
    label: String,
    options: List<Pair<String, String>>,
    selectedId: String,
    allowClear: Boolean = false,
    onSelect: (String) -> Unit,
) {
    Column {
        Text(label.uppercase(), style = SsmType.label)
        Spacer(Modifier.height(SsmSpacing.xs))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(SsmSpacing.xs)) {
            items(options, key = { it.first }) { (id, text) ->
                val isSelected = id == selectedId
                Box(
                    Modifier
                        .clip(RoundedCornerShape(SsmRadius.sm))
                        .background(if (isSelected) SsmColors.Sky else SsmColors.CardSoft)
                        .clickable { onSelect(if (isSelected && allowClear) "" else id) }
                        .padding(horizontal = SsmSpacing.sm, vertical = 8.dp),
                ) {
                    Text(text, style = SsmType.caption,
                        color = if (isSelected) SsmColors.Background else SsmColors.TextPrimary)
                }
            }
        }
    }
}

@Composable
private fun BigButton(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(SsmRadius.sm))
            .background(if (enabled) SsmColors.Orange else SsmColors.CardSoft)
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = SsmType.body)
    }
}

@Composable
internal fun coachFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White, unfocusedTextColor = Color.White,
    focusedBorderColor = SsmColors.Border, unfocusedBorderColor = SsmColors.Border,
    focusedLabelColor = SsmColors.Muted, unfocusedLabelColor = SsmColors.Muted,
    cursorColor = SsmColors.Sky,
    focusedContainerColor = SsmColors.CardSoft, unfocusedContainerColor = SsmColors.CardSoft,
)
