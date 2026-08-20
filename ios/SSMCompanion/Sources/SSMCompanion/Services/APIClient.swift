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

    // ── Protests (officials inbox — reuses the website's protest service) ──
    public func protests(meetID: String) async throws -> ProtestsResponse {
        try await request("/api/v1/meets/\(meetID)/protests")
    }

    public func ruleProtest(meetID: String, protestID: String,
                            state: String, ruling: String) async throws -> ProtestRuleResponse {
        try await request("/api/v1/meets/\(meetID)/protests/\(protestID)/rule",
                          method: "POST",
                          formBody: ["state": state, "ruling": ruling])
    }

    public func collectProtestFee(meetID: String, protestID: String) async throws -> ProtestActionResponse {
        try await request("/api/v1/meets/\(meetID)/protests/\(protestID)/fee",
                          method: "POST", formBody: [:])
    }

    // ── Coach protest filing ──────────────────────────────────────────────
    public func myCoachMeets() async throws -> CoachMeetsResponse {
        try await request("/api/v1/my-coach-meets")
    }

    public func coachProtestForm(meetID: String) async throws -> CoachProtestForm {
        try await request("/api/v1/meets/\(meetID)/coach/protest-form")
    }

    public func fileCoachProtest(meetID: String, category: String, raceID: String,
                                 raceLabel: String, registrationID: String,
                                 statement: String) async throws -> CoachProtestFiled {
        try await request("/api/v1/meets/\(meetID)/coach/protest",
                          method: "POST",
                          formBody: ["category": category, "raceId": raceID,
                                     "raceLabel": raceLabel, "registrationId": registrationID,
                                     "statement": statement])
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
                                                          treatRedirectAsSuccess: true,
                                                          expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    /// Request against the website's portal/form endpoints with redirects
    /// suppressed: a redirect to /admin/login surfaces as .unauthorized, any
    /// other redirect is browser-style success when the caller says so, and
    /// JSON bodies (success or error) decode normally.
    private func portalRequest<T: Decodable>(_ path: String,
                                             method: String = "GET",
                                             formFields: [(String, String)]? = nil,
                                             treatRedirectAsSuccess: Bool = false,
                                             expectedRedirectPrefix: String? = nil) async throws -> T {
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
                // A redirect that doesn't land back inside the meet (e.g. a
                // bare /portal) is the server's lost-permission signal.
                if let prefix = expectedRedirectPrefix, !location.contains(prefix) {
                    throw APIError.server("You no longer have edit access to this meet.")
                }
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

    // ── Block Builder (iPad) ─────────────────────────────────────────────
    // All of these are the website's existing JSON block endpoints in
    // routes/raceDayRoutes.js — the same ones its drag-and-drop UI calls.

    public func addBlock(meetID: String) async throws -> String? {
        let response: BlockAddResponse = try await apiPost("/api/meet/\(meetID)/blocks/add", body: [:])
        return response.blockId
    }

    /// `afterBlockID` accepts a block id or the server's `__start__` sentinel.
    public func addDivider(meetID: String, type: String, name: String, day: String, afterBlockID: String) async throws -> String? {
        let response: BlockAddResponse = try await apiPost("/api/meet/\(meetID)/blocks/add-divider", body: [
            "type": type, "name": name, "day": day, "afterBlockId": afterBlockID,
        ])
        return response.blockId
    }

    public func updateBlockMeta(meetID: String, blockID: String, name: String, day: String, type: String, notes: String, durationMin: String) async throws {
        let _: SimpleOKResponse = try await apiPost("/api/meet/\(meetID)/blocks/update-meta", body: [
            "blockId": blockID, "name": name, "day": day, "type": type,
            "notes": notes, "durationMin": durationMin,
        ])
    }

    public func deleteBlock(meetID: String, blockID: String) async throws {
        let _: SimpleOKResponse = try await apiPost("/api/meet/\(meetID)/blocks/delete", body: ["blockId": blockID])
    }

    public func moveBlock(meetID: String, blockID: String, direction: String) async throws {
        let _: SimpleOKResponse = try await apiPost("/api/meet/\(meetID)/blocks/move", body: ["blockId": blockID, "dir": direction])
    }

    public func reorderRaces(meetID: String, blockID: String, order: [String]) async throws {
        let _: SimpleOKResponse = try await apiPost("/api/meet/\(meetID)/blocks/reorder-races", body: ["blockId": blockID, "order": order])
    }

    public func mergeRaces(meetID: String, raceA: String, raceB: String) async throws -> MergeRacesResponse {
        try await apiPost("/api/meet/\(meetID)/blocks/merge-races", body: ["raceIdA": raceA, "raceIdB": raceB])
    }

    public func unmergeRaces(meetID: String, raceID: String) async throws -> UnmergeRacesResponse {
        try await apiPost("/api/meet/\(meetID)/blocks/unmerge-races", body: ["raceId": raceID])
    }

    /// `destBlockID` accepts a block id or `__unassigned__`. When
    /// `beforeRaceID` is nil the race lands at the end of the destination.
    public func moveRace(meetID: String, raceID: String, destBlockID: String, beforeRaceID: String?) async throws {
        var body: [String: Any] = ["raceId": raceID, "destBlockId": destBlockID]
        if let beforeRaceID { body["beforeRaceId"] = beforeRaceID }
        let _: SimpleOKResponse = try await apiPost("/api/meet/\(meetID)/blocks/move-race", body: body)
    }

    public func moveRaces(meetID: String, raceIDs: [String], destBlockID: String) async throws -> MoveRacesResponse {
        try await apiPost("/api/meet/\(meetID)/blocks/move-races", body: ["raceIds": raceIDs, "destBlockId": destBlockID])
    }

    public func generateSchedule(meetID: String, mode: String, style: String, confirmReplace: Bool) async throws -> GenerateScheduleOutcome {
        var body: [String: Any] = ["mode": mode, "style": style]
        if confirmReplace { body["confirmReplace"] = true }
        let (data, http) = try await apiPostRaw("/api/meet/\(meetID)/blocks/generate-schedule", body: body)
        if http.statusCode == 409,
           let decoded = try? JSONDecoder().decode(GenerateScheduleResponse.self, from: data),
           decoded.needsConfirm == true {
            return .needsConfirm(assignedCount: decoded.assignedCount ?? 0)
        }
        try Self.throwIfError(http: http, data: data)
        let decoded = try decodeOrThrow(GenerateScheduleResponse.self, from: data)
        return .generated(blocks: decoded.blocks ?? 0, placed: decoded.placed ?? 0)
    }

    /// The website's "Optimize Flow" button — a portal form post that
    /// answers with a redirect on success. Returns the server's
    /// `?autoFlow=<changedBlocks>` count (0 = nothing needed changing).
    public func autoFlowBlocks(meetID: String) async throws -> Int? {
        let location = try await portalRedirectPost("/portal/meet/\(meetID)/blocks/auto-flow",
                                                    expectedRedirectPrefix: "/portal/meet/\(meetID)/")
        guard let components = URLComponents(string: location),
              let value = components.queryItems?.first(where: { $0.name == "autoFlow" })?.value else {
            return nil
        }
        return Int(value)
    }

    /// The website's "Rebuild Races/Assignments" — recalculates race
    /// assignments from registrations, preserving block layout server-side.
    public func rebuildRaceAssignments(meetID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/assign-races",
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    // ── Check-In / Registered (iPad front desk) ──────────────────────────
    // All of these are the website's existing portal endpoints in
    // routes/registrationRoutes.js — form posts whose success answer is a
    // redirect back into the meet.

    /// Sends the INTENDED state ("1"/"0") — the server assigns it instead of
    /// blind-inverting, so a tap made on stale data is an idempotent no-op
    /// rather than a reversal when another station got there first.
    public func setCheckedIn(meetID: String, registrationID: String, to value: Bool) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/checkin/toggle-checkin/\(registrationID)",
                                         formFields: [("checkedIn", value ? "1" : "0")],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func setPaid(meetID: String, registrationID: String, to value: Bool) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/checkin/toggle-paid/\(registrationID)",
                                         formFields: [("paid", value ? "1" : "0")],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func bulkMarkPaid(meetID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/checkin/bulk-mark-paid",
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func setHelmetNumber(meetID: String, registrationID: String, helmetNumber: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/checkin/helmet/\(registrationID)",
                                         formFields: [("helmetNumber", helmetNumber)],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func reassignHelmets(meetID: String, startHelmet: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/checkin/reassign-helmets",
                                         formFields: [("startHelmet", startHelmet)],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    /// Add/edit take JSON bodies: the server reads flags as !!body.x, so real
    /// JSON booleans and arrays behave exactly, with none of the urlencoded
    /// omit-unchecked-checkbox pitfalls. Validation failures come back as
    /// 400 {ok:false,error} because we send Accept: application/json.
    public func addRegistration(meetID: String, body: [String: Any]) async throws {
        _ = try await portalRedirectPostJSON("/portal/meet/\(meetID)/registered/add",
                                             body: body,
                                             expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func editRegistration(meetID: String, registrationID: String, body: [String: Any]) async throws {
        _ = try await portalRedirectPostJSON("/portal/meet/\(meetID)/registered/\(registrationID)/edit",
                                             body: body,
                                             expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func deleteRegistration(meetID: String, registrationID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/registered/\(registrationID)/delete",
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    // ── Time trials + director actions (iPad) ────────────────────────────

    /// In-race-day TT session: post one skater's time onto the TT race.
    public func ttPostTime(meetID: String, raceID: String, registrationID: String, time: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/race-day/judges/tt-post",
                                         formFields: [("raceId", raceID),
                                                      ("registrationId", registrationID),
                                                      ("time", time),
                                                      ("action", "save")],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func ttRemoveTime(meetID: String, raceID: String, registrationID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/race-day/judges/tt-remove",
                                         formFields: [("raceId", raceID), ("registrationId", registrationID)],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    /// Dedicated TT event screen: save the current skater's time (the server
    /// normalizes to 2 decimals and auto-advances currentIndex). The /time
    /// endpoint reports a bad time via an ?error= redirect the website never
    /// shows — surface it (client-side validation should catch it first).
    public func ttSaveEventTime(meetID: String, eventID: String, registrationID: String, time: String) async throws {
        let location = try await portalRedirectPost("/portal/meet/\(meetID)/time-trials/\(eventID)/time",
                                                    formFields: [("registrationId", registrationID),
                                                                 ("time", time),
                                                                 ("mode", "director"),
                                                                 ("action", "save")],
                                                    expectedRedirectPrefix: "/portal/meet/\(meetID)/")
        if let components = URLComponents(string: location),
           let message = components.queryItems?.first(where: { $0.name == "error" })?.value,
           !message.isEmpty {
            throw APIError.server(message)
        }
    }

    public func ttStepEvent(meetID: String, eventID: String, direction: Int) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/time-trials/\(eventID)/step",
                                         formFields: [("direction", String(direction)), ("mode", "director")],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func ttCompleteEvent(meetID: String, eventID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/time-trials/\(eventID)/complete",
                                         formFields: [("mode", "director")],
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    /// Re-randomize one race's lane draw. The failure redirect stays inside
    /// the meet with an ?error= query — surface that as the error it is.
    public func reRandomizeLanes(meetID: String, raceID: String) async throws {
        let location = try await portalRedirectPost("/portal/meet/\(meetID)/race-day/re-randomize-lanes",
                                                    formFields: [("raceId", raceID)],
                                                    expectedRedirectPrefix: "/portal/meet/\(meetID)/")
        if let components = URLComponents(string: location),
           let message = components.queryItems?.first(where: { $0.name == "error" })?.value,
           !message.isEmpty {
            throw APIError.server(message)
        }
    }

    public func finalizeMeet(meetID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/finalize",
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    public func reopenMeet(meetID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/reopen",
                                         expectedRedirectPrefix: "/portal/meet/\(meetID)/")
    }

    /// Clone a meet's setup into a new draft (copies divisions/pricing/blocks,
    /// not registrations/results). Returns the new draft meet's id.
    @discardableResult
    public func cloneMeet(meetID: String) async throws -> String? {
        // Success redirects to /portal/meet/{newId}/builder.
        let location = try await portalRedirectPost("/portal/meet/\(meetID)/clone",
                                                    expectedRedirectPrefix: "/portal/meet/")
        let parts = location.split(separator: "/").map(String.init)
        if let i = parts.firstIndex(of: "meet"), i + 1 < parts.count { return parts[i + 1] }
        return nil
    }

    /// Archive a meet (soft delete — the website's archive action).
    public func archiveMeet(meetID: String) async throws {
        _ = try await portalRedirectPost("/portal/meet/\(meetID)/archive",
                                         expectedRedirectPrefix: "/portal/archived-meets")
    }

    /// Fetch a time-trial event's results as CSV bytes for a share/export sheet.
    public func fetchTimeTrialCSV(meetID: String, eventID: String) async throws -> Data {
        guard let url = URL(string: "/portal/meet/\(meetID)/time-trials/\(eventID)/export.csv",
                            relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(from: url) }
        catch { throw APIError.network(error) }
        guard let http = response as? HTTPURLResponse else { throw APIError.server("No response from server.") }
        // A lost session redirects to the login HTML page; reject anything that
        // isn't the CSV.
        let contentType = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
        guard http.statusCode == 200, !contentType.contains("html") else {
            throw APIError.server("Couldn't export the CSV — log in again and retry.")
        }
        return data
    }

    /// Fetch the score-sheets PDF (scope: meet | block | race). Returns the
    /// raw PDF bytes for a share/print sheet.
    public func fetchScoreSheetsPDF(meetID: String, scope: String,
                                    raceID: String? = nil, blockID: String? = nil,
                                    layout: String = "compact") async throws -> Data {
        var components = URLComponents(string: "/portal/meet/\(meetID)/score-sheets/print")!
        var items = [URLQueryItem(name: "scope", value: scope),
                     URLQueryItem(name: "layout", value: layout),
                     URLQueryItem(name: "format", value: "pdf")]
        if let raceID { items.append(URLQueryItem(name: "raceId", value: raceID)) }
        if let blockID { items.append(URLQueryItem(name: "blockId", value: blockID)) }
        components.queryItems = items
        guard let url = URL(string: components.string ?? "", relativeTo: baseURL)?.absoluteURL else {
            throw APIError.invalidURL
        }
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(from: url)
        } catch {
            throw APIError.network(error)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.server("No response from server.") }
        guard http.statusCode == 200,
              (http.value(forHTTPHeaderField: "Content-Type") ?? "").contains("pdf") else {
            throw APIError.server("Couldn't fetch the score sheets — log in again and retry.")
        }
        return data
    }

    /// Same redirect-success semantics as portalRedirectPost but with a JSON
    /// body (needed for real booleans and arrays on add/edit registration).
    private func portalRedirectPostJSON(_ path: String,
                                        body: [String: Any],
                                        expectedRedirectPrefix: String) async throws -> String {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await sendRedirectRequest(req, expectedRedirectPrefix: expectedRedirectPrefix)
    }

    /// Form POST to a portal endpoint whose success answer is a redirect
    /// back into the meet. Returns the redirect Location. The server signals
    /// a lost-permission (or deleted-meet) failure on these routes with a
    /// bare redirect to /portal — that must NOT read as success.
    private func portalRedirectPost(_ path: String,
                                    formFields: [(String, String)] = [],
                                    expectedRedirectPrefix: String) async throws -> String {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = Self.formEncode(formFields) ?? Data()
        return try await sendRedirectRequest(req, expectedRedirectPrefix: expectedRedirectPrefix)
    }

    private func sendRedirectRequest(_ req: URLRequest, expectedRedirectPrefix: String) async throws -> String {

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
            guard location.contains(expectedRedirectPrefix) else {
                throw APIError.server("You no longer have edit access to this meet.")
            }
            return location
        }
        try Self.throwIfError(http: http, data: data)
        throw APIError.server("Unexpected response from server.")
    }

    // ── JSON POST plumbing for the /api/meet/* block endpoints ───────────

    /// JSON POST (arrays allowed in the body) with redirects suppressed, so
    /// an expired session surfaces as .unauthorized instead of a login page.
    private func apiPost<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        let (data, http) = try await apiPostRaw(path, body: body)
        try Self.throwIfError(http: http, data: data)
        return try decodeOrThrow(T.self, from: data)
    }

    private func apiPostRaw(_ path: String, body: [String: Any]) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

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
            throw APIError.server("Unexpected redirect from server.")
        }
        return (data, http)
    }

    /// Shared error mapping for API responses: JSON `{ok:false,error}` first,
    /// then short plain-text bodies (several block endpoints answer 400 with
    /// bare text), then a generic message.
    private static func throwIfError(http: HTTPURLResponse, data: Data) throws {
        guard http.statusCode >= 400 else { return }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if let decoded = try? JSONDecoder().decode(SimpleOKResponse.self, from: data), let message = decoded.error {
            throw APIError.server(message)
        }
        if let text = String(data: data, encoding: .utf8), !text.isEmpty, text.count < 200, !text.contains("<") {
            throw APIError.server(text)
        }
        if http.statusCode == 403 { throw APIError.server("You don't have access to this.") }
        throw APIError.server("Request failed (\(http.statusCode)).")
    }

    private func decodeOrThrow<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    /// JSON POST with an arbitrary object body (nested arrays/dicts), for
    /// endpoints like relay-builder/teams that need more than flat strings.
    private func postJSONObject<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: req) }
        catch { throw APIError.network(error) }
        guard let http = response as? HTTPURLResponse else { throw APIError.server("No response from server.") }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 403 { throw APIError.server("You don't have access to this.") }
        if http.statusCode >= 400 { throw APIError.server("Request failed (\(http.statusCode)).") }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(error) }
    }

    // ── Relay builder (director) ──────────────────────────────────────────
    public func relayBuilder(meetID: String) async throws -> RelayBuilderData {
        try await request("/api/v1/meets/\(meetID)/relay-builder")
    }

    public func saveRelayTeams(meetID: String,
                               teams: [(divisionId: String, memberRegIds: [String])]) async throws -> RelayTeamsResponse {
        let payload: [String: Any] = ["teams": teams.map { ["divisionId": $0.divisionId, "memberRegIds": $0.memberRegIds] }]
        return try await postJSONObject("/api/v1/meets/\(meetID)/relay-builder/teams", body: payload)
    }

    public func generateRelays(meetID: String) async throws -> RelayGenerateResponse {
        try await postJSONObject("/api/v1/meets/\(meetID)/relay-builder/generate", body: [:])
    }

    // ── Relay teams (coach) ───────────────────────────────────────────────
    // A coach builds their own club's teams; the director generates the races.
    public func coachRelayBuilder(meetID: String) async throws -> CoachRelayBuilderData {
        try await request("/api/v1/meets/\(meetID)/coach/relay-builder")
    }

    public func saveCoachRelayTeams(meetID: String,
                                    teams: [(divisionId: String, memberRegIds: [String])]) async throws -> RelayTeamsResponse {
        let payload: [String: Any] = ["teams": teams.map { ["divisionId": $0.divisionId, "memberRegIds": $0.memberRegIds] }]
        return try await postJSONObject("/api/v1/meets/\(meetID)/coach/relay-builder/teams", body: payload)
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
