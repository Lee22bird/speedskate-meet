import SwiftUI

public struct LiveRaceDayView: View {
    let meetID: String
    let meetName: String

    @StateObject private var viewModel = LiveRaceDayViewModel()

    public init(meetID: String, meetName: String) {
        self.meetID = meetID
        self.meetName = meetName
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if viewModel.isLoading && viewModel.data == nil {
                    ProgressView().padding(.top, 60)
                } else if let error = viewModel.errorMessage {
                    ContentUnavailableFallback(text: error)
                } else if let data = viewModel.data {
                    LiveContent(data: data)
                }
            }
            .padding(.vertical)
            .padding(.bottom, 70)
        }
        .background(SSMTheme.publicBackground)
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

// ── The live view: now racing + lanes, up next, coming up, recent results ─────
private struct LiveContent: View {
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
                                .font(.ssmRounded(15, weight: .semibold))
                                .foregroundStyle(SSMTheme.publicPeach)
                        }
                    }
                }
                .padding(.horizontal)
            }

            if !data.recentResults.isEmpty {
                SSMCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Recent Results").font(.subheadline.bold()).foregroundStyle(SSMTheme.muted)
                        // The race title carries its own colour so the eye can
                        // find where one race ends and the next begins — a wall
                        // of same-coloured names is hard to scan at a rink.
                        ForEach(Array(data.recentResults.enumerated()), id: \.element.id) { index, race in
                            VStack(alignment: .leading, spacing: 5) {
                                if index > 0 {
                                    Divider()
                                        .overlay(SSMTheme.publicBorder)
                                        .padding(.vertical, 4)
                                }
                                Text("\(race.groupLabel) — \(race.distanceLabel)")
                                    .font(.ssmRounded(15, weight: .heavy))
                                    .foregroundStyle(SSMTheme.publicMint)
                                ForEach(race.results) { row in
                                    HStack {
                                        Text(row.status ?? row.place ?? "—")
                                            .bold()
                                            .foregroundStyle(SSMTheme.muted)
                                            .frame(width: 36, alignment: .leading)
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
                HStack(spacing: 8) {
                    Text(item.isMergedPack ? "Lanes — merged pack" : item.isRelayRace ? "Lanes — relay teams" : "Lanes")
                        .font(.subheadline.bold()).foregroundStyle(SSMTheme.muted)
                    if item.isRelayRace { RelayTag() }
                }
                if item.isMergedPack {
                    MergePackBanner(label: item.packLabel ?? "")
                }
                ForEach(item.displayLanes) { lane in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(lane.lane)")
                            .font(.ssmRounded(16, weight: .heavy))
                            .frame(width: 36, height: 36)
                            .background(SSMTheme.orangeGradient)
                            .foregroundStyle(.white)
                            .clipShape(Circle())
                            .shadow(color: SSMTheme.orange.opacity(0.4), radius: 4, x: 0, y: 2)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(item.isRelayRace ? (lane.team.isEmpty ? "Lane \(lane.lane)" : lane.team) : lane.skaterName)
                                    .font(.ssmRounded(17, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                                if let div = lane.division, !div.isEmpty {
                                    MergeDivTag(div)
                                }
                            }
                            HStack(spacing: 6) {
                                if let helmet = lane.helmetNumber {
                                    Text("#\(helmet)").font(.caption).foregroundStyle(SSMTheme.muted)
                                }
                                Text(item.isRelayRace ? lane.skaterName : lane.team).font(.caption).foregroundStyle(SSMTheme.muted)
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
