import Foundation
import SwiftUI

/// Shared engine for the iPad Registered + Check-In boards. Roster comes
/// from desktop-export; every mutation calls the website's existing portal
/// endpoints and re-reads. Issue rules and stat math mirror
/// views/checkinView.js and views/registeredView.js exactly — the server
/// still owns divisions, cost, helmets, and race assignments.
@MainActor
public final class FrontDeskViewModel: ObservableObject {
    @Published public private(set) var meet: ExportMeet?
    @Published public private(set) var isLoading = false
    @Published public private(set) var isWorking = false
    @Published public var errorMessage: String?
    @Published public var statusFlash: String? {
        didSet { if statusFlash != nil { flashID = UUID() } }
    }
    /// Changes on every flash — banner timers key off this so two identical
    /// back-to-back messages still each get their full display time.
    @Published public private(set) var flashID = UUID()

    private let api: APIClient
    private var meetID = ""

    public init(api: APIClient = .shared) {
        self.api = api
    }

    // ── Loading ──────────────────────────────────────────────────────────

    public func load(meetID: String) async {
        if self.meetID != meetID {
            self.meetID = meetID
            meet = nil
        }
        guard meet == nil else { return }
        isLoading = true
        defer { isLoading = false }
        await refresh()
    }

    public func refresh() async {
        guard !meetID.isEmpty else { return }
        do {
            meet = try await api.desktopExport(meetID: meetID)
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        recomputeDerived()
    }

    // ── Derived state ────────────────────────────────────────────────────

    public private(set) var registrations: [ExportRegistration] = []
    /// How many registrations use each (trimmed) helmet number.
    private var helmetCounts: [String: Int] = [:]

    private func recomputeDerived() {
        registrations = meet?.registrations ?? []
        var counts: [String: Int] = [:]
        for reg in registrations {
            if let h = reg.helmetDisplay { counts[h, default: 0] += 1 }
        }
        helmetCounts = counts
    }

    public func isDuplicateHelmet(_ reg: ExportRegistration) -> Bool {
        guard let h = reg.helmetDisplay else { return false }
        return (helmetCounts[h] ?? 0) > 1
    }

    static func money(_ value: Double) -> String {
        "$\(Int(value.rounded()))"
    }

    public func cost(_ reg: ExportRegistration) -> Double { reg.totalCost ?? 0 }

    // Check-In issue list (checkinView.js issuesFor — exact wording).
    public func checkInIssues(_ reg: ExportRegistration) -> [String] {
        var issues: [String] = []
        if reg.helmetDisplay == nil {
            issues.append("No helmet # assigned")
        } else if isDuplicateHelmet(reg), let h = reg.helmetDisplay {
            issues.append("Helmet #\(h) is a duplicate")
        }
        if !reg.paid {
            issues.append("\(Self.money(cost(reg))) due")
        }
        return issues
    }

    public struct RosterIssue: Identifiable {
        public let text: String
        public let isBlocking: Bool
        public var id: String { text }
    }

    // Registered issue list (registeredView.js issuesForRegistration).
    public func rosterIssues(_ reg: ExportRegistration) -> [RosterIssue] {
        var issues: [RosterIssue] = []
        if reg.helmetDisplay == nil {
            issues.append(RosterIssue(text: "No helmet # assigned", isBlocking: true))
        } else if isDuplicateHelmet(reg), let h = reg.helmetDisplay {
            issues.append(RosterIssue(text: "Helmet #\(h) is used by \(helmetCounts[h] ?? 2) skaters", isBlocking: true))
        }
        if !reg.hasEntries {
            issues.append(RosterIssue(text: "No entries selected", isBlocking: true))
        }
        if !reg.paid {
            issues.append(RosterIssue(text: "\(Self.money(cost(reg))) entry fee outstanding", isBlocking: false))
        }
        return issues
    }

    public func isBlocking(_ reg: ExportRegistration) -> Bool {
        rosterIssues(reg).contains { $0.isBlocking }
    }

    /// Entry chips, normalized to the check-in page's labels.
    public func entryChips(_ reg: ExportRegistration) -> [String] {
        var chips: [String] = []
        if reg.challengeUp { chips.append("CU") }
        if reg.options["novice"] == true { chips.append("Novice") }
        if reg.options["elite"] == true { chips.append("Elite") }
        if reg.options["open"] == true { chips.append("Open") }
        if reg.options["quad"] == true { chips.append("Quad") }
        if reg.options["additional"] == true { chips.append("Additional") }
        if reg.timeTrials { chips.append("Time Trials") }
        if reg.options["relay2Person"] == true { chips.append("2 Person Relay") }
        if reg.options["relay3Person"] == true { chips.append("3 Person Relay") }
        if reg.options["relay4Person"] == true { chips.append("4 Person Relay") }
        if reg.options["quadRelay2Person"] == true { chips.append("Quad 2 Person") }
        if reg.options["quadRelay3Person"] == true { chips.append("Quad 3 Person") }
        return chips
    }

    // ── Check-In stats (checkinView.js band) ─────────────────────────────

    public struct CheckInStats {
        public var total = 0
        public var checkedIn = 0
        public var remaining = 0
        public var totalOwed: Double = 0
        public var totalPaid: Double = 0
        public var attention = 0
        public var unpaid = 0
        public var noHelmet = 0
    }

    public var checkInStats: CheckInStats {
        var stats = CheckInStats()
        stats.total = registrations.count
        for reg in registrations {
            if reg.checkedIn { stats.checkedIn += 1 }
            stats.totalOwed += cost(reg)
            if reg.paid { stats.totalPaid += cost(reg) } else { stats.unpaid += 1 }
            if reg.helmetDisplay == nil { stats.noHelmet += 1 }
            if !checkInIssues(reg).isEmpty { stats.attention += 1 }
        }
        stats.remaining = stats.total - stats.checkedIn
        return stats
    }

    /// Check-in queue order: needs-attention first, then ready-not-checked-in,
    /// then checked-in; insertion order within each tier.
    public var checkInQueue: [ExportRegistration] {
        func rank(_ reg: ExportRegistration) -> Int {
            if !checkInIssues(reg).isEmpty { return 0 }
            return reg.checkedIn ? 2 : 1
        }
        return registrations.enumerated()
            .sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }
            .map(\.element)
    }

