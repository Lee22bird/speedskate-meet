import Foundation

@MainActor
public final class ResultsViewModel: ObservableObject {
    @Published public var data: ResultsResponse?
    @Published public var isLoading = false
    @Published public var errorMessage: String?

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func load(meetID: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            data = try await api.results(meetID: meetID)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
