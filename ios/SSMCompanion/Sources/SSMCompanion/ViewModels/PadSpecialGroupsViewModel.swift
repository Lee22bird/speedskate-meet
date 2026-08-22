import Foundation

/// One editable Open or Quad race group.
public struct EditableSpecialGroup: Identifiable {
    public let id: String
    public let label: String
    public let gender: String
    public var enabled: Bool
    public var ages: String          // editable for Open; display-only for Quad
    public var distance: String      // Open only
    public var distances: [String]   // Quad only — POSITIONAL, slot = race day
}

/// Drives the Open and Quad builders — same screen, two kinds. Enabling a group
/// generates its races from the configured distances, so saving confirms first.
@MainActor
public final class PadSpecialGroupsViewModel: ObservableObject {
    /// "open" or "quad".
    public let kind: String
    public var isOpen: Bool { kind == "open" }

    @Published public private(set) var scheme = ""
    @Published public var groups: [EditableSpecialGroup] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var loaded = false
    @Published public private(set) var isSaving = false
    @Published public var errorMessage: String?
    @Published public var savedMessage: String?
    @Published public var showEnabledOnly = false

    private let api: APIClient
    public init(kind: String, api: APIClient = .shared) {
        self.kind = kind
        self.api = api
    }

    public var enabledCount: Int { groups.filter(\.enabled).count }

    public func load(meetID: String) async {
        isLoading = !loaded
        defer { isLoading = false }
        do {
            let r = try await api.specialGroups(meetID: meetID, kind: kind)
            scheme = r.scheme
            groups = r.groups.map {
                EditableSpecialGroup(id: $0.id, label: $0.label, gender: $0.gender,
                                     enabled: $0.enabled, ages: $0.ages,
                                     distance: $0.distance, distances: $0.distances)
            }
            loaded = true
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func save(meetID: String) async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        savedMessage = nil
        // Addressed by group id, so sending all rows is safe; the server ignores
        // ids it doesn't know and refuses a scheme that shifted underneath us.
        let payload: [[String: Any]] = groups.map { g in
            var row: [String: Any] = ["id": g.id, "enabled": g.enabled]
            if isOpen {
                row["ages"] = g.ages.trimmingCharacters(in: .whitespaces)
                row["distance"] = g.distance.trimmingCharacters(in: .whitespaces)
            } else {
                // Positional — trimmed in place, holes preserved.
                row["distances"] = g.distances.map { $0.trimmingCharacters(in: .whitespaces) }
            }
            return row
        }
        do {
            let r = try await api.saveSpecialGroups(meetID: meetID, kind: kind,
                                                    scheme: scheme, groups: payload)
            errorMessage = nil
            await load(meetID: meetID)
            savedMessage = r.racesRebuilt
                ? "Saved — \(r.enabledCount) on, races regenerated."
                : "Saved — nothing changed, races untouched."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
