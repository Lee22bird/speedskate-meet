import SwiftUI

public struct StaffTabRootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    public init() {}

    public var body: some View {
        NavigationStack {
            Group {
                if auth.isLoggedIn {
                    StaffMeetsListView()
                } else {
                    StaffLoginView()
                }
            }
            .navigationTitle("Staff")
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
                Image(systemName: "person.badge.shield.checkmark")
                    .font(.system(size: 48))
                    .foregroundStyle(SSMTheme.orange)
                    .padding(.top, 40)
                Text("Race-Day Staff Login")
                    .font(.ssmRounded(22, weight: .heavy))
                    .foregroundStyle(SSMTheme.navy)
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
        .background(SSMTheme.pageBackground)
    }
}

struct StaffMeetsListView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @StateObject private var viewModel = StaffMeetsViewModel()

    var body: some View {
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
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(meet.meetName).font(.headline)
                                Spacer()
                                SSMChip(meet.role.displayName, color: SSMTheme.navy)
                            }
                            Text(meet.date).font(.caption).foregroundStyle(SSMTheme.muted)
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button("Log Out") { auth.logout() }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}
