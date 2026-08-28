package com.speedskatemeet.android.network

import kotlinx.serialization.Serializable

/**
 * Staff-side models: race-day state/controls, the officials' protest inbox,
 * coach protest filing, and the coach relay builder. Mirrors Models.swift.
 */

fun staffRoleDisplayName(role: String): String = when (role) {
    "director" -> "Meet Director"
    "tabulator" -> "Tabulator"
    "announcer" -> "Announcer"
    "referee" -> "Referee"
    else -> role.replaceFirstChar { it.uppercase() }
}

@Serializable
data class SimpleOkResponse(val ok: Boolean = false, val error: String? = null)

@Serializable
data class OrderedRaceOption(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val index: Int = 0,
    val label: String = "",
    val isCurrent: Boolean = false,
)

@Serializable
data class RaceDayStateResponse(
    val ok: Boolean = false,
    val role: String = "",
    val canControlRaceDay: Boolean = false,
    val paused: Boolean = false,
    val progress: RaceDayProgress = RaceDayProgress(),
    val protestUnresolvedCount: Int? = null,
    val current: RaceDayItem? = null,
    val next: RaceDayItem? = null,
    val orderedRaces: List<OrderedRaceOption> = emptyList(),
)

// ── Protests ─────────────────────────────────────────────────────────────

@Serializable
data class Protest(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val createdAt: String = "",
    val category: String = "",
    @Serializable(with = AnyIdSerializer::class) val raceId: String = "",
    val raceLabel: String = "",
    @Serializable(with = AnyIdSerializer::class) val registrationId: String = "",
    val filedByName: String = "",
    val team: String = "",
    val statement: String = "",
    val state: String = "",         // new | review | upheld | denied
    val ruling: String = "",
    val ruledByName: String = "",
    val ruledAt: String = "",
    @Serializable(with = AnyIdSerializer::class) val correctionRaceId: String = "",
    val feeAmount: Double = 0.0,
    val feeCollected: Boolean = false,
    val feeCollectedBy: String = "",
    val feeCollectedAt: String = "",
    val deadlineAt: String = "",
) {
    val isResolved: Boolean get() = state == "upheld" || state == "denied"
    val isUnresolved: Boolean get() = state == "new" || state == "review"
    val hasFee: Boolean get() = feeAmount > 0
}

@Serializable
data class ProtestsResponse(
    val ok: Boolean = false,
    val protests: List<Protest> = emptyList(),
    val unresolvedCount: Int = 0,
    val canRule: Boolean = false,
    val canCollectFee: Boolean = false,
    val canOpenCorrection: Boolean = false,
    val protestFee: Double = 0.0,
    val protestDeadlineMinutes: Int = 0,
)

@Serializable
data class ProtestRuleResponse(
    val ok: Boolean = false,
    val protest: Protest,
    val unresolvedCount: Int = 0,
)

@Serializable
data class ProtestActionResponse(
    val ok: Boolean = false,
    val protest: Protest,
    val unresolvedCount: Int = 0,
)

// ── Coach: meets + protest filing ────────────────────────────────────────

@Serializable
data class CoachMeet(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val meetName: String = "",
    val date: String = "",
    val status: String = "",
    val location: String = "",
    val mySkaterCount: Int = 0,
    val myProtestCount: Int = 0,
)

@Serializable
data class CoachMeetsResponse(
    val ok: Boolean = false,
    val isCoach: Boolean = false,
    val team: String? = null,
    val meets: List<CoachMeet> = emptyList(),
)

@Serializable
data class ProtestCategoryOption(val name: String = "", val raceSpecific: Boolean = false)

@Serializable
data class ProtestRaceOption(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val label: String = "",
)

@Serializable
data class ProtestSkaterOption(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val name: String = "",
    @Serializable(with = AnyIdSerializer::class) val helmetNumber: String? = null,
)

@Serializable
data class CoachProtestForm(
    val ok: Boolean = false,
    val categories: List<ProtestCategoryOption> = emptyList(),
    val races: List<ProtestRaceOption> = emptyList(),
    val skaters: List<ProtestSkaterOption> = emptyList(),
    val protestFee: Double = 0.0,
    val protestDeadlineMinutes: Int = 0,
    val myProtests: List<Protest> = emptyList(),
)

@Serializable
data class CoachProtestFiled(val ok: Boolean = false, val protest: Protest)

// ── Coach relay builder ──────────────────────────────────────────────────

@Serializable
data class RelaySkaterOption(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val name: String = "",
    val age: Int? = null,
    val team: String = "",
)

@Serializable
data class RelayTeamData(
    val id: Int = 0,
    val memberRegIds: List<String> = emptyList(),
    val club: String = "",
    val mixed: Boolean = false,
)

@Serializable
data class RelayDivision(
    val id: String = "",
    val size: Int = 0,
    val label: String = "",
    val ageRange: String = "",
    val gender: String = "",
    val distance: String = "",
    val eligible: List<RelaySkaterOption> = emptyList(),
    val teams: List<RelayTeamData> = emptyList(),
)

@Serializable
data class CoachRelayBuilderData(
    val ok: Boolean = false,
    val team: String = "",
    val divisions: List<RelayDivision> = emptyList(),
    val locked: Boolean? = null,
)

@Serializable
data class RelayTeamsResponse(
    val ok: Boolean = false,
    val savedTeams: Int = 0,
    val totalTeams: Int? = null,
)

@Serializable
data class SaveRelayTeamEntry(val divisionId: String, val memberRegIds: List<String>)

@Serializable
data class SaveRelayTeamsRequest(val teams: List<SaveRelayTeamEntry>)

// Race-day control bodies (the website's Director-panel endpoints; direction is
// sent as a string to match the iOS client exactly).
@Serializable
data class SetCurrentRaceRequest(val raceId: String)

@Serializable
data class StepRaceRequest(val direction: String)

@Serializable
data class UnlockRaceRequest(val raceId: String)
