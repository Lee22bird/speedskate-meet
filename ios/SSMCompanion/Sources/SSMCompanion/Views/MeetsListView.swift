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
                VStack(alignment: .leading, spacing: 20) {
                    SSMHeader()

                    VStack(alignment: .leading, spacing: 12) {
                        SearchBar(text: $viewModel.searchText)

                        MeetFilterChipsRow(selected: $viewModel.selectedFilter)
                    }
                    .padding(.horizontal)

                    if viewModel.isLoading && viewModel.meets.isEmpty {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let error = viewModel.errorMessage {
                        ContentUnavailableFallback(text: error)
                    } else if viewModel.filteredMeets.isEmpty {
                        ContentUnavailableFallback(text: "No meets match those filters.")
                            .padding(.top, 40)
                    } else {
                        if let live = viewModel.liveMeet {
                            NavigationLink(value: live) {
                                LiveNowCard(meet: live)
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
                                        MeetCard(meet: meet)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
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

public struct SSMHeader: View {
    public init() {}

    public var body: some View {
        ZStack(alignment: .bottomLeading) {
            Image("SSMIOSHero", bundle: .module)
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity, minHeight: 178, maxHeight: 178)
                .clipped()
            LinearGradient(
                colors: [.clear, .clear, SSMTheme.pageBackground.opacity(0.92)],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)

            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .top) {
                    Spacer()
                    NotificationBellButton()
                }

                Text("Find a Meet")
                    .font(.ssmRounded(36, weight: .heavy))
                    .foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)
        }
        .frame(minHeight: 178)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Speed Skate Meet. Find a Meet.")
    }
}

private struct NotificationBellButton: View {
    var body: some View {
        Button(action: {}) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(.black.opacity(0.24), in: Circle())
                    .overlay(Circle().strokeBorder(.white.opacity(0.15), lineWidth: 1))
                Circle()
                    .fill(SSMTheme.orange)
                    .frame(width: 10, height: 10)
                    .overlay(Circle().strokeBorder(SSMTheme.pageBackground, lineWidth: 2))
                    .offset(x: -1, y: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Notifications")
    }
}

public struct SearchBar: View {
    @Binding var text: String
    public init(text: Binding<String>) { _text = text }

    public var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
            TextField("Search meets by name, city, state, rink…", text: $text)
                .foregroundStyle(.white)
                .ssmNoAutocapitalization()
                .autocorrectionDisabled()

            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(SSMTheme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 18)
        .frame(minHeight: 56)
        .background(.black.opacity(0.24), in: SSMTheme.pillShape)
        .overlay(SSMTheme.pillShape.strokeBorder(.white.opacity(0.13), lineWidth: 1))
    }
}

private struct MeetFilterChipsRow: View {
    @Binding var selected: MeetFilterChip

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MeetFilterChip.allCases) { chip in
                    FilterChip(chip: chip, isSelected: selected == chip) {
                        withAnimation(.easeOut(duration: 0.18)) { selected = chip }
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }
}

public struct FilterChip: View {
    let chip: MeetFilterChip
    let isSelected: Bool
    let action: () -> Void

    public init(chip: MeetFilterChip, isSelected: Bool, action: @escaping () -> Void) {
        self.chip = chip
        self.isSelected = isSelected
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if isSelected { Image(systemName: chip.icon) }
                Text(chip.rawValue)
            }
            .font(.ssmRounded(14, weight: .semibold))
            .foregroundStyle(isSelected ? .white : SSMTheme.muted)
            .padding(.horizontal, 16)
            .frame(minHeight: 42)
            .background(isSelected ? SSMTheme.skyGradient : SSMTheme.inactiveChipGradient, in: SSMTheme.pillShape)
            .overlay(SSMTheme.pillShape.strokeBorder(isSelected ? SSMTheme.orange.opacity(0.8) : .white.opacity(0.1), lineWidth: 1))
            .shadow(color: isSelected ? SSMTheme.sky.opacity(0.24) : .clear, radius: 8)
        }
        .buttonStyle(.plain)
    }
}

public struct LiveNowCard: View {
    let meet: MeetSummary
    @StateObject private var liveViewModel = LiveRaceDayViewModel()

    public init(meet: MeetSummary) { self.meet = meet }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            SpeedStreaksBackground()
            LinearGradient(colors: [.black.opacity(0.08), .black.opacity(0.72)], startPoint: .topTrailing, endPoint: .bottomLeading)

            VStack(alignment: .leading, spacing: 13) {
                LiveBadge()
                Text(meet.meetName)
                    .font(.ssmRounded(26, weight: .heavy))
                    .foregroundStyle(.white)

                if let live = liveViewModel.data {
                    Text("Race \(min(live.progress.completed + 1, live.progress.total)) of \(live.progress.total)")
                        .font(.ssmRounded(18, weight: .bold))
                        .foregroundStyle(.white)

                    HStack(alignment: .top, spacing: 14) {
                        RacePreview(label: "CURRENT", name: live.current?.groupLabel ?? "Between races", color: SSMTheme.sky)
                        Divider().overlay(.white.opacity(0.16))
                        RacePreview(label: "NEXT", name: live.next?.groupLabel ?? live.coming.first?.groupLabel ?? "Schedule complete", color: SSMTheme.orange)
                    }
                    .frame(minHeight: 48)
                } else {
                    Text("\(meet.raceCount) Races • \(meet.registrationCount) Registered")
                        .font(.ssmRounded(15, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.82))
                }

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
        .clipShape(RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous).strokeBorder(SSMTheme.sky.opacity(0.4), lineWidth: 1.5))
        .shadow(color: .black.opacity(0.4), radius: 16, x: 0, y: 8)
        .task { await liveViewModel.load(meetID: meet.id.stringValue) }
    }
}

private struct RacePreview: View {
    let label: String
    let name: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(color)
            Text(name)
                .font(.ssmRounded(16, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

public struct MeetCard: View {
    let meet: MeetSummary
    public init(meet: MeetSummary) { self.meet = meet }

    public var body: some View {
        SSMCard {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(SSMTheme.navyGradient)
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(SSMTheme.sky.opacity(0.24), lineWidth: 1)
                    Text(meet.initials)
                        .font(.ssmRounded(16, weight: .heavy))
                        .foregroundStyle(.white)
                }
                .frame(width: 58, height: 58)

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
                    HStack(spacing: 0) {
                        Text("\(meet.registrationCount) Registered")
                            .foregroundStyle(SSMTheme.sky2)
                        Text(" • \(meet.raceCount) Races")
                            .foregroundStyle(SSMTheme.muted)
                    }
                    .font(.caption2)
                }

                Spacer(minLength: 4)

                VStack(spacing: 8) {
                    SSMChip(meet.status.capitalized, color: meet.isLiveNow ? SSMTheme.good : SSMTheme.sky2)
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
