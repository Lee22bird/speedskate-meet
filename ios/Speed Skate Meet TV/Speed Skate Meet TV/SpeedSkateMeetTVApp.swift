import SwiftUI
import SSMCompanion

// Apple TV "Live Board" — a 10-foot, read-only companion to Speed Skate Meet.
// Pick a meet, then the TV shows the race that's running right now (lanes,
// places, times) and the last few finishes, auto-refreshing on its own. It
// reuses the same public live API and models as the iPhone/iPad app
// (SSMCompanion package) — no server changes, no auth (public live data only).

@main
struct SpeedSkateMeetTVApp: App {
    init() {
        // Local-testing override: set SSM_BASE_URL in the scheme's environment
        // to aim the TV at a dev server. Ships pointed at production.
        if let raw = ProcessInfo.processInfo.environment["SSM_BASE_URL"],
           let url = URL(string: raw) {
            APIClient.shared.baseURL = url
        }
    }

    var body: some Scene {
        WindowGroup {
            TVRootView()
        }
    }
}

struct TVRootView: View {
    var body: some View {
        NavigationStack {
            TVMeetPickerView()
                .navigationDestination(for: MeetSummary.self) { meet in
                    TVLiveBoardView(meet: meet)
                }
        }
    }
}

@MainActor
final class TVMeetsViewModel: ObservableObject {
    @Published var meets: [MeetSummary] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = APIClient.shared
    private var refreshTask: Task<Void, Never>?

    func load() async {
        if meets.isEmpty { isLoading = true }
        defer { isLoading = false }
        do {
            let resp = try await api.meets()
            // Live meets float to the top so the TV lands on what's happening now.
            meets = resp.meets.sorted { a, b in
                a.isLiveNow && !b.isLiveNow
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Refresh the list every 30s so a meet flipping to LIVE shows up without
    /// leaving the screen.
    func startAutoRefresh() {
        stopAutoRefresh()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if Task.isCancelled { break }
                await self?.load()
            }
        }
    }

    func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }
}

struct TVMeetPickerView: View {
    @StateObject private var vm = TVMeetsViewModel()

    private let columns = [GridItem(.adaptive(minimum: 440, maximum: 560), spacing: 44)]

    var body: some View {
        ZStack {
            SSMTheme.pageGradient.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                header

                if vm.isLoading && vm.meets.isEmpty {
                    Spacer()
                    ProgressView().scaleEffect(2).frame(maxWidth: .infinity)
                    Spacer()
                } else if let error = vm.errorMessage, vm.meets.isEmpty {
                    Spacer()
                    TVEmptyState(icon: "wifi.exclamationmark",
                                 title: "Can't reach Speed Skate Meet",
                                 subtitle: error)
                    Spacer()
                } else if vm.meets.isEmpty {
                    Spacer()
                    TVEmptyState(icon: "calendar",
                                 title: "No meets available",
                                 subtitle: "Meets appear here when they're published.")
                    Spacer()
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 44) {
                            ForEach(vm.meets) { meet in
                                NavigationLink(value: meet) {
                                    TVMeetCard(meet: meet)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 80)
                        .padding(.vertical, 40)
                    }
                }
            }
        }
        .task {
            await vm.load()
            vm.startAutoRefresh()
        }
        .onDisappear { vm.stopAutoRefresh() }
    }

    private var header: some View {
        HStack(alignment: .center) {
            HStack(spacing: 18) {
                Image(systemName: "flag.checkered.2.crossed")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundStyle(SSMTheme.orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text("SPEED SKATE MEET")
                        .font(.ssmRounded(46, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    Text("Pick a meet to watch the live race board")
                        .font(.ssmRounded(24, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 80)
        .padding(.top, 60)
    }
}

/// A big, focusable meet tile. Lifts, brightens, and shows an orange ring when
/// the Siri Remote focuses it.
struct TVMeetCard: View {
    let meet: MeetSummary
    @Environment(\.isFocused) private var isFocused

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                Text(meet.initials)
                    .font(.ssmRounded(34, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 84, height: 84)
                    .background(SSMTheme.orangeGradient, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                Spacer()
                if meet.isLiveNow {
                    LiveBadge().scaleEffect(1.35)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(meet.meetName)
                    .font(.ssmRounded(32, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Label(meet.dateRangeLabel, systemImage: "calendar")
                    .font(.ssmRounded(22, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                if !meet.location.isEmpty {
                    Label(meet.location, systemImage: "mappin.and.ellipse")
                        .font(.ssmRounded(22, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                        .lineLimit(1)
                }
            }

            Divider().overlay(SSMTheme.cardBorder)

            HStack(spacing: 26) {
                statPill("\(meet.raceCount)", "races")
                statPill("\(meet.registrationCount)", "skaters")
                Spacer()
                Image(systemName: "chevron.right.circle.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(isFocused ? SSMTheme.orange : SSMTheme.muted)
            }
        }
        .padding(30)
        .frame(height: 340, alignment: .top)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(isFocused ? SSMTheme.cardBackgroundLight : SSMTheme.cardBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(isFocused ? SSMTheme.orange : SSMTheme.cardBorder,
                              lineWidth: isFocused ? 4 : 1)
        )
        .shadow(color: .black.opacity(isFocused ? 0.55 : 0.3),
                radius: isFocused ? 30 : 12, x: 0, y: isFocused ? 18 : 8)
        .scaleEffect(isFocused ? 1.06 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isFocused)
    }

    private func statPill(_ value: String, _ label: String) -> some View {
        HStack(spacing: 6) {
            Text(value).font(.ssmRounded(24, weight: .heavy)).foregroundStyle(SSMTheme.textPrimary)
            Text(label).font(.ssmRounded(20, weight: .medium)).foregroundStyle(SSMTheme.muted)
        }
    }
}

struct TVEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: icon)
                .font(.system(size: 72, weight: .regular))
                .foregroundStyle(SSMTheme.muted)
            Text(title)
                .font(.ssmRounded(38, weight: .bold))
                .foregroundStyle(SSMTheme.textPrimary)
            Text(subtitle)
                .font(.ssmRounded(24, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 800)
        }
        .frame(maxWidth: .infinity)
    }
}
