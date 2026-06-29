import SwiftUI

struct MeetRow: View {
    let meet: MeetSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(meet.meetName)
                    .font(.headline)
                    .foregroundStyle(SSMTheme.navy)
                Spacer()
                SSMChip(meet.status.capitalized, color: meet.status == "live" ? SSMTheme.good : SSMTheme.sky2)
            }
            if !meet.date.isEmpty {
                Text(meet.date)
                    .font(.subheadline)
                    .foregroundStyle(SSMTheme.muted)
            }
            if !meet.location.isEmpty {
                Text(meet.location)
                    .font(.caption)
                    .foregroundStyle(SSMTheme.muted)
            }
        }
        .padding(.vertical, 4)
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
                    }
                    .listStyle(.plain)
                }
            }
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
                SSMCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(meet.meetName)
                            .font(.title2.bold())
                            .foregroundStyle(SSMTheme.navy)
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
                    ActionRow(title: "Live Race Day", icon: "dot.radiowaves.left.and.right", color: SSMTheme.orange)
                }

                NavigationLink {
                    ResultsView(meetID: meet.id.stringValue, meetName: meet.meetName)
                } label: {
                    ActionRow(title: "Results", icon: "list.number", color: SSMTheme.sky2)
                }
            }
            .padding()
        }
        .background(SSMTheme.pageBackground)
        .navigationTitle("Meet")
        .ssmInlineNavigationTitle()
    }
}

struct ActionRow: View {
    let title: String
    let icon: String
    let color: Color

    var body: some View {
        HStack {
            Image(systemName: icon)
                .font(.title3)
            Text(title)
                .font(.headline)
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.white.opacity(0.7))
        }
        .foregroundStyle(.white)
        .padding()
        .background(color)
        .cornerRadius(SSMTheme.cornerRadius)
    }
}
