import Foundation

@MainActor
public final class LiveRaceDayViewModel: ObservableObject {
    @Published public var data: LiveRaceDayResponse?
    @Published public var isLoading = false
    @Published public var errorMessage: String?

    private let api: APIClient
    private var refreshTask: Task<Void, Never>?

    public init(api: APIClient = .shared) { self.api = api }

    public func load(meetID: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            data = try await api.liveRaceDay(meetID: meetID)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Polls every 8s while the Live screen is visible, same cadence the
    /// website's /meet/:meetId/live page already uses for its auto-refresh.
    public func startAutoRefresh(meetID: String) {
        stopAutoRefresh()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.load(meetID: meetID)
                try? await Task.sleep(nanoseconds: 8_000_000_000)
            }
        }
    }

    public func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }
}
