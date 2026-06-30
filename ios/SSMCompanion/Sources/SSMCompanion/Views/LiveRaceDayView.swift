import SwiftUI

public struct LiveRaceDayView: View {
    let meetID: String
    let meetName: String

    @StateObject private var viewModel = LiveRaceDayViewModel()
    @State private var mode: DisplayMode = .detailed

    private enum DisplayMode: String, CaseIterable {
        case detailed = "Live Race Day"
        case board = "Live Board"
    }

    public init(meetID: String, meetName: String) {
        self.meetID = meetID
        self.meetName = meetName
    }

    public var body: some View {
        ScrollView { 
            VStack(spacing: 16) {
                Picker("View", selection: $mode) {
                    ForEach(DisplayMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .tint(SSMTheme.orange)
                .padding(.horizontal)

                if viewModel.isLoading && viewModel.data == nil {
                    ProgressView().padding(.top, 60)
                } else if let error = viewModel.errorMessage {
                    ContentUnavailableFallback(text: error)
                } else if let data = viewModel.data {
                    switch mode {
                    case .detailed:
                        DetailedLiveContent(data: data)
                    case .board:
                        LiveBoardContent(data: data)
                    }
                }
            }
            .padding(.vertical)
            .padding(.bottom, 70)
        }
        .background(SSMTheme.pageBackground)
        .navigationTitle(meetName)
        .ssmInlineNavigationTitle()
        .ssmNavigationBarHidden(false)
        .task {
            await viewModel.load(meetID: meetID)
            viewModel.startAutoRefresh(meetID: meetID)
        }
        .onDisappear { viewModel.stopAutoRefresh() }
    }
}

// ── Full detail: current race + lanes, in staging, after that, recent results ─
private struct DetailedLiveContent: View {
    let data: LiveRaceDayResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let current = data.current {
                RaceHeroCard(label: "Now Racing", item: current, color: SSMTheme.orangeGradient)
                LaneListCard(item: current)
            } else {
                SSMCard { Text("No race selected yet.").foregroundStyle(SSMTheme.muted) }
                    .padding(.horizontal)
            }

            if let next = data.next {
                RaceSummaryCard(label: "In Staging", item: next, color: SSMTheme.sky)
            }

            if !data.coming.isEmpty {
                SSMCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("After That").font(.subheadline.bold()).foregroundStyle(SSMTheme.muted)
                        ForEach(data.coming) { item in
                            Text("\(item.groupLabel) — \(item.distanceLabel)")
                                .font(.subheadline)
                        }
                    }
                }
                .padding(.horizontal)
            }

            if !data.recentResults.isEmpty {
                SSMCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Recent Results").font(.subheadline.bold()).foregroundStyle(SSMTheme.muted)
                        ForEach(data.recentResults) { race in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(race.groupLabel) — \(race.distanceLabel)").font(.subheadline.bold())
                                ForEach(race.results) { row in
                                    HStack {
                                        Text(row.status ?? row.place ?? "—").bold().frame(width: 36, alignment: .leading)
                                        Text(row.skaterName)
                                        Spacer()
                                        Text(row.team).foregroundStyle(SSMTheme.muted).font(.caption)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

// ── Simplified Live Board: big readable current/next/last tiles ─────────────
private struct LiveBoardContent: View {
    let data: LiveRaceDayResponse

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: SSMTheme.cornerRadius)
                    .fill(SSMTheme.navyGradient)
                VStack(alignment: .leading, spacing: 8) {
                    Text("NOW RACING")
                        .font(.caption.bold())
                        .foregroundStyle(SSMTheme.orange)
                    if let current = data.current {
                        Text(current.groupLabel)
                            .font(.ssmRounded(36, weight: .heavy))
                            .foregroundStyle(.white)
                        Text("\(current.division.map { $0.capitalized } ?? "") • \(current.distanceLabel) • \(current.stage)")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.85))
                        if current.lanes.count > 0 && current.lanes.count <= 4 {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(current.lanes) { lane in
                                    Text("\(lane.lane). \(lane.skaterName)")
                                        .font(.ssmRounded(20, weight: .bold))
                                        .foregroundStyle(.white)
                                }
                            }
                            .padding(.top, 6)
                        }
                    } else {
                        Text("Stand By").font(.ssmRounded(36, weight: .heavy)).foregroundStyle(.white.opacity(0.6))
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 180)
            .padding(.horizontal)

            HStack(spacing: 12) {
                BoardTile(label: "Next", text: data.next?.groupLabel ?? "—", gradient: SSMTheme.skyGradient)
                BoardTile(label: "Last Result", text: lastResultText, gradient: LinearGradient(colors: [SSMTheme.good, SSMTheme.good.opacity(0.7)], startPoint: .top, endPoint: .bottom))
            }
            .padding(.horizontal)
        }
    }

    private var lastResultText: String {
        guard let first = data.recentResults.first, let winner = first.results.first else { return "Waiting" }
        return winner.skaterName
    }
}

private struct BoardTile: View {
    let label: String
    let text: String
    let gradient: LinearGradient

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased()).font(.ssmRounded(11, weight: .bold)).foregroundStyle(.white.opacity(0.85))
            Text(text).font(.ssmRounded(17, weight: .bold)).foregroundStyle(.white).lineLimit(2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(gradient, in: RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 4)
    }
}

// ── Shared pieces ────────────────────────────────────────────────────────────
struct RaceHeroCard: View {
    let label: String
    let item: RaceDayItem
    let color: LinearGradient

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label.uppercased()).font(.ssmRounded(12, weight: .bold)).foregroundStyle(.white.opacity(0.9))
                Spacer()
                LiveBadge()
            }
            Text(item.groupLabel).font(.ssmRounded(28, weight: .heavy)).foregroundStyle(.white)
            Text("\(item.division.map { $0.capitalized } ?? "") • \(item.distanceLabel) • \(item.stage)")
                .font(.ssmRounded(15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color, in: RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 5)
        .padding(.horizontal)
    }
}

struct RaceSummaryCard: View {
    let label: String
    let item: RaceDayItem
    let color: Color

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased()).font(.caption.bold()).foregroundStyle(color)
                Text(item.groupLabel).font(.ssmRounded(18, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                Text("\(item.division.map { $0.capitalized } ?? "") • \(item.distanceLabel)")
                    .font(.subheadline)
                    .foregroundStyle(SSMTheme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal)
    }
}

struct LaneListCard: View {
    let item: RaceDayItem

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Lanes").font(.subheadline.bold()).foregroundStyle(SSMTheme.muted)
                ForEach(item.lanes) { lane in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(lane.lane)")
                            .font(.ssmRounded(16, weight: .heavy))
                            .frame(width: 36, height: 36)
                            .background(SSMTheme.orangeGradient)
                            .foregroundStyle(.white)
                            .clipShape(Circle())
                            .shadow(color: SSMTheme.orange.opacity(0.4), radius: 4, x: 0, y: 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(lane.skaterName).font(.ssmRounded(17, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                            HStack(spacing: 6) {
                                if let helmet = lane.helmetNumber {
                                    Text("#\(helmet)").font(.caption).foregroundStyle(SSMTheme.muted)
                                }
                                Text(lane.team).font(.caption).foregroundStyle(SSMTheme.muted)
                            }
                            if let sponsor = lane.sponsor {
                                Text("Sponsored by \(sponsor)").font(.caption2).foregroundStyle(SSMTheme.sky2)
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal)
    }
}
