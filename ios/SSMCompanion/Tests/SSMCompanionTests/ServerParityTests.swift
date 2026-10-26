import XCTest
@testable import SSMCompanion

/// Locks the iPad's local copies of server rules to the website's behaviour:
/// rolling-start race order (services/raceDay.js, services/rollingStart.js),
/// registration availability (services/registrationAvailability.js), relays
/// by team size and event pricing (routes/registrationRoutes.js,
/// services/pricing.js).
final class ServerParityTests: XCTestCase {

    private func meet(_ json: String) throws -> ExportMeet {
        try JSONDecoder().decode(ExportMeet.self, from: Data(json.utf8))
    }

    // ── Rolling-start finals ─────────────────────────────────────────────

    /// After startRollingFinal the two heats are removed from their block and
    /// marked superseded; the final takes heat 1's slot. The iPad must not
    /// list the heats anywhere (they used to trail the order as "unassigned").
    func testSupersededHeatsAreDroppedFromRaceOrderAndUnassignedPool() throws {
        let m = try meet("""
        {"id":"m1","races":[
          {"id":"h1","stage":"heat","heatNumber":1,"rollingStartSupersededBy":"f1","status":"open"},
          {"id":"h2","stage":"heat","heatNumber":2,"rollingStartSupersededBy":"f1","status":"open"},
          {"id":"f1","stage":"final","rollingStartFinal":true,"startType":"rolling","status":"open"},
          {"id":"other","stage":"final","status":"open"}],
         "blocks":[{"id":"b1","name":"Block 1","raceIds":["f1","other"]}]}
        """)
        XCTAssertEqual(m.races.map(\.id), ["f1", "other"])
        XCTAssertEqual(m.unassignedRaceIDs(), [])
        XCTAssertNil(m.race(id: "h1"))
        XCTAssertEqual(m.race(id: "f1")?.stageLabel, "Rolling Final")
        XCTAssertEqual(m.race(id: "other")?.stageLabel, "Final")
    }

    func testBlankSupersededMarkerIsNotTreatedAsSuperseded() throws {
        let m = try meet("""
        {"id":"m1","races":[{"id":"h1","stage":"heat","heatNumber":1,"rollingStartSupersededBy":""}],"blocks":[]}
        """)
        XCTAssertEqual(m.races.map(\.id), ["h1"])
    }

    // ── Registration availability ────────────────────────────────────────

    func testAvailabilityMirrorsServer() throws {
        let m = try meet("""
        {"id":"m1","allowChallengeUp":true,
         "groups":[{"divisions":{"novice":{"enabled":false},"elite":{"enabled":true}}}],
         "openGroups":[{"enabled":false}],"quadGroups":[{"enabled":true}]}
        """)
        XCTAssertEqual(m.registrationAvailability,
                       RegistrationAvailability(challengeUp: true, novice: false, elite: true, open: false, quad: true))
    }

    func testChallengeUpNeedsNoviceOrEliteEvenWhenAllowed() throws {
        let m = try meet("""
        {"id":"m1","allowChallengeUp":true,"groups":[{"divisions":{"novice":{"enabled":false},"elite":{"enabled":false}}}]}
        """)
        XCTAssertFalse(m.registrationAvailability.challengeUp)
    }

    // ── Relays by team size ──────────────────────────────────────────────

    func testRelaySizesComeFromEnabledTemplatesOnly() throws {
        let m = try meet("""
        {"id":"m1","relayTemplates":[
          {"divisionId":"r2_primary_boys","type":"2 Person","enabled":true},
          {"divisionId":"mssl_r3_juvenile","type":"","enabled":true},
          {"divisionId":"r4_open","type":"4 Person","enabled":false},
          {"divisionId":"","type":"4 Person","enabled":true}]}
        """)
        XCTAssertEqual(m.registrationRelaySizes, [2, 3])
    }

