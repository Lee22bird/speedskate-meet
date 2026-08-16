import Foundation

// Models for the website's existing desktop-export endpoint
// (GET /portal/meet/:meetId/desktop-export → { ok, exportedAt, meet }).
// That endpoint returns the entire meet object from the server's JSON store,
// so decoding here is deliberately tolerant: the store has legacy shapes
// (numbers stored as strings and vice versa), and the iPad app only reads
// the slice it renders. Nothing here is Encodable — the app never writes
// meet objects, it only posts the same flat form fields the website posts.

// ── Flexible decoding helpers ────────────────────────────────────────────

extension KeyedDecodingContainer {
    /// String that may be stored as a string, int, or double (legacy data).
    func flexString(_ key: Key) -> String? {
        if let s = try? decodeIfPresent(String.self, forKey: key) { return s }
        if let i = try? decodeIfPresent(Int.self, forKey: key) { return String(i) }
        if let d = try? decodeIfPresent(Double.self, forKey: key) {
            return d == d.rounded() ? String(Int(d)) : String(d)
        }
        return nil
    }

    /// Int that may be stored as an int, double, or numeric string.
    func flexInt(_ key: Key) -> Int? {
        if let i = try? decodeIfPresent(Int.self, forKey: key) { return i }
        if let d = try? decodeIfPresent(Double.self, forKey: key) { return Int(d) }
        if let s = try? decodeIfPresent(String.self, forKey: key) { return Int(s.trimmingCharacters(in: .whitespaces)) }
        return nil
    }

    /// Bool that may be stored as a bool, 0/1, or "true"/"false".
    func flexBool(_ key: Key) -> Bool? {
        if let b = try? decodeIfPresent(Bool.self, forKey: key) { return b }
        if let i = try? decodeIfPresent(Int.self, forKey: key) { return i != 0 }
        if let s = try? decodeIfPresent(String.self, forKey: key) {
            let lowered = s.lowercased()
            if ["true", "1", "yes"].contains(lowered) { return true }
            if ["false", "0", "no", ""].contains(lowered) { return false }
        }
        return nil
    }
}

// ── Export payload ───────────────────────────────────────────────────────

public struct DesktopExportResponse: Decodable {
    public let ok: Bool
    public let exportedAt: String?
    public let meet: ExportMeet
}

/// The slice of a full meet object the iPad race-day screens need.
public struct ExportMeet: Decodable {
    public let id: String
    public let meetName: String
    public let status: String
    public let lanes: Int
    public let currentRaceId: String?
    public let raceDayPaused: Bool
    public let races: [ExportRace]
    public let blocks: [ExportBlock]

    private enum CodingKeys: String, CodingKey {
        case id, meetName, status, lanes, currentRaceId, raceDayPaused, races, blocks
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexString(.id) ?? ""
        meetName = c.flexString(.meetName) ?? "Meet"
        status = c.flexString(.status) ?? "draft"
        lanes = c.flexInt(.lanes) ?? 4
        currentRaceId = c.flexString(.currentRaceId)
        raceDayPaused = c.flexBool(.raceDayPaused) ?? false
        races = (try? c.decodeIfPresent([ExportRace].self, forKey: .races)) ?? []
        blocks = (try? c.decodeIfPresent([ExportBlock].self, forKey: .blocks)) ?? []
    }

    public func race(id raceID: String) -> ExportRace? {
        races.first { $0.id == raceID }
    }

