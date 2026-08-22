import SwiftUI
#if os(iOS)
import UIKit
#endif

/// Director "Meet Actions": re-randomize a race's lanes, finalize/reopen the
/// meet, and fetch/share the score-sheets PDF — the website's director-tools
/// and results-toolbar actions, one sheet. All server-side behavior is the
/// existing endpoints'; finalize is purely a status flag (the website keeps
/// race-day controls working on complete meets, and so do we).
@MainActor
final class MeetActionsViewModel: ObservableObject {
    @Published private(set) var meet: ExportMeet?
    @Published private(set) var isLoading = false
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?
    @Published var statusFlash: String?
    @Published var pdfFileURL: URL?

    private let api = APIClient.shared
    private var meetID = ""

    func load(meetID: String) async {
        self.meetID = meetID
        isLoading = true
        defer { isLoading = false }
        await refresh()
    }

    func refresh() async {
        do {
            meet = try await api.desktopExport(meetID: meetID)
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Races eligible for a lane re-draw — the website's filter: everything
    /// except time trials and relays (open AND closed races both allowed).
    var randomizableRaces: [ExportRace] {
        guard let meet else { return [] }
        var seen = Set<String>()
        let ordered = meet.blocks.flatMap(\.raceIds) + meet.races.map(\.id)
        let byID = Dictionary(meet.races.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return ordered.compactMap { id in
            guard seen.insert(id).inserted, let race = byID[id] else { return nil }
            guard !race.isTimeTrial, !race.isRelayRace else { return nil }
            return race
        }
    }

    func reRandomize(raceID: String) async {
        await run {
            try await self.api.reRandomizeLanes(meetID: self.meetID, raceID: raceID)
            self.statusFlash = "Lanes re-randomized."
        }
    }

    func finalize() async {
        await run {
            try await self.api.finalizeMeet(meetID: self.meetID)
            self.statusFlash = "Meet finalized."
        }
    }

    func reopen() async {
        await run {
            try await self.api.reopenMeet(meetID: self.meetID)
            self.statusFlash = "Meet reopened."
        }
    }

    func clone() async {
        await run {
            let newID = try await self.api.cloneMeet(meetID: self.meetID)
            self.statusFlash = newID != nil
                ? "Draft clone created — it's in your meet list."
                : "Draft clone created."
        }
    }

    func archive() async {
        await run {
            try await self.api.archiveMeet(meetID: self.meetID)
            self.statusFlash = "Meet archived."
        }
    }

    func unarchive() async {
        await run {
            let status = try await self.api.unarchiveMeet(meetID: self.meetID)
            self.statusFlash = "Meet unarchived — back to \(status)."
        }
    }

    func sendResultsToSSL() async {
        await run {
            let message = try await self.api.sendResultsToSSL(meetID: self.meetID)
            self.statusFlash = message
        }
    }

    /// Fetch a score-sheets PDF and stage it as a shareable temp file.
    func fetchScoreSheets(scope: String, raceID: String? = nil, blockID: String? = nil) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let data = try await api.fetchScoreSheetsPDF(meetID: meetID, scope: scope,
                                                         raceID: raceID, blockID: blockID)
            let name = (meet?.meetName ?? "meet").lowercased()
                .replacingOccurrences(of: " ", with: "-")
                .filter { $0.isLetter || $0.isNumber || $0 == "-" }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(name.isEmpty ? "meet" : name)-score-sheets.pdf")
            try data.write(to: url, options: .atomic)
            pdfFileURL = url
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
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
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            await refresh()
            errorMessage = message
        }
    }
}

struct MeetActionsSheet: View {
    let meetID: String

    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var model = MeetActionsViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var randomizeRaceID: String?
    @State private var confirmRandomize = false
    @State private var confirmFinalize = false
    @State private var confirmClone = false
    @State private var confirmArchive = false
    @State private var confirmSendSSL = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let flash = model.statusFlash {
                        Text("✅ \(flash)")
                            .font(.ssmRounded(14, weight: .bold))
                            .foregroundStyle(SSMTheme.good)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(SSMTheme.good.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    statusCard
                    lifecycleCard
                    randomizeCard
                    sslCard
                    printCard

                    if let message = model.errorMessage {
                        Text(message)
                            .font(.ssmRounded(13, weight: .bold))
                            .foregroundStyle(SSMTheme.danger)
                    }
                }
                .padding(24)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .background(SSMTheme.pageBackground)
            .navigationTitle("Meet Actions")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await model.load(meetID: meetID) }
        .confirmationDialog("Re-randomize lanes?",
                            isPresented: $confirmRandomize, titleVisibility: .visible,
                            presenting: randomizeRaceID) { raceID in
            Button("Re-Randomize Lanes", role: .destructive) {
                Task { await model.reRandomize(raceID: raceID) }
            }
        } message: { _ in
            Text("Re-randomize lanes for this race? This only changes lane numbers — heats, order, and blocks stay the same.")
        }
        .confirmationDialog("Finalize this meet?", isPresented: $confirmFinalize, titleVisibility: .visible) {
            Button("Finalize Meet") {
                Task { await model.finalize() }
            }
        } message: {
            Text("Marks the meet complete on the public site and swaps the Results toolbar. Race-day controls keep working, and you can reopen any time.")
        }
        .confirmationDialog("Clone this meet's setup?", isPresented: $confirmClone, titleVisibility: .visible) {
            Button("Create Draft Clone") { Task { await model.clone() } }
        } message: {
            Text("Creates a new draft meet copying divisions, distances, pricing, and block names — not registrations, results, or check-ins.")
        }
        .confirmationDialog("Archive this meet?", isPresented: $confirmArchive, titleVisibility: .visible) {
            Button("Archive Meet", role: .destructive) { Task { await model.archive() } }
        } message: {
            Text("Moves the meet to your archived list. You can unarchive it later from the website.")
        }
        .sheet(isPresented: Binding(get: { model.pdfFileURL != nil },
                                    set: { if !$0 { model.pdfFileURL = nil } })) {
            if let url = model.pdfFileURL {
                PDFShareView(url: url)
            }
        }
    }