    public var attentionList: [ExportRegistration] {
        registrations.filter { !checkInIssues($0).isEmpty }
    }

    // ── Registered stats (registeredView.js band) ────────────────────────

    public struct RegisteredStats {
        public var total = 0
        public var checkedIn = 0
        public var feesDue: Double = 0
        public var feesCollected: Double = 0
        public var paidCount = 0
        public var attention = 0
        public var blocking = 0
        public var onSiteUnpaid = 0
        public var onSiteUnpaidTotal: Double = 0
        public var readyPct = 0
    }

    public var registeredStats: RegisteredStats {
        var stats = RegisteredStats()
        stats.total = registrations.count
        for reg in registrations {
            if reg.checkedIn { stats.checkedIn += 1 }
            stats.feesDue += cost(reg)
            if reg.paid { stats.feesCollected += cost(reg); stats.paidCount += 1 }
            let issues = rosterIssues(reg)
            if !issues.isEmpty { stats.attention += 1 }
            if issues.contains(where: \.isBlocking) { stats.blocking += 1 }
            if reg.checkedIn && !reg.paid {
                stats.onSiteUnpaid += 1
                stats.onSiteUnpaidTotal += cost(reg)
            }
        }
        stats.readyPct = stats.total == 0 ? 0
            : min(max(Int((Double(stats.total - stats.blocking) / Double(stats.total) * 100).rounded()), 0), 100)
        return stats
    }

    /// Division-grouped roster: groups alphabetical, rows in insertion order,
    /// blank division last as "No division assigned".
    public func groupedRoster(_ rows: [ExportRegistration]) -> [(division: String, rows: [ExportRegistration])] {
        var byDivision: [String: [ExportRegistration]] = [:]
        for reg in rows {
            let label = reg.divisionGroupLabel.isEmpty ? "No division assigned" : reg.divisionGroupLabel
            byDivision[label, default: []].append(reg)
        }
        return byDivision
            .sorted { $0.key.localizedCompare($1.key) == .orderedAscending }
            .map { (division: $0.key, rows: $0.value) }
    }

    // ── Mutations ────────────────────────────────────────────────────────

