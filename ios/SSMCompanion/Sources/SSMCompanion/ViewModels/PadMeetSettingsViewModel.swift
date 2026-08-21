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

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

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
        // Money/number fields: send only when non-empty and valid, so a blank box
        // never posts a stray value.
        addNumber(&fields, "baseEntryFee", baseEntryFee)
        addNumber(&fields, "additionalRaceFee", additionalRaceFee)
        addNumber(&fields, "maxRegistrationFee", maxRegistrationFee)
        addNumber(&fields, "protestFee", protestFee)
        addNumber(&fields, "protestDeadlineMinutes", protestDeadlineMinutes)
        do {
            let s = try await api.saveMeetSettings(meetID: meetID, fields: fields)
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

    private func addNumber(_ fields: inout [String: Any], _ key: String, _ raw: String) {
        let t = raw.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, let n = Double(t), n >= 0 else { return }
        fields[key] = n
    }
}
