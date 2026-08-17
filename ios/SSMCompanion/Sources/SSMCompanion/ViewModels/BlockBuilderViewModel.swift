import Foundation
import SwiftUI

/// Drives the iPad Block Builder. Hydrates the full schedule from the
/// website's desktop-export endpoint and calls the same JSON block endpoints
/// the website's drag-and-drop UI posts to. Every mutation is
/// call-then-refresh — the server owns ordering, validation, and the
/// current-race pointer; this class never reimplements any of it.
///
/// Derived values (pace, day options, per-block time chips, numbering) are
/// recomputed once per meet load, not per body evaluation — the math matches
/// views/blockBuilderView.js exactly.
@MainActor
public final class BlockBuilderViewModel: ObservableObject {
    @Published public private(set) var meet: ExportMeet?
    @Published public private(set) var isLoading = false
    @Published public private(set) var isWorking = false
    @Published public var errorMessage: String?
    @Published public var statusFlash: String?
    /// Race ids picked in multi-select mode (move / merge).
    @Published public var selectedRaceIDs: Set<String> = []
    @Published public var expandedBlockIDs: Set<String> = []
    /// Set when generate-schedule answered 409 needsConfirm — the view shows
    /// a replace-confirmation dialog (Replace / Append-unassigned / Cancel).
    /// Assigned only after the request round-trip fully settles, so the
    /// dialog's buttons can never race `isWorking`.
    @Published public var pendingGenerate: PendingGenerate?
    /// Unassigned-pool filters (mirrors the website's search/class/distance).
    @Published public var poolSearch: String = ""
    @Published public var poolClass: String = "all"
    @Published public var poolDistance: Int = 0

    public struct PendingGenerate: Identifiable {
        public let style: String
        public let assignedCount: Int
        public var id: String { style }
    }

    private let api: APIClient
    private var meetID = ""

    public init(api: APIClient = .shared) {
        self.api = api
    }

    // ── Loading ──────────────────────────────────────────────────────────

    public func load(meetID: String) async {
        if self.meetID != meetID {
            self.meetID = meetID
            meet = nil
            selectedRaceIDs = []
            expandedBlockIDs = []
        }
        guard meet == nil else { return }
        isLoading = true
        defer { isLoading = false }
        await refresh()
    }

