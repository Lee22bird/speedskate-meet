import SwiftUI

/// Announcer board (read-only) — the app's version of the website's
/// Announcer tab: Current / In Staging deck plus big lane read-cards with
/// team and sponsor lines. Pinned to the meet's current race; the director
/// moves it, the announcer just reads.
struct PadAnnouncerView: View {
    @EnvironmentObject private var session: PadSessionViewModel

    var body: some View {
        Group {
            if let state = session.state {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        deck(state)
                        if let current = state.current {
                            announcerCard(current)
                        }
                    }
                    .padding(24)
                    .frame(maxWidth: 980)
                    .frame(maxWidth: .infinity)
                }
                .scrollIndicators(.hidden)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SSMTheme.pageBackground)
    }

    private func deck(_ state: RaceDayStateResponse) -> some View {
        HStack(spacing: 16) {
            deckTile(label: "CURRENT RACE", item: state.current, accent: SSMTheme.orange)
            deckTile(label: "IN STAGING", item: state.next, accent: SSMTheme.sky)
        }
    }

    private func deckTile(label: String, item: RaceDayItem?, accent: Color) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 6) {
                Text(label)
                    .font(.ssmRounded(11, weight: .heavy))
                    .foregroundStyle(accent)
                Text(item?.groupLabel ?? "—")
                    .font(.ssmRounded(20, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(2)
                if let item {
                    Text("\(item.distanceLabel) · \(item.stage)")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func announcerCard(_ race: RaceDayItem) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("NOW RACING — READ SHEET")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                ForEach(race.lanes) { lane in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 10) {
                            Text("\(lane.lane)")
                                .font(.ssmRounded(18, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 38, height: 38)
                                .background(Circle().fill(SSMTheme.orange))
                            if let helmet = lane.helmetNumber {
                                Text("#\(helmet)")
                                    .font(.ssmRounded(20, weight: .heavy))
                                    .foregroundStyle(SSMTheme.sky)
                            }
                            Text(lane.skaterName)
                                .font(.ssmRounded(22, weight: .heavy))
                                .foregroundStyle(SSMTheme.textPrimary)
                            Spacer()
                            Text(lane.team)
                                .font(.ssmRounded(15, weight: .bold))
                                .foregroundStyle(SSMTheme.muted)
                        }
                        if let sponsor = lane.sponsor, !sponsor.isEmpty {
                            Text("Sponsored by \(sponsor)")
                                .font(.ssmRounded(13, weight: .semibold))
                                .foregroundStyle(SSMTheme.orange)
                                .padding(.leading, 48)
                        }
                    }
                    .padding(.vertical, 5)
                }
            }
        }
    }
}

/// Referee board (read-only) — lane assignments for the current and staging
/// races, mirroring the website's Referee tab.
struct PadRefereeView: View {
    @EnvironmentObject private var session: PadSessionViewModel

    var body: some View {
        Group {
            if let state = session.state {
                GeometryReader { proxy in
                    ScrollView {
                        // Side-by-side only when both cards get real width.
                        if proxy.size.width >= 760 {
                            HStack(alignment: .top, spacing: 20) {
                                assignmentCard(label: "CURRENT RACE — LANE ASSIGNMENTS",
                                               item: state.current, accent: SSMTheme.orange)
                                assignmentCard(label: "IN STAGING — LANE ASSIGNMENTS",
                                               item: state.next, accent: SSMTheme.sky)
                            }
                            .padding(24)
                        } else {
                            VStack(spacing: 20) {
                                assignmentCard(label: "CURRENT RACE — LANE ASSIGNMENTS",
                                               item: state.current, accent: SSMTheme.orange)
                                assignmentCard(label: "IN STAGING — LANE ASSIGNMENTS",
                                               item: state.next, accent: SSMTheme.sky)
                            }
                            .padding(20)
                        }
                    }
                    .scrollIndicators(.hidden)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SSMTheme.pageBackground)
    }

    private func assignmentCard(label: String, item: RaceDayItem?, accent: Color) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(label)
                    .font(.ssmRounded(11, weight: .heavy))
                    .foregroundStyle(accent)
                if let item {
                    Text(item.groupLabel)
                        .font(.ssmRounded(22, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    Text("\(item.distanceLabel) · \(item.stage)")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                    Divider().overlay(SSMTheme.cardBorder)
                    ForEach(item.lanes) { lane in
                        HStack(spacing: 10) {
                            Text("\(lane.lane)")
                                .font(.ssmRounded(15, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                                .background(Circle().fill(accent))
                            if let helmet = lane.helmetNumber {
                                Text("#\(helmet)")
                                    .font(.ssmRounded(14, weight: .heavy))
                                    .foregroundStyle(SSMTheme.sky)
                            }
                            Text(lane.skaterName)
                                .font(.ssmRounded(15, weight: .bold))
                                .foregroundStyle(SSMTheme.textPrimary)
                                .lineLimit(1)
                            Spacer()
                            Text(lane.team)
                                .font(.ssmRounded(12, weight: .medium))
                                .foregroundStyle(SSMTheme.muted)
                                .lineLimit(1)
                        }
                        .padding(.vertical, 3)
                    }
                } else {
                    Text("—")
                        .font(.ssmRounded(18, weight: .bold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