    func testTeamSizeParsing() {
        XCTAssertEqual(ExportRelayTemplate.teamSize(explicit: 4, type: "2 Person", divisionId: "r2_x"), 4)
        XCTAssertEqual(ExportRelayTemplate.teamSize(explicit: nil, type: "3 Person", divisionId: ""), 3)
        XCTAssertEqual(ExportRelayTemplate.teamSize(explicit: nil, type: "", divisionId: "mssl_r2_juvenile"), 2)
        XCTAssertEqual(ExportRelayTemplate.teamSize(explicit: nil, type: "", divisionId: "quad_relay"), 0)
    }

    /// The server builds relays ONLY from relay2Person/3/4. The iPad used to
    /// send relay event ids with the size flags false, which registered no
    /// relays at all.
    func testFormPostsRelaySizeFlagsNotEventIds() {
        var form = RegistrationFormState()
        form.name = "Test"
        form.relay3Person = true
        let body = form.jsonBody()
        XCTAssertEqual(body["relay3Person"] as? Bool, true)
        XCTAssertEqual(body["relay2Person"] as? Bool, false)
        XCTAssertNil(body["relayEventIds"])
        XCTAssertNil(body["quadRelayEventIds"])
    }

    func testEditingAQuadOnlyRelayKeepsItsSize() throws {
        let reg = try JSONDecoder().decode(ExportRegistration.self, from: Data("""
        {"id":"r1","name":"A","options":{"quadRelay2Person":true,"quadRelayEventIds":["q2"]}}
        """.utf8))
        let form = RegistrationFormState(from: reg)
        XCTAssertTrue(form.relay2Person)
        XCTAssertFalse(form.relay3Person)
    }

    // ── Pricing (services/pricing.js) ────────────────────────────────────

    private func pricedMeet() throws -> ExportMeet {
        try meet("""
        {"id":"m1","baseEntryFee":40,"additionalRaceFee":10,"maxRegistrationFee":0,"allowChallengeUp":true,
         "groups":[{"divisions":{"novice":{"enabled":true},"elite":{"enabled":true}}}],
         "openGroups":[{"enabled":false}],
         "relayTemplates":[{"divisionId":"r2_a","type":"2 Person","enabled":true},
                           {"divisionId":"q2_a","type":"2 Person","discipline":"quad","enabled":true},
                           {"divisionId":"r3_a","type":"3 Person","enabled":true}]}
        """)
    }

    func testChallengeUpIsChargedAsAnAdditionalEvent() throws {
        var form = RegistrationFormState()
        form.elite = true
        form.challengeUp = true
        let p = form.costPreview(for: try pricedMeet())
        XCTAssertEqual(p.categories, 2)
        XCTAssertEqual(p.total, 50)
    }

    func testUnofferedEventsAreNotCharged() throws {
        var form = RegistrationFormState()
        form.elite = true
        form.open = true   // meet has no open groups — server drops it
        let p = form.costPreview(for: try pricedMeet())
        XCTAssertEqual(p.categories, 1)
        XCTAssertEqual(p.total, 40)
    }

    func testRelaySizeCountsOnceEvenWithInlineAndQuadEvents() throws {
        var form = RegistrationFormState()
        form.elite = true
        form.relay2Person = true   // one inline + one quad 2-person event → one category
        form.relay3Person = true
        form.relay4Person = true   // no 4-person event at this meet → not charged
        let p = form.costPreview(for: try pricedMeet())
        XCTAssertEqual(p.categories, 3)
        XCTAssertEqual(p.total, 60)
    }

    func testMaximumFeeCap() throws {
        let m = try meet("""
        {"id":"m1","baseEntryFee":40,"additionalRaceFee":25,"maxRegistrationFee":70,
         "groups":[{"divisions":{"novice":{"enabled":true},"elite":{"enabled":true}}}],"quadGroups":[{"enabled":true}]}
        """)
        var form = RegistrationFormState()
        form.novice = true; form.elite = true; form.quad = true
        let p = form.costPreview(for: m)
        XCTAssertEqual(p.uncapped, 90)
        XCTAssertEqual(p.total, 70)
        XCTAssertTrue(p.capped)
    }
}
