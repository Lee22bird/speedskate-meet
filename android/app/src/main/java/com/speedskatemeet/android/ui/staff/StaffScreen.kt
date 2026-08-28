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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.speedskatemeet.android.SsmApplication
import com.speedskatemeet.android.network.CurrentUser
import com.speedskatemeet.android.network.MeetPinLoginRequest
import com.speedskatemeet.android.network.MeetPinMeetOption
import com.speedskatemeet.android.network.StaffMeet
import com.speedskatemeet.android.ui.meets.friendlyDate
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

data class StaffUiState(
    val user: CurrentUser? = null,
    val pinIdentity: String? = null,       // "Jon Esterline — Tabulator for Fall Classic"
    val staffMeets: List<StaffMeet> = emptyList(),
    val pinMeets: List<MeetPinMeetOption> = emptyList(),
    val isLoading: Boolean = true,
    val isWorking: Boolean = false,
    val message: String? = null,
)

class StaffViewModel(app: Application) : AndroidViewModel(app) {
    private val apiClient = (app as SsmApplication).apiClient
    private val _uiState = MutableStateFlow(StaffUiState())
    val uiState: StateFlow<StaffUiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, message = null)
            val me = runCatching { apiClient.api.me() }.getOrNull()
            if (me?.loggedIn == true) {
                val meets = runCatching { apiClient.api.myStaffMeets() }.getOrNull()?.meets ?: emptyList()
                _uiState.value = _uiState.value.copy(
                    user = me.user, staffMeets = meets, isLoading = false,
                )
            } else {
                val pinMeets = runCatching { apiClient.api.meetPinMeets() }.getOrNull()?.meets ?: emptyList()
                _uiState.value = StaffUiState(pinMeets = pinMeets, isLoading = false,
                    pinIdentity = _uiState.value.pinIdentity)
            }
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = _uiState.value.copy(message = "Enter your email and password.")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isWorking = true, message = null)
            val ok = runCatching { apiClient.login(email.trim(), password) }.getOrDefault(false)
            _uiState.value = _uiState.value.copy(isWorking = false)
            if (ok) refresh()
            else _uiState.value = _uiState.value.copy(message = "Sign-in failed — check your email and password.")
        }
    }

    fun pinLogin(meetId: String, pin: String) {
        if (meetId.isBlank() || pin.length != 6) {
            _uiState.value = _uiState.value.copy(message = "Pick the meet and enter the 6-digit PIN.")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isWorking = true, message = null)
            runCatching { apiClient.api.meetPinLogin(MeetPinLoginRequest(meetId, pin)) }
                .onSuccess { r ->
                    _uiState.value = _uiState.value.copy(
                        isWorking = false,
                        pinIdentity = "${r.name} — ${r.roleLabel} for ${r.meetName}",
                    )
                    refresh()
                }
                .onFailure {
                    _uiState.value = _uiState.value.copy(
                        isWorking = false,
                        message = "That PIN isn't valid for this meet.",
                    )
                }
        }
    }

    fun signOut() {
        apiClient.clearSession()
        _uiState.value = StaffUiState(isLoading = false)
        refresh()
    }
}

/** Staff tab: signed out = account login + meet-PIN sign-in; signed in = your
 *  staff meets with roles (race-day tools come in the next phase). */
@Composable
fun StaffScreen(viewModel: StaffViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    SsmBackground {
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SsmColors.Sky)
            }
            state.user != null || state.pinIdentity != null -> SignedIn(state, viewModel)
            else -> SignedOut(state, viewModel)
        }
    }
}

