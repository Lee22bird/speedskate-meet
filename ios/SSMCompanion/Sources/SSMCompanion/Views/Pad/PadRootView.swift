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
    /// Custom overlay drawer — every board runs full-width and the ☰ button
    /// slides the sidebar in over it. (NavigationSplitView's columnVisibility
    /// binding can't be reliably re-opened programmatically on iPad, so we
    /// own the drawer state directly.) Starts open until a meet is picked.
    @State private var drawerOpen = true

    private static let drawerWidth: CGFloat = 380

    public init() {}

    public var body: some View {
        ZStack(alignment: .leading) {
            PadDetailRouter(drawerOpen: $drawerOpen)
                .environmentObject(auth)
                .environmentObject(session)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Dim backdrop — tap to dismiss.
            if drawerOpen {
                Color.black.opacity(0.45)
                    .ignoresSafeArea()
                    .onTapGesture { withAnimation(.easeInOut(duration: 0.2)) { drawerOpen = false } }
                    .transition(.opacity)
                    .zIndex(1)
            }

            if drawerOpen {
                PadSidebar(showLogin: $showLogin,
                           closeDrawer: { withAnimation(.easeInOut(duration: 0.2)) { drawerOpen = false } })
                    .environmentObject(auth)
                    .environmentObject(session)
                    .environmentObject(staffMeets)
                    .environmentObject(allMeets)
                    .frame(width: Self.drawerWidth)
                    .frame(maxHeight: .infinity)
                    .background(SSMTheme.pageBackground)
                    .shadow(color: .black.opacity(0.5), radius: 20, x: 4, y: 0)
                    .transition(.move(edge: .leading))
                    .zIndex(2)
            }
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
    /// Slide the drawer shut after a pick so the chosen board is immediately
    /// full-width.
    let closeDrawer: () -> Void

    @State private var isCreatingMeet = false
    @State private var createError: String?

    var body: some View {
        // Plain ScrollView + VStack (not List) — predictable hit-testing and
        // width inside the custom drawer overlay.
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Speed Skate Meet")
                    .font(.ssmRounded(26, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .padding(.top, 8)

                accountSection
                if session.selectedMeetID != nil {
                    boardsSection
                }
                if auth.isLoggedIn {
                    myMeetsSection
                }
                allMeetsSection
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .safeAreaPadding(.top)
    }

    private func sectionHeader(_ text: String, accent: Color = SSMTheme.muted) -> some View {
        Text(text.uppercased())
            .font(.ssmRounded(11, weight: .heavy))
            .foregroundStyle(accent)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var accountSection: some View {
        card {
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
                    Button("Log Out") { auth.logout() }
                        .font(.ssmRounded(12, weight: .bold))
                        .foregroundStyle(SSMTheme.muted)
                        .buttonStyle(.plain)
                }
            } else {
                Button {
                    showLogin = true
                } label: {
                    Label("Staff Log In", systemImage: "person.badge.key")
                        .font(.ssmRounded(15, weight: .bold))
                        .foregroundStyle(SSMTheme.orange)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// The web shows the unresolved-protest badge on the Director + Tabulator
    /// tabs; we mirror that and also badge the dedicated Protests entry.
    private let badgeSections: Set<PadSection> = [.director, .tabulator, .protests]

    private var boardsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.selectedMeetName)
                    .font(.ssmRounded(13, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                Text((session.role?.displayName ?? "Spectator").uppercased())
                    .font(.ssmRounded(10, weight: .bold))
                    .foregroundStyle(session.role != nil ? SSMTheme.orange : SSMTheme.muted)
            }
            card {
                VStack(spacing: 4) {
                    ForEach(PadSection.allCases.filter { $0.allowed(for: session.role, canBuildBlocks: session.canBuildBlocks) }) { section in
                        Button {
                            session.selectedSection = section
                            closeDrawer()
                        } label: {
                            HStack {
                                Label(section.title, systemImage: section.icon)
                                    .font(.ssmRounded(15, weight: session.selectedSection == section ? .bold : .semibold))
                                    .foregroundStyle(session.selectedSection == section ? SSMTheme.orange : SSMTheme.textPrimary)
                                Spacer()
                                if badgeSections.contains(section), session.protestUnresolvedCount > 0 {
                                    Text("\(session.protestUnresolvedCount)")
                                        .font(.ssmRounded(11, weight: .heavy))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 7).padding(.vertical, 2)
                                        .background(SSMTheme.danger, in: Capsule())
                                }
                                if session.selectedSection == section {
                                    Circle().fill(SSMTheme.orange).frame(width: 7, height: 7)
                                }
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// Meet creation matches the server's gate (meet_director or judge; super
    /// admins implicitly). Coaches and plain accounts shouldn't see a button
    /// that can only 403.
    private var canCreateMeets: Bool {
        let roles = auth.currentUser?.roles ?? []
        return roles.contains("meet_director") || roles.contains("judge") || roles.contains("super_admin")
    }

    private func createNewMeet() async {
        guard !isCreatingMeet else { return }
        isCreatingMeet = true
        defer { isCreatingMeet = false }
        do {
            guard let newID = try await APIClient.shared.createMeet() else {
                createError = "Couldn't create the meet."
                return
            }
            createError = nil
            await staffMeets.load()
            await session.selectMeet(id: newID, name: "New Meet")
            // Land on setup — but only if this user's resolved role is allowed
            // there (selectMeet just recomputed it; never bypass the gate).
            if PadSection.meetSettings.allowed(for: session.role, canBuildBlocks: session.canBuildBlocks) {
                session.selectedSection = .meetSettings
            }
            closeDrawer()
        } catch {
            createError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private var myMeetsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                sectionHeader("My Meets")
                Spacer()
                if canCreateMeets {
                    Button {
                        Task { await createNewMeet() }
                    } label: {
                        Label(isCreatingMeet ? "Creating…" : "New Meet", systemImage: "plus.circle.fill")
                            .font(.ssmRounded(12, weight: .bold))
                            .foregroundStyle(SSMTheme.orange)
                    }
                    .buttonStyle(.plain)
                    .disabled(isCreatingMeet)
                }
            }
            if let createError {
                Text(createError).font(.ssmRounded(11, weight: .semibold)).foregroundStyle(SSMTheme.danger)
            }
            if staffMeets.meets.isEmpty {
                Text(staffMeets.isLoading ? "Loading…" : "No assigned meets.")
                    .font(.ssmRounded(13, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
            ForEach(staffMeets.meets) { meet in
                Button {
                    Task { await session.selectMeet(id: meet.id.stringValue, name: meet.meetName) }
                    closeDrawer()
                } label: {
                    card {
                        PadSidebarMeetRow(
                            name: meet.meetName,
                            detail: meet.date,
                            badge: meet.role.displayName,
                            isLive: meet.status.lowercased() == "live",
                            isSelected: session.selectedMeetID == meet.id.stringValue
                        )
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var allMeetsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("All Meets")
            ForEach(allMeets.meets) { meet in
                Button {
                    Task { await session.selectMeet(id: meet.id.stringValue, name: meet.meetName) }
                    closeDrawer()
                } label: {
                    card {
                        PadSidebarMeetRow(
                            name: meet.meetName,
                            detail: "\(meet.date) · \(meet.location)",
                            badge: nil,
                            isLive: meet.isLiveNow,
                            isSelected: session.selectedMeetID == meet.id.stringValue
                        )
                    }
                }
                .buttonStyle(.plain)
            }
        }
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
    @Binding var drawerOpen: Bool

    var body: some View {
        VStack(spacing: 0) {
            detailHeader
            routedContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
    }

    /// Slim chrome bar carrying the drawer toggle (top-left ☰) and a
    /// breadcrumb, so every board keeps the full width below it.
    private var detailHeader: some View {
        HStack(spacing: 14) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { drawerOpen.toggle() }
            } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .frame(width: 44, height: 44)
                    .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Menu")

            VStack(alignment: .leading, spacing: 1) {
                Text(session.selectedMeetID == nil ? "Speed Skate Meet"
                     : (session.selectedMeetName.isEmpty ? "Speed Skate Meet" : session.selectedMeetName))
                    .font(.ssmRounded(16, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(1)
                if session.selectedMeetID != nil, let title = session.selectedSection?.title {
                    Text(title.uppercased())
                        .font(.ssmRounded(10, weight: .bold))
                        .foregroundStyle(SSMTheme.orange)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(SSMTheme.pageBackground)
    }

    @ViewBuilder private var routedContent: some View {
        if let meetID = session.selectedMeetID {
            switch session.selectedSection {
            case .director:
                PadDirectorView()
            case .meetSettings:
                PadMeetSettingsView(meetID: meetID)
                    .id(meetID)
            case .divisions:
                PadDivisionsView(meetID: meetID)
                    .id(meetID)
            case .relayTemplates:
                PadRelayTemplatesView(meetID: meetID)
                    .id(meetID)
            case .blockBuilder:
                // .id(meetID) tears the view (and its @StateObject) down
                // the instant the sidebar switches meets — otherwise the
                // old meet's data stays interactive during the
                // staff-access round-trip and mutations hit the old meet.
                PadBlockBuilderView(meetID: meetID)
                    .id(meetID)
            case .relayBuilder:
                PadRelayBuilderView(meetID: meetID)
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
            case .protests:
                PadProtestsView(meetID: meetID)
                    .id(meetID)
            case .scoreSheets:
                PadScoreSheetsView(meetID: meetID)
                    .id(meetID)
            case .liveBoard:
                PadEmbeddedScreen(title: session.selectedMeetName) {
                    LiveRaceDayView(meetID: meetID, meetName: session.selectedMeetName)
                }
            case .results:
                PadEmbeddedScreen(title: session.selectedMeetName) {
                    ResultsView(meetID: meetID, meetName: session.selectedMeetName)
                }
            case nil:
                PadPlaceholder(text: "Pick a board from the ☰ menu.")
            }
        } else {
            PadPlaceholder(text: "Tap ☰ to pick a meet.")
        }
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
