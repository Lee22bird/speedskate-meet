import SwiftUI

/// The iPad Live Board — a big-screen race board built to be AirPlayed to a TV
/// at the rink. Everything is oversized and high-contrast so it reads from
/// across the room: NOW RACING with its lanes on the left, and Up Next / On
/// Deck / Just Finished down the right. Auto-refreshes on the shared live feed.
///
/// Tap "Full screen" to present it edge-to-edge (hiding the sidebar) — that's
/// the view you mirror to the Apple TV.
struct PadLiveBoardView: View {
    let meetID: String
    let meetName: String

    @StateObject private var vm = LiveRaceDayViewModel()
    @State private var fullScreen = false

    var body: some View {
        ZStack {
            SSMTheme.pageBackground.ignoresSafeArea()
            if vm.isLoading && vm.data == nil {
                ProgressView().tint(.white).scaleEffect(1.4)
            } else if let error = vm.errorMessage, vm.data == nil {
                VStack(spacing: 14) {
                    Image(systemName: "tv.slash").font(.system(size: 44)).foregroundStyle(SSMTheme.muted)
                    Text(error).font(.ssmRounded(16, weight: .semibold)).foregroundStyle(SSMTheme.muted)
                }
            } else if let data = vm.data {
                TVBoardContent(data: data, meetName: meetName,
                               chrome: .inline { fullScreen = true })
            }
        }
        .task {
            await vm.load(meetID: meetID)
            vm.startAutoRefresh(meetID: meetID)
        }
        .onDisappear { vm.stopAutoRefresh() }
        .fullScreenCover(isPresented: $fullScreen) {
            ZStack {
                SSMTheme.pageBackground.ignoresSafeArea()
                if let data = vm.data {
                    TVBoardContent(data: data, meetName: meetName,
                                   chrome: .fullScreen { fullScreen = false })
                }
            }
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)
        }
    }
}

// ── The board itself (shared by inline + full-screen) ─────────────────────────

private struct TVBoardContent: View {
    let data: LiveRaceDayResponse
    let meetName: String

    enum Chrome {
        case inline(() -> Void)      // shows a "Full screen" button
        case fullScreen(() -> Void)  // shows a small "Exit" affordance
    }
    let chrome: Chrome

    var body: some View {
        VStack(spacing: 0) {
            header
            HStack(alignment: .top, spacing: 20) {
                nowRacing
                    .frame(maxWidth: .infinity, alignment: .leading)
                rightRail
                    .frame(width: 360)
            }
            .padding(24)
        }
    }

    // MARK: header

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            HStack(spacing: 10) {
                Circle().fill(SSMTheme.good).frame(width: 14, height: 14)
                    .shadow(color: SSMTheme.good.opacity(0.8), radius: 6)
                Text("LIVE").font(.ssmRounded(18, weight: .heavy)).tracking(2).foregroundStyle(SSMTheme.good)
            }
            Text(meetName)
                .font(.ssmRounded(26, weight: .heavy)).foregroundStyle(.white)
                .lineLimit(1)
            Spacer()
            Text("Race \(min(data.progress.completed + 1, max(data.progress.total, 1))) of \(data.progress.total)")
                .font(.ssmRounded(22, weight: .bold)).foregroundStyle(SSMTheme.muted)
            switch chrome {
            case .inline(let go):
                Button(action: go) {
                    Label("Full screen", systemImage: "tv").font(.ssmRounded(15, weight: .bold))
                }
                .buttonStyle(.ssmSoftPill)
            case .fullScreen(let exit):
                Button(action: exit) {
                    Image(systemName: "xmark").font(.system(size: 17, weight: .bold))
                        .padding(10)
                        .background(SSMTheme.cardBackgroundLight, in: Circle())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 18)
        .padding(.bottom, 14)
        .background(SSMTheme.cardBackground)
    }

    // MARK: now racing (left, dominant)

