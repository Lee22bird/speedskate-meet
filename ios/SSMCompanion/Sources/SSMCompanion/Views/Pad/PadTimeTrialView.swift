import SwiftUI

/// The dedicated Time Trial event screen (timeTrialRoutes.js) as a native
/// sheet: stat cards, current-skater time entry with Save / Save & Next,
/// Previous/Next skater, the ✓/▶/○ queue, three leaderboards, and Complete.
/// The server owns the queue, currentIndex, normalization (n.toFixed(2)),
/// and auto-advance; announcer-role viewers poll read-only every 10s like
/// the website's reload.
@MainActor
final class TimeTrialViewModel: ObservableObject {
    @Published private(set) var event: ExportTimeTrialEvent?
    @Published private(set) var isLoading = false
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?
    @Published var timeDraft = ""

    private let api = APIClient.shared
    private var meetID = ""
    private var eventID = ""

    func load(meetID: String, eventID: String) async {
        self.meetID = meetID
        self.eventID = eventID
        isLoading = true
        defer { isLoading = false }
        await refresh()
        seedDraft()
    }

    func refresh() async {
        guard !meetID.isEmpty else { return }
        do {
            let meet = try await api.desktopExport(meetID: meetID)
            event = meet.timeTrialEvents.first { $0.id == eventID } ?? meet.timeTrialEvents.first
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func seedDraft() {
        timeDraft = event?.currentParticipant?.time ?? ""
    }

    /// Client-side mirror of the server's timeNumber gate: finite and > 0
    /// (the /time endpoint's error redirect is never displayed by the
    /// website, so we must catch bad input before posting).
    func validatedTime() -> String? {
        let trimmed = timeDraft.trimmingCharacters(in: .whitespaces)
        guard let n = Double(trimmed), n.isFinite, n > 0 else { return nil }
        return String(format: "%.2f", n)
    }

    func saveTime() async {
        guard let current = event?.currentParticipant else { return }
        guard let time = validatedTime() else {
            errorMessage = "Enter a valid time, like 10.42."
            return
        }
        await run {
            try await self.api.ttSaveEventTime(meetID: self.meetID, eventID: self.eventID,
                                               registrationID: current.registrationId, time: time)
        }
        seedDraft()
    }

    func step(_ direction: Int) async {
        await run {
            try await self.api.ttStepEvent(meetID: self.meetID, eventID: self.eventID, direction: direction)
        }
        seedDraft()
    }

    func complete() async {
        await run {
            try await self.api.ttCompleteEvent(meetID: self.meetID, eventID: self.eventID)
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

struct PadTimeTrialView: View {
    let meetID: String
    let eventID: String
    /// Read-only announcer/referee viewers poll instead of editing.
    let canManage: Bool

    @StateObject private var model = TimeTrialViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var confirmComplete = false

    var body: some View {
        NavigationStack {
            Group {
                if let event = model.event {
                    screenBody(event)
                } else if model.isLoading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    PadPlaceholder(text: model.errorMessage ?? "No time trial event found.")
                }
            }
            .background(SSMTheme.pageBackground)
            .navigationTitle("Time Trial Event")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Back to Race Day") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await model.load(meetID: meetID, eventID: eventID) }
        .task {
            // Announcer-style liveness for read-only viewers (website: full
            // reload every 10s).
            guard !canManage else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                guard !Task.isCancelled else { break }
                await model.refresh()
            }
        }
        .alert("Couldn't update",
               isPresented: Binding(get: { model.errorMessage != nil },
                                    set: { if !$0 { model.errorMessage = nil } }),
               presenting: model.errorMessage) { _ in
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: { message in
            Text(message)
        }
        .confirmationDialog("Complete this time trial?", isPresented: $confirmComplete, titleVisibility: .visible) {
            Button("Complete Time Trial Event", role: .destructive) {
                Task {
                    await model.complete()
                    dismiss()
                }
            }
        } message: {
            let missing = model.event?.remainingCount ?? 0
            Text(missing > 0
                 ? "Some skaters do not have recorded times. Complete Time Trials anyway?"
                 : "Complete this Time Trial Event and advance Race Day?")
        }
    }

    private func screenBody(_ event: ExportTimeTrialEvent) -> some View {
        GeometryReader { proxy in
            ScrollView {
                if proxy.size.width >= 900 {
                    HStack(alignment: .top, spacing: 20) {
                        VStack(spacing: 16) {
                            statBand(event)
                            if canManage { currentSkaterCard(event) }
                            leaderboards(event)
                        }
                        .frame(maxWidth: .infinity)
                        VStack(spacing: 16) { queueCard(event) }
                            .frame(width: 330)
                    }
                    .padding(24)
                } else {
                    VStack(spacing: 16) {
                        statBand(event)
                        if canManage { currentSkaterCard(event) }
                        queueCard(event)
                        leaderboards(event)
                    }
                    .padding(20)
                }
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private func statBand(_ event: ExportTimeTrialEvent) -> some View {
        HStack(spacing: 12) {
            statTile("DISTANCE", value: event.distance.isEmpty ? "100m" : event.distance, accent: SSMTheme.sky)
            statTile("COMPLETED", value: "\(event.completedCount)", accent: SSMTheme.good)
            statTile("REMAINING", value: "\(event.remainingCount)", accent: SSMTheme.orange)
            if canManage {
                Spacer()
                Button {
                    confirmComplete = true
                } label: {
                    Label(event.isComplete ? "Completed" : "Complete Event", systemImage: "flag.checkered")
                }
                .buttonStyle(.ssmPill(SSMTheme.goodGradient))
                .disabled(model.isWorking || event.isComplete)
            }
        }
    }

    private func statTile(_ label: String, value: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(accent)
            Text(value)
                .font(.ssmRounded(24, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
        }
        .padding(14)
        .frame(minWidth: 110, alignment: .leading)
        .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func currentSkaterCard(_ event: ExportTimeTrialEvent) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("CURRENT SKATER")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                if let current = event.currentParticipant {
                    HStack(spacing: 10) {
                        if !current.helmetNumber.isEmpty {
                            Text("#\(current.helmetNumber)")
                                .font(.ssmRounded(22, weight: .heavy))
                                .foregroundStyle(SSMTheme.sky)
                        }
                        Text(current.skater)
                            .font(.ssmRounded(32, weight: .heavy))
                            .foregroundStyle(SSMTheme.textPrimary)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                    }
                    Text("\(current.ageGroup.isEmpty ? "—" : current.ageGroup) • Age \(current.age.map(String.init) ?? "—") • \(current.team.isEmpty ? "Independent" : current.team)")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)

                    HStack(spacing: 10) {
                        Text("TIME")
                            .font(.ssmRounded(11, weight: .heavy))
                            .foregroundStyle(SSMTheme.muted)
                        TextField("10.42", text: $model.timeDraft)
                            .ssmDecimalPad()
                            .multilineTextAlignment(.center)
                            .font(.ssmRounded(24, weight: .heavy))
                            .foregroundStyle(SSMTheme.textPrimary)
                            .padding(.vertical, 10)
                            .frame(width: 150)
                            .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        Button("Save & Next") {
                            Task { await model.saveTime() }
                        }
                        .buttonStyle(.ssmPill)
                        .disabled(model.isWorking || model.validatedTime() == nil)
                    }

                    HStack(spacing: 10) {
                        Button {
                            Task { await model.step(-1) }
                        } label: {
                            Label("Previous Skater", systemImage: "chevron.left")
                        }
                        .buttonStyle(.ssmSoftPill)
                        Button {
                            Task { await model.step(1) }
                        } label: {
                            Label("Next Skater", systemImage: "chevron.right")
                        }
                        .buttonStyle(.ssmSoftPill)
                    }
                    .disabled(model.isWorking)
                } else {
                    Text("No participants yet.")
                        .font(.ssmRounded(15, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
        }
    }

    private func queueCard(_ event: ExportTimeTrialEvent) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("QUEUE — YOUNGEST TO OLDEST")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                if event.participants.isEmpty {
                    Text("No registered skaters.")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                ForEach(Array(event.participants.enumerated()), id: \.element.id) { index, row in
                    HStack(spacing: 8) {
                        Text(row.hasTime ? "✓" : (index == event.currentIndex ? "▶" : "○"))
                            .font(.ssmRounded(14, weight: .heavy))
                            .foregroundStyle(row.hasTime ? SSMTheme.good : (index == event.currentIndex ? SSMTheme.orange : SSMTheme.muted))
                            .frame(width: 20)
                        Text(row.skater)
                            .font(.ssmRounded(13, weight: index == event.currentIndex ? .heavy : .semibold))
                            .foregroundStyle(SSMTheme.textPrimary)
                            .lineLimit(1)
                        Spacer()
                        if row.hasTime {
                            Text(row.time)
                                .font(.ssmRounded(12, weight: .bold))
                                .foregroundStyle(SSMTheme.muted)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func leaderboards(_ event: ExportTimeTrialEvent) -> some View {
        let columns = [("FASTEST MALE", "male"), ("FASTEST FEMALE", "female"), ("OVERALL", nil as String?)]
        return SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("LEADERBOARDS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 18) {
                        ForEach(columns, id: \.0) { column in
                            leaderboardColumn(title: column.0, rows: event.leaderboard(bucket: column.1))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(columns, id: \.0) { column in
                            leaderboardColumn(title: column.0, rows: event.leaderboard(bucket: column.1))
                        }
                    }
                }
            }
        }
    }

    private func leaderboardColumn(title: String, rows: [ExportTTParticipant]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(SSMTheme.sky)
            if rows.isEmpty {
                Text("No times yet.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                HStack(spacing: 8) {
                    Text("\(index + 1)")
                        .font(.ssmRounded(13, weight: .heavy))
                        .foregroundStyle(index == 0 ? SSMTheme.orange : SSMTheme.muted)
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(row.skater)
                            .font(.ssmRounded(13, weight: .bold))
                            .foregroundStyle(SSMTheme.textPrimary)
                            .lineLimit(1)
                        if !row.team.isEmpty {
                            Text(row.team)
                                .font(.ssmRounded(10, weight: .medium))
                                .foregroundStyle(SSMTheme.muted)
                                .lineLimit(1)
                        }
                    }
                    Spacer()
                    Text(row.time)
                        .font(.ssmRounded(13, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                }
            }
        }
    }
}
