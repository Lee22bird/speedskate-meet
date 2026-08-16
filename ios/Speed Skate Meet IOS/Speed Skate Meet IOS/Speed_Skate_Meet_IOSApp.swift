//
//  Speed_Skate_Meet_IOSApp.swift
//  Speed Skate Meet IOS
//
//  Created by Lee Bird on 6/28/26.
//

import SwiftUI
import SSMCompanion

@main
struct Speed_Skate_Meet_IOSApp: App {
    init() {
        // Debug-only: lets a dev/simulator run point at a local SSM server
        // (launch with SIMCTL_CHILD_SSM_BASE_URL=http://127.0.0.1:10000).
        // Release builds always use the production URL baked into APIClient.
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["SSM_BASE_URL"],
           let url = URL(string: override) {
            APIClient.shared.baseURL = url
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
