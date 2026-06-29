import SwiftUI

public struct RootTabView: View {
    @StateObject private var auth = AuthViewModel()

    public init() {}

    public var body: some View {
        TabView {
            MeetsListView()
                .tabItem { Label("Meets", systemImage: "magnifyingglass") }

            LiveTabRootView()
                .tabItem { Label("Live", systemImage: "dot.radiowaves.left.and.right") }

            ResultsTabRootView()
                .tabItem { Label("Results", systemImage: "list.number") }

            StaffTabRootView()
                .tabItem { Label("Staff", systemImage: "person.badge.shield.checkmark") }
                .environmentObject(auth)
        }
        .tint(SSMTheme.orange)
        .environmentObject(auth)
        .task { await auth.refreshSession() }
    }
}

/// "Live" tab: pick a meet first (any public meet), then view its Live Race
/// Day / Live Board.
private struct LiveTabRootView: View {
    @StateObject private var viewModel = MeetsListViewModel()

    var body: some View {
        NavigationStack {
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
                    }
                    .listStyle(.plain)
                }
            }
            .navigationDestination(for: MeetSummary.self) { meet in
                LiveRaceDayView(meetID: meet.id.stringValue, meetName: meet.meetName)
            }
            .navigationTitle("Live")
            .task { await viewModel.load() }
            .refreshable { await viewModel.load() }
        }
    }
}

private struct ResultsTabRootView: View {
    @StateObject private var viewModel = MeetsListViewModel()

    var body: some View {
        NavigationStack {
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
                    }
                    .listStyle(.plain)
                }
            }
            .navigationDestination(for: MeetSummary.self) { meet in
                ResultsView(meetID: meet.id.stringValue, meetName: meet.meetName)
            }
            .navigationTitle("Results")
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
    }
}
