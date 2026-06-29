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
        filteredMeets.first { $0.isLiveNow }
    }

    public var upcomingMeets: [MeetSummary] {
        filteredMeets.filter { !$0.isLiveNow }
    }

    public var filteredMeets: [MeetSummary] {
        meets.filter { meet in
            let search = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            let matchesSearch = search.isEmpty || meet.searchableText.localizedCaseInsensitiveContains(search)
            return matchesSearch && selectedFilter.matches(meet)
        }
    }

    public func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            meets = try await api.meets()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

private extension MeetFilterChip {
    func matches(_ meet: MeetSummary, now: Date = Date()) -> Bool {
        switch self {
        case .all:
            return true
        case .kansas:
            return meet.matchesPlace(name: "Kansas", abbreviation: "KS")
        case .texas:
            return meet.matchesPlace(name: "Texas", abbreviation: "TX")
        case .nationals:
            return meet.searchableText.localizedCaseInsensitiveContains("National")
        case .today:
            guard let range = meet.dateRange else { return false }
            return range.contains(Calendar.current.startOfDay(for: now))
        case .thisWeek:
            guard let range = meet.dateRange,
                  let weekEnd = Calendar.current.date(byAdding: .day, value: 7, to: now) else { return false }
            return range.overlaps(Calendar.current.startOfDay(for: now)...weekEnd)
        }
    }
}

private extension MeetSummary {
    func matchesPlace(name: String, abbreviation: String) -> Bool {
        if searchableText.localizedCaseInsensitiveContains(name) { return true }
        let tokens = searchableText
            .uppercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
        return tokens.contains(abbreviation)
    }
}
