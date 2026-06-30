import SwiftUI

public struct StaffTabRootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SSMHeader(title: "Staff")

                Group {
                    if auth.isLoggedIn {
                        StaffMeetsListView()
                    } else {
                        StaffLoginView()
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .ssmNavigationBarHidden(true)
        }
    }
}

struct StaffLoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Label("Race-Day Staff Login", systemImage: "person.badge.shield.checkmark")
                    .font(.ssmRounded(22, weight: .heavy))
                    .foregroundStyle(.white)
                    .padding(.top, 18)

                Text("Log in with your SpeedSkateMeet account to access race-day controls for meets you're assigned to.")
                    .font(.subheadline)
                    .foregroundStyle(SSMTheme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                SSMCard {
                    VStack(spacing: 12) {
                        TextField("Email or username", text: $email)
                            .ssmNoAutocapitalization()
                            .autocorrectionDisabled()
                            .ssmUsernameContentType()
                        SecureField("Password", text: $password)
                            .ssmPasswordContentType()

                        if let error = auth.errorMessage {
                            Text(error).font(.caption).foregroundStyle(SSMTheme.danger)
                        }

                        Button {
                            Task { await auth.login(email: email, password: password) }
                        } label: {
                            if auth.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Text("Log In")
                            }
                        }
                        .buttonStyle(.ssmPill)
                        .disabled(email.isEmpty || password.isEmpty || auth.isLoading)
                    }
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 70)
        }
        .background(SSMTheme.pageBackground)
    }
}

struct StaffMeetsListView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @StateObject private var viewModel = StaffMeetsViewModel()

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Assigned Meets")
                    .font(.ssmRounded(18, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
                Button {
                    auth.logout()
                } label: {
                    Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.orange)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)

            Group {
                if viewModel.isLoading && viewModel.meets.isEmpty {
                    ProgressView()
                } else if viewModel.meets.isEmpty {
                    ContentUnavailableFallback(text: "You're not assigned as staff on any meets yet.")
                } else {
                    List(viewModel.meets) { meet in
                        NavigationLink {
                            StaffRaceDayView(meetID: meet.id.stringValue, meetName: meet.meetName, role: meet.role)
                        } label: {
                            SSMCard {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(meet.meetName).font(.ssmRounded(17, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                                        Spacer()
                                        SSMChip(meet.role.displayName, color: SSMTheme.orange)
                                    }
                                    Text(meet.date).font(.caption).foregroundStyle(SSMTheme.muted)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .scrollIndicators(.hidden)
                    .safeAreaPadding(.bottom, 70)
                }
            }
            .frame(maxHeight: .infinity)
        }
        .background(SSMTheme.pageBackground)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}
