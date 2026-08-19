import Foundation

/// Drives the officials' Protests inbox on the iPad. Load + rule + fee all go
/// through the additive /api/v1 protest endpoints, which reuse the website's
/// exact protest service and permission gates — this view model never decides
/// who can rule or what a ruling means, it just reflects the server's answer.
@MainActor
public final class ProtestsViewModel: ObservableObject {
    @Published public var protests: [Protest] = []
    @Published public var unresolvedCount = 0
    @Published public var canCollectFee = false
    @Published public var canOpenCorrection = false
    @Published public var protestFee: Double = 0
    @Published public var isLoading = false
    @Published public var errorMessage: String?
    /// The protest id currently being ruled / fee-marked, so the row can show a
    /// spinner and disable its buttons without freezing the whole list.
    @Published public var actioningID: String?

    private let api: APIClient

    public init(api: APIClient = .shared) { self.api = api }

    public func load(meetID: String) async {
        if protests.isEmpty { isLoading = true }
        defer { isLoading = false }
        do {
            let r = try await api.protests(meetID: meetID)
            protests = r.protests
            unresolvedCount = r.unresolvedCount
            canCollectFee = r.canCollectFee
            canOpenCorrection = r.canOpenCorrection
            protestFee = r.protestFee
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Rule a protest. Returns correction deep-link info when the ruling was
    /// upheld on a race-specific protest and this user may correct it.
    @discardableResult
    public func rule(meetID: String, protestID: String,
                     state: String, ruling: String) async -> ProtestCorrection? {
        actioningID = protestID
        defer { actioningID = nil }
        do {
            let r = try await api.ruleProtest(meetID: meetID, protestID: protestID,
                                              state: state, ruling: ruling)
            apply(r.protest)
            unresolvedCount = r.unresolvedCount
            errorMessage = nil
            return r.correction?.available == true ? r.correction : nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    public func collectFee(meetID: String, protestID: String) async {
        actioningID = protestID
        defer { actioningID = nil }
        do {
            let r = try await api.collectProtestFee(meetID: meetID, protestID: protestID)
            apply(r.protest)
            unresolvedCount = r.unresolvedCount
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func apply(_ updated: Protest) {
        if let idx = protests.firstIndex(where: { $0.id == updated.id }) {
            protests[idx] = updated
        }
    }
}
