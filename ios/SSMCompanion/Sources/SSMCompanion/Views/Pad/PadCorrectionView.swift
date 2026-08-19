import SwiftUI

/// Correction Mode (director only) — the app's version of the website's
/// correction flow: pick a closed race, fix its lanes, give a required
/// reason. Posts to the same correction/save endpoint; the server records
/// the audit entry and never rebuilds later races or moves the pointer.
struct PadCorrectionView: View {
    let meetID: String
    /// When launched from an upheld race-specific protest, jump straight to
    /// that race with the reason prefilled (mirrors the website's
    /// correction?raceId=…&reason=… deep link). Both default to nil for the
    /// normal director-launched flow.
    var initialRaceID: String? = nil
    var initialReason: String? = nil

    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var model = CorrectionViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if model.race == nil {
                    racePicker
                } else {
                    editor
                }
            }
            .background(SSMTheme.pageBackground)
            .navigationTitle("Correction Mode")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                if model.race != nil {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Pick Another Race") { model.race = nil }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await model.load(meetID: meetID, preselectRaceID: initialRaceID, initialReason: initialReason) }
    }

    // ── Closed race picker ───────────────────────────────────────────────

    private var racePicker: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Corrections only apply to closed races. Later races are never rebuilt, and every correction is logged with its reason.")
                    .font(.ssmRounded(13, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)

                if model.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if model.closedRaces.isEmpty {
                    ContentUnavailableFallback(text: "No closed races yet.")
                        .padding(.top, 40)
                } else {
                    ForEach(model.closedRaces) { race in
                        Button {
                            model.select(race: race)
                        } label: {
                            SSMCard {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("\(race.groupLabel) · \(race.distanceLabel)")
                                            .font(.ssmRounded(16, weight: .bold))
                                            .foregroundStyle(SSMTheme.textPrimary)
                                        Text(race.stageLabel)
                                            .font(.ssmRounded(12, weight: .semibold))
                                            .foregroundStyle(SSMTheme.muted)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(SSMTheme.muted)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
    }

    // ── Editor ───────────────────────────────────────────────────────────

    private var editor: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let race = model.race {
                    HStack(spacing: 8) {
                        SSMChip("CLOSED RACE", color: SSMTheme.danger)
                        Text("\(race.groupLabel) · \(race.distanceLabel) · \(race.stageLabel)")
                            .font(.ssmRounded(18, weight: .heavy))
                            .foregroundStyle(SSMTheme.textPrimary)
                    }

                    Text("You're editing saved results. This updates this race only.")
                        .font(.ssmRounded(13, weight: .bold))
                        .foregroundStyle(SSMTheme.orange)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SSMTheme.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                    SSMCard {
                        VStack(spacing: 0) {
                            ForEach($model.lanes) { $lane in
                                LaneEntryRow(lane: $lane,
                                             onEdit: {},
                                             onStatusPick: { model.setStatus($0, forLane: lane.lane) },
                                             onDQEdit: {})
                                if lane.lane != model.lanes.last?.lane {
                                    Divider().overlay(SSMTheme.cardBorder)
                                }
                            }
                        }
                    }

                    SSMCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("CORRECTION REASON (REQUIRED)")
                                .font(.ssmRounded(12, weight: .heavy))
                                .foregroundStyle(SSMTheme.muted)
                            TextField("Why is this result being corrected?", text: $model.reason, axis: .vertical)
                                .lineLimit(2...4)
                                .font(.ssmRounded(14, weight: .medium))
                                .foregroundStyle(SSMTheme.textPrimary)
                        }
                    }

                    if let message = model.errorMessage {
                        Text(message)
                            .font(.ssmRounded(13, weight: .semibold))
                            .foregroundStyle(SSMTheme.danger)
                    }
                    if model.savedOK {
                        Text("✓ Correction saved and logged.")
                            .font(.ssmRounded(14, weight: .bold))
                            .foregroundStyle(SSMTheme.good)
                    }

                    Button {
                        Task {
                            if await model.save(meetID: meetID) {
                                await session.refreshState()
                            }
                        }
                    } label: {
                        Label("Save Correction", systemImage: "checkmark.seal")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ssmPill)
                    .disabled(model.isSaving || model.reason.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(24)
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }
}

@MainActor
final class CorrectionViewModel: ObservableObject {
    @Published var closedRaces: [ExportRace] = []
    @Published var race: ExportRace?
    @Published var lanes: [LaneEdit] = []
    @Published var reason = ""
    @Published var isLoading = false
    @Published var isSaving = false
    @Published var savedOK = false
    @Published var errorMessage: String?

    private let api = APIClient.shared
    private var resultsMode = "places"
    private var notes = ""

    func load(meetID: String, preselectRaceID: String? = nil, initialReason: String? = nil) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let meet = try await api.desktopExport(meetID: meetID)
            closedRaces = meet.closedRaces()
            errorMessage = nil
            // Deep-linked from an upheld protest: jump straight to the race
            // and prefill the reason. If the race isn't a closed race (can't
            // be corrected), fall back to the normal picker.
            if let preselectRaceID,
               let match = closedRaces.first(where: { $0.id == preselectRaceID }) {
                select(race: match)
                if let initialReason, !initialReason.isEmpty { reason = initialReason }
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func select(race: ExportRace) {
        self.race = race
        lanes = race.laneEntries.map(LaneEdit.init)
        resultsMode = race.resultsMode
        notes = race.notes
        reason = ""
        savedOK = false
        errorMessage = nil
    }

    func setStatus(_ status: String, forLane lane: Int) {
        guard let idx = lanes.firstIndex(where: { $0.lane == lane }) else { return }
        lanes[idx].status = status
        if status.hasPrefix("DQ_"), lanes[idx].dqTimestamp.isEmpty {
            lanes[idx].dqTimestamp = ISO8601DateFormatter().string(from: Date())
        }
    }

    func save(meetID: String) async -> Bool {
        guard let race else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            try await api.saveCorrection(meetID: meetID,
                                         raceID: race.id,
                                         reason: reason,
                                         resultsMode: resultsMode,
                                         notes: notes,
                                         lanes: lanes.map { $0.submission() })
            savedOK = true
            errorMessage = nil
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }
}
