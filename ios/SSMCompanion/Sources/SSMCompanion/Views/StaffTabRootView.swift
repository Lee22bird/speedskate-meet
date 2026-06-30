import SwiftUI

public struct StaffTabRootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SSMHeader(title: "Staff")

                    if auth.isLoggedIn {
                        StaffMeetsListView()
                    } else {
                        StaffLoginView()
                    }
                }
                .padding(.bottom, 80)
            }
            .scrollIndicators(.hidden)
            .background(SSMTheme.pageBackground)
            .ssmNavigationBarHidden(true)
        }
    }
}

struct StaffLoginView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 16) {
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
    }
}

struct StaffMeetsListView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @StateObject private var viewModel = StaffMeetsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
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
            .padding(.horizontal)

            if viewModel.isLoading && viewModel.meets.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if viewModel.meets.isEmpty {
                ContentUnavailableFallback(text: "You're not assigned as staff on any meets yet.")
                    .padding(.top, 40)
            } else {
                VStack(spacing: 12) {
                    ForEach(viewModel.meets) { meet in
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
                    }
                }
                .padding(.horizontal)
            }
        }
        .task { await viewModel.load() }
    }
}