    /// Closed races in block order — the candidates for Correction Mode.
    public func closedRaces() -> [ExportRace] {
        let ordered = orderedRaceIDs()
        // Legacy meet data can carry duplicate race ids — keep the first.
        let byID = Dictionary(races.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var seen = Set<String>()
        var result: [ExportRace] = []
        for raceID in ordered {
            if let race = byID[raceID], race.status == "closed", seen.insert(raceID).inserted {
                result.append(race)
            }
        }
        for race in races where race.status == "closed" && !seen.contains(race.id) {
            result.append(race)
        }
        return result
    }

    /// Race ids in the canonical race-day order (blocks first, then any
    /// unassigned races) — mirrors services/raceDay.js orderedRaces().
    private func orderedRaceIDs() -> [String] {
        var ids = blocks.flatMap { $0.raceIds }
        let assigned = Set(ids)
        ids.append(contentsOf: races.map(\.id).filter { !assigned.contains($0) })
        return ids
    }

    /// Name of the block containing a race, if any.
    public func blockName(forRace raceID: String) -> String? {
        blocks.first { $0.raceIds.contains(raceID) }?.name
    }
}

public struct ExportRace: Decodable, Identifiable, Hashable {
    public let id: String
    public let groupLabel: String
    public let division: String?
    public let distanceLabel: String
    public let stage: String?
    public let heatNumber: Int?
    public let startType: String?
    public let status: String
    public let resultsMode: String
    public let notes: String
    public let isOpenRace: Bool
    public let isQuadRace: Bool
    public let isTimeTrial: Bool
    public let isRelayRace: Bool
    public let mergeGroupId: String?
    public let laneEntries: [ExportLane]

    private enum CodingKeys: String, CodingKey {
        case id, groupLabel, division, distanceLabel, stage, heatNumber, startType, status
        case resultsMode, notes, isOpenRace, isQuadRace, isTimeTrial, isRelayRace, mergeGroupId, laneEntries
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexString(.id) ?? ""
        groupLabel = c.flexString(.groupLabel) ?? ""
        division = c.flexString(.division)
        distanceLabel = c.flexString(.distanceLabel) ?? ""
        stage = c.flexString(.stage)
        heatNumber = c.flexInt(.heatNumber)
        startType = c.flexString(.startType)
        status = c.flexString(.status) ?? "open"
        resultsMode = c.flexString(.resultsMode) ?? "places"
        notes = c.flexString(.notes) ?? ""
        isOpenRace = c.flexBool(.isOpenRace) ?? false
        isQuadRace = c.flexBool(.isQuadRace) ?? false
        isTimeTrial = c.flexBool(.isTimeTrial) ?? false
        isRelayRace = c.flexBool(.isRelayRace) ?? false
        mergeGroupId = c.flexString(.mergeGroupId)
        laneEntries = (try? c.decodeIfPresent([ExportLane].self, forKey: .laneEntries)) ?? []
    }

    public var isClosed: Bool { status == "closed" }

    /// "Heat 2" / "Semi" / "Final" style label, matching the website's stage chips.
    public var stageLabel: String {
        switch stage {
        case "heat": return heatNumber.map { "Heat \($0)" } ?? "Heat"
        case "semi": return "Semi"
        case "final": return "Final"
        default: return "Race"
        }
    }

    public static func == (lhs: ExportRace, rhs: ExportRace) -> Bool { lhs.id == rhs.id }
    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

public struct ExportLane: Decodable, Identifiable, Hashable {
    public var id: Int { lane }
    public let lane: Int
    public let registrationId: String?
    public let helmetNumber: String?
    public let skaterName: String
    public let team: String
    public let sponsor: String?
    public let place: String
    public let time: String
    public let status: String
    public let record: Bool
    public let dqRuleReference: String?
    public let dqOfficialNotes: String?
    public let dqTimestamp: String?
    public let relayTeamId: String?

    private enum CodingKeys: String, CodingKey {
        case lane, registrationId, helmetNumber, skaterName, team, sponsor
        case place, time, status, record
        case dqRuleReference, dqOfficialNotes, dqTimestamp, relayTeamId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lane = c.flexInt(.lane) ?? 0
        registrationId = c.flexString(.registrationId)
        helmetNumber = c.flexString(.helmetNumber)
        skaterName = c.flexString(.skaterName) ?? ""
        team = c.flexString(.team) ?? ""
        sponsor = c.flexString(.sponsor)
        place = c.flexString(.place) ?? ""
        time = c.flexString(.time) ?? ""
        status = c.flexString(.status) ?? ""
        record = c.flexBool(.record) ?? false
        dqRuleReference = c.flexString(.dqRuleReference)
        dqOfficialNotes = c.flexString(.dqOfficialNotes)
        dqTimestamp = c.flexString(.dqTimestamp)
        relayTeamId = c.flexString(.relayTeamId)
    }
}

public struct ExportBlock: Decodable, Identifiable {
    public let id: String
    public let name: String
    public let type: String
    public let raceIds: [String]

