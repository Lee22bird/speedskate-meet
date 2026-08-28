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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import com.speedskatemeet.android.network.Protest
import com.speedskatemeet.android.network.ProtestsResponse
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

data class ProtestsUiState(
    val data: ProtestsResponse? = null,
    val isLoading: Boolean = true,
    val isWorking: Boolean = false,
    val message: String? = null,
)

class ProtestsViewModel(app: Application) : AndroidViewModel(app) {
    private val apiClient = (app as SsmApplication).apiClient
    private val _uiState = MutableStateFlow(ProtestsUiState())
    val uiState: StateFlow<ProtestsUiState> = _uiState.asStateFlow()

    fun load(meetId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = _uiState.value.data == null)
            runCatching { apiClient.api.protests(meetId) }
                .onSuccess { _uiState.value = ProtestsUiState(data = it, isLoading = false) }
                .onFailure { _uiState.value = ProtestsUiState(isLoading = false, message = "Protests aren't available for you on this meet.") }
        }
    }

    fun rule(meetId: String, protest: Protest, state: String, ruling: String, onDone: (Boolean) -> Unit) {
        if (ruling.isBlank()) {
            _uiState.value = _uiState.value.copy(message = "Write a short ruling first.")
            onDone(false); return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isWorking = true, message = null)
            val result = runCatching { apiClient.api.ruleProtest(meetId, protest.id, state, ruling.trim()) }
            _uiState.value = _uiState.value.copy(isWorking = false)
            if (result.isSuccess) { load(meetId); onDone(true) }
            else { _uiState.value = _uiState.value.copy(message = "Couldn't save the ruling."); onDone(false) }
        }
    }

    fun collectFee(meetId: String, protest: Protest) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isWorking = true, message = null)
            runCatching { apiClient.api.collectProtestFee(meetId, protest.id) }
                .onFailure { _uiState.value = _uiState.value.copy(message = "Couldn't mark the fee collected.") }
            _uiState.value = _uiState.value.copy(isWorking = false)
            load(meetId)
        }
    }
}

/** Officials' protest inbox: list + rule (upheld/denied with a ruling) + fee. */
@Composable
fun ProtestsScreen(meetId: String) {
    val viewModel: ProtestsViewModel = viewModel()
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(meetId) { viewModel.load(meetId) }

    SsmBackground {
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SsmColors.Sky)
            }
            state.data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(state.message ?: "Unavailable.", style = SsmType.body, color = SsmColors.Muted)
            }
            else -> {
                val data = state.data!!
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(SsmSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
                ) {
                    item {
                        Text(
                            "${data.unresolvedCount} open · fee ${"$"}${"%.0f".format(data.protestFee)} · ${data.protestDeadlineMinutes} min deadline",
                            style = SsmType.caption,
                        )
                    }
                    state.message?.let { item { Text(it, style = SsmType.caption, color = SsmColors.Danger) } }
                    if (data.protests.isEmpty()) {
                        item { Text("No protests filed.", style = SsmType.caption) }
                    }
                    items(data.protests, key = { it.id }) { protest ->
                        ProtestCard(meetId, protest, data, state, viewModel)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProtestCard(
    meetId: String,
    protest: Protest,
    data: ProtestsResponse,
    state: ProtestsUiState,
    viewModel: ProtestsViewModel,
) {
    var expanded by remember { mutableStateOf(protest.isUnresolved) }
    var ruling by remember(protest.id) { mutableStateOf(protest.ruling) }

    val stateColor = when (protest.state) {
        "upheld" -> SsmColors.Good
        "denied" -> SsmColors.Danger
        else -> SsmColors.Peach
    }

    Column(
        Modifier
            .fillMaxWidth()
            .ssmBubbleCard(tint = if (protest.isUnresolved) SsmColors.Peach else null)
            .clickable { expanded = !expanded }
            .padding(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(protest.category, style = SsmType.headline, modifier = Modifier.weight(1f))
            Text(protest.state.uppercase(), style = SsmType.label, color = stateColor)
        }
        val meta = listOf(protest.raceLabel, protest.filedByName, protest.team)
            .filter { it.isNotBlank() }.joinToString(" · ")
        if (meta.isNotEmpty()) Text(meta, style = SsmType.caption)

        if (expanded) {
            Text(protest.statement, style = SsmType.body)

            if (protest.hasFee) {
                if (protest.feeCollected) {
                    Text("✓ Fee collected${if (protest.feeCollectedBy.isNotBlank()) " by ${protest.feeCollectedBy}" else ""}",
                        style = SsmType.caption, color = SsmColors.Good)
                } else if (data.canCollectFee) {
                    ActionChip("Mark fee collected (${"$"}${"%.0f".format(protest.feeAmount)})", SsmColors.CardSoft,
                        enabled = !state.isWorking) { viewModel.collectFee(meetId, protest) }
                }
            }

            if (protest.isResolved) {
                if (protest.ruling.isNotBlank()) {
                    Text("Ruling: ${protest.ruling}${if (protest.ruledByName.isNotBlank()) " — ${protest.ruledByName}" else ""}",
                        style = SsmType.caption, color = SsmColors.Muted)
                }
            } else if (data.canRule) {
                OutlinedTextField(
                    value = ruling,
                    onValueChange = { ruling = it },
                    label = { Text("Ruling") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                        focusedBorderColor = SsmColors.Border, unfocusedBorderColor = SsmColors.Border,
                        focusedLabelColor = SsmColors.Muted, unfocusedLabelColor = SsmColors.Muted,
                        cursorColor = SsmColors.Sky,
                        focusedContainerColor = SsmColors.CardSoft, unfocusedContainerColor = SsmColors.CardSoft,
                    ),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
                    Box(Modifier.weight(1f)) {
                        ActionChip("Uphold", SsmColors.Good.copy(alpha = 0.25f), enabled = !state.isWorking) {
                            viewModel.rule(meetId, protest, "upheld", ruling) {}
                        }
                    }
                    Box(Modifier.weight(1f)) {
                        ActionChip("Deny", SsmColors.Danger.copy(alpha = 0.25f), enabled = !state.isWorking) {
                            viewModel.rule(meetId, protest, "denied", ruling) {}
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ActionChip(label: String, bg: Color, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(42.dp)
            .clip(RoundedCornerShape(SsmRadius.sm))
            .background(bg)
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = SsmType.body)
    }
}
