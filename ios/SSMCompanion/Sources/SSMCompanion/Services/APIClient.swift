import Foundation

public enum APIError: Error, LocalizedError {
    case invalidURL
    case server(String)
    case decoding(Error)
    case network(Error)
    case unauthorized

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server address."
        case .server(let message): return message
        case .decoding: return "The server sent back something unexpected."
        case .network(let error): return error.localizedDescription
        case .unauthorized: return "You need to log in to do that."
        }
    }
}

/// Talks to the existing SSM Express server's JSON API (routes/mobileApiRoutes.js)
/// plus the existing session-cookie login endpoint (POST /admin/login) and the
/// existing race-day control endpoints under /api/meet/:meetId/race-day/*.
/// No separate auth system — this reuses the website's `ssm_sess` cookie via
/// URLSession's shared cookie storage, exactly like a browser would.
public final class APIClient {
    public static let shared = APIClient()

    /// Change this to your SSM server's address. See ios/README.md.
    public var baseURL: URL = URL(string: "https://speedskatemeet.com")!

    private let session: URLSession

    /// Like `session`, but never follows redirects. Used for the website's
    /// portal form endpoints, where a 302 is how the server says "saved"
    /// (browser semantics) and a redirect to /admin/login means the session
    /// expired. Suppressing the redirect lets us tell those apart instead of
    /// landing on an HTML page we can't decode.
    private let noRedirectSession: URLSession

