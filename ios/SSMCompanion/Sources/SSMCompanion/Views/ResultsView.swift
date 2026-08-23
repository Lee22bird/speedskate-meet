import SwiftUI

public struct ResultsView: View {
    let meetID: String
    let meetName: String

    @StateObject private var viewModel = ResultsViewModel()

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
                    if data.standard.isEmpty && data.quad.isEmpty && data.open.isEmpty {
                        ContentUnavailableFallback(text: "No results yet.")
                            .padding(.top, 60)
                    }
                    ForEach(data.standard) { section in
                        ResultsMatrixCard(title: "\(section.groupLabel) — \(section.division.capitalized)",
                                          distances: section.distances ?? [], rows: section.standings)
                    }
                    ForEach(data.quad) { section in
                        ResultsMatrixCard(title: "\(section.groupLabel) — \(section.distanceLabel)",
                                          distances: section.distances ?? [], rows: section.standings, accent: SSMTheme.sky2)
                    }
                    ForEach(data.open) { section in
                        OpenResultsSectionCard(section: section)
                    }
                }
            }
            .padding(.vertical)
            .padding(.bottom, 70)
        }
        .background(SSMTheme.publicBackground)
        .navigationTitle(meetName)
        .ssmInlineNavigationTitle()
        .ssmNavigationBarHidden(false)
        .task { await viewModel.load(meetID: meetID) }
        .refreshable { await viewModel.load(meetID: meetID) }
    }
}

/// Per-division results matrix: each scored distance is a column, each
/// skater's row shows the place they took in that race, with the total on the
/// end — the whole division auditable at a glance. Falls back gracefully when
/// the API sends no distances (older server): shows place + total only.
private struct ResultsMatrixCard: View {
    let title: String
    let distances: [ResultsDistance]
    let rows: [StandingRow]
    var accent: Color = SSMTheme.orange

    // Column widths: a fixed place column, a fixed total column, and each
    // distance gets an equal share of what's left. A horizontal scroll
    // guards a division with many distances on a narrow width.
    private let placeW: CGFloat = 30
    private let distW: CGFloat = 54
    private let totalW: CGFloat = 52

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 0) {
                // Coloured so a long results page reads as distinct races
                // rather than one continuous wall of names.
                Text(title)
                    .font(.ssmRounded(16, weight: .heavy))
                    .foregroundStyle(SSMTheme.publicMint)
                    .padding(.bottom, 10)

                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        headerRow
                        Divider().overlay(SSMTheme.cardBorder).padding(.vertical, 4)
                        ForEach(rows) { row in
                            matrixRow(row)
                        }
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private var headerRow: some View {
        HStack(spacing: 0) {
            Text("PL").frame(width: placeW, alignment: .center)
            Text("SKATER").frame(minWidth: 150, alignment: .leading)
            ForEach(distances) { d in
                Text(d.label).frame(width: distW, alignment: .center).lineLimit(1)
            }
            Text("TOTAL").frame(width: totalW, alignment: .trailing)
        }
        .font(.caption2.weight(.heavy))
        .foregroundStyle(SSMTheme.muted)
    }

    private func matrixRow(_ row: StandingRow) -> some View {
        HStack(spacing: 0) {
            Text("\(row.place)")
                .font(.subheadline.bold())
                .foregroundStyle(accent)
                .frame(width: placeW, alignment: .center)

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 5) {
                    Text(row.skaterName).font(.subheadline.bold()).foregroundStyle(SSMTheme.textPrimary)
                    if row.runoffNeeded == true {
                        Text("RUN-OFF").font(.system(size: 9, weight: .heavy)).foregroundStyle(SSMTheme.danger)
                    } else if row.tiebreakerUsed == true {
                        Text("TB").font(.system(size: 9, weight: .heavy)).foregroundStyle(SSMTheme.sky2)
                    }
                }
                Text(row.team).font(.caption2).foregroundStyle(SSMTheme.muted).lineLimit(1)
            }
            .frame(minWidth: 150, alignment: .leading)

            ForEach(distances) { d in
                Text(row.place(inRace: d.raceId).map(String.init) ?? "—")
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(row.place(inRace: d.raceId) == nil ? SSMTheme.muted : SSMTheme.textPrimary)
                    .frame(width: distW, alignment: .center)
            }

            Text(formattedPoints(row.totalPoints))
                .font(.subheadline.bold())
                .monospacedDigit()
                .foregroundStyle(SSMTheme.textPrimary)
                .frame(width: totalW, alignment: .trailing)
        }
        .padding(.vertical, 7)
    }

    private func formattedPoints(_ value: Double) -> String {
        value.rounded() == value ? "\(Int(value))" : String(format: "%.1f", value)
    }
}

private struct OpenResultsSectionCard: View {
    let section: OpenResultsSection

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(section.groupLabel) — \(section.distanceLabel)")
                    .font(.ssmRounded(16, weight: .heavy))
                    .foregroundStyle(SSMTheme.publicMint)
                ForEach(section.results) { row in
                    HStack {
                        Text(row.place ?? "—").font(.headline).foregroundStyle(SSMTheme.orange).frame(width: 28, alignment: .leading)
                        Text(row.skaterName).font(.subheadline)
                        Spacer()
                        Text(row.team).font(.caption).foregroundStyle(SSMTheme.muted)
                    }
                }
            }
        }
        .padding(.horizontal)
    }
}
