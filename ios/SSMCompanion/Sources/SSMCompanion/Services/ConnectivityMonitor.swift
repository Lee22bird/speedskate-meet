import Foundation
import Network

/// Publishes whether the device currently has a usable network path, so the
/// meet-running screens can warn the operator up front ("you're offline —
/// entries are saved on this device") instead of only finding out when a save
/// fails.
@MainActor
public final class ConnectivityMonitor: ObservableObject {
    public static let shared = ConnectivityMonitor()

    @Published public private(set) var isOnline = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.speedskatemeet.connectivity")

    public init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.isOnline = online }
        }
        monitor.start(queue: queue)
    }
}
