import Foundation

/// One editable relay division row. `enabled` decides whether the meet offers
/// this relay at all; distance/age range are per-meet overrides of the ruleset
/// defaults.
public struct EditableRelayTemplate: Identifiable {
    public let divisionId: String
    public let label: String
    public let type: String
    public let age: String
    public let discipline: String
    public var enabled: Bool
    public var ageRange: String
    public var distance: String
    public let raceId: String?
    public let raceHasResults: Bool
    public var id: String { divisionId }
}

/// Drives the relay-templates editor: pick which relay divisions this meet runs
/// and tune their ages/distances. Enabling a division generates its relay race;
/// teams are filled in afterwards (Relay Builder), which is where the races get
/// their entries.
@MainActor
public final class PadRelayTemplatesViewModel: ObservableObject {
    @Published public private(set) var ruleset = ""
    @Published public var rows: [EditableRelayTemplate] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var loaded = false
    @Published public private(set) var isSaving = false
    @Published public var errorMessage: String?
    @Published public var savedMessage: String?
    /// Show every division, or only the ones this meet offers.
    @Published public var showEnabledOnly = false

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public var enabledCount: Int { rows.filter(\.enabled).count }

    public var visibleRows: [EditableRelayTemplate] {
        showEnabledOnly ? rows.filter(\.enabled) : rows
    }

    public func load(meetID: String) async {
        isLoading = !loaded
        defer { isLoading = false }
        do {
            let r = try await api.relayTemplates(meetID: meetID)
            ruleset = r.ruleset
            rows = r.rows.map {
                EditableRelayTemplate(divisionId: $0.divisionId, label: $0.label, type: $0.type,
                                      age: $0.age, discipline: $0.discipline, enabled: $0.enabled,
                                      ageRange: $0.ageRange, distance: $0.distance,
                                      raceId: $0.raceId, raceHasResults: $0.raceHasResults)
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
        // Rows are addressed by divisionId, so sending all of them is safe even
        // if the ruleset shifted underneath us — unknown ids are ignored server-side.
        let payload: [[String: Any]] = rows.map { r in
            ["divisionId": r.divisionId,
             "enabled": r.enabled,
             "ageRange": r.ageRange.trimmingCharacters(in: .whitespaces),
             "distance": r.distance.trimmingCharacters(in: .whitespaces)]
        }
        do {
            let r = try await api.saveRelayTemplates(meetID: meetID, rows: payload)
            errorMessage = nil
            await load(meetID: meetID)
            savedMessage = "Saved — \(r.relayRaceCount) relay race\(r.relayRaceCount == 1 ? "" : "s") set up."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func deleteRace(meetID: String, raceID: String) async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        savedMessage = nil
        do {
            _ = try await api.deleteRelayRace(meetID: meetID, raceID: raceID)
            errorMessage = nil
            await load(meetID: meetID)
            savedMessage = "Relay race removed."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