    public func refresh() async {
        guard !meetID.isEmpty else { return }
        do {
            meet = try await api.desktopExport(meetID: meetID)
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        recomputeDerived()
    }

    // ── Derived state (cached per load) ──────────────────────────────────

    public private(set) var racesByID: [String: ExportRace] = [:]
    public private(set) var ttEventsByID: [String: ExportTimeTrialEvent] = [:]
    public private(set) var unassignedRaces: [ExportRace] = []
    /// TT events no block claims — the website shows these at the top of the
    /// Unassigned pool (the schedule generator never places them, so the pool
    /// is the only way back onto the schedule).
    public private(set) var unassignedTTEvents: [ExportTimeTrialEvent] = []
    public private(set) var paceMinutes: Double = 3
    public private(set) var dayOptions: [DayOption] = [DayOption(value: "Day 1", label: "Day 1")]
    private var displayNames: [String: String] = [:]
    private var blockMinutes: [String: Double] = [:]
    private var blockClocks: [String: String] = [:]
    private var dayTotals: [String: String] = [:]

    public var blocks: [ExportBlock] { meet?.blocks ?? [] }

    /// Resolved races for a block, first occurrence only — legacy meet data
    /// can carry the same race id twice in raceIds, and duplicate ForEach
    /// identities break SwiftUI. (Moving such a race out and back repairs
    /// the duplication server-side: move-race strips every occurrence.)
    public func races(in block: ExportBlock) -> [ExportRace] {
        var seen = Set<String>()
        return block.raceIds.compactMap { id in
            guard seen.insert(id).inserted else { return nil }
            return racesByID[id]
        }
    }

    public func displayName(for block: ExportBlock) -> String {
        displayNames[block.id] ?? (block.name.isEmpty ? "Block" : block.name)
    }

    public func dividerIcon(_ block: ExportBlock) -> String {
        switch block.type {
        case "break": return "☕"
        case "lunch": return "🍽️"
        case "awards": return "🏆"
        case "practice": return "🛼"
        default: return "📌"
        }
    }

    public func estimatedMinutes(for block: ExportBlock) -> Double {
        blockMinutes[block.id] ?? 0
    }

    /// "~2h 15m • 9:30am" style chip (clock only when the meet has a start
    /// time) — same numbers as the website's chips.
    public func timeChip(for block: ExportBlock) -> String {
        var chip = "~" + Self.formatDuration(estimatedMinutes(for: block))
        if let clock = blockClocks[block.id] {
            chip += " • \(clock)"
        }
        return chip
    }

    public func dayTotalLabel(for day: String) -> String {
        dayTotals[day] ?? ""
    }

    public func dayLabel(for value: String) -> String {
        dayOptions.first { $0.value == value }?.label ?? value
    }

    /// Unassigned pool after the website's search/class/distance filters.
    public var filteredUnassigned: [ExportRace] {
        let query = poolSearch.trimmingCharacters(in: .whitespaces).lowercased()
        return unassignedRaces.filter { race in
            if !query.isEmpty, !race.groupLabel.lowercased().contains(query) { return false }
            if poolClass != "all", (race.division ?? "").lowercased() != poolClass { return false }
            if poolDistance > 0, race.dayIndex != poolDistance { return false }
            return true
        }
    }

    /// The two selected races as a same-block ordered pair, or nil. Mirrors
    /// the website's merge tool, which only merges races within one block —
    /// cross-block/pool merges would create states its race-day rendering
    /// can't honor. Order comes from the block, so the earlier race is the
    /// lead (raceIdA).
    public var mergeablePair: (String, String)? {
        guard selectedRaceIDs.count == 2,
              selectedRaceIDs.allSatisfy({ racesByID[$0]?.canMerge == true }) else { return nil }
        for block in blocks where !block.isBreakDivider {
            let ordered = block.raceIds.filter { selectedRaceIDs.contains($0) }
            if ordered.count == 2 { return (ordered[0], ordered[1]) }
        }
        return nil
    }

    public var canMergeSelection: Bool { mergeablePair != nil }

    /// Selected ids in canonical display order (block order first, then pool
    /// order). The move-races endpoint appends in submitted order, so this
    /// order is load-bearing — a Set's hash order would scramble heats/finals.
    private func orderedSelection() -> [String] {
        var display: [String] = []
        for block in blocks { display += block.raceIds }
        display += unassignedRaces.map(\.id)
        var result = display.filter { selectedRaceIDs.contains($0) }
        result += selectedRaceIDs.subtracting(result).sorted()
        return result
    }

    /// Race-row label, matching the website's two-line format.
    public func raceTitle(_ race: ExportRace) -> String {
        var title = "\(race.typeTag)\(race.groupLabel)"
        if let division = race.division, !division.isEmpty {
            title += " • \(division.capitalized)"
        }
        return title
    }

    public func raceMeta(_ race: ExportRace) -> String {
        var parts = [race.distanceLabel]
        if let ordinal = race.dayIndex, ordinal > 0 { parts.append("D\(ordinal)") }
        parts.append(race.stageLabel)
        if let startType = race.startType, !startType.isEmpty { parts.append(startType.capitalized) }
        return parts.joined(separator: " • ")
    }

    /// Which block currently holds this race or TT event, if any.
    public func blockID(containing itemID: String) -> String? {
        blocks.first { $0.raceIds.contains(itemID) || $0.timeTrialEventIds.contains(itemID) }?.id
    }

    /// The control center's Race Summary tiles.
    public var summaryCounts: (inline: Int, open: Int, quad: Int, timeTrials: Int, relays: Int, additional: Int) {
        let races = meet?.races ?? []
        return (
            inline: races.filter { !$0.isOpenRace && !$0.isQuadRace && !$0.isTimeTrial && !$0.isRelayRace }.count,
            open: races.filter(\.isOpenRace).count,
            quad: races.filter(\.isQuadRace).count,
            timeTrials: (meet?.timeTrialEvents.isEmpty == false) ? 1 : 0,
            relays: races.filter(\.isRelayRace).count,
            additional: races.filter { $0.isAdditionalRace || $0.division == "additional" }.count
        )
    }

    /// Merge-badge partner labels for a merged race.
    public func mergePartners(of race: ExportRace) -> [ExportRace] {
        guard let groupID = race.mergeGroupId else { return [] }
        return (meet?.races ?? []).filter { $0.mergeGroupId == groupID && $0.id != race.id }
    }

    // ── Derived recompute (once per meet load) ───────────────────────────

    public struct DayOption: Identifiable, Hashable {
        public let value: String
        public let label: String
        public var id: String { value }
    }

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain = ISO8601DateFormatter()
    private static let ymdFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static let dowFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "E M/d"
        return f
    }()

