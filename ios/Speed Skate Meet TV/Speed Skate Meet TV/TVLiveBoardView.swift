import SwiftUI
import SSMCompanion

// The full-screen live race board. Reuses SSMCompanion's LiveRaceDayViewModel
// (the same 8-second poll the website's /live page uses) and shows the race
// that's on the track right now plus the last few finishes.

struct TVLiveBoardView: View {
    let meet: MeetSummary
    @StateObject private var vm = LiveRaceDayViewModel()

    var body: some View {
        ZStack {
            SSMTheme.pageGradient.ignoresSafeArea()

            VStack(spacing: 28) {
                header

                if vm.data == nil && vm.isLoading {
                    Spacer()
                    ProgressView().scaleEffect(2)
                    Spacer()
                } else if let error = vm.errorMessage, vm.data == nil {
                    Spacer()
                    TVEmptyState(icon: "wifi.exclamationmark",
                                 title: "Can't reach the meet",
                                 subtitle: error)
                    Spacer()
                } else {
                    HStack(alignment: .top, spacing: 32) {
                        currentPanel
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        sidePanel
                            .frame(width: 620, alignment: .top)
                    }
                    .frame(maxHeight: .infinity, alignment: .top)
                }
            }
            .padding(.horizontal, 72)
            .padding(.vertical, 54)
        }
        .task {
            await vm.load(meetID: meet.id.stringValue)
            vm.startAutoRefresh(meetID: meet.id.stringValue)
        }
        .onDisappear { vm.stopAutoRefresh() }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center, spacing: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Text(vm.data?.meetName ?? meet.meetName)
                    .font(.ssmRounded(40, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(1)
                Text("Live Race Board")
                    .font(.ssmRounded(22, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
            LiveBadge().scaleEffect(1.4).padding(.leading, 6)
            Spacer()
            progressView
        }
    }

    private var progressView: some View {
        let total = vm.data?.progress.total ?? 0
        let done = vm.data?.progress.completed ?? 0
        let frac = total > 0 ? Double(done) / Double(total) : 0
        return VStack(alignment: .trailing, spacing: 8) {
            Text("\(done) of \(total) races complete")
                .font(.ssmRounded(22, weight: .semibold))
                .foregroundStyle(SSMTheme.muted)
            ZStack(alignment: .leading) {
                Capsule().fill(SSMTheme.cardBackgroundLight).frame(width: 420, height: 14)
                Capsule().fill(SSMTheme.orangeGradient)
                    .frame(width: max(14, 420 * frac), height: 14)
            }
        }
    }

    // MARK: Current race

    @ViewBuilder
    private var currentPanel: some View {
        if let current = vm.data?.current {
            raceCard(title: "ON THE TRACK", accent: SSMTheme.good, item: current)
        } else if let next = vm.data?.next {
            raceCard(title: "ON DECK", accent: SSMTheme.sky, item: next)
        } else {
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: "pause.circle")
                    .font(.system(size: 90))
                    .foregroundStyle(SSMTheme.muted)
                Text("No race running right now")
                    .font(.ssmRounded(38, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                if let coming = vm.data?.coming, !coming.isEmpty {
                    Text("Coming up: " + coming.prefix(3).map { $0.groupLabel }.joined(separator: " · "))
                        .font(.ssmRounded(24, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func raceCard(title: String, accent: Color, item: RaceDayItem) -> some View {
        let lanes = sortedLanes(item.lanes)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 14) {
                Text(title)
                    .font(.ssmRounded(22, weight: .heavy))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(accent, in: SSMTheme.pillShape)
                stageChips(item)
                Spacer()
            }
            .padding(.bottom, 18)

            Text(item.groupLabel)
                .font(.ssmRounded(52, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(subtitle(item))
                .font(.ssmRounded(30, weight: .semibold))
                .foregroundStyle(accent)
                .padding(.bottom, 22)

            if lanes.isEmpty {
                Text("Lineup loading…")
                    .font(.ssmRounded(26, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 40)
            } else {
                VStack(spacing: 12) {
                    ForEach(lanes) { lane in
                        TVLaneRow(lane: lane)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(SSMTheme.cardBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .strokeBorder(SSMTheme.cardBorder, lineWidth: 1)
        )
    }

    private func stageChips(_ item: RaceDayItem) -> some View {
        HStack(spacing: 10) {
            if !item.stage.isEmpty {
                TVChip(item.stage.uppercased(), color: SSMTheme.orange)
            }
            if item.isTimeTrial {
                TVChip("TIME TRIAL", color: SSMTheme.sky2)
            } else if item.isQuadRace == true {
                TVChip("QUAD", color: SSMTheme.sky2)
            } else if item.isOpenRace == true {
                TVChip("OPEN", color: SSMTheme.sky2)
            }
            if let start = item.startType, !start.isEmpty {
                TVChip(start.uppercased(), color: SSMTheme.navy3)
            }
        }
    }

    private func subtitle(_ item: RaceDayItem) -> String {
        var parts: [String] = []
        if let div = item.division, !div.isEmpty { parts.append(div.capitalized) }
        parts.append(item.distanceLabel)
        return parts.joined(separator: "  •  ")
    }

    // MARK: Up next + coming up + recently finished

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 22) {
            // Only surface "Up Next" here while a race is actually running —
            // when nothing's on the track the next race is promoted to the
            // main panel as "ON DECK", so showing it twice would be redundant.
            if vm.data?.current != nil, let next = vm.data?.next {
                upNextCard(next)
            }

            if let coming = vm.data?.coming, !coming.isEmpty {
                comingUpList(coming)
            }

            finishedSection
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func upNextCard(_ item: RaceDayItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text("UP NEXT")
                    .font(.ssmRounded(20, weight: .heavy))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 6)
                    .background(SSMTheme.sky2, in: SSMTheme.pillShape)
                if !item.stage.isEmpty {
                    TVChip(item.stage.uppercased(), color: SSMTheme.navy3)
                }
                Spacer()
                if !item.lanes.isEmpty {
                    Text("\(item.lanes.count) skaters")
                        .font(.ssmRounded(18, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
            Text(item.groupLabel)
                .font(.ssmRounded(30, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(subtitle(item))
                .font(.ssmRounded(22, weight: .semibold))
                .foregroundStyle(SSMTheme.sky)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(SSMTheme.cardBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(SSMTheme.sky2.opacity(0.55), lineWidth: 2)
        )
    }

    private func comingUpList(_ coming: [ComingUpItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("COMING UP")
                .font(.ssmRounded(20, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)
            ForEach(coming.prefix(3)) { item in
                HStack(spacing: 12) {
                    Circle().fill(SSMTheme.navy3).frame(width: 8, height: 8)
                    Text(comingLabel(item))
                        .font(.ssmRounded(21, weight: .semibold))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private var finishedSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("JUST FINISHED")
                .font(.ssmRounded(20, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)

            let recents = vm.data?.recentResults ?? []
            if recents.isEmpty {
                Text("Results will appear here as races close.")
                    .font(.ssmRounded(21, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            } else {
                VStack(spacing: 14) {
                    ForEach(recents.prefix(3)) { race in
                        TVFinishedRaceCard(race: race)
                    }
                }
            }
        }
    }

    private func comingLabel(_ item: ComingUpItem) -> String {
        var parts: [String] = [item.groupLabel]
        if let div = item.division, !div.isEmpty { parts.append(div.capitalized) }
        parts.append(item.distanceLabel)
        return parts.joined(separator: " • ")
    }

    // MARK: Helpers

    private func sortedLanes(_ lanes: [LaneEntry]) -> [LaneEntry] {
        lanes.sorted { a, b in
            switch (placeInt(a.place), placeInt(b.place)) {
            case let (x?, y?): return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil): return a.lane < b.lane
            }
        }
    }
}

func placeInt(_ s: String?) -> Int? {
    guard let s else { return nil }
    return Int(s.trimmingCharacters(in: .whitespaces))
}

/// Medal color for places 1–3, muted navy otherwise.
func medalColor(_ place: Int?) -> Color {
    switch place {
    case 1: return Color(red: 0xFF/255, green: 0xC1/255, blue: 0x07/255)
    case 2: return Color(red: 0xC7/255, green: 0xD0/255, blue: 0xDE/255)
    case 3: return Color(red: 0xCD/255, green: 0x7F/255, blue: 0x32/255)
    default: return SSMTheme.navy3
    }
}

struct TVLaneRow: View {
    let lane: LaneEntry

    private var place: Int? { placeInt(lane.place) }
    private var statusText: String? {
        guard let s = lane.status, !s.isEmpty, s.uppercased() != "OK" else { return nil }
        return s.uppercased()
    }

    var body: some View {
        HStack(spacing: 20) {
            // Place / status marker
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(place != nil ? medalColor(place) : SSMTheme.cardBackgroundLight)
                    .frame(width: 66, height: 66)
                if let place {
                    Text("\(place)")
                        .font(.ssmRounded(34, weight: .heavy))
                        .foregroundStyle(place <= 3 ? .black : .white)
                } else if statusText != nil {
                    Image(systemName: "xmark")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(SSMTheme.danger)
                } else {
                    Text("–").font(.ssmRounded(30, weight: .bold)).foregroundStyle(SSMTheme.muted)
                }
            }

            Text("L\(lane.lane)")
                .font(.ssmRounded(22, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)
                .frame(width: 58, alignment: .leading)

            if let helmet = lane.helmetNumber {
                Text("\(helmet)")
                    .font(.ssmRounded(26, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 62, height: 62)
                    .background(SSMTheme.navy2, in: Circle())
                    .overlay(Circle().strokeBorder(SSMTheme.cardBorder, lineWidth: 1))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(lane.skaterName)
                    .font(.ssmRounded(30, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(1)
                Text([lane.team, lane.sponsor].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  •  "))
                    .font(.ssmRounded(20, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if let statusText {
                Text(statusText)
                    .font(.ssmRounded(24, weight: .heavy))
                    .foregroundStyle(SSMTheme.danger)
            } else if let time = lane.time, !time.isEmpty {
                Text(time)
                    .font(.ssmRounded(30, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(SSMTheme.textPrimary)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(SSMTheme.cardBackgroundLight.opacity(place == 1 ? 0.9 : 0.5))
        )
    }
}

struct TVFinishedRaceCard: View {
    let race: RecentRace

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(raceTitle)
                .font(.ssmRounded(22, weight: .bold))
                .foregroundStyle(SSMTheme.textPrimary)
                .lineLimit(1)
            ForEach(race.results.prefix(3)) { row in
                HStack(spacing: 12) {
                    Text(row.place ?? row.status ?? "–")
                        .font(.ssmRounded(22, weight: .heavy))
                        .foregroundStyle(medalColor(placeInt(row.place)))
                        .frame(width: 40, alignment: .leading)
                    Text(row.skaterName)
                        .font(.ssmRounded(22, weight: .semibold))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Text(row.team)
                        .font(.ssmRounded(18, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                        .lineLimit(1)
                        .frame(maxWidth: 160, alignment: .trailing)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(SSMTheme.cardBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(SSMTheme.cardBorder, lineWidth: 1)
        )
    }

    private var raceTitle: String {
        var parts: [String] = [race.groupLabel]
        if let div = race.division, !div.isEmpty { parts.append(div.capitalized) }
        parts.append(race.distanceLabel)
        return parts.joined(separator: " • ")
    }
}

struct TVChip: View {
    let text: String
    let color: Color
    init(_ text: String, color: Color) { self.text = text; self.color = color }
    var body: some View {
        Text(text)
            .font(.ssmRounded(18, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(color, in: SSMTheme.pillShape)
    }
}
