import Foundation

/// Drives the iPad Meet Settings editor: identity, venue, registration window,
/// fees, racing basics (lanes/track — saving a change there rebuilds races,
/// behind a confirm), the division scheme, and the publish toggle. Saves are
/// partial updates; publish and the registration window are only sent when the
/// user actually changed them, so a stale screen can't clobber a newer value.
@MainActor
public final class PadMeetSettingsViewModel: ObservableObject {
    @Published public var meetName = ""
    @Published public var date = ""
    @Published public var endDate = ""
    @Published public var startTime = ""
    @Published public var registrationCloseDate = ""
    @Published public var registrationCloseTime = ""
    @Published public var rinkId = 0
    @Published public var customRinkName = ""
    @Published public private(set) var rinks: [Rink] = []
    @Published public var lanes = ""
    @Published public var trackLength = ""
    @Published public private(set) var divisionScheme = "standard"
    @Published public private(set) var isSwitchingScheme = false
    @Published public var published = false
    @Published public private(set) var status = "draft"
    @Published public var ttEventEnabled = false
    @Published public var ttDistance = ""
    @Published public var ttCountsForOverall = false
    @Published public var baseEntryFee = ""
    @Published public var additionalRaceFee = ""
    @Published public var maxRegistrationFee = ""
    @Published public var protestFee = ""
    @Published public var protestDeadlineMinutes = ""

    @Published public private(set) var isLoading = false
    @Published public private(set) var isSaving = false
    @Published public private(set) var loaded = false
    @Published public var errorMessage: String?
    @Published public var savedFlash = false
    @Published public var rebuildFlash = false

    private var originalLanes = 0
    private var originalTrack = 0
    private var originalPublished = false
    private var originalCloseDate = ""
    private var originalCloseTime = ""
    private var originalTTEnabled = false
    private var originalTTDistance = ""
    private var originalTTCounts = false
    @Published public var schemeFlash: String?

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    /// Lanes or track length differs from what loaded — saving will rebuild
    /// races. Uses the SAME parse the save payload uses, so the confirm dialog
    /// can never disagree with what actually gets sent.
    public var racingChanged: Bool {
        let l = parsedNumber(lanes).map { Int($0) } ?? originalLanes
        let t = parsedNumber(trackLength).map { Int($0.rounded()) } ?? originalTrack
        return l != originalLanes || t != originalTrack
    }

    /// Money as a clean string: whole dollars drop the decimals ("25", not "25.0").
    private func money(_ v: Double) -> String {
        if v.rounded() == v, let i = Int(exactly: v.rounded()) { return String(i) }
        return String(format: "%.2f", v)
    }

