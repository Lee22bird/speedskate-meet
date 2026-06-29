import Foundation
import SwiftUI

@MainActor
public final class AuthViewModel: ObservableObject {
    @Published public var currentUser: CurrentUser?
    @Published public var isLoading = false
    @Published public var errorMessage: String?

    public var isLoggedIn: Bool { currentUser != nil }

    private let api: APIClient
    public init(api: APIClient = .shared) { self.api = api }

    public func refreshSession() async {
        do {
            let response = try await api.me()
            currentUser = response.loggedIn ? response.user : nil
        } catch {
            currentUser = nil
        }
    }

    public func login(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await api.login(email: email, password: password)
            await refreshSession()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func logout() {
        api.logout()
        currentUser = nil
    }
}
