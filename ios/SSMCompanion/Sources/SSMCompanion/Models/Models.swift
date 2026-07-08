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
    public let lanes: [LaneEntry]

    public var isTimeTrial: Bool { type == "time_trial" }
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

public struct StandingRow: Decodable, Identifiable, Hashable {
    public let place: Int
    public let skaterName: String
    public let team: String
    public let sponsor: String?
    public let totalPoints: Double

    public var id: String { "\(place)-\(skaterName)-\(team)" }
}

public struct StandardResultsSection: Decodable, Identifiable, Hashable {
    public let groupLabel: String
    public let division: String
    public let standings: [StandingRow]

    public var id: String { "\(groupLabel)-\(division)" }
}

public struct QuadResultsSection: Decodable, Identifiable, Hashable {
    public let groupLabel: String
    public let distanceLabel: String
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
    public let current: RaceDayItem?
    public let next: RaceDayItem?
    public let orderedRaces: [OrderedRaceOption]
}

public struct SimpleOKResponse: Decodable {
    public let ok: Bool
    public let error: String?
}