    /// The toggle endpoints are blind inversions server-side, so the flash
    /// reports the reg's state AFTER refresh — never the pre-tap guess
    /// (another station may have flipped it first).
    public func toggleCheckIn(_ reg: ExportRegistration) async {
        await run {
            try await self.api.toggleCheckIn(meetID: self.meetID, registrationID: reg.id)
        }
        guard errorMessage == nil else { return }
        if let updated = registrations.first(where: { $0.id == reg.id }) {
            statusFlash = updated.checkedIn ? "\(updated.name) checked in." : "\(updated.name) checked back out."
        }
    }

    public func togglePaid(_ reg: ExportRegistration) async {
        await run {
            try await self.api.togglePaid(meetID: self.meetID, registrationID: reg.id)
        }
        guard errorMessage == nil else { return }
        if let updated = registrations.first(where: { $0.id == reg.id }) {
            statusFlash = updated.paid ? "\(updated.name) marked paid." : "\(updated.name) marked unpaid."
        }
    }

    public func setHelmet(_ reg: ExportRegistration, to value: String) async {
        // Unchanged (or blank-on-blank) saves are a no-op — a blank POST
        // would otherwise clear-and-renumber the helmet server-side.
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        guard trimmed != (reg.helmetDisplay ?? "") else { return }
        await run {
            try await self.api.setHelmetNumber(meetID: self.meetID, registrationID: reg.id, helmetNumber: trimmed)
            self.statusFlash = "Helmet number updated."
        }
    }

    public func bulkMarkPaid() async {
        let previouslyUnpaid = registrations.filter { !$0.paid }.count
        await run {
            try await self.api.bulkMarkPaid(meetID: self.meetID)
            self.statusFlash = "Marked \(previouslyUnpaid) skater\(previouslyUnpaid == 1 ? "" : "s") paid."
        }
    }

    public func reassignHelmets(startingAt start: String) async {
        await run {
            try await self.api.reassignHelmets(meetID: self.meetID, startHelmet: start)
            self.statusFlash = "Helmets reassigned in skater-number order."
        }
    }

    public func deleteRegistration(_ reg: ExportRegistration) async {
        await run {
            try await self.api.deleteRegistration(meetID: self.meetID, registrationID: reg.id)
            self.statusFlash = "\(reg.name) removed from all race assignments."
        }
    }

    public func rebuildAssignments() async {
        await run {
            try await self.api.rebuildRaceAssignments(meetID: self.meetID)
            self.statusFlash = "Race assignments rebuilt."
        }
    }

    /// Save the add/edit form. Sends the COMPLETE record — the server's edit
    /// wholly replaces options/paid/checkedIn/gender/email/team/sponsor.
    /// Returns true on success.
    public func saveRegistration(_ form: RegistrationFormState, editingID: String?) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            let body = form.jsonBody()
            if let editingID {
                try await api.editRegistration(meetID: meetID, registrationID: editingID, body: body)
                await refresh()
                // An edit of a concurrently-deleted racer redirects exactly
                // like success — the roster is the only truth. Keep the sheet
                // open so the typed corrections aren't lost.
                guard registrations.contains(where: { $0.id == editingID }) else {
                    errorMessage = "This racer was deleted by another station — their record no longer exists."
                    return false
                }
                statusFlash = "\(form.name) saved."
            } else {
                try await api.addRegistration(meetID: meetID, body: body)
                await refresh()
                statusFlash = "\(form.name) added to the roster."
            }
            errorMessage = nil
            return true
        } catch {
            // Refresh FIRST — a successful refresh clears errorMessage, so
            // setting the failure message afterward keeps it visible.
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            await refresh()
            errorMessage = message
            return false
        }
    }

    private func run(_ body: () async throws -> Void) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await body()
            errorMessage = nil
            await refresh()
        } catch {
            // Same ordering rule as saveRegistration: refresh, THEN set the
            // error so the follow-up refresh can't wipe it.
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            await refresh()
            errorMessage = message
        }
    }
}

// ── Registration form state (shared add/edit sheet) ──────────────────────

/// Mirrors the website's registrationForm fields. `jsonBody()` produces the
/// full-state POST the server expects (real booleans; absent = cleared is
/// avoided by always sending everything).
public struct RegistrationFormState {
    public var name = ""
    public var birthdate = ""          // "YYYY-MM-DD" or ""
    public var gender = "male"
    public var team = "Midwest Racing"
    public var sponsor = ""
    public var email = ""
    public var helmetNumber = ""       // blank = auto (add) / keep (edit)
    public var paid = false
    public var checkedIn = false
    public var challengeUp = false
    public var novice = false
    public var elite = false
    public var open = false
    public var quad = false
    public var timeTrials = false
    public var additional = false
    public var additionalGroupId = ""
    public var relayEventIds: Set<String> = []
    public var quadRelayEventIds: Set<String> = []
    // Legacy plain relay flags — only used when the meet has no templates.
    public var relay2Person = false
    public var relay3Person = false
    public var relay4Person = false
    public var quadRelay2Person = false
    public var quadRelay3Person = false

