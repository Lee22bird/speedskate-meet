package com.speedskatemeet.android.network

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

/**
 * Mirrors SSMCompanion's Models.swift for the phone-companion surface: meets,
 * live race day, results, and staff/PIN sign-in. Meet/race ids can arrive as
 * numbers or strings (AnyMeetID on iOS) — always exposed as String here.
 */
object AnyIdSerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("AnyId", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): String {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeString()
        val primitive = jsonDecoder.decodeJsonElement() as? JsonPrimitive ?: return ""
        return primitive.content
    }
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}

// ── Meets ────────────────────────────────────────────────────────────────

@Serializable
data class MeetSummary(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val meetName: String,
    val date: String = "",
    val startTime: String? = null,
    val status: String = "",
    val location: String = "",
    val raceCount: Int = 0,
    val registrationCount: Int = 0,
) {
    val isLiveNow: Boolean get() = status.equals("live", ignoreCase = true)

    val initials: String
        get() = meetName.split(" ").mapNotNull { it.firstOrNull() }.take(2)
            .joinToString("").uppercase().ifEmpty { "SM" }

    /** "12 skaters · 8 races", pluralised, omitting zeros; null if nothing to say. */
    val countsLabel: String?
        get() {
            val parts = buildList {
                if (registrationCount > 0) add("$registrationCount skater${if (registrationCount == 1) "" else "s"}")
                if (raceCount > 0) add("$raceCount race${if (raceCount == 1) "" else "s"}")
            }
            return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
        }
}

@Serializable
data class MeetsResponse(val ok: Boolean = false, val meets: List<MeetSummary> = emptyList())

@Serializable
data class MeetDetail(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val meetName: String,
    val date: String = "",
    val startTime: String? = null,
    val status: String = "",
    val location: String = "",
    val dateLabel: String = "",
    val isLive: Boolean = false,
    val raceCount: Int = 0,
)

@Serializable
data class MeetDetailResponse(val ok: Boolean = false, val meet: MeetDetail)

// ── Live race day ────────────────────────────────────────────────────────

@Serializable
data class RaceDayProgress(val total: Int = 0, val completed: Int = 0)

@Serializable
data class LaneEntry(
    val lane: Int = 0,
    @Serializable(with = AnyIdSerializer::class) val helmetNumber: String? = null,
    val skaterName: String = "",
    val team: String = "",
    val place: String? = null,
    val status: String? = null,
    val division: String? = null,
)

@Serializable
data class RaceDayItem(
    @Serializable(with = AnyIdSerializer::class) val id: String = "",
    val groupLabel: String = "",
    val division: String? = null,
    val distanceLabel: String = "",
    val stage: String = "",
    val status: String? = null,
    val lanes: List<LaneEntry> = emptyList(),
    val isMerged: Boolean? = null,
    val mergedLanes: List<LaneEntry>? = null,
    val packLabel: String? = null,
    val isRelay: Boolean? = null,
) {
    val isMergedPack: Boolean get() = isMerged == true && !mergedLanes.isNullOrEmpty()
    val displayLanes: List<LaneEntry> get() = if (isMergedPack) mergedLanes ?: lanes else lanes
    val isRelayRace: Boolean get() = isRelay == true
}

@Serializable
data class ComingUpItem(
    @Serializable(with = AnyIdSerializer::class) val id: String = "",
    val groupLabel: String = "",
    val division: String? = null,
    val distanceLabel: String = "",
)

@Serializable
data class RecentResultRow(
    val place: String? = null,
    val status: String? = null,
    val skaterName: String = "",
    val team: String = "",
)

@Serializable
data class RecentRace(
    @Serializable(with = AnyIdSerializer::class) val id: String = "",
    val groupLabel: String = "",
    val division: String? = null,
    val distanceLabel: String = "",
    val results: List<RecentResultRow> = emptyList(),
)

@Serializable
data class LiveRaceDayResponse(
    val ok: Boolean = false,
    val meetName: String = "",
    val progress: RaceDayProgress = RaceDayProgress(),
    val current: RaceDayItem? = null,
    val next: RaceDayItem? = null,
    val coming: List<ComingUpItem> = emptyList(),
    val recentResults: List<RecentRace> = emptyList(),
)

// ── Results ──────────────────────────────────────────────────────────────

@Serializable
data class ResultsRaceScore(
    @Serializable(with = AnyIdSerializer::class) val raceId: String = "",
    val place: Int? = null,
    val points: Double? = null,
)

@Serializable
data class StandingRow(
    val place: Int = 0,
    val skaterName: String = "",
    val team: String = "",
    val sponsor: String? = null,
    val totalPoints: Double = 0.0,
    val raceScores: List<ResultsRaceScore>? = null,
    val tiebreakerUsed: Boolean? = null,
    val runoffNeeded: Boolean? = null,
)

@Serializable
data class StandardResultsSection(
    val groupLabel: String = "",
    val division: String = "",
    val standings: List<StandingRow> = emptyList(),
)

@Serializable
data class OpenResultRow(
    val place: String? = null,
    val skaterName: String = "",
    val team: String = "",
)

@Serializable
data class OpenResultsSection(
    val groupLabel: String = "",
    val distanceLabel: String = "",
    val results: List<OpenResultRow> = emptyList(),
)

@Serializable
data class ResultsResponse(
    val ok: Boolean = false,
    val meetName: String = "",
    val standard: List<StandardResultsSection> = emptyList(),
    val quad: List<StandardResultsSection> = emptyList(),
    val open: List<OpenResultsSection> = emptyList(),
)

// ── Auth / staff ─────────────────────────────────────────────────────────

@Serializable
data class CurrentUser(
    @Serializable(with = AnyIdSerializer::class) val id: String = "",
    val displayName: String = "",
    val email: String = "",
    val roles: List<String> = emptyList(),
    val team: String = "",
)

@Serializable
data class MeResponse(
    val ok: Boolean = false,
    val loggedIn: Boolean = false,
    val user: CurrentUser? = null,
)

@Serializable
data class StaffMeet(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val meetName: String = "",
    val date: String = "",
    val status: String = "",
    val role: String = "",
)

@Serializable
data class MyStaffMeetsResponse(val ok: Boolean = false, val meets: List<StaffMeet> = emptyList())

// ── Meet PIN sign-in ─────────────────────────────────────────────────────

@Serializable
data class MeetPinMeetOption(
    @Serializable(with = AnyIdSerializer::class) val id: String,
    val meetName: String = "",
    val date: String = "",
)

@Serializable
data class MeetPinMeetsResponse(val ok: Boolean = false, val meets: List<MeetPinMeetOption> = emptyList())

@Serializable
data class MeetPinLoginRequest(val meetId: String, val pin: String)

@Serializable
data class MeetPinLoginResponse(
    val ok: Boolean = false,
    val meetId: String = "",
    val meetName: String = "",
    val name: String = "",
    val role: String = "",
    val roleLabel: String = "",
)