    private enum CodingKeys: String, CodingKey { case id, name, type, raceIds }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.flexString(.id) ?? ""
        name = c.flexString(.name) ?? ""
        type = c.flexString(.type) ?? "race"
        raceIds = (try? c.decodeIfPresent([String].self, forKey: .raceIds)) ?? []
    }
}

// ── Result submission ────────────────────────────────────────────────────

/// One lane's worth of the flat form fields the website's judges/save and
/// correction/save endpoints parse (routes/raceDayRoutes.js laneResultFromBody).
/// The server preserves registrationId/helmetNumber/relay identity itself, so
/// only the editable fields are sent. `record` follows checkbox semantics:
/// the key is only present when checked. DQ detail fields are only sent for
/// DQ statuses — the server derives dqCategory from the status value.
public struct LaneResultSubmission {
    public let lane: Int
    public var skaterName: String
    public var team: String
    public var place: String
    public var time: String
    public var status: String
    public var record: Bool
    public var dqRuleReference: String
    public var dqOfficialNotes: String
    public var dqTimestamp: String

    public init(lane: Int, skaterName: String, team: String, place: String, time: String,
                status: String, record: Bool,
                dqRuleReference: String = "", dqOfficialNotes: String = "", dqTimestamp: String = "") {
        self.lane = lane
        self.skaterName = skaterName
        self.team = team
        self.place = place
        self.time = time
        self.status = status
        self.record = record
        self.dqRuleReference = dqRuleReference
        self.dqOfficialNotes = dqOfficialNotes
        self.dqTimestamp = dqTimestamp
    }

    public var isDQ: Bool { status == "DQ" || status.hasPrefix("DQ_") }

    func formFields() -> [(String, String)] {
        var fields: [(String, String)] = [
            ("skaterName_\(lane)", skaterName),
            ("team_\(lane)", team),
            ("place_\(lane)", place),
            ("time_\(lane)", time),
            ("status_\(lane)", status),
        ]
        if record { fields.append(("record_\(lane)", "1")) }
        if isDQ {
            fields.append(("dqRuleReference_\(lane)", dqRuleReference))
            fields.append(("dqOfficialNotes_\(lane)", dqOfficialNotes))
            if !dqTimestamp.isEmpty { fields.append(("dqTimestamp_\(lane)", dqTimestamp)) }
        }
        return fields
    }
}

/// JSON reply from judges/save when called with ajax=1.
public struct JudgesSaveResponse: Decodable {
    public let ok: Bool
    public let action: String?
    public let raceId: String?
    public let status: String?
}

// ── Race statuses (mirrors services/raceStatus.js — display strings only) ─

/// The status values the server accepts for a lane. This is a UI pick list,
/// not logic: validation stays on the server.
public enum LaneStatusOption: String, CaseIterable, Identifiable {
    case none = ""
    case dns = "DNS"
    case dnf = "DNF"
    case scratch = "Scratch"
    case dqFalseStart = "DQ_FALSE_START"
    case dqBodyContact = "DQ_BODY_CONTACT"
    case dqTrackCut = "DQ_TRACK_CUT"
    case dqProfanity = "DQ_PROFANITY"
    case dqLoafing = "DQ_LOAFING"
    case dqIllegalAssistance = "DQ_ILLEGAL_ASSISTANCE"
    case dqDistanced = "DQ_DISTANCED"
    case dqTeamFoul = "DQ_TEAM_FOUL"
    case dqOther = "DQ_OTHER"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .none: return "—"
        case .dns: return "DNS"
        case .dnf: return "DNF"
        case .scratch: return "Scratch"
        case .dqFalseStart: return "DQ · False Start"
        case .dqBodyContact: return "DQ · Body Contact"
        case .dqTrackCut: return "DQ · Track Cut"
        case .dqProfanity: return "DQ · Profanity"
        case .dqLoafing: return "DQ · Loafing"
        case .dqIllegalAssistance: return "DQ · Illegal Assistance"
        case .dqDistanced: return "DQ · Distanced"
        case .dqTeamFoul: return "DQ · Team Foul"
        case .dqOther: return "DQ · Other"
        }
    }

    public var isDQ: Bool { rawValue.hasPrefix("DQ_") }
}
