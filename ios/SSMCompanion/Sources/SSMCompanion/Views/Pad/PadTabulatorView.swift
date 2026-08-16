import SwiftUI

/// iPad Tabulator board — mirrors the website's judges panel
/// (views/raceDayView.js renderJudgeBoard): finish-order tap tray, lane grid
/// with place/time/record/status, DQ details sheet, race notes, and
/// Save / Close & Advance posting to the same judges/save endpoint.
struct PadTabulatorView: View {
    let meetID: String

    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var model = TabulatorViewModel()
    @State private var dqEditLane: DQLaneSelection?
    @State private var confirmClose = false

    var body: some View {
        Group {
            if session.state?.current?.type == "time_trial" {
                timeTrialPlaceholder
            } else if let race = model.race {
                boardBody(race)
            } else if model.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                PadPlaceholder(text: model.errorMessage ?? "No race is on the track.")
            }
        }
        .background(SSMTheme.pageBackground)
        .task(id: session.state?.current?.id.stringValue) {
            await model.pointerChanged(to: session.state?.current?.id.stringValue, meetID: meetID)
            if model.race == nil {
                await model.loadCurrentRace(meetID: meetID,
                                            currentRaceID: session.state?.current?.id.stringValue)
                model.seedFinishOrderFromPlaces()
            }
        }
        .sheet(item: $dqEditLane) { selection in
            DQDetailsSheet(model: model, lane: selection.lane)
        }
        .confirmationDialog("Close race & advance?",
                            isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Close Race & Advance", role: .destructive) {
                Task {
                    if await model.save(meetID: meetID, close: true) {
                        await session.refreshState()
                    }
                }
            }
        } message: {
            Text("Results lock in, progression runs, and the meet moves to the next race.")
        }
    }

    private var timeTrialPlaceholder: some View {
        VStack(spacing: 12) {
            Image(systemName: "stopwatch")
                .font(.system(size: 44))
                .foregroundStyle(SSMTheme.sky)
            Text("Time Trial event on the track")
                .font(.ssmRounded(20, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
            Text("Time trials run on the website or desktop app for now — coming to iPad next.")
                .font(.ssmRounded(14, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // ── Board ────────────────────────────────────────────────────────────

    private func boardBody(_ race: ExportRace) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if model.pointerMovedAway {
                    pointerBanner
                }
                raceHeader(race)
                if race.mergeGroupId != nil {
                    mergedBanner
                }
                if race.isClosed {
                    closedBanner
                }
                modeAndTray
                laneGrid
                notesCard
                actionBar(race)
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    private var pointerBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(SSMTheme.orange)
            Text("The meet moved to a different race while you were editing.")
                .font(.ssmRounded(14, weight: .bold))
                .foregroundStyle(SSMTheme.textPrimary)
            Spacer()
            Button("Load Current Race") {
                Task {
                    model.pointerMovedAway = false
                    await model.loadCurrentRace(meetID: meetID,
                                                currentRaceID: session.state?.current?.id.stringValue)
                    model.seedFinishOrderFromPlaces()
                }
            }
            .buttonStyle(.ssmSoftPill)
        }
        .padding(14)
        .background(SSMTheme.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var mergedBanner: some View {
        Text("Merged pack — this division races with others, but enter places for THIS division only.")
            .font(.ssmRounded(13, weight: .bold))
            .foregroundStyle(SSMTheme.sky)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SSMTheme.sky.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var closedBanner: some View {
        Text("This race is closed. The director can unlock it, or use Correction Mode.")
            .font(.ssmRounded(13, weight: .bold))
            .foregroundStyle(SSMTheme.danger)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SSMTheme.danger.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func raceHeader(_ race: ExportRace) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    HStack(spacing: 6) {
                        Circle().fill(SSMTheme.good).frame(width: 9, height: 9)
                        Text("ON TRACK NOW")
                            .font(.ssmRounded(12, weight: .heavy))
                            .foregroundStyle(SSMTheme.good)
                    }
                    if race.isRelayRace { SSMChip("RELAY", color: SSMTheme.orange) }
                    if race.stage == "final" { SSMChip("FINAL", color: SSMTheme.orange) }
                    else if race.stage == "heat" || race.stage == "semi" { SSMChip("QUALIFYING", color: SSMTheme.sky) }
                    Spacer()
                    if let blockName = model.blockName {
                        Text(blockName)
                            .font(.ssmRounded(12, weight: .bold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                }
                Text("\(race.groupLabel) · \(race.distanceLabel)")
                    .font(.ssmRounded(30, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .minimumScaleFactor(0.5)
                HStack(spacing: 8) {
                    SSMChip(race.stageLabel, color: SSMTheme.sky)
                    if let division = race.division, !division.isEmpty {
                        SSMChip(division.capitalized, color: SSMTheme.muted)
                    }
                    if let startType = race.startType, !startType.isEmpty {
                        SSMChip(startType, color: SSMTheme.muted)
                    }
                }
            }
        }
    }

    // ── Mode toggle + finish-order tray ──────────────────────────────────

    private var modeAndTray: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    Picker("Results mode", selection: $model.resultsMode) {
                        Text("Places").tag("places")
                        Text("Times").tag("times")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 240)
                    .onChange(of: model.resultsMode) { _, _ in model.markDirty() }
                    Text(model.resultsMode == "places"
                         ? "Places are authoritative; time is optional."
                         : "Times drive the ranking.")
                        .font(.ssmRounded(12, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                    Spacer()
                    Button("Clear Order") { model.clearFinishOrder() }
                        .font(.ssmRounded(13, weight: .bold))
                        .foregroundStyle(SSMTheme.danger)
                }

                Text("TAP IN FINISH ORDER")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)

                let columns = [GridItem(.adaptive(minimum: 150), spacing: 10)]
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(model.lanes.filter(\.hasSkater)) { lane in
                        FinishOrderChip(
                            lane: lane,
                            orderIndex: model.finishOrder.firstIndex(of: lane.lane)
                        ) {
                            model.tapFinishOrder(lane: lane.lane)
                        }
                    }
                }
            }
        }
    }

    // ── Lane grid ────────────────────────────────────────────────────────

    private var laneGrid: some View {
        SSMCard {
            VStack(spacing: 0) {
                // Column headers only when the wide single-row layout fits.
                ViewThatFits(in: .horizontal) {
                    HStack {
                        Text("LANE").frame(width: 52, alignment: .leading)
                        Text("SKATER").frame(maxWidth: .infinity, alignment: .leading)
                            .frame(minWidth: 200)
                        Text("PLACE").frame(width: 76)
                        Text("TIME").frame(width: 110)
                        Text("🏅").frame(width: 44)
                        Text("STATUS").frame(width: 170, alignment: .leading)
                    }
                    .font(.ssmRounded(11, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                    .padding(.bottom, 8)

                    Color.clear.frame(height: 0)
                }

                ForEach($model.lanes) { $lane in
                    LaneEntryRow(lane: $lane,
                                 onEdit: { model.markDirty() },
                                 onStatusPick: { status in
                                     model.setStatus(status, forLane: lane.lane)
                                     if status.hasPrefix("DQ_") { dqEditLane = DQLaneSelection(lane: lane.lane) }
                                 },
                                 onDQEdit: { dqEditLane = DQLaneSelection(lane: lane.lane) })
                    if lane.lane != model.lanes.last?.lane {
                        Divider().overlay(SSMTheme.cardBorder)
                    }
                }
            }
        }
    }

    private var notesCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("RACE NOTES")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                TextField("Optional notes for this race…", text: $model.notes, axis: .vertical)
                    .lineLimit(2...4)
                    .font(.ssmRounded(14, weight: .medium))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .onChange(of: model.notes) { _, _ in model.markDirty() }
            }
        }
    }

    private func actionBar(_ race: ExportRace) -> some View {
        VStack(spacing: 10) {
            if let message = model.errorMessage {
                Text(message)
                    .font(.ssmRounded(13, weight: .semibold))
                    .foregroundStyle(SSMTheme.danger)
            }
            HStack(spacing: 14) {
                Button {
                    Task {
                        if await model.save(meetID: meetID, close: false) {
                            await session.refreshState()
                        }
                    }
                } label: {
                    Label(model.savedFlash ? "✓ Race Saved" : "Save",
                          systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmPill(SSMTheme.goodGradient))
                .disabled(model.isSaving || race.isClosed)

                Button {
                    confirmClose = true
                } label: {
                    Label("Close Race & Advance", systemImage: "flag.checkered")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmPill)
                .disabled(model.isSaving || race.isClosed)
            }
            .opacity(model.isSaving ? 0.6 : 1)
        }
        .task(id: model.savedFlash) {
            if model.savedFlash {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                model.savedFlash = false
            }
        }
    }
}

// ── Pieces ───────────────────────────────────────────────────────────────

struct FinishOrderChip: View {
    let lane: LaneEdit
    let orderIndex: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let orderIndex {
                    Text("\(orderIndex + 1)")
                        .font(.ssmRounded(15, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(SSMTheme.orange))
                } else if let helmet = lane.helmetNumber, !helmet.isEmpty {
                    Text("#\(helmet)")
                        .font(.ssmRounded(14, weight: .heavy))
                        .foregroundStyle(SSMTheme.sky)
                }
                Text(firstName(lane.skaterName))
                    .font(.ssmRounded(15, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(orderIndex != nil ? SSMTheme.good.opacity(0.18) : SSMTheme.cardBackgroundLight)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(orderIndex != nil ? SSMTheme.good : SSMTheme.cardBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

struct LaneEntryRow: View {
    @Binding var lane: LaneEdit
    let onEdit: () -> Void
    let onStatusPick: (String) -> Void
    let onDQEdit: () -> Void

    var body: some View {
        // Wide: one row. Narrow (sidebar pinned in portrait): skater line on
        // top, inputs underneath — the name never gets crushed.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) {
                laneCircle.frame(width: 52, alignment: .leading)
                skaterBlock.frame(maxWidth: .infinity, alignment: .leading)
                    .frame(minWidth: 200)
                inputsBlock
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 12) {
                    laneCircle
                    skaterBlock
                    Spacer()
                }
                inputsBlock
            }
        }
        .padding(.vertical, 7)
        .opacity(lane.hasSkater ? 1 : 0.5)
    }

    private var laneCircle: some View {
        Text("\(lane.lane)")
            .font(.ssmRounded(16, weight: .heavy))
            .foregroundStyle(.white)
            .frame(width: 32, height: 32)
            .background(Circle().fill(lane.hasSkater ? SSMTheme.orange : SSMTheme.muted.opacity(0.4)))
    }

    private var skaterBlock: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
                if let helmet = lane.helmetNumber, !helmet.isEmpty {
                    Text("#\(helmet)")
                        .font(.ssmRounded(13, weight: .heavy))
                        .foregroundStyle(SSMTheme.sky)
                }
                Text(lane.hasSkater ? lane.skaterName : "— empty lane —")
                    .font(.ssmRounded(15, weight: .bold))
                    .foregroundStyle(lane.hasSkater ? SSMTheme.textPrimary : SSMTheme.muted)
                    .lineLimit(1)
            }
            if !lane.team.isEmpty {
                Text(lane.team)
                    .font(.ssmRounded(11, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                    .lineLimit(1)
            }
        }
    }

    private var inputsBlock: some View {
        HStack(spacing: 6) {
            TextField("—", text: $lane.place)
                .multilineTextAlignment(.center)
                .ssmNumberPad()
                .font(.ssmRounded(16, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(.vertical, 8)
                .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .frame(width: 76)
                .onChange(of: lane.place) { _, _ in onEdit() }

            TextField("—", text: $lane.time)
                .multilineTextAlignment(.center)
                .ssmDecimalPad()
                .font(.ssmRounded(15, weight: .bold))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(.vertical, 8)
                .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .frame(width: 110)
                .onChange(of: lane.time) { _, _ in onEdit() }

            Toggle("", isOn: $lane.record)
                .labelsHidden()
                .toggleStyle(RecordToggleStyle())
                .frame(width: 44)
                .onChange(of: lane.record) { _, _ in onEdit() }

            HStack(spacing: 4) {
                Menu {
                    ForEach(LaneStatusOption.allCases) { option in
                        Button(option.label) { onStatusPick(option.rawValue) }
                    }
                } label: {
                    Text(statusLabel)
                        .font(.ssmRounded(12, weight: .bold))
                        .foregroundStyle(lane.status.isEmpty ? SSMTheme.muted : (lane.isDQ ? SSMTheme.danger : SSMTheme.orange))
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 9)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                if lane.isDQ {
                    Button(action: onDQEdit) {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(SSMTheme.danger)
                    }
                }
            }
            .frame(minWidth: 130, maxWidth: 170, alignment: .leading)
        }
    }

    private var statusLabel: String {
        LaneStatusOption(rawValue: lane.status)?.label ?? (lane.status.isEmpty ? "—" : lane.status)
    }
}

/// 🏅 record checkbox, matching the website's "Rec" column.
struct RecordToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            Text("🏅")
                .font(.system(size: 18))
                .opacity(configuration.isOn ? 1 : 0.25)
                .padding(6)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(configuration.isOn ? SSMTheme.orange.opacity(0.2) : Color.clear)
                )
        }
        .buttonStyle(.plain)
    }
}

/// DQ details sheet — the app's version of the website's DQ dialog:
/// category comes from the picked status; rule reference + officials-only
/// notes are optional; timestamp is captured automatically.
struct DQDetailsSheet: View {
    @ObservedObject var model: TabulatorViewModel
    let lane: Int
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Disqualification Details")
                .font(.ssmRounded(22, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(.top, 24)

            if let idx = model.lanes.firstIndex(where: { $0.lane == lane }) {
                let laneEdit = model.lanes[idx]
                HStack(spacing: 8) {
                    Text("Lane \(laneEdit.lane)")
                        .font(.ssmRounded(14, weight: .heavy))
                        .foregroundStyle(SSMTheme.orange)
                    Text(laneEdit.skaterName)
                        .font(.ssmRounded(14, weight: .bold))
                        .foregroundStyle(SSMTheme.textPrimary)
                    SSMChip(LaneStatusOption(rawValue: laneEdit.status)?.label ?? laneEdit.status,
                            color: SSMTheme.danger)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("RULE REFERENCE (OPTIONAL)")
                        .font(.ssmRounded(11, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    TextField("e.g. SR 7.3", text: $model.lanes[idx].dqRuleReference)
                        .padding(12)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .foregroundStyle(SSMTheme.textPrimary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("OFFICIALS-ONLY NOTES (OPTIONAL)")
                        .font(.ssmRounded(11, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    TextField("What happened…", text: $model.lanes[idx].dqOfficialNotes, axis: .vertical)
                        .lineLimit(3...5)
                        .padding(12)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .foregroundStyle(SSMTheme.textPrimary)
                }
            }

            Button {
                model.markDirty()
                dismiss()
            } label: {
                Text("Done").frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)

            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
        .preferredColorScheme(.dark)
    }
}

/// Wrapper so a lane number can drive `.sheet(item:)`.
struct DQLaneSelection: Identifiable {
    let lane: Int
    var id: Int { lane }
}
