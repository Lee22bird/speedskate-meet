// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SSMCompanion",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "SSMCompanion", targets: ["SSMCompanion"]),
    ],
    targets: [
        .target(
            name: "SSMCompanion",
            resources: [.process("Resources")]
        ),
    ]
)
