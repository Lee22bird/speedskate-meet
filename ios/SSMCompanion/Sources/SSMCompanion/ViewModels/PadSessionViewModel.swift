import Foundation
import SwiftUI

/// Which board the iPad sidebar has selected for the active meet.
public enum PadSection: String, CaseIterable, Identifiable {
    case director
    case blockBuilder
    case tabulator
    case announcer
    case referee
    case liveBoard
    case results

    public var id: String { rawValue }

    var title: String {
        switch self {
        case .director: return "Race Day Control"
        case .blockBuilder: return "Block Builder"
        case .tabulator: return "Tabulator"
        case .announcer: return "Announcer"
        case .referee: return "Referee"
        case .liveBoard: return "Live Board"
        case .results: return "Results"
        }
    }

    var icon: String {
        switch self {
        case .director: return "flag.checkered"
        case .blockBuilder: return "square.stack.3d.up"
        case .tabulator: return "square.and.pencil"
        case .announcer: return "megaphone"
        case .referee: return "person.crop.rectangle.stack"
        case .liveBoard: return "tv"
        case .results: return "list.number"
        }
    }

    /// Which staff roles may open this board — mirrors the website's race-day
    /// tab access rules (routes/raceDayRoutes.js:1595-1600) and its
    /// director-only meet tabs. The server still enforces everything; this
    /// only decides what the sidebar offers.
    func allowed(for role: StaffRole?) -> Bool {
        switch self {
        case .director, .blockBuilder: return role == .director
        case .tabulator: return role == .director || role == .tabulator
        case .announcer, .referee: return role != nil
        case .liveBoard, .results: return true
        }
    }
}

/// Owns the iPad session: which meet is selected, the user's role on it, and
/// the polled race-day state every board shares.
@MainActor
public final class PadSessionViewModel: ObservableObject {
    @Published public var selectedMeetID: String?
    @Published public var selectedMeetName: String = ""
    @Published public var selectedSection: PadSection?
    @Published public private(set) var role: StaffRole?
    @Published public private(set) var canControlRaceDay: Bool = false
    @Published public private(set) var state: RaceDayStateResponse?
    @Published public private(set) var isSendingAction = false
    @Published public var errorMessage: String?

    private let api: APIClient
    private var pollTask: Task<Void, Never>?

    public init(api: APIClient = .shared) {
        self.api = api
    }

    /// Select a meet from the sidebar: resolve the user's role for it, pick a
    /// sensible default board, and start polling state if they're staff.
    public func selectMeet(id: String, name: String) async {
        guard selectedMeetID != id else { return }
        stopPolling()
        selectedMeetID = id
        selectedMeetName = name
        role = nil
        canControlRaceDay = false
        state = nil
        errorMessage = nil

        do {
            let access = try await api.staffAccess(meetID: id)
            role = access.hasAccess ? access.role : nil
            canControlRaceDay = access.canControlRaceDay ?? false
        } catch {
            role = nil
            canControlRaceDay = false
        }

        selectedSection = defaultSection(for: role)
        if role != nil {
            await refreshState()
            startPolling()
        }
    }

    public func clearMeet() {
        stopPolling()
        selectedMeetID = nil
        selectedMeetName = ""
        selectedSection = nil
        role = nil
        canControlRaceDay = false
        state = nil
    }

    private func defaultSection(for role: StaffRole?) -> PadSection {
        switch role {
        case .director: return .director
        case .tabulator: return .tabulator
        case .announcer: return .announcer
        case .referee: return .referee
        case nil: return .liveBoard
        }
    }

    // ── Race-day state polling ───────────────────────────────────────────

    public func refreshState() async {
        guard let meetID = selectedMeetID, role != nil else { return }
        do {
            state = try await api.raceDayState(meetID: meetID)
            errorMessage = nil
        } catch APIError.unauthorized {
            errorMessage = "Your session expired — log in again."
        } catch {
            // Keep the last good state on transient failures.
            if state == nil { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
        }
    }

    public func startPolling(interval: UInt64 = 5_000_000_000) {
        stopPolling()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: interval)
                guard !Task.isCancelled else { break }
                await self?.refreshState()
            }
        }
    }

    public func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // ── Director controls (same endpoints as the website) ────────────────

    public func setCurrentRace(raceID: String) async { await runAction { [self] in
        guard let meetID = selectedMeetID else { return }
        try await api.setCurrentRace(meetID: meetID, raceID: raceID)
    } }

    public func step(direction: Int) async { await runAction { [self] in
        guard let meetID = selectedMeetID else { return }
        try await api.stepRace(meetID: meetID, direction: direction)
    } }

    public func togglePause() async { await runAction { [self] in
        guard let meetID = selectedMeetID else { return }
        try await api.togglePause(meetID: meetID)
    } }

    public func unlockCurrentRace() async { await runAction { [self] in
        guard let meetID = selectedMeetID, let raceID = state?.current?.id.stringValue else { return }
        try await api.unlockRace(meetID: meetID, raceID: raceID)
    } }

    private func runAction(_ body: () async throws -> Void) async {
        guard !isSendingAction else { return }
        isSendingAction = true
        defer { isSendingAction = false }
        do {
            try await body()
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        await refreshState()
    }
}