    public func load(meetID: String) async {
        isLoading = !loaded
        defer { isLoading = false }
        do {
            let s = try await api.meetSettings(meetID: meetID)
            meetName = s.meetName
            date = s.date
            endDate = s.endDate
            startTime = s.startTime
            registrationCloseDate = s.registrationCloseDate
            registrationCloseTime = s.registrationCloseTime
            rinkId = s.rinkId
            customRinkName = s.customRinkName
            lanes = String(s.lanes)
            trackLength = String(s.trackLength)
            divisionScheme = s.divisionScheme
            published = s.published
            status = s.status
            originalLanes = s.lanes
            originalTrack = s.trackLength
            originalPublished = s.published
            originalCloseDate = s.registrationCloseDate
            originalCloseTime = s.registrationCloseTime
            ttEventEnabled = s.ttEventEnabled
            ttDistance = s.ttDistance
            ttCountsForOverall = s.ttCountsForOverall
            originalTTEnabled = s.ttEventEnabled
            originalTTDistance = s.ttDistance
            originalTTCounts = s.ttCountsForOverall
            if rinks.isEmpty { rinks = (try? await api.rinks()) ?? [] }
            baseEntryFee = money(s.baseEntryFee)
            additionalRaceFee = money(s.additionalRaceFee)
            maxRegistrationFee = money(s.maxRegistrationFee)
            protestFee = money(s.protestFee)
            protestDeadlineMinutes = String(s.protestDeadlineMinutes)
            loaded = true
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public var canSave: Bool { !meetName.trimmingCharacters(in: .whitespaces).isEmpty }

    /// Switch the division scheme (standard | usars | mssl). This re-applies the
    /// scheme's full division template and rebuilds races, so the caller confirms
    /// first. Reloads afterward so the editor shows the new scheme.
    public func switchScheme(meetID: String, to scheme: String) async {
        guard !isSwitchingScheme, scheme != divisionScheme else { return }
        isSwitchingScheme = true
        defer { isSwitchingScheme = false }
        savedFlash = false
        rebuildFlash = false
        schemeFlash = nil
        do {
            try await api.setDivisionScheme(meetID: meetID, scheme: scheme)
            await load(meetID: meetID)
            errorMessage = nil
            schemeFlash = "Division scheme applied. Review the Divisions tab — races regenerate when divisions are saved."
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func save(meetID: String) async {
        guard !isSaving, canSave else { return }
        isSaving = true
        defer { isSaving = false }
        savedFlash = false
        // Send everything; the endpoint is a safe partial update either way.
        var fields: [String: Any] = [
            "meetName": meetName.trimmingCharacters(in: .whitespaces),
            "date": date.trimmingCharacters(in: .whitespaces),
            "endDate": endDate.trimmingCharacters(in: .whitespaces),
            "startTime": startTime.trimmingCharacters(in: .whitespaces),
        ]
        // Registration window: only send when the user changed it here, so a
        // stale screen can't clobber an edit made elsewhere. An emptied date
        // still clears the window.
        let closeDate = registrationCloseDate.trimmingCharacters(in: .whitespaces)
        let closeTime = registrationCloseTime.trimmingCharacters(in: .whitespaces)
        if closeDate != originalCloseDate || closeTime != originalCloseTime {
            fields["registrationCloseDate"] = closeDate
            fields["registrationCloseTime"] = closeTime
        }
        // Venue: send BOTH keys — the custom name is a display override that the
        // server checks first (meetRinkLabel), so picking a rink must clear it
        // and typing a name must not disturb the underlying rinkId.
        if rinkId > 0 { fields["rinkId"] = rinkId }
        fields["customRinkName"] = customRinkName.trimmingCharacters(in: .whitespaces)
        // Money/number fields: send only when non-empty and valid, so a blank box
        // never posts a stray value.
        addNumber(&fields, "baseEntryFee", baseEntryFee)
        addNumber(&fields, "additionalRaceFee", additionalRaceFee)
        addNumber(&fields, "maxRegistrationFee", maxRegistrationFee)
        addNumber(&fields, "protestFee", protestFee)
        addNumber(&fields, "protestDeadlineMinutes", protestDeadlineMinutes)
        addNumber(&fields, "lanes", lanes)
        addNumber(&fields, "trackLength", trackLength)
        // Publish: only when the user flipped it on this screen (dirty-tracked).
        if published != originalPublished { fields["published"] = published }
        // Time-trial config: also dirty-tracked, so a stale screen can't flip it.
        let ttDist = ttDistance.trimmingCharacters(in: .whitespaces)
        if ttEventEnabled != originalTTEnabled || ttDist != originalTTDistance || ttCountsForOverall != originalTTCounts {
            fields["ttEventEnabled"] = ttEventEnabled
            if !ttDist.isEmpty { fields["ttDistance"] = ttDist }
            fields["ttCountsForOverall"] = ttCountsForOverall
        }
        rebuildFlash = false
        schemeFlash = nil
        do {
            let r = try await api.saveMeetSettings(meetID: meetID, fields: fields)
            let s = r.settings
            registrationCloseDate = s.registrationCloseDate
            registrationCloseTime = s.registrationCloseTime
            rinkId = s.rinkId
            customRinkName = s.customRinkName
            lanes = String(s.lanes)
            trackLength = String(s.trackLength)
            divisionScheme = s.divisionScheme
            published = s.published
            status = s.status
            originalLanes = s.lanes
            originalTrack = s.trackLength
            originalPublished = s.published
            originalCloseDate = s.registrationCloseDate
            originalCloseTime = s.registrationCloseTime
            ttEventEnabled = s.ttEventEnabled
            ttDistance = s.ttDistance
            ttCountsForOverall = s.ttCountsForOverall
            originalTTEnabled = s.ttEventEnabled
            originalTTDistance = s.ttDistance
            originalTTCounts = s.ttCountsForOverall
            rebuildFlash = (r.racesRebuilt == true)
            baseEntryFee = money(s.baseEntryFee)
            additionalRaceFee = money(s.additionalRaceFee)
            maxRegistrationFee = money(s.maxRegistrationFee)
            protestFee = money(s.protestFee)
            protestDeadlineMinutes = String(s.protestDeadlineMinutes)
            meetName = s.meetName
            errorMessage = nil
            savedFlash = true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// The venue shown on the picker button. The CUSTOM NAME wins when set —
    /// that's the server's display rule (meetRinkLabel checks it first), and the
    /// website leaves a rinkId behind custom-venue meets, so rink-first here
    /// would show the wrong venue.
    public var currentRinkLabel: String {
        let c = customRinkName.trimmingCharacters(in: .whitespaces)
        if !c.isEmpty { return c }
        if rinkId > 0, let r = rinks.first(where: { $0.id == rinkId }) { return r.label }
        return "No venue set"
    }

    public func selectRink(_ r: Rink) { rinkId = r.id; customRinkName = "" }

    /// Comma-decimal tolerant numeric parse shared by the save payload and
    /// racingChanged, so the two can never disagree.
    private func parsedNumber(_ raw: String) -> Double? {
        let t = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !t.isEmpty, let n = Double(t), n.isFinite, n >= 0 else { return nil }
        return n
    }

    private func addNumber(_ fields: inout [String: Any], _ key: String, _ raw: String) {
        guard let n = parsedNumber(raw) else { return }
        fields[key] = n
    }
}
