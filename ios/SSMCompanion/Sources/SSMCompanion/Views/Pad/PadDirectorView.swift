import SwiftUI

/// iPad Director Command Center — mirrors the website's Director race-day
/// board (views/raceDayView.js renderDirectorBoard): current-race hero, lane
/// sheet, flow controls, progress, staging rail, jump-to-race, and the door
/// into Correction Mode. All mutations call the same four control endpoints
/// the website's buttons post to.
struct PadDirectorView: View {
    @EnvironmentObject private var session: PadSessionViewModel
    @State private var showCorrection = false
    @State private var showMeetActions = false
    @State private var showTTEvent = false

    var body: some View {
        Group {
            if let state = session.state {
                boardBody(state)
            } else if let message = session.errorMessage {
                PadPlaceholder(text: message)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SSMTheme.pageBackground)
        .sheet(isPresented: $showCorrection) {
            if let meetID = session.selectedMeetID {
                PadCorrectionView(meetID: meetID)
                    .environmentObject(session)
            }
        }
        .sheet(isPresented: $showMeetActions) {
            if let meetID = session.selectedMeetID {
                MeetActionsSheet(meetID: meetID)
                    .environmentObject(session)
            }
        }
        .sheet(isPresented: $showTTEvent) {
            if let meetID = session.selectedMeetID,
               let eventID = session.state?.current?.id.stringValue {
                PadTimeTrialView(meetID: meetID, eventID: eventID, canManage: true)
            }
        }
    }

    private func boardBody(_ state: RaceDayStateResponse) -> some View {
        GeometryReader { proxy in
            ScrollView {
                // Two columns when there's room; one column when the split
                // view leaves us narrow (portrait with the sidebar pinned).
                if proxy.size.width >= 760 {
                    HStack(alignment: .top, spacing: 20) {
                        VStack(spacing: 20) {
                            currentRaceHero(state)
                            controlsCard(state)
                            if let current = state.current, !current.lanes.isEmpty {
                                laneSheetCard(current)
                            }
                        }
                        .frame(maxWidth: .infinity)

                        VStack(spacing: 20) {
                            progressCard(state)
                            jumpCard(state)
                            stagingCard(state)
                            directorToolsCard
                        }
                        .frame(width: 340)
                    }
                    .padding(24)
                } else {
                    VStack(spacing: 20) {
                        currentRaceHero(state)
                        controlsCard(state)
                        progressCard(state)
                        jumpCard(state)
                        stagingCard(state)
                        if let current = state.current, !current.lanes.isEmpty {
                            laneSheetCard(current)
                        }
                        directorToolsCard
                    }
                    .padding(20)
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    // ── Current race hero ────────────────────────────────────────────────

    private func currentRaceHero(_ state: RaceDayStateResponse) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    HStack(spacing: 6) {
                        Circle().fill(state.paused ? SSMTheme.muted : SSMTheme.good)
                            .frame(width: 9, height: 9)
                        Text(state.paused ? "PAUSED" : "ON THE TRACK")
                            .font(.ssmRounded(12, weight: .heavy))
                            .foregroundStyle(state.paused ? SSMTheme.muted : SSMTheme.good)
                    }
                    Spacer()
                    if let current = state.current, let index = raceIndex(of: current, in: state) {
                        Text("Race \(index) of \(state.orderedRaces.count)")
                            .font(.ssmRounded(13, weight: .bold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                }

                if let current = state.current, current.type == "time_trial" {
                    Text(current.groupLabel)
                        .font(.ssmRounded(34, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .minimumScaleFactor(0.5)
                        .lineLimit(2)
                    HStack(spacing: 8) {
                        SSMChip("⏱ Time Trial", color: SSMTheme.sky)
                        SSMChip(current.distanceLabel.isEmpty ? "100m" : current.distanceLabel, color: SSMTheme.orange)
                    }
                    Text("Standalone queue event — manual time entry and live leaderboards.")
                        .font(.ssmRounded(13, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                    Button {
                        showTTEvent = true
                    } label: {
                        Label("Open Time Trial Event", systemImage: "stopwatch")
                    }
                    .buttonStyle(.ssmPill)
                } else if let current = state.current {
                    Text(current.groupLabel)
                        .font(.ssmRounded(34, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .minimumScaleFactor(0.5)
                        .lineLimit(2)

                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            if let division = current.division, !division.isEmpty {
                                SSMChip(division.capitalized, color: SSMTheme.sky)
                            }
                            SSMChip(current.distanceLabel, color: SSMTheme.orange)
                            SSMChip(current.stage, color: SSMTheme.sky)
                            if let startType = current.startType, !startType.isEmpty {
                                SSMChip(startType, color: SSMTheme.muted)
                            }
                            if (current.status ?? "open") == "closed" {
                                SSMChip("CLOSED", color: SSMTheme.danger)
                            }
                            if current.isOpenRace == true { SSMChip("Open", color: SSMTheme.orange) }
                            if current.isQuadRace == true { SSMChip("Quad", color: SSMTheme.orange) }
                            if current.isRelayRace { SSMChip("RELAY — lanes are teams", color: SSMTheme.mergeAccent) }
                        }
                        .fixedSize()
                    }
                    .scrollIndicators(.hidden)
                } else {
                    Text("No current race — pick one from Jump to Race.")
                        .font(.ssmRounded(16, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
        }
    }

    // ── Controls ─────────────────────────────────────────────────────────

    private func controlsCard(_ state: RaceDayStateResponse) -> some View {
        SSMCard {
            VStack(spacing: 12) {
                HStack(spacing: 12) {
                    Button {
                        Task { await session.step(direction: -1) }
                    } label: {
                        Label("Previous", systemImage: "chevron.left")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ssmSoftPill)

                    Button {
                        Task { await session.step(direction: 1) }
                    } label: {
                        Label("Advance", systemImage: "chevron.right")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ssmPill)
                }

                HStack(spacing: 12) {
                    Button {
                        Task { await session.togglePause() }
                    } label: {
                        Label(state.paused ? "Resume Meet" : "Pause Meet",
                              systemImage: state.paused ? "play.fill" : "pause.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ssmSoftPill)

                    if (state.current?.status ?? "open") == "closed" {
                        Button {
                            Task { await session.unlockCurrentRace() }
                        } label: {
                            Label("Unlock Race", systemImage: "lock.open.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.ssmPill(LinearGradient(colors: [SSMTheme.danger, SSMTheme.danger.opacity(0.75)],
                                                             startPoint: .topLeading, endPoint: .bottomTrailing)))
                    }
                }

                if let message = session.errorMessage {
                    Text(message)
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.danger)
                }
            }
            .disabled(session.isSendingAction)
            .opacity(session.isSendingAction ? 0.6 : 1)
        }
    }

    // ── Lane sheet ───────────────────────────────────────────────────────

    private func laneSheetCard(_ race: RaceDayItem) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(race.isMergedPack ? "MERGED PACK — LANE SHEET"
                     : race.isRelayRace ? "RELAY — TEAM LANE SHEET" : "LANE SHEET")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                if race.isMergedPack {
                    MergePackBanner(label: race.packLabel ?? "")
                }
                ForEach(race.displayLanes) { lane in
                    HStack(spacing: 12) {
                        Text("\(lane.lane)")
                            .font(.ssmRounded(16, weight: .heavy))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(SSMTheme.orange))
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 6) {
                                if let helmet = lane.helmetNumber {
                                    Text("#\(helmet)")
                                        .font(.ssmRounded(14, weight: .heavy))
                                        .foregroundStyle(SSMTheme.sky)
                                }
                                // Relay lane = a team: lead with the club.
                                Text(race.isRelayRace ? (lane.team.isEmpty ? "Lane \(lane.lane)" : lane.team) : lane.skaterName)
                                    .font(.ssmRounded(16, weight: .bold))
                                    .foregroundStyle(SSMTheme.textPrimary)
                                if let div = lane.division, !div.isEmpty {
                                    MergeDivTag(div)
                                }
                            }
                            Text(race.isRelayRace ? lane.skaterName : lane.team)
                                .font(.ssmRounded(12, weight: .medium))
                                .foregroundStyle(SSMTheme.muted)
                        }
                        Spacer()
                        if let place = lane.place, !place.isEmpty {
                            SSMChip(ordinal(place), color: SSMTheme.good)
                        } else if let status = lane.status, !status.isEmpty {
                            SSMChip(status, color: SSMTheme.danger)
                        }
                        if let time = lane.time, !time.isEmpty {
                            Text(time)
                                .font(.ssmRounded(14, weight: .bold))
                                .foregroundStyle(SSMTheme.muted)
                        }
                    }
                    .padding(.vertical, 3)
                }
            }
        }
    }

    // ── Right rail ───────────────────────────────────────────────────────

    private func progressCard(_ state: RaceDayStateResponse) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("MEET PROGRESS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                let total = max(state.progress.total, 1)
                ProgressView(value: Double(state.progress.completed), total: Double(total))
                    .tint(SSMTheme.orange)
                Text("\(state.progress.completed) of \(state.progress.total) races complete · \(state.paused ? "Paused" : "Running")")
                    .font(.ssmRounded(13, weight: .semibold))
                    .foregroundStyle(SSMTheme.textPrimary)
            }
        }
    }

    private func jumpCard(_ state: RaceDayStateResponse) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("JUMP TO RACE")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Menu {
                    ForEach(state.orderedRaces) { option in
                        Button {
                            Task { await session.setCurrentRace(raceID: option.id.stringValue) }
                        } label: {
                            if option.isCurrent {
                                Label(option.label, systemImage: "checkmark")
                            } else {
                                Text(option.label)
                            }
                        }
                    }
                } label: {
                    HStack {
                        Text(state.orderedRaces.first(where: \.isCurrent)?.label ?? "Choose a race…")
                            .font(.ssmRounded(14, weight: .bold))
                            .foregroundStyle(SSMTheme.textPrimary)
                            .lineLimit(2)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down")
                            .foregroundStyle(SSMTheme.muted)
                    }
                    .padding(12)
                    .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .disabled(session.isSendingAction)
            }
        }
    }

    private func stagingCard(_ state: RaceDayStateResponse) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("IN STAGING")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                if let next = state.next {
                    Text(next.isMergedPack ? (next.packLabel ?? next.groupLabel) : next.groupLabel)
                        .font(.ssmRounded(20, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    HStack(spacing: 6) {
                        Text("\(next.distanceLabel) · \(next.stage)")
                            .font(.ssmRounded(13, weight: .semibold))
                            .foregroundStyle(SSMTheme.sky)
                        if next.isMergedPack {
                            MergeDivTag("MERGED")
                        }
                    }
                    ForEach(next.displayLanes.prefix(8)) { lane in
                        HStack(spacing: 8) {
                            Text("\(lane.lane)")
                                .font(.ssmRounded(12, weight: .heavy))
                                .foregroundStyle(SSMTheme.muted)
                                .frame(width: 18)
                            if let helmet = lane.helmetNumber {
                                Text("#\(helmet)")
                                    .font(.ssmRounded(12, weight: .bold))
                                    .foregroundStyle(SSMTheme.sky)
                            }
                            Text(lane.skaterName)
                                .font(.ssmRounded(13, weight: .semibold))
                                .foregroundStyle(SSMTheme.textPrimary)
                                .lineLimit(1)
                            if let div = lane.division, !div.isEmpty {
                                MergeDivTag(div)
                            }
                            Spacer()
                        }
                    }
                    if let upNext = upcoming(after: state, count: 3), !upNext.isEmpty {
                        Divider().overlay(SSMTheme.cardBorder)
                        Text("COMING UP")
                            .font(.ssmRounded(11, weight: .heavy))
                            .foregroundStyle(SSMTheme.muted)
                        ForEach(upNext) { option in
                            Text(option.label)
                                .font(.ssmRounded(13, weight: .semibold))
                                .foregroundStyle(SSMTheme.muted)
                                .lineLimit(1)
                        }
                    }
                } else {
                    Text("Nothing staged — end of the schedule.")
                        .font(.ssmRounded(14, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
        }
    }

    private var directorToolsCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("DIRECTOR TOOLS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Button {
                    showCorrection = true
                } label: {
                    Label("Correction Mode", systemImage: "pencil.and.outline")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmSoftPill)
                Text("Fix results on a closed race — needs a reason, keeps an audit trail.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)

                Button {
                    showMeetActions = true
                } label: {
                    Label("Meet Actions", systemImage: "gearshape")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmSoftPill)
                Text("Re-randomize lanes, finalize or reopen the meet, print score sheets.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private func raceIndex(of race: RaceDayItem, in state: RaceDayStateResponse) -> Int? {
        state.orderedRaces.first { $0.isCurrent }.map { $0.index + 1 }
    }

    private func upcoming(after state: RaceDayStateResponse, count: Int) -> [OrderedRaceOption]? {
        guard let currentIndex = state.orderedRaces.firstIndex(where: \.isCurrent) else { return nil }
        // state.next occupies currentIndex+1; "coming up" starts after it.
        let start = state.orderedRaces.index(after: state.orderedRaces.index(after: currentIndex))
        guard start < state.orderedRaces.endIndex else { return [] }
        return Array(state.orderedRaces[start...].prefix(count))
    }

    private func ordinal(_ place: String) -> String {
        guard let n = Int(place) else { return place }
        switch n {
        case 1: return "1st"
        case 2: return "2nd"
        case 3: return "3rd"
        default: return "\(n)th"
        }
    }
}
