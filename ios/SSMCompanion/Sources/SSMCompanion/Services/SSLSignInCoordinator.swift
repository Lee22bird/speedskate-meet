import Foundation
#if canImport(AuthenticationServices)
import AuthenticationServices
#if os(iOS)
import UIKit
#endif

/// Drives the "Sign in with SSL" flow: opens SpeedSkateLeague's login page in
/// a system browser session, then captures the ssmcompanion:// callback that
/// SSM's existing /sso/ssl/callback redirects to once SSL hands off a signed
/// SSO token. No new auth system — this only adds a native-app-friendly
/// transport on top of the SSO bridge that already exists between SSL and SSM.
@MainActor
final class SSLSignInCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func signIn() async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let authSession = ASWebAuthenticationSession(
                url: APIClient.sslSignInURL,
                callbackURLScheme: APIClient.sslSignInCallbackScheme
            ) { callbackURL, error in
                if let error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        continuation.resume(throwing: CancellationError())
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                guard
                    let callbackURL,
                    let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                    let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
                    !code.isEmpty
                else {
                    continuation.resume(throwing: APIError.server("SSL sign-in did not return a code."))
                    return
                }
                continuation.resume(returning: code)
            }
            authSession.presentationContextProvider = self
            authSession.prefersEphemeralWebBrowserSession = false
            self.session = authSession
            authSession.start()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(iOS)
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        #else
        return ASPresentationAnchor()
        #endif
    }
}
#endif
