import Foundation

@MainActor
public final class StaffMeetsViewModel: ObservableObject {
    @Published public var meets: [StaffMeetSummary] = []
    @Published public var isLoading = false
    @Published public var errorMessage: String?

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            meets = try await api.myStaffMeets()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

@MainActor
public final class StaffRaceDayViewModel: ObservableObject {
    @Published public var data: RaceDayStateResponse?
    @Published public var isLoading = false
    @Published public var errorMessage: String?
    @Published public var isSendingAction = false

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func load(meetID: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            data = try await api.raceDayState(meetID: meetID)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func setCurrentRace(meetID: String, raceID: String) async {
        await runAction { try await self.api.setCurrentRace(meetID: meetID, raceID: raceID) }
        await load(meetID: meetID)
    }

    public func step(meetID: String, direction: Int) async {
        await runAction { try await self.api.stepRace(meetID: meetID, direction: direction) }
        await load(meetID: meetID)
    }

    public func togglePause(meetID: String) async {
        await runAction { try await self.api.togglePause(meetID: meetID) }
        await load(meetID: meetID)
    }

    public func unlockCurrentRace(meetID: String) async {
        guard let raceID = data?.current?.id.stringValue else { return }
        await runAction { try await self.api.unlockRace(meetID: meetID, raceID: raceID) }
        await load(meetID: meetID)
    }

    private func runAction(_ action: @escaping () async throws -> Void) async {
        isSendingAction = true
        errorMessage = nil
        defer { isSendingAction = false }
        do {
            try await action()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
