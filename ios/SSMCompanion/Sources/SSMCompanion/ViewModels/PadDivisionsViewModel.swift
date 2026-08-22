import Foundation

/// One editable division slot (novice/elite). Distances are POSITIONAL — slot
/// index = race day (D1..D4), and the race generator keys races on that index —
/// so they are edited as four separate boxes and holes are preserved exactly.
/// (A compacting edit would silently move a race to a different day and
/// recreate it with a new id and empty results.)
public struct EditableSlot {
    public var enabled: Bool
    public var ages: String
    public var distances: [String]   // always 4 entries, "" = no race that day
}

public struct EditableGroup: Identifiable {
    public let index: Int
    public let label: String
    public let ages: String
    public let gender: String
    public var novice: EditableSlot
    public var elite: EditableSlot
    public var id: Int { index }
}

/// Drives the per-division editor: load meet.groups into editable rows, then save
/// the whole set (the server regenerates races from the config).
@MainActor
public final class PadDivisionsViewModel: ObservableObject {
    @Published public private(set) var scheme = ""
    @Published public var groups: [EditableGroup] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var loaded = false
    @Published public private(set) var isSaving = false
    @Published public var errorMessage: String?
    @Published public var savedMessage: String?

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func load(meetID: String) async {
        isLoading = !loaded
        defer { isLoading = false }
        do {
            let r = try await api.divisions(meetID: meetID)
            scheme = r.scheme
            groups = r.groups.map { g in
                EditableGroup(index: g.index, label: g.label, ages: g.ages, gender: g.gender,
                              novice: slot(g.novice, fallbackAges: g.ages),
                              elite: slot(g.elite, fallbackAges: g.ages))
            }
            loaded = true
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func slot(_ d: DivisionSlotDTO, fallbackAges: String) -> EditableSlot {
        var ds = d.distances
        while ds.count < 4 { ds.append("") }
        return EditableSlot(enabled: d.enabled,
                            ages: d.ages.isEmpty ? fallbackAges : d.ages,
                            distances: Array(ds.prefix(4)))
    }

    /// Enabled divisions across all groups — drives the Save button count.
    public var enabledCount: Int {
        groups.reduce(0) { $0 + (($1.novice.enabled ? 1 : 0) + ($1.elite.enabled ? 1 : 0)) }
    }

    public func save(meetID: String) async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        savedMessage = nil
        let payload: [[String: Any]] = groups.map { g in
            ["index": g.index,
             "novice": slotPayload(g.novice),
             "elite": slotPayload(g.elite)]
        }
        do {
            // The scheme rides along so a stale editor (scheme switched under it)
            // is refused by the server instead of writing onto the wrong groups.
            let r = try await api.saveDivisions(meetID: meetID, scheme: scheme, groups: payload)
            errorMessage = nil
            let n = r.raceCount ?? 0
            let rebuilt = r.racesRebuilt == true
            await load(meetID: meetID)   // reflect exactly what the server kept
            savedMessage = rebuilt
                ? "Saved — \(n) race\(n == 1 ? "" : "s") generated from your divisions."
                : "Saved — nothing changed, races untouched."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func slotPayload(_ s: EditableSlot) -> [String: Any] {
        // Positional: trimmed in place, holes preserved, never compacted.
        ["enabled": s.enabled,
         "ages": s.ages.trimmingCharacters(in: .whitespaces),
         "distances": s.distances.map { $0.trimmingCharacters(in: .whitespaces) }]
    }
}
