import Foundation

public enum MeetFilterChip: String, CaseIterable, Identifiable {
    case all = "All"
    case kansas = "Kansas"
    case texas = "Texas"
    case nationals = "Nationals"
    case today = "Today"
    case thisWeek = "This Week"

    public var id: String { rawValue }
    public var icon: String {
        switch self {
        case .all: return "calendar"
        case .kansas, .texas: return "mappin.circle"
        case .nationals: return "trophy"
        case .today: return "sun.max"
        case .thisWeek: return "calendar.badge.clock"
        }
    }
}

@MainActor
public final class MeetsListViewModel: ObservableObject {
    @Published public var meets: [MeetSummary] = []
    @Published public var isLoading = false
    @Published public var errorMessage: String?
    @Published public var searchText: String = ""
    @Published public var selectedFilter: MeetFilterChip = .all

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public var liveMeet: MeetSummary? {
        meets.first { $0.isLive == true }
    }

    public var upcomingMeets: [MeetSummary] {
        meets.filter { $0.isLive != true }
    }

    public func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            switch selectedFilter {
            case .all:
                meets = try await api.meets(query: searchText)
            case .kansas:
                meets = try await api.meets(query: searchText, state: "KS")
            case .texas:
                meets = try await api.meets(query: searchText, state: "TX")
            case .nationals:
                meets = try await api.meets(query: searchText, league: "national")
            case .today:
                meets = try await api.meets(query: searchText, when: "today")
            case .thisWeek:
                meets = try await api.meets(query: searchText, when: "week")
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