@Composable
private fun SignedIn(state: StaffUiState, viewModel: StaffViewModel) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
    ) {
        item {
            Column(Modifier.fillMaxWidth().ssmBubbleCard(tint = SsmColors.Sky).padding(SsmSpacing.md)) {
                Text("SIGNED IN", style = SsmType.label, color = SsmColors.Sky)
                Text(state.user?.displayName ?: state.pinIdentity ?: "Staff", style = SsmType.title)
                state.user?.roles?.takeIf { it.isNotEmpty() }?.let {
                    Text(it.joinToString(" · ") { r -> r.replace('_', ' ').uppercase() },
                        style = SsmType.label, color = SsmColors.Orange)
                }
                Spacer(Modifier.height(SsmSpacing.sm))
                Text("Sign out", style = SsmType.body, color = SsmColors.Danger,
                    modifier = Modifier.clickable { viewModel.signOut() })
            }
        }
        item { Text("YOUR MEETS", style = SsmType.label) }
        if (state.staffMeets.isEmpty()) {
            item {
                Text("No staff assignments yet. Race-day tools arrive here in the next update — for now, run the meet from the iPad or the website.",
                    style = SsmType.caption)
            }
        }
        items(state.staffMeets, key = { it.id }) { meet ->
            Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(meet.meetName, style = SsmType.headline, modifier = Modifier.weight(1f))
                    Text(meet.role.replace('_', ' ').uppercase(), style = SsmType.label, color = SsmColors.Orange)
                }
                if (meet.date.isNotBlank()) Text(friendlyDate(meet.date), style = SsmType.caption, color = SsmColors.Sky)
            }
        }
    }
}

@Composable
private fun SignedOut(state: StaffUiState, viewModel: StaffViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var pinMeetId by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(SsmSpacing.md),
        verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm),
    ) {
        item {
            Text("STAFF", style = SsmType.label, color = SsmColors.Sky)
            Text("Staff Log In", style = SsmType.display)
            Text("Use your SSL account — the same login as the website.", style = SsmType.caption)
            Spacer(Modifier.height(SsmSpacing.sm))
        }
        item {
            Column(Modifier.fillMaxWidth().ssmBubbleCard().padding(SsmSpacing.md),
                verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
                StaffField("Email", email, KeyboardType.Email) { email = it }
                OutlinedTextField(
                    value = password, onValueChange = { password = it },
                    label = { Text("Password") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(), colors = staffFieldColors(),
                )
                PrimaryAction("Log In", state.isWorking) { viewModel.login(email, password) }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().ssmBubbleCard(tint = SsmColors.Peach).padding(SsmSpacing.md),
                verticalArrangement = Arrangement.spacedBy(SsmSpacing.sm)) {
                Text("SIGN IN WITH A MEET PIN", style = SsmType.label, color = SsmColors.Peach)
                Text("Working a meet but don't have an account? Your meet director can give you a 6-digit PIN.",
                    style = SsmType.caption)
                if (state.pinMeets.isEmpty()) {
                    Text("No meets are handing out PINs right now.", style = SsmType.caption)
                } else {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(SsmSpacing.xs)) {
                        items(state.pinMeets, key = { it.id }) { meet ->
                            PinMeetChip(meet, selected = pinMeetId == meet.id) { pinMeetId = meet.id }
                        }
                    }
                    StaffField("6-digit PIN", pin, KeyboardType.NumberPassword) {
                        pin = it.filter { c -> c.isDigit() }.take(6)
                    }
                    PrimaryAction("Sign In with PIN", state.isWorking) { viewModel.pinLogin(pinMeetId, pin) }
                }
            }
        }
        state.message?.let { msg ->
            item { Text(msg, style = SsmType.caption, color = SsmColors.Danger) }
        }
    }
}

@Composable
private fun PinMeetChip(meet: MeetPinMeetOption, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(SsmRadius.sm))
            .background(if (selected) SsmColors.Sky else SsmColors.CardSoft)
            .clickable { onClick() }
            .padding(horizontal = SsmSpacing.sm, vertical = 8.dp),
    ) {
        Text(meet.meetName, style = SsmType.caption,
            color = if (selected) SsmColors.Background else SsmColors.TextPrimary)
    }
}

@Composable
private fun StaffField(label: String, value: String, keyboard: KeyboardType, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth(), colors = staffFieldColors(),
    )
}

@Composable
private fun PrimaryAction(label: String, loading: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(50.dp)
            .clip(RoundedCornerShape(SsmRadius.sm))
            .background(SsmColors.Orange)
            .clickable(enabled = !loading) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (loading) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.height(20.dp))
        else Text(label, style = SsmType.body)
    }
}

@Composable
private fun staffFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedBorderColor = SsmColors.Border,
    unfocusedBorderColor = SsmColors.Border,
    focusedLabelColor = SsmColors.Muted,
    unfocusedLabelColor = SsmColors.Muted,
    cursorColor = SsmColors.Sky,
    focusedContainerColor = SsmColors.CardSoft,
    unfocusedContainerColor = SsmColors.CardSoft,
)
