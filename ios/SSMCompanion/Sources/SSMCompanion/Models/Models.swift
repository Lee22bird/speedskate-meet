import Foundation

// Mirrors the JSON shapes returned by routes/mobileApiRoutes.js on the SSM
// server. Field names match the backend response keys exactly so no manual
// CodingKeys are needed.

public struct APIEnvelope<T: Decodable>: Decodable {
    public let ok: Bool
    public let error: String?
}

public struct MeetSummary: Decodable, Identifiable, Hashable {
    public let id: AnyMeetID
    public let meetName: String
    public let date: String
    public let startTime: String?
    public let status: String
    public let location: String
    public let raceCount: Int
    public let registrationCount: Int

    /// The listing endpoint currently returns only one meet date.
    public var dateRangeLabel: String {
        date
    }

    public var initials: String {
        let words = meetName.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "SM" : letters.uppercased()
    }

    public var isLiveNow: Bool {
        status.localizedCaseInsensitiveCompare("live") == .orderedSame
    }

    public var searchableText: String {
        [meetName, location].joined(separator: " ")
    }

    public var dateRange: ClosedRange<Date>? {
        guard let start = Self.parseDate(date) else { return nil }
        return start...start
    }

    private static func parseDate(_ value: String) -> Date? {
        let formats = ["yyyy-MM-dd", "MM/dd/yyyy", "MMM d, yyyy", "MMMM d, yyyy"]
        for format in formats {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = format
            if let date = formatter.date(from: value) { return date }
        }
        return ISO8601DateFormatter().date(from: value)
    }
}

public struct FeaturedSchedule: Decodable, Hashable {
    public let title: String
    public let subtitle: String
    public let url: String
}

public struct MeetsResponse: Decodable {
    public let ok: Bool
    public let meets: [MeetSummary]
    // Server-driven promo for a featured schedule (e.g. Nationals). Absent/null
    // when there's nothing to feature — lets us turn the in-app banner on/off
    // from the server with no app update.
    public let featuredSchedule: FeaturedSchedule?
}

public struct MeetDetail: Decodable {
    public let id: AnyMeetID
    public let meetName: String
    public let date: String
    public let startTime: String?
    public let status: String
    public let location: String
    public let dateLabel: String
    public let isLive: Bool
    public let raceCount: Int
}

public struct MeetDetailResponse: Decodable {
    public let ok: Bool
    public let meet: MeetDetail
}

// Meet ids in SSM can be numbers or strings depending on how a meet was
// created/imported — decode either without crashing.
public struct AnyMeetID: Decodable, Hashable, CustomStringConvertible {
    public let stringValue: String

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intValue = try? container.decode(Int.self) {
            stringValue = String(intValue)
        } else {
            stringValue = try container.decode(String.self)
        }
    }

    public var description: String { stringValue }
}

public struct RaceDayProgress: Decodable {
    public let total: Int
    public let completed: Int
}

public struct LaneEntry: Decodable, Identifiable, Hashable {
    public let lane: Int
    public let helmetNumber: Int?
    public let skaterName: String
    public let team: String
    public let sponsor: String?
    public let place: String?
    public let time: String?
    public let status: String?
    /// Home division for a lane in a merged-pack sheet (the race's group label,
    /// e.g. "Esquire Men"). nil on ordinary single-race lanes.
    public let division: String?

    public var id: Int { lane }
}

public struct RaceDayItem: Decodable, Identifiable, Hashable {
    public let id: AnyMeetID
    public let type: String
    public let groupLabel: String
    public let division: String?
    public let distanceLabel: String
    public let stage: String
    public let startType: String?
    public let status: String?
    public let isOpenRace: Bool?
    public let isQuadRace: Bool?
    /// Relay race — each lane is a TEAM (skaterName = joined members, team =
    /// club). Optional so older servers still decode.
    public let isRelay: Bool?
    public let lanes: [LaneEntry]
    /// Day-of race merge (display only). When two races start as one pack,
    /// `mergedLanes` is the combined, renumbered, division-tagged sheet and
    /// `packLabel` is the joined label ("Elite Veteran & Esquire Men"). `lanes`
    /// stays this race's own lanes so result entry remains per-division. All
    /// optional so older servers still decode.
    public let isMerged: Bool?
    public let packLabel: String?
    public let mergedLanes: [LaneEntry]?

