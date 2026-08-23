import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Row used by the Live and Results tabs. Same calm treatment as the Meets tab:
/// friendly dates, and a badge only when there's actually something happening.
struct MeetRow: View {
    let meet: MeetSummary

    var body: some View {
        SSMBubbleCard(tint: meet.isLiveNow ? SSMTheme.publicMint : nil) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline) {
                    Text(meet.meetName)
                        .font(.ssmRounded(18, weight: .bold))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    if meet.isLiveNow {
                        SSMChip("Live now", color: SSMTheme.publicMint)
                    }
                }
                if !meet.date.isEmpty {
                    Text(FriendlyDate.label(meet.date))
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.publicSky)
                }
                if !meet.location.isEmpty {
                    Text(meet.location)
                        .font(.caption)
                        .foregroundStyle(SSMTheme.muted)
                        .lineLimit(1)
                }
            }
        }
        #if !os(tvOS)
        .listRowSeparator(.hidden) // tvOS List rows have no separators to hide
        #endif
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
                    SSMHeader(title: "Find a Meet", subtitle: "Live races, results, and what's coming up.")

                    VStack(alignment: .leading, spacing: 12) {
                        SearchBar(text: $viewModel.searchText)

                        MeetFilterChipsRow(selected: $viewModel.selectedFilter)
                    }
                    .padding(.horizontal)

                    if viewModel.selectedFilter == .nationals, let featured = viewModel.featuredSchedule {
                        NavigationLink { NationalsScheduleView(featured: featured) } label: {
                            NationalsScheduleBanner(featured: featured)
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal)
                    }

                    if viewModel.isLoading && viewModel.meets.isEmpty {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let error = viewModel.errorMessage {
                        ContentUnavailableFallback(text: error)
                    } else if viewModel.filteredMeets.isEmpty {
                        // When the Nationals banner is showing it's the content,
                        // so skip the generic "no meets" message. Once the server
                        // stops featuring the schedule, the normal empty state
                        // returns automatically.
                        if !(viewModel.selectedFilter == .nationals && viewModel.featuredSchedule != nil) {
                            ContentUnavailableFallback(text: "Nothing here yet — try another filter.")
                                .padding(.top, 40)
                        }
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
                                Text("Coming up")
                                    .font(.ssmRounded(20, weight: .heavy))
                                    .foregroundStyle(.white)
                                Spacer()
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
            .background(SSMTheme.publicBackground)
            .ssmNavigationBarHidden(true)
            .navigationDestination(for: MeetSummary.self) { meet in
                MeetDetailView(meet: meet)
            }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}

/// Calm solid header for the public tabs — a soft navy panel with big rounded
/// bottom corners, no streak artwork (see the SSM design direction).
public struct SSMHeader: View {
    private let title: String
    private let subtitle: String?

    public init(title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SPEED SKATE MEET")
                .font(.ssmRounded(11, weight: .heavy))
                .tracking(1.6)
                .foregroundStyle(SSMTheme.publicSky.opacity(0.85))
            Text(title)
                .font(.ssmRounded(34, weight: .heavy))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle)
                    .font(.ssmRounded(14, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 22)
        .padding(.top, 22)
        .padding(.bottom, 26)
        .background(
            UnevenRoundedRectangle(
                bottomLeadingRadius: 34, bottomTrailingRadius: 34, style: .continuous
            )
            .fill(SSMTheme.publicCard)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Speed Skate Meet. \(title).")
    }
}

/// Turns the server's ISO dates ("2026-10-31", or a range) into something a
/// parent would actually read: "Sat, Oct 31" — this year's dates drop the year.
enum FriendlyDate {
    private static let iso: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); return f
    }()

    static func label(_ raw: String) -> String {
        let parts = raw.components(separatedBy: " to ").map { $0.trimmingCharacters(in: .whitespaces) }
        let formatted = parts.map(one)
        if formatted.count == 2, formatted[0] != formatted[1] {
            return "\(formatted[0]) – \(formatted[1])"
        }
        return formatted.first ?? raw
    }

    private static func one(_ raw: String) -> String {
        guard let date = iso.date(from: raw) else { return raw }
        let cal = Calendar.current
        let out = DateFormatter()
        out.locale = .current
        out.setLocalizedDateFormatFromTemplate(
            cal.component(.year, from: date) == cal.component(.year, from: Date()) ? "EEEMMMd" : "MMMdyyyy"
        )
        return out.string(from: date)
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
        .padding(.horizontal, 20)
        .frame(minHeight: 54)
        .background(SSMTheme.publicCardSoft, in: SSMTheme.pillShape)
        .overlay(SSMTheme.pillShape.strokeBorder(SSMTheme.publicBorder, lineWidth: 1))
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
            .foregroundStyle(isSelected ? SSMTheme.publicBackground : SSMTheme.muted)
            .padding(.horizontal, 18)
            .frame(minHeight: 42)
            .background(isSelected ? SSMTheme.publicSky : SSMTheme.publicCardSoft, in: SSMTheme.pillShape)
            .overlay(SSMTheme.pillShape.strokeBorder(isSelected ? .clear : SSMTheme.publicBorder, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

public struct LiveNowCard: View {
    let meet: MeetSummary
    @StateObject private var liveViewModel = LiveRaceDayViewModel()

    public init(meet: MeetSummary) { self.meet = meet }

    public var body: some View {
        SSMBubbleCard(tint: SSMTheme.publicMint) {
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
                        RacePreview(label: "CURRENT", name: live.current?.groupLabel ?? "Between races", color: SSMTheme.publicMint)
                        Divider().overlay(SSMTheme.publicBorder)
                        RacePreview(label: "NEXT", name: live.next?.groupLabel ?? live.coming.first?.groupLabel ?? "Schedule complete", color: SSMTheme.publicPeach)
                    }
                    .frame(minHeight: 48)
                } else {
                    Text("\(meet.raceCount) Races • \(meet.registrationCount) Registered")
                        .font(.ssmRounded(15, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.82))
                }

                Label("Watch Live", systemImage: "play.fill")
                    .font(.ssmRounded(17, weight: .bold))
                    .foregroundStyle(SSMTheme.publicBackground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(SSMTheme.publicMint, in: SSMTheme.pillShape)
            }
        }
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
        SSMBubbleCard {
            HStack(spacing: 14) {
                DefaultMeetArtwork(initials: meet.initials)

                VStack(alignment: .leading, spacing: 4) {
                    // Only LIVE earns a badge — a "Published" chip on every card
                    // is noise to someone just looking for their kid's meet.
                    if meet.isLiveNow {
                        SSMChip("Live now", color: SSMTheme.publicMint)
                    }
                    Text(meet.meetName)
                        .font(.ssmRounded(17, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    if !meet.dateRangeLabel.isEmpty {
                        Text(FriendlyDate.label(meet.dateRangeLabel))
                            .font(.ssmRounded(13, weight: .semibold))
                            .foregroundStyle(SSMTheme.publicSky)
                            .lineLimit(1)
                    }
                    if !meet.location.isEmpty {
                        Text(meet.location)
                            .font(.caption)
                            .foregroundStyle(SSMTheme.muted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    if let counts = meet.countsLabel {
                        Text(counts)
                            .font(.caption2)
                            .foregroundStyle(SSMTheme.muted.opacity(0.85))
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(SSMTheme.muted.opacity(0.6))
            }
        }
    }
}

private struct DefaultMeetArtwork: View {
    let initials: String

    var body: some View {
        Text(initials)
            .font(.ssmRounded(17, weight: .heavy))
            .foregroundStyle(SSMTheme.publicSky)
            .frame(width: 58, height: 58)
            .background(SSMTheme.publicCardSoft,
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(SSMTheme.publicSky.opacity(0.18), lineWidth: 1)
            )
            .accessibilityHidden(true)
    }
}

private struct SSMHeroArtwork: View {
    var body: some View {
        Group {
            #if canImport(UIKit)
            if let url = Bundle.module.url(forResource: "SSMIOSHero", withExtension: "png"),
               let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image).resizable()
            } else {
                SpeedStreaksBackground()
            }
            #elseif canImport(AppKit)
            if let url = Bundle.module.url(forResource: "SSMIOSHero", withExtension: "png"),
               let image = NSImage(contentsOf: url) {
                Image(nsImage: image).resizable()
            } else {
                SpeedStreaksBackground()
            }
            #else
            SpeedStreaksBackground()
            #endif
        }
    }
}

public struct MeetDetailView: View {
    let meet: MeetSummary

    public init(meet: MeetSummary) { self.meet = meet }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(meet.meetName)
                        .font(.ssmRounded(28, weight: .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.7)
                    if !meet.dateRangeLabel.isEmpty {
                        Text(meet.dateRangeLabel)
                            .font(.ssmRounded(14, weight: .semibold))
                            .foregroundStyle(SSMTheme.publicSky)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(22)
                .background(SSMTheme.publicCard,
                            in: RoundedRectangle(cornerRadius: SSMTheme.bubbleRadius, style: .continuous))

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
