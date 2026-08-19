import Foundation

/// A locally-persisted snapshot of a tabulator's in-progress entries for one
/// race. Written to disk as the operator types so a crash, an app switch, or a
/// relaunch never loses typed places/times — the single biggest data-loss risk
/// when running a meet on flaky rink wifi.
public struct TabulationDraft: Codable {
    public let meetID: String
    public let raceID: String
    public var lanes: [LaneEdit]
    public var finishOrder: [Int]
    public var resultsMode: String
    public var notes: String
    public var savedAt: Date

    /// Lane numbers this draft covers — used to reject a stale draft whose race
    /// changed shape underneath us.
    public var laneSet: Set<Int> { Set(lanes.map(\.lane)) }
}

/// Reads/writes tabulation drafts as small JSON files in Application Support.
/// One file per (meet, race); cleared on a successful save/close.
public final class TabulationDraftStore {
    public static let shared = TabulationDraftStore()

    private let dir: URL
    private let fileManager = FileManager.default

    public init() {
        let base = (try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                         appropriateFor: nil, create: true))
            ?? fileManager.temporaryDirectory
        dir = base.appendingPathComponent("SSMTabulationDrafts", isDirectory: true)
        try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func fileURL(meetID: String, raceID: String) -> URL {
        // Race ids are `r<hex>` and meet ids are numeric, but sanitize anyway so
        // a stray `/` can never escape the drafts directory.
        let safe = "\(meetID)__\(raceID)"
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: "..", with: "-")
        return dir.appendingPathComponent("\(safe).json")
    }

    public func save(_ draft: TabulationDraft) {
        guard let data = try? JSONEncoder().encode(draft) else { return }
        try? data.write(to: fileURL(meetID: draft.meetID, raceID: draft.raceID), options: .atomic)
    }

    public func load(meetID: String, raceID: String) -> TabulationDraft? {
        let url = fileURL(meetID: meetID, raceID: raceID)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(TabulationDraft.self, from: data)
    }

    public func clear(meetID: String, raceID: String) {
        try? fileManager.removeItem(at: fileURL(meetID: meetID, raceID: raceID))
    }
}
