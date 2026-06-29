import Foundation

@MainActor
public final class MeetsListViewModel: ObservableObject {
    @Published public var meets: [MeetSummary] = []
    @Published public var isLoading = false
    @Published public var errorMessage: String?
    @Published public var searchText: String = ""

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            meets = try await api.meets(query: searchText)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
