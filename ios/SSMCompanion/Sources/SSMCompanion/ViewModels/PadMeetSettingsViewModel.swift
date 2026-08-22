import Foundation

/// Drives the iPad Meet Settings editor (phase 1): identity + fees. Loads the
/// current values from the additive settings endpoint and saves a partial
/// update — only the fields shown here, never touching lanes/divisions/etc. and
/// never regenerating races.
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

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    /// Lanes or track length differs from what loaded — saving will rebuild races.
    public var racingChanged: Bool {
        (Int(lanes.trimmingCharacters(in: .whitespaces)) ?? originalLanes) != originalLanes ||
        (Int(trackLength.trimmingCharacters(in: .whitespaces)) ?? originalTrack) != originalTrack
    }

    /// Money as a clean string: whole dollars drop the decimals ("25", not "25.0").
    private func money(_ v: Double) -> String {
        v.rounded() == v ? String(Int(v)) : String(format: "%.2f", v)
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
        do {
            try await api.setDivisionScheme(meetID: meetID, scheme: scheme)
            await load(meetID: meetID)
            errorMessage = nil
            savedFlash = true
            rebuildFlash = true   // a scheme switch always rebuilds races
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
            // Always send the close date so clearing it clears the window.
            "registrationCloseDate": registrationCloseDate.trimmingCharacters(in: .whitespaces),
            "registrationCloseTime": registrationCloseTime.trimmingCharacters(in: .whitespaces),
        ]
        // Venue: a picked rink wins; otherwise a free-text name.
        if rinkId > 0 {
            fields["rinkId"] = rinkId
        } else {
            fields["customRinkName"] = customRinkName.trimmingCharacters(in: .whitespaces)
        }
        // Money/number fields: send only when non-empty and valid, so a blank box
        // never posts a stray value.
        addNumber(&fields, "baseEntryFee", baseEntryFee)
        addNumber(&fields, "additionalRaceFee", additionalRaceFee)
        addNumber(&fields, "maxRegistrationFee", maxRegistrationFee)
        addNumber(&fields, "protestFee", protestFee)
        addNumber(&fields, "protestDeadlineMinutes", protestDeadlineMinutes)
        addNumber(&fields, "lanes", lanes)
        addNumber(&fields, "trackLength", trackLength)
        fields["published"] = published
        rebuildFlash = false
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

    /// The venue shown on the picker button — a chosen rink's label, else the
    /// custom name, else a placeholder.
    public var currentRinkLabel: String {
        if rinkId > 0, let r = rinks.first(where: { $0.id == rinkId }) { return r.label }
        let c = customRinkName.trimmingCharacters(in: .whitespaces)
        return c.isEmpty ? "No venue set" : c
    }

    public func selectRink(_ r: Rink) { rinkId = r.id; customRinkName = "" }

    private func addNumber(_ fields: inout [String: Any], _ key: String, _ raw: String) {
        let t = raw.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, let n = Double(t), n >= 0 else { return }
        fields[key] = n
    }
}
