import SwiftUI
#if os(iOS)
import UIKit
#endif

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

    @State private var showTTEvent = false

    var body: some View {
        Group {
            if session.state?.current?.type == "time_trial" {
                timeTrialEventCard
            } else if let race = model.race, race.isTimeTrial {
                ttSessionBody(race)
            } else if let race = model.race {
                boardBody(race)
            } else if model.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                PadPlaceholder(text: model.errorMessage ?? "No race is on the track.")
            }
        }
        .sheet(isPresented: $showTTEvent) {
            if let eventID = session.state?.current?.id.stringValue {
                PadTimeTrialView(meetID: meetID, eventID: eventID,
                                 canManage: session.role == .director || session.role == .tabulator)
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

    /// The current ordered item is a standalone TT EVENT — the dedicated
    /// screen owns time entry, queue, and leaderboards (website parity).
    private var timeTrialEventCard: some View {
        VStack(spacing: 14) {
            Image(systemName: "stopwatch")
                .font(.system(size: 44))
                .foregroundStyle(SSMTheme.sky)
            Text("Time Trial Event")
                .font(.ssmRounded(22, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
            Text("This standalone event uses the dedicated Time Trial screen for time entry, queue, and leaderboards.")
                .font(.ssmRounded(14, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
            Button {
                showTTEvent = true
            } label: {
                Label("Open Time Trial Event", systemImage: "stopwatch")
            }
            .buttonStyle(.ssmPill)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // ── In-race-day TT session (the isTimeTrial RACE) ────────────────────

    @State private var ttSelectedRegID: String?
    @State private var ttTimeDraft = ""
    @State private var confirmCloseTT = false
    @State private var ttRemoveTarget: LaneEdit?

    private func ttSessionBody(_ race: ExportRace) -> some View {
        // The next-up skater is simply the head of the waiting queue.
        let waiting = model.ttWaiting
        let posted = model.ttPosted
        let selected = waiting.first { $0.registrationId == ttSelectedRegID } ?? waiting.first

        return GeometryReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if model.pointerMovedAway { pointerBanner }

                    SSMCard {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("⏱ TIME TRIAL SESSION — \(race.distanceLabel.isEmpty ? "100m" : race.distanceLabel)")
                                    .font(.ssmRounded(16, weight: .heavy))
                                    .foregroundStyle(SSMTheme.textPrimary)
                                Text("One rolling queue. Tap the next skater, enter the time, Save Time. Saved skaters leave the waiting list.")
                                    .font(.ssmRounded(12, weight: .medium))
                                    .foregroundStyle(SSMTheme.muted)
                            }
                            Spacer()
                            Button("Close Time Trial") { confirmCloseTT = true }
                                .buttonStyle(.ssmPill)
                                .disabled(model.isSaving || race.isClosed)
                        }
                    }

                    let columns = proxy.size.width >= 900
                    if columns {
                        HStack(alignment: .top, spacing: 16) {
                            ttWaitingCard(waiting: waiting, selected: selected)
                                .frame(maxWidth: .infinity)
                            VStack(spacing: 16) {
                                ttEntryCard(selected: selected)
                                ttPostedCard(posted: posted)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    } else {
                        ttEntryCard(selected: selected)
                        ttWaitingCard(waiting: waiting, selected: selected)
                        ttPostedCard(posted: posted)
                    }
                }
                .padding(20)
                .frame(maxWidth: 1100)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
        .confirmationDialog("Close this Time Trial Session and advance to the next race?",
                            isPresented: $confirmCloseTT, titleVisibility: .visible) {
            Button("Close Time Trial", role: .destructive) {
                Task {
                    if await model.save(meetID: meetID, close: true) {
                        await session.refreshState()
                    }
                }
            }
        }
        .confirmationDialog("Remove this posted time?",
                            isPresented: Binding(get: { ttRemoveTarget != nil },
                                                 set: { if !$0 { ttRemoveTarget = nil } }),
                            titleVisibility: .visible,
                            presenting: ttRemoveTarget) { target in
            Button("Remove", role: .destructive) {
                if let regID = target.registrationId {
                    Task { await model.removeTTTime(meetID: meetID, registrationID: regID) }
                }
            }
        }
    }

    private func ttWaitingCard(waiting: [LaneEdit], selected: LaneEdit?) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("WAITING QUEUE")
                        .font(.ssmRounded(12, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    Spacer()
                    Text("Youngest to oldest • \(waiting.count) remaining")
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                if waiting.isEmpty {
                    Text("All time trial skaters have posted times.")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.good)
                        .padding(.vertical, 8)
                }
                ForEach(Array(waiting.enumerated()), id: \.element.lane) { index, row in
                    let isSelected = row.registrationId == selected?.registrationId
                    Button {
                        ttSelectedRegID = row.registrationId
                        ttTimeDraft = ""
                    } label: {
                        HStack(spacing: 10) {
                            Text("\(index + 1)")
                                .font(.ssmRounded(13, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 26, height: 26)
                                .background(Circle().fill(isSelected ? SSMTheme.orange : SSMTheme.navy3))
                            VStack(alignment: .leading, spacing: 1) {
                                Text("#\(row.helmetNumber ?? "—") — \(row.skaterName)")
                                    .font(.ssmRounded(14, weight: .bold))
                                    .foregroundStyle(SSMTheme.textPrimary)
                                Text(row.team)
                                    .font(.ssmRounded(11, weight: .medium))
                                    .foregroundStyle(SSMTheme.muted)
                            }
                            Spacer()
                        }
                        .padding(8)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(isSelected ? SSMTheme.orange.opacity(0.12) : Color.clear)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func ttEntryCard(selected: LaneEdit?) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("SELECTED SKATER")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                if let selected {
                    Text("#\(selected.helmetNumber ?? "—") — \(selected.skaterName)")
                        .font(.ssmRounded(28, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(selected.team.isEmpty ? "Independent" : selected.team)
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                    HStack(spacing: 10) {
                        TextField("ex: 11.42", text: $ttTimeDraft)
                            .ssmDecimalPad()
                            .multilineTextAlignment(.center)
                            .font(.ssmRounded(24, weight: .heavy))
                            .foregroundStyle(SSMTheme.textPrimary)
                            .padding(.vertical, 10)
                            .frame(width: 150)
                            .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        Button("Save Time") {
                            Task {
                                if let regID = selected.registrationId,
                                   await model.postTTTime(meetID: meetID, registrationID: regID, rawTime: ttTimeDraft) {
                                    ttSelectedRegID = nil
                                    ttTimeDraft = ""
                                }
                            }
                        }
                        .buttonStyle(.ssmPill)
                        .disabled(model.isSaving || selected.registrationId == nil)
                    }
                } else {
                    Text("Select a skater from the waiting queue.")
                        .font(.ssmRounded(14, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
        }
    }

    private func ttPostedCard(posted: [LaneEdit]) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("POSTED TIMES")
                        .font(.ssmRounded(12, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    Spacer()
                    Text("\(posted.count) posted • sorted fastest first")
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                if posted.isEmpty {
                    Text("No times posted yet.")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                        .padding(.vertical, 6)
                }
                ForEach(Array(posted.enumerated()), id: \.element.lane) { index, row in
                    HStack(spacing: 10) {
                        Text("\(index + 1)")
                            .font(.ssmRounded(13, weight: .heavy))
                            .foregroundStyle(index == 0 ? SSMTheme.orange : SSMTheme.muted)
                            .frame(width: 22)
                        Text("#\(row.helmetNumber ?? "—")")
                            .font(.ssmRounded(12, weight: .bold))
                            .foregroundStyle(SSMTheme.sky)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(row.skaterName)
                                .font(.ssmRounded(13, weight: .bold))
                                .foregroundStyle(SSMTheme.textPrimary)
                            Text(row.team)
                                .font(.ssmRounded(10, weight: .medium))
                                .foregroundStyle(SSMTheme.muted)
                        }
                        Spacer()
                        Text(row.time)
                            .font(.ssmRounded(15, weight: .heavy))
                            .foregroundStyle(SSMTheme.textPrimary)
                        Button("Remove") { ttRemoveTarget = row }
                            .font(.ssmRounded(11, weight: .heavy))
                            .foregroundStyle(SSMTheme.danger)
                            .buttonStyle(.plain)
                            .disabled(model.isSaving)
                    }
                    .padding(.vertical, 3)
                }
            }
        }
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
                modeBar
                tapToPlaceCard
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

    // ── Mode toggle ──────────────────────────────────────────────────────

    private var modeBar: some View {
        SSMCard {
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
            }
        }
    }

    // ── Tap-to-place hero ────────────────────────────────────────────────
    // The finish-line workflow: tap each skater as they cross, big helmet
    // numbers front-and-centre; tapped skaters drop into a live finish-order
    // column. Undo, tap-to-unplace, and auto-place the last skater.

    private var tapToPlaceCard: some View {
        let placed = model.placedLanes
        let unplaced = model.unplacedLanes
        let total = model.placeableCount

        return SSMCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("TAP AS THEY FINISH")
                            .font(.ssmRounded(13, weight: .heavy))
                            .foregroundStyle(SSMTheme.orange)
                        Text("\(placed.count) of \(total) placed")
                            .font(.ssmRounded(12, weight: .semibold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                    Spacer()
                    Button {
                        SSMHaptics.tap()
                        model.undoLastFinish()
                    } label: {
                        Label("Undo", systemImage: "arrow.uturn.backward")
                            .font(.ssmRounded(13, weight: .bold))
                    }
                    .buttonStyle(.ssmSoftPill)
                    .disabled(placed.isEmpty)

                    Button("Clear") {
                        SSMHaptics.tap()
                        model.clearFinishOrder()
                    }
                    .font(.ssmRounded(13, weight: .bold))
                    .foregroundStyle(SSMTheme.danger)
                    .disabled(placed.isEmpty)
                }

                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 16) {
                        unplacedPad(unplaced).frame(maxWidth: .infinity, alignment: .topLeading)
                        finishOrderColumn(placed).frame(width: 320)
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        unplacedPad(unplaced)
                        finishOrderColumn(placed)
                    }
                }
            }
        }
    }

    /// The grid of big skater buttons still waiting to be placed.
    @ViewBuilder private func unplacedPad(_ unplaced: [LaneEdit]) -> some View {
        if unplaced.isEmpty {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(SSMTheme.good)
                Text("Everyone's placed — review the order, then Close Race.")
                    .font(.ssmRounded(14, weight: .bold))
                    .foregroundStyle(SSMTheme.good)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 20)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                let columns = [GridItem(.adaptive(minimum: 132), spacing: 10)]
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(unplaced) { lane in
                        FinishTapButton(lane: lane) {
                            SSMHaptics.tap()
                            withAnimation(.easeOut(duration: 0.18)) {
                                model.tapFinishOrder(lane: lane.lane)
                            }
                        }
                    }
                }
                if unplaced.count == 1, let last = unplaced.first {
                    Button {
                        SSMHaptics.tap()
                        withAnimation { model.placeRemaining() }
                    } label: {
                        Label("Place last skater — \(shortName(last.skaterName))", systemImage: "flag.checkered")
                            .font(.ssmRounded(13, weight: .bold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ssmSoftPill)
                    .padding(.top, 2)
                }
            }
        }
    }

    /// The live finish-order results column filling in 1..N.
    @ViewBuilder private func finishOrderColumn(_ placed: [LaneEdit]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("FINISH ORDER")
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)
            if placed.isEmpty {
                Text("Tap a skater as they cross the line.")
                    .font(.ssmRounded(13, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                    .padding(.vertical, 10)
            } else {
                ForEach(Array(placed.enumerated()), id: \.element.lane) { index, lane in
                    Button {
                        SSMHaptics.tap()
                        withAnimation(.easeOut(duration: 0.18)) { model.unplace(lane: lane.lane) }
                    } label: {
                        HStack(spacing: 10) {
                            PlaceBadge(place: index + 1)
                            VStack(alignment: .leading, spacing: 1) {
                                HStack(spacing: 6) {
                                    if let helmet = lane.helmetNumber, !helmet.isEmpty {
                                        Text("#\(helmet)")
                                            .font(.ssmRounded(12, weight: .heavy))
                                            .foregroundStyle(SSMTheme.sky)
                                    }
                                    Text(lane.skaterName)
                                        .font(.ssmRounded(14, weight: .bold))
                                        .foregroundStyle(SSMTheme.textPrimary)
                                        .lineLimit(1)
                                }
                                Text("Lane \(lane.lane)\(lane.team.isEmpty ? "" : " · \(lane.team)")")
                                    .font(.ssmRounded(10, weight: .medium))
                                    .foregroundStyle(SSMTheme.muted)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(SSMTheme.muted.opacity(0.6))
                        }
                        .padding(8)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func shortName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
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

/// A big finish-line button — helmet number front and centre (officials call
/// skaters by helmet), name below. Tapping drops them into the finish order.
struct FinishTapButton: View {
    let lane: LaneEdit
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(lane.helmetNumber.map { $0.isEmpty ? "L\(lane.lane)" : "#\($0)" } ?? "L\(lane.lane)")
                    .font(.ssmRounded(30, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(firstName(lane.skaterName))
                    .font(.ssmRounded(14, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(1)
                Text("Lane \(lane.lane)")
                    .font(.ssmRounded(10, weight: .semibold))
                    .foregroundStyle(SSMTheme.muted)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 96)
            .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(SSMTheme.cardBorder, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

/// A place badge — gold / silver / bronze for the podium, navy otherwise.
struct PlaceBadge: View {
    let place: Int

    private var color: Color {
        switch place {
        case 1: return Color(red: 0.98, green: 0.75, blue: 0.20)   // gold
        case 2: return Color(red: 0.75, green: 0.79, blue: 0.85)   // silver
        case 3: return Color(red: 0.80, green: 0.52, blue: 0.30)   // bronze
        default: return SSMTheme.navy3
        }
    }

    var body: some View {
        Text("\(place)")
            .font(.ssmRounded(16, weight: .heavy))
            .foregroundStyle(place <= 3 ? .black : .white)
            .frame(width: 34, height: 34)
            .background(Circle().fill(color))
    }
}

/// Light haptic feedback for finish-line taps.
enum SSMHaptics {
    static func tap() {
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
        #endif
    }
}

struct LaneEntryRow: View {
    @Binding var lane: LaneEdit
    let onEdit: () -> Void
    let onStatusPick: (String) -> Void
    let onDQEdit: () -> Void

    @Environment(\.horizontalSizeClass) private var hSizeClass

    var body: some View {
        // A STABLE layout choice — deliberately NOT ViewThatFits. ViewThatFits
        // re-measures both branches on every re-render; on iPad, the number pad
        // appearing while a place/time field is first responder makes it tear
        // down and rebuild the focused field mid-edit, which crashes the app
        // (the manual place-entry crash). A size-class branch only flips on
        // rotation/multitasking, so the focused field's identity stays put.
        // Wide: one row. Narrow (compact width): skater line on top, inputs
        // underneath — the name never gets crushed.
        Group {
            if hSizeClass == .compact {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        laneCircle
                        skaterBlock
                        Spacer()
                    }
                    inputsBlock
                }
            } else {
                HStack(spacing: 0) {
                    laneCircle.frame(width: 52, alignment: .leading)
                    skaterBlock.frame(maxWidth: .infinity, alignment: .leading)
                        .frame(minWidth: 200)
                    inputsBlock
                }
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