    private var statusCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("MEET STATUS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                HStack(spacing: 10) {
                    let status = model.meet?.status ?? "…"
                    SSMChip(status.capitalized,
                            color: status == "complete" ? SSMTheme.good : (status == "live" ? SSMTheme.orange : SSMTheme.sky))
                    Spacer()
                    switch model.meet?.status {
                    case "complete":
                        Button("Reopen Meet") {
                            Task { await model.reopen() }
                        }
                        .buttonStyle(.ssmSoftPill)
                    case "archived":
                        Button("Unarchive Meet") {
                            Task { await model.unarchive() }
                        }
                        .buttonStyle(.ssmSoftPill)
                    default:
                        Button("Finalize Meet") { confirmFinalize = true }
                            .buttonStyle(.ssmPill)
                    }
                }
                Text("Finalize marks results official; Reopen sets the meet live again.")
                    .font(.ssmRounded(11, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
            .disabled(model.isWorking)
        }
    }

    private var lifecycleCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("🗂 MEET LIFECYCLE")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Text("Clone copies this meet's setup into a new draft (no registrations or results). Archive tidies a finished meet away.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                HStack(spacing: 10) {
                    Button { confirmClone = true } label: {
                        Label("Clone Setup", systemImage: "doc.on.doc").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ssmSoftPill)
                    if model.meet?.status == "complete" {
                        Button { confirmArchive = true } label: {
                            Label("Archive", systemImage: "archivebox").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.ssmSoftPill)
                    }
                }
                .disabled(model.isWorking)
            }
        }
    }

    private var sslCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("🏅 SEND RESULTS TO SSL")
                    .font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                Text("Pushes this meet's official results to skaters' SpeedSkateLeague career profiles. Safe to send more than once.")
                    .font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
                Button { confirmSendSSL = true } label: {
                    Label("Send Results to SSL", systemImage: "arrow.up.circle")
                        .font(.ssmRounded(14, weight: .bold)).frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmSoftPill)
                .disabled(model.isWorking)
            }
        }
        .confirmationDialog("Send results to SSL?", isPresented: $confirmSendSSL, titleVisibility: .visible) {
            Button("Send Results") { Task { await model.sendResultsToSSL() } }
        } message: {
            Text("Sends official results from this meet to SSL career profiles. Needs an internet connection.")
        }
    }

    private var randomizeCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("🎲 RE-RANDOMIZE LANES")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Text("Shuffles one race's lane draw. Entries, heats, order, and blocks stay the same.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                Menu {
                    ForEach(model.randomizableRaces) { race in
                        Button("\(race.groupLabel) — \(race.distanceLabel) — \(race.stageLabel)") {
                            randomizeRaceID = race.id
                            confirmRandomize = true
                        }
                    }
                } label: {
                    Label("Pick a race…", systemImage: "dice")
                        .font(.ssmRounded(14, weight: .bold))
                }
                .buttonStyle(.ssmSoftPill)
                .disabled(model.isWorking || model.randomizableRaces.isEmpty)
            }
        }
    }

    private var printCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("🖨 SCORE SHEETS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Text("Fetches the printable PDF (one sheet per race) — share to AirPrint, Files, or email.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                Button {
                    Task { await model.fetchScoreSheets(scope: "meet") }
                } label: {
                    Label(model.isWorking ? "Fetching…" : "Whole-Meet Score Sheets PDF",
                          systemImage: "printer")
                }
                .buttonStyle(.ssmPill)
                .disabled(model.isWorking)
            }
        }
    }
}

/// Share sheet for a fetched PDF.
struct PDFShareView: View {
    let url: URL

    var body: some View {
        #if os(iOS)
        ActivityViewController(items: [url])
            .ignoresSafeArea()
        #else
        Text(url.lastPathComponent)
        #endif
    }
}

#if os(iOS)
private struct ActivityViewController: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