    public var isTimeTrial: Bool { type == "time_trial" }

    /// True when this race is running as a merged pack with a combined sheet.
    public var isMergedPack: Bool { isMerged == true && !(mergedLanes?.isEmpty ?? true) }

    /// The lanes a DISPLAY board should show: the combined pack sheet when
    /// merged, otherwise this race's own lanes. (Result entry never uses this.)
    public var displayLanes: [LaneEntry] { isMergedPack ? (mergedLanes ?? lanes) : lanes }

    /// True when this is a relay race (lanes are teams, not individuals).
    public var isRelayRace: Bool { isRelay == true }
}

public struct ComingUpItem: Decodable, Identifiable, Hashable {
    public let id: AnyMeetID
    public let groupLabel: String
    public let division: String?
    public let distanceLabel: String
}

public struct RecentResultRow: Decodable, Identifiable, Hashable {
    public let place: String?
    public let status: String?
    public let skaterName: String
    public let team: String

    public var id: String { "\(skaterName)-\(team)-\(place ?? status ?? "")" }
}

public struct RecentRace: Decodable, Identifiable, Hashable {
    public let id: AnyMeetID
    public let groupLabel: String
    public let division: String?
    public let distanceLabel: String
    public let results: [RecentResultRow]
}

public struct LiveRaceDayResponse: Decodable {
    public let ok: Bool
    public let meetName: String
    public let progress: RaceDayProgress
    public let current: RaceDayItem?
    public let next: RaceDayItem?
    public let coming: [ComingUpItem]
    public let recentResults: [RecentRace]
}

// ── Results ──────────────────────────────────────────────────────────────

/// One scored-distance column in a results section.
public struct ResultsDistance: Decodable, Identifiable, Hashable {
    public let raceId: String
    public let label: String
    public var id: String { raceId }
}

/// A skater's place/points in one race (for the per-distance matrix).
public struct ResultsRaceScore: Decodable, Hashable {
    public let raceId: String
    public let place: Int?
    public let points: Double?
}

public struct StandingRow: Decodable, Identifiable, Hashable {
    public let place: Int
    public let skaterName: String
    public let team: String
    public let sponsor: String?
    public let totalPoints: Double
    public let raceScores: [ResultsRaceScore]?
    public let tiebreakerUsed: Bool?
    public let runoffNeeded: Bool?

    public var id: String { "\(place)-\(skaterName)-\(team)" }

    /// Place this skater took in a given race, or nil if they didn't score it.
    public func place(inRace raceId: String) -> Int? {
        guard let score = raceScores?.first(where: { $0.raceId == raceId }),
              let p = score.place, p > 0 else { return nil }
        return p
    }
}

public struct StandardResultsSection: Decodable, Identifiable, Hashable {
    public let groupLabel: String
    public let division: String
    public let distances: [ResultsDistance]?
    public let standings: [StandingRow]

    public var id: String { "\(groupLabel)-\(division)" }
}

public struct QuadResultsSection: Decodable, Identifiable, Hashable {
    public let groupLabel: String
    public let distanceLabel: String
    public let distances: [ResultsDistance]?
    public let standings: [StandingRow]

    public var id: String { "\(groupLabel)-\(distanceLabel)" }
}

public struct OpenResultRow: Decodable, Identifiable, Hashable {
    public let place: String?
    public let skaterName: String
    public let team: String

    public var id: String { "\(place ?? "")-\(skaterName)" }
}

