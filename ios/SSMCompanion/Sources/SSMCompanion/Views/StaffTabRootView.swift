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
                ZStack {
                    SpeedStreaksBackground()
                    VStack(spacing: 10) {
                        Image(systemName: "person.badge.shield.checkmark")
                            .font(.system(size: 40))
                            .foregroundStyle(.white)
                        Text("Race-Day Staff Login")
                            .font(.ssmRounded(22, weight: .heavy))
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.vertical, 36)
                    .padding(.horizontal, 20)
                }
                .frame(height: 170)
                .clipShape(RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))
                .padding(.horizontal)
                .padding(.top, 12)

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
        .background(SSMTheme.pageBackground)
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button("Log Out") { auth.logout() }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}
