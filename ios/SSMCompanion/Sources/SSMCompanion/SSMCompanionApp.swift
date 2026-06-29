import SwiftUI

/// Entry point when this package is wired up as an iOS App target in Xcode
/// (see ios/README.md — add this package as a local dependency, then make
/// your App target's @main type call RootTabView(), or use this type
/// directly as the app's @main if you generate the App target from this
/// package).
public struct SSMCompanionApp: App {
    public init() {}

    public var body: some Scene {
        WindowGroup {
            RootTabView()
        }
    }
}