    private var nowRacing: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let current = data.current {
                VStack(alignment: .leading, spacing: 6) {
                    Text("NOW RACING")
                        .font(.ssmRounded(20, weight: .heavy)).tracking(2)
                        .foregroundStyle(SSMTheme.orange)
                    Text(current.groupLabel)
                        .font(.ssmRounded(64, weight: .heavy))
                        .foregroundStyle(.white)
                        .minimumScaleFactor(0.5)
                        .lineLimit(2)
                    Text([current.division?.capitalized, current.distanceLabel, current.stage]
                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  •  "))
                        .font(.ssmRounded(26, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                    if current.isMergedPack, let pack = current.packLabel, !pack.isEmpty {
                        Text("🔗 One pack — \(pack) (scored separately)")
                            .font(.ssmRounded(18, weight: .bold))
                            .foregroundStyle(SSMTheme.mergeAccent)
                            .padding(.top, 2)
                    }
                }
                laneBoard(current)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("STAND BY")
                        .font(.ssmRounded(56, weight: .heavy)).foregroundStyle(.white.opacity(0.5))
                    Text("Between races").font(.ssmRounded(24, weight: .semibold)).foregroundStyle(SSMTheme.muted)
                }
            }
        }
    }

    private func laneBoard(_ item: RaceDayItem) -> some View {
        let lanes = item.displayLanes
        return VStack(spacing: 10) {
            ForEach(lanes) { lane in
                HStack(spacing: 18) {
                    Text("\(lane.lane)")
                        .font(.ssmRounded(30, weight: .heavy))
                        .frame(width: 58, height: 58)
                        .background(SSMTheme.orangeGradient, in: Circle())
                        .foregroundStyle(.white)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.isRelayRace ? (lane.team.isEmpty ? "Lane \(lane.lane)" : lane.team) : lane.skaterName)
                            .font(.ssmRounded(30, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        HStack(spacing: 10) {
                            if let helmet = lane.helmetNumber {
                                Text("#\(helmet)").font(.ssmRounded(18, weight: .heavy)).foregroundStyle(SSMTheme.sky2)
                            }
                            if !item.isRelayRace, !lane.team.isEmpty {
                                Text(lane.team).font(.ssmRounded(18, weight: .semibold)).foregroundStyle(SSMTheme.muted)
                            }
                            if let div = lane.division, !div.isEmpty {
                                Text(div).font(.ssmRounded(15, weight: .bold))
                                    .foregroundStyle(SSMTheme.mergeAccent)
                            }
                        }
                    }
                    Spacer()
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .padding(.top, 4)
    }

    // MARK: right rail — up next / on deck / just finished

    private var rightRail: some View {
        VStack(spacing: 16) {
            railCard(label: "UP NEXT", accent: SSMTheme.sky) {
                if let next = data.next {
                    Text(next.groupLabel)
                        .font(.ssmRounded(30, weight: .heavy)).foregroundStyle(.white)
                        .lineLimit(2).minimumScaleFactor(0.6)
                    Text([next.division?.capitalized, next.distanceLabel]
                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  •  "))
                        .font(.ssmRounded(19, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
                } else {
                    Text("—").font(.ssmRounded(28, weight: .bold)).foregroundStyle(SSMTheme.muted)
                }
            }

            if !data.coming.isEmpty {
                railCard(label: "ON DECK", accent: SSMTheme.publicPeach) {
                    ForEach(data.coming.prefix(3)) { item in
                        Text("\(item.groupLabel) — \(item.distanceLabel)")
                            .font(.ssmRounded(18, weight: .semibold))
                            .foregroundStyle(SSMTheme.publicPeach)
                            .lineLimit(1).minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }

            if let recent = data.recentResults.first {
                railCard(label: "JUST FINISHED", accent: SSMTheme.publicMint) {
                    Text("\(recent.groupLabel) — \(recent.distanceLabel)")
                        .font(.ssmRounded(19, weight: .heavy)).foregroundStyle(SSMTheme.publicMint)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    ForEach(recent.results.prefix(4)) { row in
                        HStack(spacing: 12) {
                            Text(placeLabel(row.place ?? row.status))
                                .font(.ssmRounded(20, weight: .heavy))
                                .foregroundStyle(SSMTheme.publicMint)
                                .frame(width: 44, alignment: .leading)
                            Text(row.skaterName)
                                .font(.ssmRounded(20, weight: .bold)).foregroundStyle(.white)
                                .lineLimit(1).minimumScaleFactor(0.6)
                            Spacer()
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func railCard<Content: View>(label: String, accent: Color,
                                         @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.ssmRounded(14, weight: .heavy)).tracking(1.5).foregroundStyle(accent)
            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(accent.opacity(0.25), lineWidth: 1))
    }

    private func placeLabel(_ raw: String?) -> String {
        guard let raw else { return "—" }
        guard let place = Int(raw) else { return raw }   // DQ / DNF etc. pass through
        switch place {
        case 1: return "1st"
        case 2: return "2nd"
        case 3: return "3rd"
        default: return "\(place)th"
        }
    }
}
