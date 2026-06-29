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
                        ResultsSectionCard(title: "\(section.groupLabel) — \(section.division.capitalized)", rows: section.standings)
                    }
                    ForEach(data.quad) { section in
                        ResultsSectionCard(title: "\(section.groupLabel) — \(section.distanceLabel)", rows: section.standings, accent: SSMTheme.sky2)
                    }
                    ForEach(data.open) { section in
                        OpenResultsSectionCard(section: section)
                    }
                }
            }
            .padding(.vertical)
            .padding(.bottom, 70)
        }
        .background(SSMTheme.pageBackground)
        .navigationTitle(meetName)
        .ssmInlineNavigationTitle()
        .task { await viewModel.load(meetID: meetID) }
        .refreshable { await viewModel.load(meetID: meetID) }
    }
}

private struct ResultsSectionCard: View {
    let title: String
    let rows: [StandingRow]
    var accent: Color = SSMTheme.orange

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(title).font(.headline).foregroundStyle(SSMTheme.textPrimary)
                ForEach(rows) { row in
                    HStack {
                        Text("\(row.place)")
                            .font(.headline)
                            .foregroundStyle(accent)
                            .frame(width: 28, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.skaterName).font(.subheadline.bold())
                            Text(row.team).font(.caption).foregroundStyle(SSMTheme.muted)
                        }
                        Spacer()
                        Text(formattedPoints(row.totalPoints))
                            .font(.subheadline.bold())
                            .foregroundStyle(SSMTheme.textPrimary)
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private func formattedPoints(_ value: Double) -> String {
        value.rounded() == value ? "\(Int(value)) pts" : String(format: "%.1f pts", value)
    }
}

private struct OpenResultsSectionCard: View {
    let section: OpenResultsSection

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(section.groupLabel) — \(section.distanceLabel)").font(.headline).foregroundStyle(SSMTheme.textPrimary)
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