public struct OpenResultsSection: Decodable, Identifiable, Hashable {
    public let groupLabel: String
    public let distanceLabel: String
    public let results: [OpenResultRow]

    public var id: String { "\(groupLabel)-\(distanceLabel)" }
}

public struct ResultsResponse: Decodable {
    public let ok: Bool
    public let meetName: String
    public let standard: [StandardResultsSection]
    public let quad: [QuadResultsSection]
    public let open: [OpenResultsSection]
}

// ── Auth / staff ─────────────────────────────────────────────────────────

public struct CurrentUser: Decodable, Hashable {
    public let id: AnyMeetID
    public let displayName: String
    public let email: String
    public let roles: [String]
    public let team: String

    /// League directors also count as coaches on the server (hasRole).
    public var isCoach: Bool { roles.contains("coach") || roles.contains("league_director") }
}

public struct MeResponse: Decodable {
    public let ok: Bool
    public let loggedIn: Bool
    public let user: CurrentUser?
}

public enum StaffRole: String, Decodable {
    case director = "director"
    case tabulator = "tabulator"
    case announcer = "announcer"
    case referee = "referee"

    public var displayName: String {
        switch self {
        case .director: return "Meet Director"
        case .tabulator: return "Tabulator"
        case .announcer: return "Announcer"
        case .referee: return "Referee"
        }
    }
}

public struct StaffAccessResponse: Decodable {
    public let ok: Bool
    public let hasAccess: Bool
    public let role: StaffRole?
    public let canControlRaceDay: Bool?
    /// Whether this user may use the Block Builder on this meet (the
    /// server's canEditMeet gate — includes assigned tabulators). Optional
    /// so older servers without the field keep working.
    public let canBuildBlocks: Bool?
}

public struct StaffMeetSummary: Decodable, Identifiable, Hashable {
    public let id: AnyMeetID
    public let meetName: String
    public let date: String
    public let status: String
    public let role: StaffRole
}

public struct MyStaffMeetsResponse: Decodable {
    public let ok: Bool
    public let meets: [StaffMeetSummary]
}

public struct OrderedRaceOption: Decodable, Identifiable, Hashable {
    public let id: AnyMeetID
    public let index: Int
    public let label: String
    public let isCurrent: Bool
}

public struct RaceDayStateResponse: Decodable {
    public let ok: Bool
    public let role: StaffRole
    public let canControlRaceDay: Bool
    public let paused: Bool
    public let progress: RaceDayProgress
    /// Unresolved protests (new + review) — drives the badge on the Director /
    /// Tabulator tabs. Optional so older servers without the field still decode.
    public let protestUnresolvedCount: Int?
    public let current: RaceDayItem?
    public let next: RaceDayItem?
    public let orderedRaces: [OrderedRaceOption]
}

public struct SimpleOKResponse: Decodable {
    public let ok: Bool
    public let error: String?
}

// ── Protests (officials inbox) ─────────────────────────────────────────────

/// A coach-filed protest, ruled by officials. Mirrors the server's
/// normalizeProtest() shape (services/protests.js). Fields the app doesn't
/// use (e.g. ruledByUserId) are simply omitted — extra JSON keys are ignored.
public struct Protest: Decodable, Identifiable, Hashable {
    public let id: String
    public let createdAt: String
    public let category: String
    public let raceId: String
    public let raceLabel: String
    public let registrationId: String
    public let filedByName: String
    public let team: String
    public let statement: String
    public let state: String        // new | review | upheld | denied
    public let ruling: String
    public let ruledByName: String
    public let ruledAt: String
    public let correctionRaceId: String
    public let feeAmount: Double
    public let feeCollected: Bool
    public let feeCollectedBy: String
    public let feeCollectedAt: String
    public let deadlineAt: String

    /// Only Competition/Eligibility/Conduct carry a race; the rest are meet-wide.
    public var isRaceSpecific: Bool { !raceId.isEmpty }
    public var isResolved: Bool { state == "upheld" || state == "denied" }
    public var isUnresolved: Bool { state == "new" || state == "review" }
    public var isUpheld: Bool { state == "upheld" }
    public var isDenied: Bool { state == "denied" }
    public var hasFee: Bool { feeAmount > 0 }
}

