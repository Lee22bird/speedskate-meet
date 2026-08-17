import SwiftUI

/// The iPad experience: the full SSM meet-running app. iPhone keeps the
/// companion tabs; this split view is what a director/tabulator runs a meet
/// from at the rink. Solid navy surfaces per the SSM design direction —
/// no streak artwork on these screens.
public struct PadRootView: View {
    @StateObject private var auth = AuthViewModel()
    @StateObject private var session = PadSessionViewModel()
    @StateObject private var staffMeets = StaffMeetsViewModel()
    @StateObject private var allMeets = MeetsListViewModel()
    @State private var showLogin = false

    public init() {}

    public var body: some View {
        NavigationSplitView {
            PadSidebar(showLogin: $showLogin)
                .environmentObject(auth)
                .environmentObject(session)
                .environmentObject(staffMeets)
                .environmentObject(allMeets)
        } detail: {
            PadDetailRouter()
                .environmentObject(auth)
                .environmentObject(session)
        }
        .background(SSMTheme.pageBackground)
        .preferredColorScheme(.dark)
        .tint(SSMTheme.orange)
        .sheet(isPresented: $showLogin) {
            PadLoginSheet()
                .environmentObject(auth)
        }
        .task {
            await auth.refreshSession()
            await staffMeets.load()
            await allMeets.load()
        }
        .onChange(of: auth.isLoggedIn) { _, loggedIn in
            Task {
                await staffMeets.load()
                if !loggedIn { session.clearMeet() }
            }
        }
    }
}

// ── Sidebar ──────────────────────────────────────────────────────────────

