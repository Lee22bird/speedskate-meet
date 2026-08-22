import Foundation

/// Drives the staff manager: who's assigned to each role, plus search-and-assign
/// from SSL's approved directory. Searching and assigning depend on the LIVE SSL
/// server, so those failures are surfaced on their own without breaking the
/// (local) list of who's already assigned.
@MainActor
public final class PadStaffViewModel: ObservableObject {
    @Published public private(set) var roles: [StaffRoleRow] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var loaded = false
    @Published public private(set) var isWorking = false
    @Published public var errorMessage: String?
    @Published public var statusFlash: String?

    // Search state — scoped to the role whose picker is open.
    @Published public var searchRoleKey: String?
    @Published public var searchQuery = ""
    @Published public private(set) var searchResults: [StaffSearchPerson] = []
    @Published public private(set) var isSearching = false
    @Published public var searchError: String?

    private let api: APIClient
    private var searchTask: Task<Void, Never>?
    public init(api: APIClient = .shared) { self.api = api }

    public func load(meetID: String) async {
        isLoading = !loaded
        defer { isLoading = false }
        do {
            roles = try await api.staffAssignments(meetID: meetID)
            loaded = true
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func openSearch(role: String) {
        searchRoleKey = role
        searchQuery = ""
        searchResults = []
        searchError = nil
    }

    public func closeSearch() {
        searchTask?.cancel()
        searchRoleKey = nil
        searchQuery = ""
        searchResults = []
        searchError = nil
    }

    /// Debounced search. The server ignores queries under 2 characters, so match
    /// that instead of firing pointless requests.
    public func search(meetID: String) {
        searchTask?.cancel()
        guard let role = searchRoleKey else { return }
        let q = searchQuery.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { searchResults = []; searchError = nil; isSearching = false; return }
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let self else { return }
            self.isSearching = true
            defer { self.isSearching = false }
            do {
                let people = try await self.api.staffSearch(meetID: meetID, role: role, query: q)
                guard !Task.isCancelled else { return }
                self.searchResults = people
                self.searchError = people.isEmpty ? "No approved SSL profiles matched “\(q)” for this role." : nil
            } catch {
                guard !Task.isCancelled else { return }
                self.searchResults = []
                self.searchError = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    public func assign(meetID: String, person: StaffSearchPerson) async {
        guard let role = searchRoleKey, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await api.assignStaff(meetID: meetID, role: role, person: person)
            closeSearch()
            await load(meetID: meetID)
            errorMessage = nil
            statusFlash = "\(person.name) assigned."
        } catch {
            searchError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func remove(meetID: String, role: String, assignment: StaffAssignment) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await api.removeStaff(meetID: meetID, role: role, assignmentID: assignment.id)
            await load(meetID: meetID)
            errorMessage = nil
            statusFlash = "\(assignment.name) removed."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