/// Returned by the rule endpoint when an upheld race-specific protest can be
/// opened in Correction Mode (director only).
public struct ProtestCorrection: Decodable, Hashable, Identifiable {
    public let available: Bool
    public let raceId: String
    public let reason: String
    public var id: String { raceId + "|" + reason }
}

public struct ProtestsResponse: Decodable {
    public let ok: Bool
    public let protests: [Protest]
    public let unresolvedCount: Int
    public let canRule: Bool
    public let canCollectFee: Bool
    public let canOpenCorrection: Bool
    public let protestFee: Double
    public let protestDeadlineMinutes: Int
}

public struct ProtestRuleResponse: Decodable {
    public let ok: Bool
    public let protest: Protest
    public let unresolvedCount: Int
    public let correction: ProtestCorrection?
}

public struct ProtestActionResponse: Decodable {
    public let ok: Bool
    public let protest: Protest
    public let unresolvedCount: Int
}

// ── Coach protest filing ───────────────────────────────────────────────────

public struct CoachMeet: Decodable, Identifiable, Hashable {
    public let id: AnyMeetID
    public let meetName: String
    public let date: String
    public let status: String
    public let location: String
    public let mySkaterCount: Int
    public let myProtestCount: Int
}

public struct CoachMeetsResponse: Decodable {
    public let ok: Bool
    public let isCoach: Bool
    public let team: String?
    public let meets: [CoachMeet]
}

public struct ProtestCategoryOption: Decodable, Identifiable, Hashable {
    public let name: String
    public let raceSpecific: Bool
    public var id: String { name }
}

public struct ProtestRaceOption: Decodable, Identifiable, Hashable {
    public let id: String
    public let label: String
}

public struct ProtestSkaterOption: Decodable, Identifiable, Hashable {
    public let id: String
    public let name: String
    public let helmetNumber: String?
}

public struct CoachProtestForm: Decodable {
    public let ok: Bool
    public let categories: [ProtestCategoryOption]
    public let races: [ProtestRaceOption]
    public let skaters: [ProtestSkaterOption]
    public let protestFee: Double
    public let protestDeadlineMinutes: Int
    public let myProtests: [Protest]
}

public struct CoachProtestFiled: Decodable {
    public let ok: Bool
    public let protest: Protest
}

// ── Relay builder (director) ───────────────────────────────────────────────

public struct RelaySkaterOption: Decodable, Identifiable, Hashable {
    public let id: String
    public let name: String
    public let age: Int?
    public let team: String
}

public struct RelayTeamData: Decodable, Identifiable, Hashable {
    public let id: Int
    public let memberRegIds: [String]
    public let club: String
    public let mixed: Bool
}

public struct RelayDivision: Decodable, Identifiable, Hashable {
    public let id: String
    public let size: Int
    public let label: String
    public let ageRange: String
    public let gender: String
    public let distance: String
    public let eligible: [RelaySkaterOption]
    public let teams: [RelayTeamData]
}

public struct RelayBuilderData: Decodable {
    public let ok: Bool
    public let divisions: [RelayDivision]
    public let relayRaceCount: Int
}

public struct RelayTeamsResponse: Decodable {
    public let ok: Bool
    public let savedTeams: Int
    /// Only the coach endpoint reports this (director replaces all); optional.
    public let totalTeams: Int?
}

/// Coach relay builder payload — same divisions shape as the director's, but
/// scoped to the coach's own team (eligible + teams are their club only).
public struct CoachRelayBuilderData: Decodable {
    public let ok: Bool
    public let team: String
    public let divisions: [RelayDivision]
    /// True once the meet's relay deadline has passed — editing is closed.
    public let locked: Bool?
}

