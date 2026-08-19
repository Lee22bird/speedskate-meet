import Foundation

/// Lists the meets the logged-in coach has skaters in (via /api/v1/my-coach-meets).
@MainActor
public final class CoachMeetsViewModel: ObservableObject {
    @Published public var meets: [CoachMeet] = []
    @Published public var isCoach = false
    @Published public var isLoading = false
    @Published public var errorMessage: String?

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func load() async {
        if meets.isEmpty { isLoading = true }
        defer { isLoading = false }
        do {
            let r = try await api.myCoachMeets()
            isCoach = r.isCoach
            meets = r.meets
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

/// Drives one meet's coach protest screen: the filing form + the coach's own
/// filed protests. Files through the additive /api/v1 coach endpoint, which
/// reuses the website's buildProtest and lands on the same meet.protests[].
@MainActor
public final class CoachProtestViewModel: ObservableObject {
    @Published public var form: CoachProtestForm?
    @Published public var isLoading = false
    @Published public var isFiling = false
    @Published public var errorMessage: String?
    @Published public var filedFlash = false

    // Form entry state.
    @Published public var category = ""
    @Published public var raceID = ""
    @Published public var registrationID = ""
    @Published public var statement = ""

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public var categories: [ProtestCategoryOption] { form?.categories ?? [] }
    public var races: [ProtestRaceOption] { form?.races ?? [] }
    public var skaters: [ProtestSkaterOption] { form?.skaters ?? [] }
    public var myProtests: [Protest] { form?.myProtests ?? [] }
    public var protestFee: Double { form?.protestFee ?? 0 }

    /// Whether the picked category is tied to a specific race (Competition /
    /// Eligibility / Conduct) — drives whether the race picker shows.
    public var categoryIsRaceSpecific: Bool {
        categories.first(where: { $0.name == category })?.raceSpecific ?? false
    }

    /// The form is fileable: a category, a statement, and (if race-specific) a race.
    public var canFile: Bool {
        !category.isEmpty
            && !statement.trimmingCharacters(in: .whitespaces).isEmpty
            && (!categoryIsRaceSpecific || !raceID.isEmpty)
    }

    public func load(meetID: String) async {
        isLoading = (form == nil)
        defer { isLoading = false }
        do {
            form = try await api.coachProtestForm(meetID: meetID)
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func file(meetID: String) async {
        guard canFile, !isFiling else { return }
        let raceSpecific = categoryIsRaceSpecific
        let rid = raceSpecific ? raceID : ""
        let raceLabel = raceSpecific ? (races.first(where: { $0.id == raceID })?.label ?? "") : ""
        isFiling = true
        defer { isFiling = false }
        do {
            _ = try await api.fileCoachProtest(meetID: meetID, category: category, raceID: rid,
                                               raceLabel: raceLabel, registrationID: registrationID,
                                               statement: statement)
            category = ""; raceID = ""; registrationID = ""; statement = ""
            filedFlash = true
            errorMessage = nil
            await load(meetID: meetID)   // refresh "my protests"
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
