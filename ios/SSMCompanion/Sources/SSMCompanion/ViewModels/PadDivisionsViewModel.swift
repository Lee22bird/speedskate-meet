import Foundation

/// One editable division slot (novice/elite). Distances are edited as a single
/// comma-separated string ("500m, 1000m") — far friendlier on a touch form than
/// four boxes — and split on save.
public struct EditableSlot {
    public var enabled: Bool
    public var ages: String
    public var distances: String
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
        EditableSlot(enabled: d.enabled,
                     ages: d.ages.isEmpty ? fallbackAges : d.ages,
                     distances: d.distances.filter { !$0.isEmpty }.joined(separator: ", "))
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
            let r = try await api.saveDivisions(meetID: meetID, groups: payload)
            errorMessage = nil
            let n = r.raceCount ?? 0
            savedMessage = "Saved — \(n) race\(n == 1 ? "" : "s") generated from your divisions."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func slotPayload(_ s: EditableSlot) -> [String: Any] {
        let distances = s.distances
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return ["enabled": s.enabled,
                "ages": s.ages.trimmingCharacters(in: .whitespaces),
                "distances": distances]
    }
}