    public init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpShouldSetCookies = true
        self.session = URLSession(configuration: config)
        self.noRedirectSession = URLSession(
            configuration: config,
            delegate: RedirectBlocker(),
            delegateQueue: nil
        )
    }

    /// URLSessionTaskDelegate that refuses every redirect so the caller sees
    /// the original 3xx response and its Location header.
    private final class RedirectBlocker: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest,
                        completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    /// Strict application/x-www-form-urlencoded encoding. The characters kept
    /// literal are the RFC 3986 unreserved set, so names containing `&`, `=`,
    /// or `+` survive round-tripping (unlike `.urlQueryAllowed`).
    private static let formAllowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-._~")
        return set
    }()

    private static func formEncode(_ fields: [(String, String)]) -> Data? {
        fields.map { key, value in
            let k = key.addingPercentEncoding(withAllowedCharacters: formAllowed) ?? key
            let v = value.addingPercentEncoding(withAllowedCharacters: formAllowed) ?? value
            return "\(k)=\(v)"
        }.joined(separator: "&").data(using: .utf8)
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET", formBody: [String: String]? = nil) async throws -> T {
        guard var url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidURL }
        url = url.absoluteURL
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        if let formBody {
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            let encoded = formBody.map { key, value in
                "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
            }.joined(separator: "&")
            req.httpBody = encoded.data(using: .utf8)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.network(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("No response from server.")
        }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 403 { throw APIError.server("You don't have access to this.") }
        if http.statusCode >= 400 {
            if let decoded = try? JSONDecoder().decode(SimpleOKResponse.self, from: data), let message = decoded.error {
                throw APIError.server(message)
            }
            throw APIError.server("Request failed (\(http.statusCode)).")
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    /// Logs in via the website's existing /admin/login endpoint. On success
    /// that endpoint sets the ssm_sess cookie and replies with a redirect;
    /// we don't follow the redirect body, we just check the cookie landed.
    public func login(email: String, password: String) async throws {
        guard let url = URL(string: "/admin/login", relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let body = "email=\(email.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&password=\(password.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        req.httpBody = body.data(using: .utf8)

        do {
            _ = try await session.data(for: req)
        } catch {
            throw APIError.network(error)
        }

        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        guard cookies.contains(where: { $0.name == "ssm_sess" }) else {
            throw APIError.server("Invalid email or password.")
        }
    }

    public func logout() {
        let host = baseURL.host ?? ""
        for cookie in HTTPCookieStorage.shared.cookies ?? [] where cookie.domain.contains(host) {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    public func me() async throws -> MeResponse {
        try await request("/api/v1/me")
    }

    // ── Find a Meet ──────────────────────────────────────────────────────
    public func meets(query: String = "", city: String = "", state: String = "", league: String = "", date: String = "") async throws -> MeetsResponse {
        var components = URLComponents(string: "/api/v1/meets")!
        var items: [URLQueryItem] = []
        if !query.isEmpty { items.append(.init(name: "q", value: query)) }
        if !city.isEmpty { items.append(.init(name: "city", value: city)) }
        if !state.isEmpty { items.append(.init(name: "state", value: state)) }
        if !league.isEmpty { items.append(.init(name: "league", value: league)) }
        if !date.isEmpty { items.append(.init(name: "date", value: date)) }
        components.queryItems = items.isEmpty ? nil : items
        let response: MeetsResponse = try await request(components.string ?? "/api/v1/meets")
        return response
    }

    public func meetDetail(meetID: String) async throws -> MeetDetail {
        let response: MeetDetailResponse = try await request("/api/v1/meets/\(meetID)")
        return response.meet
    }

    // ── Live Race Day / Live Board ───────────────────────────────────────
    public func liveRaceDay(meetID: String) async throws -> LiveRaceDayResponse {
        try await request("/api/v1/meets/\(meetID)/live")
    }

    // ── Results ──────────────────────────────────────────────────────────
    public func results(meetID: String) async throws -> ResultsResponse {
        try await request("/api/v1/meets/\(meetID)/results")
    }

    // ── Staff ────────────────────────────────────────────────────────────
    public func staffAccess(meetID: String) async throws -> StaffAccessResponse {
        try await request("/api/v1/meets/\(meetID)/staff-access")
    }

    public func myStaffMeets() async throws -> [StaffMeetSummary] {
        let response: MyStaffMeetsResponse = try await request("/api/v1/my-staff-meets")
        return response.meets
    }

    public func raceDayState(meetID: String) async throws -> RaceDayStateResponse {
        try await request("/api/v1/meets/\(meetID)/race-day-state")
    }

    // ── Staff race-day controls ──────────────────────────────────────────
    // These reuse the website's existing Director-panel endpoints exactly —
    // no new control logic was added on the server for these actions.
    public func setCurrentRace(meetID: String, raceID: String) async throws {
        let _: SimpleOKResponse = try await postJSON("/api/meet/\(meetID)/race-day/set-current", body: ["raceId": raceID])
    }

    public func stepRace(meetID: String, direction: Int) async throws {
        let _: SimpleOKResponse = try await postJSON("/api/meet/\(meetID)/race-day/step", body: ["direction": String(direction)])
    }

    public func togglePause(meetID: String) async throws {
        let _: SimpleOKResponse = try await postJSON("/api/meet/\(meetID)/race-day/toggle-pause", body: [:])
    }

    public func unlockRace(meetID: String, raceID: String) async throws {
        let _: SimpleOKResponse = try await postJSON("/api/meet/\(meetID)/race-day/unlock-race", body: ["raceId": raceID])
    }

    // ── Full meet detail (iPad meet-running screens) ─────────────────────
    /// The website's existing desktop-export endpoint: the entire meet object
    /// as JSON. This is how the iPad app reads race detail the small mobile
    /// API doesn't carry (resultsMode, notes, every lane, blocks) without any
    /// server change. Requires canEditMeet (director/owner/assigned tabulator).
    public func desktopExport(meetID: String) async throws -> ExportMeet {
        let response: DesktopExportResponse = try await portalRequest("/portal/meet/\(meetID)/desktop-export")
        return response.meet
    }

    // ── Result entry (Tabulator) ─────────────────────────────────────────
    /// Posts race results to the website's existing judges/save endpoint.
    /// `ajax=1` + Accept: application/json make it reply with JSON instead of
    /// redirecting — the same mechanism the website's own Save button uses.
    /// `action` is "save" (stay on race) or "close" (close race & advance —
    /// the server runs heat→semi→final progression; we never do).
    public func saveRaceResults(meetID: String,
                                raceID: String,
                                resultsMode: String,
                                notes: String,
                                action: String,
                                lanes: [LaneResultSubmission]) async throws -> JudgesSaveResponse {
        var fields: [(String, String)] = [
            ("raceId", raceID),
            ("resultsMode", resultsMode),
            ("notes", notes),
            ("action", action),
            ("ajax", "1"),
        ]
        for lane in lanes { fields.append(contentsOf: lane.formFields()) }
        return try await portalRequest("/portal/meet/\(meetID)/race-day/judges/save",
                                       method: "POST", formFields: fields)
    }

    /// Posts a correction to a closed race via the website's existing
    /// correction/save endpoint. Success is a 302 back to race day (browser
    /// semantics); validation failures come back as JSON errors.
    public func saveCorrection(meetID: String,
                               raceID: String,
                               reason: String,
                               resultsMode: String,
                               notes: String,
                               lanes: [LaneResultSubmission]) async throws {
        var fields: [(String, String)] = [
            ("raceId", raceID),
            ("reason", reason),
            ("resultsMode", resultsMode),
            ("notes", notes),
        ]
        for lane in lanes { fields.append(contentsOf: lane.formFields()) }
        let _: SimpleOKResponse = try await portalRequest("/portal/meet/\(meetID)/race-day/correction/save",
                                                          method: "POST", formFields: fields,
                                                          treatRedirectAsSuccess: true)
    }

    /// Request against the website's portal/form endpoints with redirects
    /// suppressed: a redirect to /admin/login surfaces as .unauthorized, any
    /// other redirect is browser-style success when the caller says so, and
    /// JSON bodies (success or error) decode normally.
    private func portalRequest<T: Decodable>(_ path: String,
                                             method: String = "GET",
                                             formFields: [(String, String)]? = nil,
                                             treatRedirectAsSuccess: Bool = false) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let formFields {
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = Self.formEncode(formFields)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await noRedirectSession.data(for: req)
        } catch {
            throw APIError.network(error)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.server("No response from server.") }

        if (300...399).contains(http.statusCode) {
            let location = http.value(forHTTPHeaderField: "Location") ?? ""
            if location.contains("/admin/login") { throw APIError.unauthorized }
            if treatRedirectAsSuccess {
                let okData = Data("{\"ok\":true}".utf8)
                do { return try JSONDecoder().decode(T.self, from: okData) }
                catch { throw APIError.decoding(error) }
            }
            throw APIError.server("Unexpected redirect from server.")
        }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 403 { throw APIError.server("You don't have access to this.") }
        if http.statusCode >= 400 {
            if let decoded = try? JSONDecoder().decode(SimpleOKResponse.self, from: data), let message = decoded.error {
                throw APIError.server(message)
            }
            // Control/portal endpoints sometimes reply with plain text errors.
            if let text = String(data: data, encoding: .utf8), !text.isEmpty, text.count < 200, !text.contains("<") {
                throw APIError.server(text)
            }
            throw APIError.server("Request failed (\(http.statusCode)).")
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private func postJSON<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.network(error)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.server("No response from server.") }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode >= 400 { throw APIError.server("Request failed (\(http.statusCode)).") }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}
