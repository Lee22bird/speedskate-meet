import Foundation
import SwiftUI

/// One lane's editable result-entry state on the iPad tabulator board.
/// Codable so in-progress entries can be persisted as a local draft (so a
/// crash / backgrounding / relaunch never loses typed places or times).
public struct LaneEdit: Identifiable, Codable {
    public let lane: Int
    public let registrationId: String?
    public var skaterName: String
    public var team: String
    public var helmetNumber: String?
    public var sponsor: String?
    public var place: String
    public var time: String
    public var status: String
    public var record: Bool
    public var dqRuleReference: String
    public var dqOfficialNotes: String
    public var dqTimestamp: String

    public var id: Int { lane }
    public var hasSkater: Bool { !skaterName.trimmingCharacters(in: .whitespaces).isEmpty }
    public var isDQ: Bool { status == "DQ" || status.hasPrefix("DQ_") }

    init(from lane: ExportLane) {
        self.lane = lane.lane
        self.registrationId = lane.registrationId
        self.skaterName = lane.skaterName
        self.team = lane.team
        self.helmetNumber = lane.helmetNumber
        self.sponsor = lane.sponsor
        self.place = lane.place
        self.time = lane.time
        self.status = lane.status
        self.record = lane.record
        self.dqRuleReference = lane.dqRuleReference ?? ""
        self.dqOfficialNotes = lane.dqOfficialNotes ?? ""
        self.dqTimestamp = lane.dqTimestamp ?? ""
    }

    func submission() -> LaneResultSubmission {
        LaneResultSubmission(lane: lane, skaterName: skaterName, team: team,
                             place: place, time: time, status: status, record: record,
                             dqRuleReference: dqRuleReference,
                             dqOfficialNotes: dqOfficialNotes,
                             dqTimestamp: dqTimestamp)
    }
}

/// Drives the iPad tabulator board: hydrates the current race's full detail
/// from the website's desktop-export endpoint, holds in-progress edits, and
/// posts them to the same judges/save endpoint the website uses. Never
/// reimplements ranking or progression — Save/Close hand everything to the
/// server and re-read state.
@MainActor
public final class TabulatorViewModel: ObservableObject {
    @Published public private(set) var race: ExportRace?
    @Published public private(set) var blockName: String?
    @Published public var lanes: [LaneEdit] = []
    @Published public var resultsMode: String = "places"
    @Published public var notes: String = ""
    @Published public var finishOrder: [Int] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var isSaving = false
    @Published public private(set) var isDirty = false
    @Published public var errorMessage: String?
    @Published public var savedFlash = false
    /// Set when the meet's current race moved while this screen had unsaved
    /// edits — the view shows a banner instead of clobbering the entry.
    @Published public var pointerMovedAway = false
    /// True when a locally-saved draft of unsaved entries was restored on load
    /// (the view shows a "restored your entries" banner with a Discard option).
    @Published public var restoredDraft = false

    private let api: APIClient
    private var loadedRaceID: String?
    private var currentMeetID: String?
    private var draftSaveTask: Task<Void, Never>?

    public init(api: APIClient = .shared) {
        self.api = api
    }

