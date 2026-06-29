import SwiftUI

struct MeetRow: View {
    let meet: MeetSummary

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(meet.meetName)
                        .font(.ssmRounded(18, weight: .bold))
                        .foregroundStyle(SSMTheme.textPrimary)
                    Spacer()
                    SSMChip(meet.status.capitalized, color: meet.status == "live" ? SSMTheme.good : SSMTheme.sky2)
                }
                if !meet.date.isEmpty {
                    Text(meet.date)
                        .font(.ssmRounded(14, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                if !meet.location.isEmpty {
                    Text(meet.location)
                        .font(.caption)
                        .foregroundStyle(SSMTheme.muted)
                }
            }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
    }
}

public struct MeetsListView: View {
    @StateObject private var viewModel = MeetsListViewModel()

    public init() {}

    public var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.meets.isEmpty {
                    ProgressView()
                } else if let error = viewModel.errorMessage {
                    ContentUnavailableFallback(text: error)
                } else if viewModel.meets.isEmpty {
                    ContentUnavailableFallback(text: "No public meets yet.")
                } else {
                    List(viewModel.meets) { meet in
                        NavigationLink(value: meet) {
                            MeetRow(meet: meet)
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .scrollIndicators(.hidden)
                    .safeAreaPadding(.bottom, 70)
                    .background(SSMTheme.pageBackground)
                }
            }
            .background(SSMTheme.pageBackground)
            .navigationDestination(for: MeetSummary.self) { meet in
                MeetDetailView(meet: meet)
            }
            .navigationTitle("Find a Meet")
            .searchable(text: $viewModel.searchText, prompt: "Meet name, city, state, rink…")
            .onSubmit(of: .search) { Task { await viewModel.load() } }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}

public struct MeetDetailView: View {
    let meet: MeetSummary

    public init(meet: MeetSummary) { self.meet = meet }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ZStack(alignment: .bottomLeading) {
                    SpeedStreaksBackground()
                    Text(meet.meetName.uppercased())
                        .font(.system(size: 30, weight: .black, design: .rounded).italic())
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                        .padding(18)
                        .shadow(color: .black.opacity(0.4), radius: 6, x: 0, y: 2)
                }
                .frame(height: 130)
                .clipShape(RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))

                SSMCard {
                    VStack(alignment: .leading, spacing: 8) {
                        if !meet.date.isEmpty {
                            Label(meet.date, systemImage: "calendar")
                                .font(.subheadline)
                                .foregroundStyle(SSMTheme.muted)
                        }
                        if !meet.location.isEmpty {
                            Label(meet.location, systemImage: "mappin.and.ellipse")
                                .font(.subheadline)
                                .foregroundStyle(SSMTheme.muted)
                        }
                        HStack {
                            SSMChip(meet.status.capitalized, color: SSMTheme.sky2)
                            SSMChip("\(meet.raceCount) Races", color: SSMTheme.navy2)
                            SSMChip("\(meet.registrationCount) Skaters", color: SSMTheme.navy2)
                        }
                    }
                }

                NavigationLink {
                    LiveRaceDayView(meetID: meet.id.stringValue, meetName: meet.meetName)
                } label: {
                    ActionRow(title: "Live Race Day", icon: "dot.radiowaves.left.and.right", gradient: SSMTheme.orangeGradient)
                }
                .buttonStyle(.plain)

                NavigationLink {
                    ResultsView(meetID: meet.id.stringValue, meetName: meet.meetName)
                } label: {
                    ActionRow(title: "Results", icon: "list.number", gradient: SSMTheme.skyGradient)
                }
                .buttonStyle(.plain)
            }
            .padding()
            .padding(.bottom, 70)
        }
        .background(SSMTheme.pageBackground)
        .navigationTitle("Meet")
        .ssmInlineNavigationTitle()
    }
}

struct ActionRow: View {
    let title: String
    let icon: String
    let gradient: LinearGradient

    var body: some View {
        HStack {
            Image(systemName: icon)
                .font(.title2)
            Text(title)
                .font(.ssmRounded(18, weight: .bold))
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.white.opacity(0.7))
        }
        .foregroundStyle(.white)
        .padding(18)
        .background(gradient, in: RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 4)
    }
}