/// Editable meet settings (phase 1 — identity + fees). Matches the additive
/// GET/POST /api/v1/meets/:id/settings endpoints (a safe partial editor).
public struct MeetSettings: Decodable {
    public let meetName: String
    public let date: String
    public let endDate: String
    public let startTime: String
    public let registrationCloseDate: String
    public let registrationCloseTime: String
    public let rinkId: Int
    public let rinkLabel: String
    public let customRinkName: String
    public let lanes: Int
    public let trackLength: Int
    public let divisionScheme: String
    public let status: String
    public let published: Bool
    public let ttEventEnabled: Bool
    public let ttDistance: String
    public let ttCountsForOverall: Bool
    public let baseEntryFee: Double
    public let additionalRaceFee: Double
    public let maxRegistrationFee: Double
    public let protestFee: Double
    public let protestDeadlineMinutes: Int
}

public struct MeetSettingsResponse: Decodable {
    public let ok: Bool
    public let settings: MeetSettings
    /// Only the POST reports this — true when a lanes/track change rebuilt races.
    public let racesRebuilt: Bool?
}

/// One division slot (novice/elite) as read from the divisions endpoint.
public struct DivisionSlotDTO: Decodable {
    public let enabled: Bool
    public let ages: String
    public let distances: [String]
}

public struct DivisionGroupDTO: Decodable, Identifiable {
    public let index: Int
    public let label: String
    public let ages: String
    public let gender: String
    public let novice: DivisionSlotDTO
    public let elite: DivisionSlotDTO
    public var id: Int { index }
}

public struct DivisionsResponse: Decodable {
    public let ok: Bool
    public let scheme: String
    public let groups: [DivisionGroupDTO]
}

public struct DivisionsSaveResponse: Decodable {
    public let ok: Bool
    public let racesRebuilt: Bool?
    public let raceCount: Int?
}

public struct Rink: Decodable, Identifiable, Hashable {
    public let id: Int
    public let name: String
    public let city: String
    public let state: String
    public let label: String
}

/// A meet PIN: account-free access for one person, one meet, one role.
public struct MeetStaffPin: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let role: String
    public let roleLabel: String
    public let createdAt: String
    public let expiresAt: String
    public let lastUsedAt: String
    public let revoked: Bool
    public let active: Bool
}

public struct PinRoleOption: Decodable, Identifiable, Hashable {
    public let key: String
    public let label: String
    public var id: String { key }
}

public struct StaffPinsResponse: Decodable {
    public let ok: Bool
    public let roles: [PinRoleOption]
    public let pins: [MeetStaffPin]
}

/// Creating or regenerating returns the PLAINTEXT pin exactly once.
public struct StaffPinCreateResponse: Decodable {
    public let ok: Bool
    public let pin: String?
    public let name: String?
    public let roleLabel: String?
    public let pins: [MeetStaffPin]
}

public struct MeetPinLoginResponse: Decodable {
    public let ok: Bool
    public let meetId: String
    public let meetName: String
    public let name: String
    public let role: String
    public let roleLabel: String
}

public struct MeetPinMeetOption: Decodable, Identifiable, Hashable {
    public let id: String
    public let meetName: String
    public let date: String
}

public struct MeetPinMeetsResponse: Decodable {
    public let ok: Bool
    public let meets: [MeetPinMeetOption]
}

/// A saved, reusable racing setup (global template shared across meets).
public struct SetupPreset: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let scheme: String
    public let createdAt: String
}

public struct PresetsResponse: Decodable {
    public let ok: Bool
    public let presets: [SetupPreset]
}

public struct PresetSaveResponse: Decodable {
    public let ok: Bool
    public let presetId: String
    public let name: String
}

public struct PresetLoadResponse: Decodable {
    public let ok: Bool
    public let name: String
    public let raceCount: Int
}