    /// Load (or reload) the meet's current race for editing.
    public func loadCurrentRace(meetID: String, currentRaceID: String?) async {
        guard let raceID = currentRaceID else {
            race = nil
            lanes = []
            loadedRaceID = nil
            return
        }
        guard raceID != loadedRaceID || race == nil else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let meet = try await api.desktopExport(meetID: meetID)
            guard let exportRace = meet.race(id: raceID) else {
                errorMessage = "Race not found in meet data."
                return
            }
            apply(race: exportRace, from: meet)
            loadedRaceID = raceID
            currentMeetID = meetID
            errorMessage = nil
            pointerMovedAway = false
            restoreDraftIfAny(for: exportRace)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Called by the view whenever the polled race-day state reports a new
    /// current race id underneath us.
    public func pointerChanged(to newRaceID: String?, meetID: String) async {
        guard let newRaceID, newRaceID != loadedRaceID else { return }
        if isDirty {
            pointerMovedAway = true
        } else {
            loadedRaceID = nil
            await loadCurrentRace(meetID: meetID, currentRaceID: newRaceID)
        }
    }

    /// If an unsaved draft exists for the just-loaded race and still matches its
    /// lane shape, restore the typed entries over the server's saved version.
    private func restoreDraftIfAny(for exportRace: ExportRace) {
        restoredDraft = false
        guard let meetID = currentMeetID,
              let draft = TabulationDraftStore.shared.load(meetID: meetID, raceID: exportRace.id)
        else { return }
        guard !draft.lanes.isEmpty,
              draft.laneSet == Set(exportRace.laneEntries.map(\.lane)) else {
            TabulationDraftStore.shared.clear(meetID: meetID, raceID: exportRace.id)
            return
        }
        lanes = draft.lanes
        finishOrder = draft.finishOrder
        resultsMode = draft.resultsMode
        notes = draft.notes
        isDirty = true
        restoredDraft = true
    }

    private func apply(race exportRace: ExportRace, from meet: ExportMeet) {
        race = exportRace
        blockName = meet.blockName(forRace: exportRace.id)
        lanes = exportRace.laneEntries.map(LaneEdit.init)
        resultsMode = exportRace.resultsMode
        notes = exportRace.notes
        finishOrder = []
        isDirty = false
    }

    // ── Edits ────────────────────────────────────────────────────────────

    public func markDirty() {
        isDirty = true
        scheduleDraftSave()
    }

    // ── Local draft (never lose typed entries) ───────────────────────────

    /// Debounced disk snapshot of the current entries. Cheap (small JSON).
    private func scheduleDraftSave() {
        draftSaveTask?.cancel()
        draftSaveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            self?.persistDraft()
        }
    }

    private func persistDraft() {
        guard isDirty, let meetID = currentMeetID, let raceID = loadedRaceID else { return }
        TabulationDraftStore.shared.save(
            TabulationDraft(meetID: meetID, raceID: raceID, lanes: lanes,
                            finishOrder: finishOrder, resultsMode: resultsMode,
                            notes: notes, savedAt: Date()))
    }

    private func clearDraft() {
        draftSaveTask?.cancel()
        if let meetID = currentMeetID, let raceID = loadedRaceID {
            TabulationDraftStore.shared.clear(meetID: meetID, raceID: raceID)
        }
    }

    /// Throw away the restored draft and reload the server's saved version.
    public func discardDraft(meetID: String) async {
        restoredDraft = false
        clearDraft()
        loadedRaceID = nil
        await loadCurrentRace(meetID: meetID, currentRaceID: race?.id)
    }

    /// Skaters still waiting to be placed (has a skater, not DQ'd, not yet
    /// tapped) — the buttons the operator taps as racers cross the line.
    public var unplacedLanes: [LaneEdit] {
        lanes.filter { $0.hasSkater && !$0.isDQ && !finishOrder.contains($0.lane) }
            .sorted { $0.lane < $1.lane }
    }

    /// The finish order built so far, in place order (1..N).
    public var placedLanes: [LaneEdit] {
        finishOrder.compactMap { lane in lanes.first { $0.lane == lane } }
    }

    /// Total skaters eligible for a place (excludes empty lanes and DQs).
    public var placeableCount: Int {
        lanes.filter { $0.hasSkater && !$0.isDQ }.count
    }

    /// Finish-order tray: tapping skaters in the order they crossed writes
    /// places 1..N (the website's primary quick-entry flow).
    public func tapFinishOrder(lane: Int) {
        guard !finishOrder.contains(lane) else { return }
        finishOrder.append(lane)
        renumberFinishOrder()
        markDirty()
    }

    /// Remove one skater from the finish order and renumber everyone behind
    /// them — tapping a placed skater (mis-tap fix) or the × on their row.
    public func unplace(lane: Int) {
        guard let pos = finishOrder.firstIndex(of: lane) else { return }
        finishOrder.remove(at: pos)
        if let idx = lanes.firstIndex(where: { $0.lane == lane }) {
            lanes[idx].place = ""
        }
        renumberFinishOrder()
        markDirty()
    }

    /// Undo the most recent tap.
    public func undoLastFinish() {
        guard let last = finishOrder.last else { return }
        unplace(lane: last)
    }

    /// Auto-place every remaining un-placed skater (in lane order) — the
    /// convenience real timing software offers when only the last skater(s)
    /// are left to tap.
    public func placeRemaining() {
        for lane in unplacedLanes {
            finishOrder.append(lane.lane)
        }
        renumberFinishOrder()
        markDirty()
    }

    public func clearFinishOrder() {
        for lane in finishOrder {
            if let idx = lanes.firstIndex(where: { $0.lane == lane }) {
                lanes[idx].place = ""
            }
        }
        finishOrder = []
        markDirty()
    }

