import SwiftUI

// Small shims so the rest of the app can use the real iOS APIs (which this
// package also targets) while still compiling on macOS for a quick local
// `swift build` sanity check during development. These have no effect on
// the actual iOS behavior — on iOS they call straight through.
public extension View {
    @ViewBuilder
    func ssmInlineNavigationTitle() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    @ViewBuilder
    func ssmNoAutocapitalization() -> some View {
        #if os(iOS)
        self.textInputAutocapitalization(.never)
        #else
        self
        #endif
    }

    @ViewBuilder
    func ssmUsernameContentType() -> some View {
        #if os(iOS)
        self.textContentType(.username)
        #else
        self
        #endif
    }

    @ViewBuilder
    func ssmPasswordContentType() -> some View {
        #if os(iOS)
        self.textContentType(.password)
        #else
        self
        #endif
    }
}

// Matches the CSS custom properties in utils/pageShell.js (--navy, --orange,
// --sky, etc.) so the app feels like the same product as the website.
public enum SSMTheme {
    public static let navy = Color(red: 0x13/255, green: 0x21/255, blue: 0x3a/255)
    public static let navy2 = Color(red: 0x1b/255, green: 0x2c/255, blue: 0x4a/255)
    public static let orange = Color(red: 0xF9/255, green: 0x73/255, blue: 0x16/255)
    public static let orange2 = Color(red: 0xea/255, green: 0x58/255, blue: 0x0c/255)
    public static let sky = Color(red: 0x38/255, green: 0xBD/255, blue: 0xF8/255)
    public static let sky2 = Color(red: 0x0e/255, green: 0xa5/255, blue: 0xe9/255)
    public static let pageBackground = Color(red: 0xe8/255, green: 0xed/255, blue: 0xf3/255)
    public static let cardBackground = Color(red: 0xf8/255, green: 0xfa/255, blue: 0xfc/255)
    public static let muted = Color(red: 0x66/255, green: 0x70/255, blue: 0x85/255)
    public static let good = Color(red: 0x10/255, green: 0xb9/255, blue: 0x81/255)
    public static let danger = Color(red: 0xef/255, green: 0x44/255, blue: 0x44/255)

    public static let navyGradient = LinearGradient(colors: [navy, navy2], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let orangeGradient = LinearGradient(colors: [orange2, orange], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let skyGradient = LinearGradient(colors: [sky2, sky], startPoint: .topLeading, endPoint: .bottomTrailing)

    public static let cornerRadius: CGFloat = 16
    public static let cardPadding: CGFloat = 16
}

public struct SSMCard<Content: View>: View {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View {
        content
            .padding(SSMTheme.cardPadding)
            .background(SSMTheme.cardBackground)
            .cornerRadius(SSMTheme.cornerRadius)
            .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 2)
    }
}

public struct SSMChip: View {
    let text: String
    let color: Color
    public init(_ text: String, color: Color = SSMTheme.orange) {
        self.text = text
        self.color = color
    }
    public var body: some View {
        Text(text)
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(color)
            .clipShape(Capsule())
    }
}