    private static let dividerDefaultMinutes: [String: Double] = [
        "break": 15, "lunch": 45, "awards": 30, "practice": 30,
    ]

    private func recomputeDerived() {
        guard let meet else {
            racesByID = [:]
            ttEventsByID = [:]
            unassignedRaces = []
            unassignedTTEvents = []
            paceMinutes = 3
            dayOptions = [DayOption(value: "Day 1", label: "Day 1")]
            displayNames = [:]
            blockMinutes = [:]
            blockClocks = [:]
            dayTotals = [:]
            return
        }

        racesByID = Dictionary(meet.races.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        ttEventsByID = Dictionary(meet.timeTrialEvents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        unassignedRaces = meet.unassignedRaceIDs().compactMap { racesByID[$0] }
        let assignedTT = Set(meet.blocks.flatMap(\.timeTrialEventIds))
        unassignedTTEvents = meet.timeTrialEvents.filter { !assignedTT.contains($0.id) }

        // Pace: median (upper middle, like the server) of consecutive
        // closedAt gaps in 0.5–30min, ≥3 needed, clamp 1–10, 0.1 precision.
        let stamps = meet.races
            .compactMap { $0.closedAt }
            .compactMap { Self.isoFractional.date(from: $0) ?? Self.isoPlain.date(from: $0) }
            .sorted()
        let gaps = zip(stamps.dropFirst(), stamps)
            .map { $0.timeIntervalSince($1) / 60 }
            .filter { $0 >= 0.5 && $0 <= 30 }
            .sorted()
        if gaps.count >= 3 {
            paceMinutes = (min(max(gaps[gaps.count / 2], 1), 10) * 10).rounded() / 10
        } else {
            paceMinutes = 3
        }

        // Day options: meet.date..endDate span (cap 31, fallback 3), never
        // dropping a referenced "Day N", custom strings kept selectable.
        let startDate = Self.ymdFormatter.date(from: meet.date)
        let endDate = Self.ymdFormatter.date(from: meet.endDate) ?? startDate
        var count = 3
        if let startDate {
            let span = Calendar.current.dateComponents([.day], from: startDate, to: endDate ?? startDate).day ?? 0
            count = min(max(span + 1, 1), 31)
        }
        for block in meet.blocks {
            if block.day.range(of: #"^Day (\d+)$"#, options: .regularExpression) != nil,
               let n = Int(block.day.dropFirst(4)) {
                count = min(max(count, n), 31)
            }
        }
        var options: [DayOption] = (1...count).map { n in
            var label = "Day \(n)"
            if let startDate, let dayDate = Calendar.current.date(byAdding: .day, value: n - 1, to: startDate) {
                label += " — \(Self.dowFormatter.string(from: dayDate))"
            }
            return DayOption(value: "Day \(n)", label: label)
        }
        let known = Set(options.map(\.value))
        for block in meet.blocks {
            let day = block.day.trimmingCharacters(in: .whitespaces)
            if !day.isEmpty, !known.contains(day), !options.contains(where: { $0.value == day }) {
                options.append(DayOption(value: day, label: day))
            }
        }
        dayOptions = options

        // Auto-numbering: every block NOT in the website's breakTypes set
        // gets a number (that includes the league generator's 'divider'
        // warmup blocks — website parity).
        var names: [String: String] = [:]
        var number = 0
        for block in meet.blocks {
            if !block.isBreakDivider {
                number += 1
                let trimmed = block.name.trimmingCharacters(in: .whitespaces)
                let isPlaceholder = trimmed.isEmpty || trimmed.range(of: #"^Block \d+$"#, options: .regularExpression) != nil
                names[block.id] = isPlaceholder ? "Block \(number)" : trimmed
            } else {
                names[block.id] = block.name
            }
        }
        displayNames = names

        // Per-block minutes: durationMin override; else a known break-type
        // default; else the per-item sum (unknown types like the league
        // warmups fall through and cost their item sum — 0 when raceless).
        var minutes: [String: Double] = [:]
        for block in meet.blocks {
            if let override = block.durationMin, override > 0 {
                minutes[block.id] = Double(override)
            } else if let dividerDefault = Self.dividerDefaultMinutes[block.type] {
                minutes[block.id] = dividerDefault
            } else {
                let ttMinutes = block.timeTrialEventIds
                    .compactMap { ttEventsByID[$0] }
                    .map { max(10, Double($0.participantCount) * 1.5) }
                    .reduce(0, +)
                minutes[block.id] = ttMinutes + Double(block.raceIds.count) * paceMinutes
            }
        }
        blockMinutes = minutes

        // Clocks: cumulative per day from meet.startTime; day totals.
        var clocks: [String: String] = [:]
        var totals: [String: String] = [:]
        let startParts = meet.startTime.split(separator: ":")
        let dayStart: Double? = startParts.count == 2
            ? (Double(startParts[0]).flatMap { h in Double(startParts[1]).map { m in h * 60 + m } })
            : nil
        var cumulativeByDay: [String: Double] = [:]
        for block in meet.blocks {
            let est = minutes[block.id] ?? 0
            if let dayStart {
                let before = cumulativeByDay[block.day, default: 0]
                clocks[block.id] = Self.formatClock(dayStart + before)
            }
            cumulativeByDay[block.day, default: 0] += est
        }
        for (day, total) in cumulativeByDay {
            var label = "~" + Self.formatDuration(total)
            if let dayStart {
                label += " • \(Self.formatClock(dayStart))–\(Self.formatClock(dayStart + total))"
            }
            totals[day] = label
        }
        blockClocks = clocks
        dayTotals = totals
    }

    static func formatDuration(_ minutes: Double) -> String {
        let total = Int(minutes.rounded())
        if total < 60 { return "\(total)m" }
        let h = total / 60, m = total % 60
        return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    }

    static func formatClock(_ minutesAfterMidnight: Double) -> String {
        let total = Int(minutesAfterMidnight.rounded()) % (24 * 60)
        var h = total / 60
        let m = total % 60
        let suffix = h >= 12 ? "pm" : "am"
        h = h % 12
        if h == 0 { h = 12 }
        return String(format: "%d:%02d%@", h, m, suffix)
    }

    // ── Mutations (call the server, then re-read) ────────────────────────

    public func addBlock() async {
        await run {
            _ = try await self.api.addBlock(meetID: self.meetID)
            self.statusFlash = "Block added."
        }
    }

    public func addDivider(type: String, name: String, day: String, afterBlockID: String) async {
        await run {
            _ = try await self.api.addDivider(meetID: self.meetID, type: type, name: name,
                                              day: day, afterBlockID: afterBlockID)
            self.statusFlash = "Divider added."
        }
    }

    public func updateMeta(block: ExportBlock, name: String, day: String, type: String,
                           notes: String, durationMin: String) async {
        await run {
            try await self.api.updateBlockMeta(meetID: self.meetID, blockID: block.id,
                                               name: name, day: day, type: type,
                                               notes: notes, durationMin: durationMin)
            self.statusFlash = "Block updated."
        }
    }

    public func deleteBlock(_ block: ExportBlock) async {
        await run {
            try await self.api.deleteBlock(meetID: self.meetID, blockID: block.id)
            self.statusFlash = "Block deleted — its races moved to Unassigned."
        }
    }

    public func moveBlock(_ block: ExportBlock, direction: String) async {
        await run {
            try await self.api.moveBlock(meetID: self.meetID, blockID: block.id, direction: direction)
        }
    }

    /// Move a race one visible slot up/down inside its block. The neighbor is
    /// taken from the RESOLVED rows (dangling ids are skipped, so the swap
    /// always matches what's on screen) and the full permutation is posted.
    public func nudgeRace(_ raceID: String, in block: ExportBlock, offset: Int) async {
        guard racesByID[raceID]?.mergeGroupId == nil else { return }
        let resolved = races(in: block).map(\.id)
        guard let visibleIndex = resolved.firstIndex(of: raceID),
              resolved.indices.contains(visibleIndex + offset) else { return }
        let neighborID = resolved[visibleIndex + offset]
        var order = block.raceIds
        guard let a = order.firstIndex(of: raceID), let b = order.firstIndex(of: neighborID) else { return }
        order.swapAt(a, b)
        await run {
            try await self.api.reorderRaces(meetID: self.meetID, blockID: block.id, order: order)
        }
    }

    public func moveSelectedRaces(toBlockID destBlockID: String) async {
        let ids = orderedSelection()
        guard !ids.isEmpty else { return }
        await run {
            let result = try await self.api.moveRaces(meetID: self.meetID, raceIDs: ids, destBlockID: destBlockID)
            let moved = result.moved ?? ids.count
            let skipped = result.skipped ?? 0
            self.statusFlash = skipped > 0 ? "Moved \(moved), skipped \(skipped)." : "Moved \(moved) race\(moved == 1 ? "" : "s")."
            self.selectedRaceIDs = []
        }
    }

    public func moveRace(_ raceID: String, toBlockID destBlockID: String) async {
        // No-op when the item is already in the destination (the server
        // would otherwise silently move it to the end of its own block).
        guard blockID(containing: raceID) != destBlockID else { return }
        guard racesByID[raceID]?.mergeGroupId == nil else { return }
        await run {
            try await self.api.moveRace(meetID: self.meetID, raceID: raceID,
                                        destBlockID: destBlockID, beforeRaceID: nil)
        }
    }

    public func mergeSelection() async {
        guard let (leadID, followerID) = mergeablePair else { return }
        await run {
            let result = try await self.api.mergeRaces(meetID: self.meetID, raceA: leadID, raceB: followerID)
            self.statusFlash = result.label.map { "Merged: \($0)" } ?? "Races merged."
            self.selectedRaceIDs = []
        }
    }

    public func unmerge(_ raceID: String) async {
        await run {
            let result = try await self.api.unmergeRaces(meetID: self.meetID, raceID: raceID)
            let cleared = result.cleared ?? 0
            self.statusFlash = "Unmerged \(cleared) race\(cleared == 1 ? "" : "s")."
        }
    }

    public func generateSchedule(style: String) async {
        var pending: PendingGenerate?
        await run {
            let outcome = try await self.api.generateSchedule(meetID: self.meetID, mode: "replace",
                                                              style: style, confirmReplace: false)
            switch outcome {
            case .generated(let blocks, let placed):
                self.statusFlash = "Schedule generated — \(blocks) blocks, \(placed) items placed."
            case .needsConfirm(let assignedCount):
                pending = PendingGenerate(style: style, assignedCount: assignedCount)
            }
        }
        // Present the dialog only after run() fully settles so its buttons
        // can never be swallowed by the isWorking guard.
        if let pending { pendingGenerate = pending }
    }

    public func confirmGenerate(_ pending: PendingGenerate) async {
        pendingGenerate = nil
        await run {
            let outcome = try await self.api.generateSchedule(meetID: self.meetID, mode: "replace",
                                                              style: pending.style, confirmReplace: true)
            if case .generated(let blocks, let placed) = outcome {
                self.statusFlash = "Schedule regenerated — \(blocks) blocks, \(placed) items placed."
            }
        }
    }

    /// The website's second confirm option: keep the current schedule and
    /// generate blocks for the UNASSIGNED races only (append never 409s).
    public func appendGenerate(_ pending: PendingGenerate) async {
        pendingGenerate = nil
        await run {
            let outcome = try await self.api.generateSchedule(meetID: self.meetID, mode: "append",
                                                              style: pending.style, confirmReplace: false)
            if case .generated(let blocks, let placed) = outcome {
                self.statusFlash = "Added \(blocks) block\(blocks == 1 ? "" : "s") for \(placed) unassigned race\(placed == 1 ? "" : "s")."
            }
        }
    }

    public func autoFlow() async {
        await run {
            let changed = try await self.api.autoFlowBlocks(meetID: self.meetID)
            switch changed {
            case .some(0):
                self.statusFlash = "No flow changes needed — already in order."
            case .some(let n):
                self.statusFlash = "Flow optimized — \(n) block\(n == 1 ? "" : "s") re-ordered."
            case nil:
                self.statusFlash = "Flow optimized."
            }
        }
    }

    public func rebuildAssignments() async {
        await run {
            try await self.api.rebuildRaceAssignments(meetID: self.meetID)
            self.statusFlash = "Race assignments rebuilt."
        }
    }

    private func run(_ body: () async throws -> Void) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await body()
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        await refresh()
    }
}