    /// Rewrite place strings to match the current finish order (1..N).
    private func renumberFinishOrder() {
        for (index, lane) in finishOrder.enumerated() {
            if let idx = lanes.firstIndex(where: { $0.lane == lane }) {
                lanes[idx].place = String(index + 1)
            }
        }
    }

    /// Seed the tray highlight from already-saved places so reopening a
    /// half-entered race looks the same as the website.
    public func seedFinishOrderFromPlaces() {
        let placed = lanes
            .filter { !$0.place.isEmpty && Int($0.place) != nil }
            .sorted { (Int($0.place) ?? 0) < (Int($1.place) ?? 0) }
        finishOrder = placed.map(\.lane)
    }

    public func setStatus(_ status: String, forLane lane: Int) {
        guard let idx = lanes.firstIndex(where: { $0.lane == lane }) else { return }
        lanes[idx].status = status
        if !(status == "DQ" || status.hasPrefix("DQ_")) {
            lanes[idx].dqRuleReference = ""
            lanes[idx].dqOfficialNotes = ""
            lanes[idx].dqTimestamp = ""
        } else if lanes[idx].dqTimestamp.isEmpty {
            lanes[idx].dqTimestamp = ISO8601DateFormatter().string(from: Date())
        }
        markDirty()
    }

    // ── Time-trial session (the isTimeTrial RACE) ────────────────────────
    // Queue lanes come from the race's laneEntries (the server rebuilds them
    // from opted-in registrations on race-day loads): waiting = no time yet
    // (queue order), posted = has a time (fastest first).

    public var ttWaiting: [LaneEdit] {
        lanes.filter { $0.time.trimmingCharacters(in: .whitespaces).isEmpty && $0.hasSkater }
    }

    public var ttPosted: [LaneEdit] {
        lanes.filter { !$0.time.trimmingCharacters(in: .whitespaces).isEmpty }
            .sorted { (Double($0.time) ?? 999) < (Double($1.time) ?? 999) }
    }

    /// Post one skater's time via the website's tt-post endpoint. The server
    /// accepts any string, so we validate numerically here (parity with the
    /// dedicated screen's rules) and normalize to two decimals.
    public func postTTTime(meetID: String, registrationID: String, rawTime: String) async -> Bool {
        guard let race else { return false }
        let trimmed = rawTime.trimmingCharacters(in: .whitespaces)
        guard let n = Double(trimmed), n.isFinite, n > 0 else {
            errorMessage = "Enter a valid time, like 10.42."
            return false
        }
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            try await api.ttPostTime(meetID: meetID, raceID: race.id,
                                     registrationID: registrationID,
                                     time: String(format: "%.2f", n))
            errorMessage = nil
            await reloadRace(meetID: meetID)
            return true
        } catch {
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            await reloadRace(meetID: meetID)
            errorMessage = message
            return false
        }
    }

    public func removeTTTime(meetID: String, registrationID: String) async {
        guard let race else { return }
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await api.ttRemoveTime(meetID: meetID, raceID: race.id, registrationID: registrationID)
            errorMessage = nil
            await reloadRace(meetID: meetID)
        } catch {
            // Reload FIRST, then set the message — the reload clears
            // errorMessage, so setting it afterward keeps it visible.
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            await reloadRace(meetID: meetID)
            errorMessage = message
        }
    }

    private func reloadRace(meetID: String) async {
        let raceID = race?.id
        loadedRaceID = nil
        await loadCurrentRace(meetID: meetID, currentRaceID: raceID)
    }

    // ── Save / Close ─────────────────────────────────────────────────────

    public func save(meetID: String, close: Bool) async -> Bool {
        guard let race else { return false }
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            let response = try await api.saveRaceResults(
                meetID: meetID,
                raceID: race.id,
                resultsMode: resultsMode,
                notes: notes,
                action: close ? "close" : "save",
                lanes: lanes.map { $0.submission() }
            )
            guard response.ok else {
                errorMessage = "The server didn't accept that save."
                return false
            }
            errorMessage = nil
            clearDraft()          // entries are safely on the server now
            isDirty = false
            restoredDraft = false
            if close {
                // The server advanced the meet pointer; force a fresh load.
                loadedRaceID = nil
                self.race = nil
                lanes = []
            } else {
                savedFlash = true
            }
            return true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return false
        }
    }
}
