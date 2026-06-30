import SwiftUI

public struct RootTabView: View {
    @StateObject private var auth = AuthViewModel()
    @State private var selectedTab: SSMTab = .meets

    public init() {}

    public var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch selectedTab {
                case .meets: MeetsListView()
                case .live: LiveTabRootView()
                case .results: ResultsTabRootView()
                case .staff: StaffTabRootView().environmentObject(auth)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            SSMFloatingTabBar(selectedTab: $selectedTab)
        }
        .background(SSMTheme.pageBackground)
        .preferredColorScheme(.dark)
        .tint(SSMTheme.orange)
        .environmentObject(auth)
        .task { await auth.refreshSession() }
    }
}

public enum SSMTab: CaseIterable {
    case meets, live, results, staff

    var title: String {
        switch self {
        case .meets: return "Meets"
        case .live: return "Live"
        case .results: return "Results"
        case .staff: return "Staff"
        }
    }

    var icon: String {
        switch self {
        case .meets: return "magnifyingglass"
        case .live: return "dot.radiowaves.left.and.right"
        case .results: return "list.number"
        case .staff: return "person.badge.shield.checkmark"
        }
    }
}

/// The dark floating pill nav bar from the approved mockup — replaces the
/// system tab bar chrome entirely.
struct SSMFloatingTabBar: View {
    @Binding var selectedTab: SSMTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(SSMTab.allCases, id: \.self) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 19, weight: .semibold))
                        Text(tab.title)
                            .font(.ssmRounded(11, weight: .bold))
                    }
                    .foregroundStyle(selectedTab == tab ? SSMTheme.orange : SSMTheme.muted)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity)
                    .background(
                        selectedTab == tab ? SSMTheme.orange.opacity(0.12) : Color.clear,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 10)
        .background(
            SSMTheme.pillShape
                .fill(SSMTheme.cardBackground)
                .overlay(SSMTheme.pillShape.strokeBorder(SSMTheme.cardBorder, lineWidth: 1))
                .shadow(color: .black.opacity(0.5), radius: 16, x: 0, y: 8)
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }
}

/// "Live" tab: pick a meet first (any public meet), then view its Live Race
/// Day / Live Board.
private struct LiveTabRootView: View {
    @StateObject private var viewModel = MeetsListViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SSMHeader(title: "Live")

                Group {
                    if viewModel.isLoading && viewModel.meets.isEmpty {
                        ProgressView()
                    } else if viewModel.meets.isEmpty {
                        ContentUnavailableFallback(text: "No live meets right now.")
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
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(SSMTheme.pageBackground)
            .ssmNavigationBarHidden(true)
            .navigationDestination(for: MeetSummary.self) { meet in
                LiveRaceDayView(meetID: meet.id.stringValue, meetName: meet.meetName)
            }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}

private struct ResultsTabRootView: View {
    @StateObject private var viewModel = MeetsListViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SSMHeader(title: "Results")

                Group {
                    if viewModel.isLoading && viewModel.meets.isEmpty {
                        ProgressView()
                    } else if viewModel.meets.isEmpty {
                        ContentUnavailableFallback(text: "No meets found.")
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
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(SSMTheme.pageBackground)
            .ssmNavigationBarHidden(true)
            .navigationDestination(for: MeetSummary.self) { meet in
                ResultsView(meetID: meet.id.stringValue, meetName: meet.meetName)
            }
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}

struct ContentUnavailableFallback: View {
    let text: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundStyle(SSMTheme.muted)
            Text(text)
                .foregroundStyle(SSMTheme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
    }
}