/// Desktop meet PIN. `pin` is only ever returned at generation time — the
/// server stores a hash, so it can never be read back.
public struct DesktopPinResponse: Decodable {
    public let ok: Bool
    public let hasPin: Bool
    public let pin: String?
    public let createdAt: String?
    public let expiresAt: String?
}

/// A person currently assigned to a staff role on a meet.
public struct StaffAssignment: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let sslId: String
    public let userId: String
    public let avatarUrl: String
    public let assignedAt: String
}

public struct StaffRoleRow: Decodable, Identifiable {
    public let key: String
    public let label: String
    public let assignments: [StaffAssignment]
    public var id: String { key }
}

public struct StaffResponse: Decodable {
    public let ok: Bool
    public let roles: [StaffRoleRow]
}

/// A search hit from SSL's staff directory. SSL returns `staff_*` keys (the
/// server matches on those), but name/avatar have several aliases in the wild,
/// so decode defensively.
public struct StaffSearchPerson: Decodable, Identifiable, Hashable {
    public let sslId: String
    public let userId: String
    public let name: String
    public let avatarUrl: String
    public var id: String { sslId.isEmpty ? userId : sslId }

    private enum CodingKeys: String, CodingKey {
        case staff_ssl_id, ssl_id, ssl_skater_id
        case staff_user_id, user_id, id
        case staff_name, name, full_name, displayName
        case staff_avatar_url, avatar_url, profile_photo_url
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func str(_ keys: [CodingKeys]) -> String {
            for k in keys {
                if let v = try? c.decodeIfPresent(String.self, forKey: k), !v.isEmpty { return v }
                if let n = try? c.decodeIfPresent(Int.self, forKey: k) { return String(n) }
            }
            return ""
        }
        sslId = str([.staff_ssl_id, .ssl_id, .ssl_skater_id])
        userId = str([.staff_user_id, .user_id, .id])
        name = str([.staff_name, .name, .full_name, .displayName])
        avatarUrl = str([.staff_avatar_url, .avatar_url, .profile_photo_url])
    }
}

public struct StaffSearchResponse: Decodable {
    public let ok: Bool
    public let people: [StaffSearchPerson]
    public let error: String?
}

/// One Open or Quad race group. Open groups carry a single `distance` and an
/// editable age range; Quad groups carry a POSITIONAL `distances` array
/// (slot = race day) with a fixed age range.
public struct SpecialGroupDTO: Decodable, Identifiable {
    public let id: String
    public let label: String
    public let ages: String
    public let gender: String
    public let enabled: Bool
    public let distance: String
    public let distances: [String]
}

public struct SpecialGroupsResponse: Decodable {
    public let ok: Bool
    public let scheme: String
    public let groups: [SpecialGroupDTO]
}

public struct SpecialGroupsSaveResponse: Decodable {
    public let ok: Bool
    public let racesRebuilt: Bool
    public let enabledCount: Int
    public let raceCount: Int
}

/// One relay division the meet can offer (the website's relay template rows).
public struct RelayTemplateRow: Decodable, Identifiable {
    public let divisionId: String
    public let label: String
    public let type: String
    public let age: String
    public let ageRange: String
    public let distance: String
    public let notes: String
    public let discipline: String
    public let enabled: Bool
    public let raceId: String?
    public let raceHasResults: Bool
    public var id: String { divisionId }
}

public struct RelayTemplatesResponse: Decodable {
    public let ok: Bool
    public let ruleset: String
    public let rows: [RelayTemplateRow]
}

public struct RelayTemplatesSaveResponse: Decodable {
    public let ok: Bool
    public let created: Int
    public let updated: Int
    public let relayRaceCount: Int
}

public struct MeetStatusResponse: Decodable {
    public let ok: Bool
    public let status: String
}

public struct RinksResponse: Decodable {
    public let ok: Bool
    public let rinks: [Rink]
}

public struct RelayGenerateResponse: Decodable {
    public let ok: Bool
    public let created: Int
    public let updated: Int
    public let skipped: Int
    public let relayRaceCount: Int
}