    /// Blank add-form defaults (the website pre-checks Elite).
    public static func blank() -> RegistrationFormState {
        var form = RegistrationFormState()
        form.elite = true
        return form
    }

    public init() {}

    public init(from reg: ExportRegistration) {
        name = reg.name
        birthdate = reg.birthdate
        gender = reg.gender.isEmpty ? "male" : reg.gender
        team = reg.team.isEmpty ? "Midwest Racing" : reg.team
        sponsor = reg.sponsor
        email = reg.email
        helmetNumber = reg.helmetDisplay ?? ""
        paid = reg.paid
        checkedIn = reg.checkedIn
        challengeUp = reg.challengeUp
        novice = reg.options["novice"] ?? false
        elite = reg.options["elite"] ?? false
        open = reg.options["open"] ?? false
        quad = reg.options["quad"] ?? false
        timeTrials = reg.timeTrials
        additional = reg.options["additional"] ?? false
        additionalGroupId = reg.additionalGroupId
        relayEventIds = Set(reg.relayEventIds)
        quadRelayEventIds = Set(reg.quadRelayEventIds)
        relay2Person = reg.options["relay2Person"] ?? false
        relay3Person = reg.options["relay3Person"] ?? false
        relay4Person = reg.options["relay4Person"] ?? false
        quadRelay2Person = reg.options["quadRelay2Person"] ?? false
        quadRelay3Person = reg.options["quadRelay3Person"] ?? false
    }

    public func jsonBody() -> [String: Any] {
        var body: [String: Any] = [
            "name": name.trimmingCharacters(in: .whitespaces),
            "birthdate": birthdate,
            "gender": gender,
            "team": team,
            "sponsor": sponsor,
            "email": email,
            "paid": paid,
            "checkedIn": checkedIn,
            "challengeUp": challengeUp,
            "novice": novice,
            "elite": elite,
            "open": open,
            "quad": quad,
            "timeTrials": timeTrials,
            "additional": additional,
            "additionalGroupId": additionalGroupId,
            "relayEventIds": Array(relayEventIds),
            "quadRelayEventIds": Array(quadRelayEventIds),
            "relay2Person": relay2Person,
            "relay3Person": relay3Person,
            "relay4Person": relay4Person,
            "quadRelay2Person": quadRelay2Person,
            "quadRelay3Person": quadRelay3Person,
        ]
        if !helmetNumber.trimmingCharacters(in: .whitespaces).isEmpty {
            body["helmetNumber"] = helmetNumber.trimmingCharacters(in: .whitespaces)
        }
        return body
    }

    /// The website's live cost preview (services/pricingUi.js): base + each
    /// selected category beyond the first × additional fee, capped. Each
    /// selected relay id is its own category; the legacy flags fall back
    /// PER DISCIPLINE (inline flags count only when relayEventIds is empty,
    /// quad flags only when quadRelayEventIds is empty — the server treats
    /// them independently).
    public func costPreview(for meet: ExportMeet) -> (total: Double, uncapped: Double, categories: Int, capped: Bool) {
        var categories = 0
        for flag in [novice, elite, open, quad, timeTrials, additional] where flag { categories += 1 }
        if relayEventIds.isEmpty {
            for flag in [relay2Person, relay3Person, relay4Person] where flag { categories += 1 }
        } else {
            categories += relayEventIds.count
        }
        if quadRelayEventIds.isEmpty {
            for flag in [quadRelay2Person, quadRelay3Person] where flag { categories += 1 }
        } else {
            categories += quadRelayEventIds.count
        }
        let raw = meet.baseEntryFee + Double(max(0, categories - 1)) * meet.additionalRaceFee
        if meet.maxRegistrationFee > 0, raw > meet.maxRegistrationFee {
            return (meet.maxRegistrationFee, raw, categories, true)
        }
        return (raw, raw, categories, false)
    }
}
