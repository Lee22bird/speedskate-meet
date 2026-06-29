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
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SSMHomeHeader()

                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Find a Meet")
                                .font(.ssmRounded(30, weight: .heavy))
                                .foregroundStyle(.white)
                            Spacer()
                            NotificationBellButton()
                        }

                        SSMSearchField(text: $viewModel.searchText) {
                            Task { await viewModel.load() }
                        }

                        MeetFilterChipsRow(selected: $viewModel.selectedFilter) {
                            Task { await viewModel.load() }
                        }
                    }
                    .padding(.horizontal)

                    if viewModel.isLoading && viewModel.meets.isEmpty {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let error = viewModel.errorMessage {
                        ContentUnavailableFallback(text: error)
                    } else if viewModel.meets.isEmpty {
                        ContentUnavailableFallback(text: "No public meets yet.")
                            .padding(.top, 40)
                    } else {
                        if let live = viewModel.liveMeet {
                            NavigationLink(value: live) {
                                LiveMeetHeroCard(meet: live)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal)
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Label("Upcoming Meets", systemImage: "calendar")
                                    .font(.ssmRounded(18, weight: .bold))
                                    .foregroundStyle(.white)
                                Spacer()
                                Text("View All")
                                    .font(.ssmRounded(14, weight: .semibold))
                                    .foregroundStyle(SSMTheme.sky)
                            }
                            .padding(.horizontal)

                            VStack(spacing: 12) {
                                ForEach(viewModel.upcomingMeets) { meet in
                                    NavigationLink(value: meet) {
                                        UpcomingMeetRow(meet: meet)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
                .padding(.top, 8)
                .padding(.bottom, 80)
            }
            .scrollIndicators(.hidden)
            .background(SSMTheme.pageBackground)
            .ssmNavigationBarHidden(true)
            .navigationDestination(for: MeetSummary.self) { meet in
                MeetDetailView(meet: meet)
            }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}

private struct SSMHomeHeader: View {
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            SpeedStreaksBackground()
            HStack(spacing: 2) {
                Text("SSM").font(.system(size: 26, weight: .black, design: .rounded).italic())
                Text("SPEED SKATE MEET").font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(SSMTheme.orange)
                    .baselineOffset(-8)
            }
            .foregroundStyle(.white)
            .padding(16)
        }
        .frame(height: 90)
    }
}

private struct NotificationBellButton: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: "bell.fill")
                .font(.system(size: 18))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(SSMTheme.cardBackgroundLight, in: Circle())
            Circle().fill(SSMTheme.orange).frame(width: 8, height: 8)
        }
    }
}

private struct SSMSearchField: View {
    @Binding var text: String
    let onSubmit: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(SSMTheme.muted)
            TextField("Search meets by name, city, state, rink…", text: $text)
                .foregroundStyle(.white)
                .ssmNoAutocapitalization()
                .autocorrectionDisabled()
                .onSubmit(onSubmit)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(SSMTheme.cardBackgroundLight, in: SSMTheme.pillShape)
    }
}

private struct MeetFilterChipsRow: View {
    @Binding var selected: MeetFilterChip
    let onChange: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MeetFilterChip.allCases) { chip in
                    Button {
                        selected = chip
                        onChange()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: chip.icon)
                            Text(chip.rawValue)
                        }
                        .font(.ssmRounded(13, weight: .bold))
                        .foregroundStyle(selected == chip ? .white : SSMTheme.muted)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(
                            selected == chip ? SSMTheme.skyGradient : LinearGradient(colors: [SSMTheme.cardBackgroundLight, SSMTheme.cardBackgroundLight], startPoint: .top, endPoint: .bottom),
                            in: SSMTheme.pillShape
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct LiveMeetHeroCard: View {
    let meet: MeetSummary

    var body: some View {
        ZStack {
            SpeedStreaksBackground()
            VStack(alignment: .leading, spacing: 14) {
                LiveBadge()
                Text(meet.meetName)
                    .font(.ssmRounded(26, weight: .heavy))
                    .foregroundStyle(.white)
                Text("\(meet.raceCount) Races • \(meet.registrationCount) Registered")
                    .font(.ssmRounded(15, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))

                Label("Watch Live", systemImage: "play.fill")
                    .font(.ssmRounded(17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(SSMTheme.skyGradient, in: SSMTheme.pillShape)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 230)
        .clipShape(RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous).strokeBorder(SSMTheme.sky.opacity(0.4), lineWidth: 1.5))
        .shadow(color: .black.opacity(0.4), radius: 16, x: 0, y: 8)
    }
}

private struct UpcomingMeetRow: View {
    let meet: MeetSummary

    var body: some View {
        SSMCard {
            HStack(spacing: 14) {
                Text(meet.initials)
                    .font(.ssmRounded(15, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(SSMTheme.orangeGradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(meet.meetName)
                        .font(.ssmRounded(16, weight: .bold))
                        .foregroundStyle(.white)
                    if !meet.dateRangeLabel.isEmpty {
                        Label(meet.dateRangeLabel, systemImage: "calendar")
                            .font(.caption)
                            .foregroundStyle(SSMTheme.muted)
                    }
                    if !meet.location.isEmpty {
                        Label(meet.location, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .foregroundStyle(SSMTheme.muted)
                    }
                    Text("\(meet.registrationCount) Registered • \(meet.raceCount) Races")
                        .font(.caption2)
                        .foregroundStyle(SSMTheme.sky2)
                }

                Spacer(minLength: 4)

                VStack(spacing: 8) {
                    SSMChip(meet.status.capitalized, color: SSMTheme.sky2)
                    Image(systemName: "chevron.right").foregroundStyle(SSMTheme.muted)
                }
            }
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
        .ssmNavigationBarHidden(false)
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