struct PadSidebar: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var session: PadSessionViewModel
    @EnvironmentObject private var staffMeets: StaffMeetsViewModel
    @EnvironmentObject private var allMeets: MeetsListViewModel
    @Binding var showLogin: Bool

    var body: some View {
        List {
            accountSection
            if session.selectedMeetID != nil {
                boardsSection
            }
            if auth.isLoggedIn {
                myMeetsSection
            }
            allMeetsSection
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(SSMTheme.pageBackground)
        .navigationTitle("Speed Skate Meet")
        .refreshable {
            await staffMeets.load()
            await allMeets.load()
        }
    }

    private var accountSection: some View {
        Section {
            if let user = auth.currentUser {
                HStack(spacing: 10) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(SSMTheme.sky)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.displayName)
                            .font(.ssmRounded(15, weight: .bold))
                            .foregroundStyle(SSMTheme.textPrimary)
                        Text(user.team.isEmpty ? user.email : user.team)
                            .font(.ssmRounded(12, weight: .medium))
                            .foregroundStyle(SSMTheme.muted)
                            .lineLimit(1)
                    }
                    Spacer()
                    Button("Log Out") {
                        auth.logout()
                    }
                    .font(.ssmRounded(12, weight: .bold))
                    .foregroundStyle(SSMTheme.muted)
                }
                .padding(.vertical, 2)
            } else {
                Button {
                    showLogin = true
                } label: {
                    Label("Staff Log In", systemImage: "person.badge.key")
                        .font(.ssmRounded(15, weight: .bold))
                        .foregroundStyle(SSMTheme.orange)
                }
            }
        }
        .listRowBackground(SSMTheme.cardBackground)
    }

    private var boardsSection: some View {
        Section {
            ForEach(PadSection.allCases.filter { $0.allowed(for: session.role, canBuildBlocks: session.canBuildBlocks) }) { section in
                Button {
                    session.selectedSection = section
                } label: {
                    HStack {
                        Label(section.title, systemImage: section.icon)
                            .font(.ssmRounded(15, weight: session.selectedSection == section ? .bold : .semibold))
                            .foregroundStyle(session.selectedSection == section ? SSMTheme.orange : SSMTheme.textPrimary)
                        Spacer()
                        if session.selectedSection == section {
                            Circle().fill(SSMTheme.orange).frame(width: 7, height: 7)
                        }
                    }
                }
            }
        } header: {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.selectedMeetName)
                    .font(.ssmRounded(13, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                if let role = session.role {
                    Text(role.displayName.uppercased())
                        .font(.ssmRounded(10, weight: .bold))
                        .foregroundStyle(SSMTheme.orange)
                } else {
                    Text("SPECTATOR")
                        .font(.ssmRounded(10, weight: .bold))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
        }
        .listRowBackground(SSMTheme.cardBackground)
    }

    private var myMeetsSection: some View {
        Section("My Meets") {
            if staffMeets.meets.isEmpty {
                Text(staffMeets.isLoading ? "Loading…" : "No assigned meets.")
                    .font(.ssmRounded(13, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
            ForEach(staffMeets.meets) { meet in
                Button {
                    Task { await session.selectMeet(id: meet.id.stringValue, name: meet.meetName) }
                } label: {
                    PadSidebarMeetRow(
                        name: meet.meetName,
                        detail: meet.date,
                        badge: meet.role.displayName,
                        isLive: meet.status.lowercased() == "live",
                        isSelected: session.selectedMeetID == meet.id.stringValue
                    )
                }
            }
        }
        .listRowBackground(SSMTheme.cardBackground)
    }

    private var allMeetsSection: some View {
        Section("All Meets") {
            ForEach(allMeets.meets) { meet in
                Button {
                    Task { await session.selectMeet(id: meet.id.stringValue, name: meet.meetName) }
                } label: {
                    PadSidebarMeetRow(
                        name: meet.meetName,
                        detail: "\(meet.date) · \(meet.location)",
                        badge: nil,
                        isLive: meet.isLiveNow,
                        isSelected: session.selectedMeetID == meet.id.stringValue
                    )
                }
            }
        }
        .listRowBackground(SSMTheme.cardBackground)
    }
}

struct PadSidebarMeetRow: View {
    let name: String
    let detail: String
    let badge: String?
    let isLive: Bool
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.ssmRounded(14, weight: isSelected ? .heavy : .semibold))
                    .foregroundStyle(isSelected ? SSMTheme.orange : SSMTheme.textPrimary)
                    .lineLimit(1)
                Text(detail)
                    .font(.ssmRounded(11, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                    .lineLimit(1)
            }
            Spacer()
            if isLive {
                LiveBadge()
            } else if let badge {
                SSMChip(badge, color: SSMTheme.sky)
            }
        }
        .padding(.vertical, 2)
    }
}

// ── Detail router ────────────────────────────────────────────────────────

struct PadDetailRouter: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var session: PadSessionViewModel

    var body: some View {
        Group {
            if let meetID = session.selectedMeetID {
                switch session.selectedSection {
                case .director:
                    PadDirectorView()
                case .blockBuilder:
                    // .id(meetID) tears the view (and its @StateObject) down
                    // the instant the sidebar switches meets — otherwise the
                    // old meet's data stays interactive during the
                    // staff-access round-trip and mutations hit the old meet.
                    PadBlockBuilderView(meetID: meetID)
                        .id(meetID)
                case .registered:
                    PadRegisteredView(meetID: meetID)
                        .id(meetID)
                case .checkIn:
                    PadCheckInView(meetID: meetID)
                        .id(meetID)
                case .tabulator:
                    PadTabulatorView(meetID: meetID)
                        .id(meetID)
                case .announcer:
                    PadAnnouncerView()
                case .referee:
                    PadRefereeView()
                case .liveBoard:
                    PadEmbeddedScreen(title: session.selectedMeetName) {
                        LiveRaceDayView(meetID: meetID, meetName: session.selectedMeetName)
                    }
                case .results:
                    PadEmbeddedScreen(title: session.selectedMeetName) {
                        ResultsView(meetID: meetID, meetName: session.selectedMeetName)
                    }
                case nil:
                    PadPlaceholder(text: "Pick a board from the sidebar.")
                }
            } else {
                PadPlaceholder(text: "Select a meet to get started.")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
    }
}

/// Wraps the existing iPhone screens (Live Board, Results) at a readable
/// width when embedded in the split view's detail pane.
struct PadEmbeddedScreen<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        NavigationStack {
            content
        }
        .frame(maxWidth: 720)
        .frame(maxWidth: .infinity)
        .background(SSMTheme.pageBackground)
    }
}

struct PadPlaceholder: View {
    let text: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "flag.checkered")
                .font(.system(size: 44))
                .foregroundStyle(SSMTheme.muted)
            Text(text)
                .font(.ssmRounded(17, weight: .semibold))
                .foregroundStyle(SSMTheme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
    }
}

// ── Login sheet ──────────────────────────────────────────────────────────

struct PadLoginSheet: View {
    @EnvironmentObject private var auth: AuthViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 18) {
            Text("Staff Log In")
                .font(.ssmRounded(24, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(.top, 28)
            Text("Use your SSL account — the same login as the website.")
                .font(.ssmRounded(13, weight: .medium))
                .foregroundStyle(SSMTheme.muted)

            VStack(spacing: 12) {
                TextField("Email or username", text: $email)
                    .textFieldStyle(.plain)
                    .ssmNoAutocapitalization()
                    .ssmUsernameContentType()
                    .padding(14)
                    .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                SecureField("Password", text: $password)
                    .textFieldStyle(.plain)
                    .ssmPasswordContentType()
                    .padding(14)
                    .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .foregroundStyle(SSMTheme.textPrimary)

            if let message = auth.errorMessage {
                Text(message)
                    .font(.ssmRounded(13, weight: .semibold))
                    .foregroundStyle(SSMTheme.danger)
            }

            Button {
                Task {
                    await auth.login(email: email, password: password)
                    if auth.isLoggedIn { dismiss() }
                }
            } label: {
                if auth.isLoading {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Log In").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.ssmPill)
            .disabled(auth.isLoading || email.isEmpty || password.isEmpty)

            Spacer()
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: 460)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
        .preferredColorScheme(.dark)
    }
}
