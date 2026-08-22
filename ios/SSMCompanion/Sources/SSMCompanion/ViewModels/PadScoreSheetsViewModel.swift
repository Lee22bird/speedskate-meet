import Foundation

/// Drives the iPad Score Sheets board: choose a scope + layout and fetch the
/// printable score-sheets PDF (the website's exact `/score-sheets/print` output,
/// display-only — it never reads or writes places). The PDF is staged as a temp
/// file and shared to AirPrint / Files / email via the system share sheet.
@MainActor
public final class PadScoreSheetsViewModel: ObservableObject {
    public enum Scope: String, CaseIterable, Identifiable {
        case meet, currentRace, pickRace
        public var id: String { rawValue }
        var title: String {
            switch self {
            case .meet: return "Whole meet"
            case .currentRace: return "Current race"
            case .pickRace: return "Pick a race"
            }
        }
    }

    @Published public var scope: Scope = .meet
    @Published public var layout: String = "compact"  // "compact" | "standard"
    @Published public var pickedRaceID: String?
    @Published public private(set) var isWorking = false
    @Published public var errorMessage: String?
    @Published public var pdfURL: URL?

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    /// Fetch one of the other printable reports (race list, block schedule,
    /// final results, DQ report) and stage it for the share sheet.
    public func fetchReport(meetID: String, meetName: String, report: APIClient.PrintReport) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let data = try await api.fetchReportPDF(meetID: meetID, report: report)
            let safe = meetName.lowercased()
                .replacingOccurrences(of: " ", with: "-")
                .filter { $0.isLetter || $0.isNumber || $0 == "-" }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(safe.isEmpty ? "meet" : safe)-\(report.filename)")
            try data.write(to: url, options: .atomic)
            pdfURL = url
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Resolve the chosen scope to the server's params and stage the PDF.
    public func generate(meetID: String, meetName: String, currentRaceID: String?) async {
        guard !isWorking else { return }
        var apiScope = "meet"
        var raceID: String?
        switch scope {
        case .meet:        apiScope = "meet"
        case .currentRace: apiScope = "race"; raceID = currentRaceID
        case .pickRace:    apiScope = "race"; raceID = pickedRaceID
        }
        if apiScope == "race", (raceID ?? "").isEmpty {
            errorMessage = scope == .currentRace ? "No race is current right now." : "Pick a race first."
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            let data = try await api.fetchScoreSheetsPDF(meetID: meetID, scope: apiScope,
                                                         raceID: raceID, layout: layout)
            let safe = meetName.lowercased()
                .replacingOccurrences(of: " ", with: "-")
                .filter { $0.isLetter || $0.isNumber || $0 == "-" }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(safe.isEmpty ? "meet" : safe)-score-sheets.pdf")
            try data.write(to: url, options: .atomic)
            pdfURL = url
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
