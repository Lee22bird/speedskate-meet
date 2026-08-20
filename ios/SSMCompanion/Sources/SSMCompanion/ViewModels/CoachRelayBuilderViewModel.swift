import Foundation

/// Drives the phone coach relay builder: pick the coach's own eligible skaters
/// into team slots per division and save them. Only the coach's team's skaters
/// are ever offered (the server enforces this too). Generating the actual races
/// stays with the director — this view only submits teams.
@MainActor
public final class CoachRelayBuilderViewModel: ObservableObject {
    @Published public private(set) var divisions: [RelayDivision] = []
    @Published public private(set) var team: String = ""
    @Published public var draftTeams: [String: [RelayDraftTeam]] = [:]  // keyed by division id
    @Published public var isLoading = false
    @Published public var isSaving = false
    @Published public var errorMessage: String?
    @Published public var flash: String?

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func load(meetID: String) async {
        isLoading = divisions.isEmpty
        defer { isLoading = false }
        do {
            let d = try await api.coachRelayBuilder(meetID: meetID)
            team = d.team
            divisions = d.divisions
            var drafts: [String: [RelayDraftTeam]] = [:]
            for div in d.divisions {
                var list = div.teams.map { RelayDraftTeam(slots: pad($0.memberRegIds, size: div.size)) }
                list.append(RelayDraftTeam(slots: Array(repeating: "", count: div.size))) // one blank to fill
                drafts[div.id] = list
            }
            draftTeams = drafts
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func pad(_ ids: [String], size: Int) -> [String] {
        var s = ids
        while s.count < size { s.append("") }
        return Array(s.prefix(size))
    }

    // MARK: Editing

    public func setSlot(division divID: String, team teamID: UUID, slot: Int, regID: String) {
        guard let ti = draftTeams[divID]?.firstIndex(where: { $0.id == teamID }) else { return }
        draftTeams[divID]?[ti].slots[slot] = regID
        flash = nil
    }

    public func addTeam(division div: RelayDivision) {
        draftTeams[div.id, default: []].append(RelayDraftTeam(slots: Array(repeating: "", count: div.size)))
    }

    public func removeTeam(division divID: String, team teamID: UUID) {
        draftTeams[divID]?.removeAll { $0.id == teamID }
    }

    /// Skaters already used elsewhere in this division (so a menu can grey them
    /// out) — optionally excluding one slot (the one being edited).
    public func usedSkaters(inDivision divID: String, excluding teamID: UUID? = nil, slot: Int? = nil) -> Set<String> {
        var used = Set<String>()
        for team in draftTeams[divID] ?? [] {
            for (i, v) in team.slots.enumerated() where !v.isEmpty {
                if team.id == teamID && i == slot { continue }
                used.insert(v)
            }
        }
        return used
    }

    public func skaterName(_ id: String, in div: RelayDivision) -> String {
        div.eligible.first(where: { $0.id == id })?.name ?? id
    }

    public var completeTeamCount: Int {
        divisions.reduce(0) { $0 + (draftTeams[$1.id] ?? []).filter(\.isComplete).count }
    }

    // MARK: Save

    private func collectTeams() -> [(divisionId: String, memberRegIds: [String])] {
        var out: [(divisionId: String, memberRegIds: [String])] = []
        for div in divisions {
            for team in draftTeams[div.id] ?? [] where team.isComplete {
                out.append((divisionId: div.id, memberRegIds: team.slots))
            }
        }
        return out
    }

    public func save(meetID: String) async {
        isSaving = true
        defer { isSaving = false }
        do {
            let r = try await api.saveCoachRelayTeams(meetID: meetID, teams: collectTeams())
            errorMessage = nil
            flash = "Saved \(r.savedTeams) team\(r.savedTeams == 1 ? "" : "s"). Your director places them in the running order."
            await load(meetID: meetID)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
