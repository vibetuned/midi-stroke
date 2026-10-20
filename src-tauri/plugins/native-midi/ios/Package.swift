// swift-tools-version:5.3

import PackageDescription

let package = Package(
    name: "tauri-plugin-native-midi",
    platforms: [
        .macOS(.v10_13),
        .iOS(.v14),
    ],
    products: [
        .library(
            name: "tauri-plugin-native-midi",
            type: .static,
            targets: ["tauri-plugin-native-midi"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-native-midi",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources",
            linkerSettings: [
                .linkedFramework("CoreMIDI"),
                .linkedFramework("CoreAudioKit"),
                .linkedFramework("AVFoundation"),
            ])
    ]
)
