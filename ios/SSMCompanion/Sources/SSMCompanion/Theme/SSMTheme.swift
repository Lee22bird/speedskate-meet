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
// --sky, etc.) so the app feels like the same product as the website — but
// turned up toward the bubbly, rounded feel of the SSM logo: big soft
// corners, pill shapes, and SF Rounded everywhere a number or label needs
// some personality.
public enum SSMTheme {
    public static let navy = Color(red: 0x13/255, green: 0x21/255, blue: 0x3a/255)
    public static let navy2 = Color(red: 0x1b/255, green: 0x2c/255, blue: 0x4a/255)
    public static let navy3 = Color(red: 0x26/255, green: 0x3c/255, blue: 0x61/255)
    public static let orange = Color(red: 0xF9/255, green: 0x73/255, blue: 0x16/255)
    public static let orange2 = Color(red: 0xea/255, green: 0x58/255, blue: 0x0c/255)
    public static let orange3 = Color(red: 0xfb/255, green: 0x92/255, blue: 0x3c/255)
    public static let sky = Color(red: 0x38/255, green: 0xBD/255, blue: 0xF8/255)
    public static let sky2 = Color(red: 0x0e/255, green: 0xa5/255, blue: 0xe9/255)
    public static let pageBackground = Color(red: 0xe8/255, green: 0xed/255, blue: 0xf3/255)
    public static let cardBackground = Color(red: 0xf8/255, green: 0xfa/255, blue: 0xfc/255)
    public static let muted = Color(red: 0x66/255, green: 0x70/255, blue: 0x85/255)
    public static let good = Color(red: 0x10/255, green: 0xb9/255, blue: 0x81/255)
    public static let danger = Color(red: 0xef/255, green: 0x44/255, blue: 0x44/255)

    public static let navyGradient = LinearGradient(colors: [navy, navy2, navy3], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let orangeGradient = LinearGradient(colors: [orange2, orange, orange3], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let skyGradient = LinearGradient(colors: [sky2, sky], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let goodGradient = LinearGradient(colors: [Color(red: 0x05/255, green: 0x96/255, blue: 0x69/255), good], startPoint: .topLeading, endPoint: .bottomTrailing)

    public static let cornerRadius: CGFloat = 24
    public static let smallCornerRadius: CGFloat = 18
    public static let cardPadding: CGFloat = 18
    public static let pillShape = RoundedRectangle(cornerRadius: 999, style: .continuous)

    public static let cardShadow = Color.black.opacity(0.10)
}

public extension Font {
    /// SF Rounded — the "bubbly" font design that matches the SSM logo's
    /// soft, rounded wordmark.
    static func ssmRounded(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

public struct SSMCard<Content: View>: View {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View {
        content
            .padding(SSMTheme.cardPadding)
            .background(
                RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous)
                    .fill(SSMTheme.cardBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.6), lineWidth: 1)
            )
            .shadow(color: SSMTheme.cardShadow, radius: 10, x: 0, y: 4)
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
            .font(.ssmRounded(12, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(color, in: SSMTheme.pillShape)
            .shadow(color: color.opacity(0.35), radius: 4, x: 0, y: 2)
    }
}

/// A big, bouncy pill button — used for the primary actions (Next, Log In,
/// Download, etc.) so the app's controls feel as playful as the brand.
public struct SSMPillButtonStyle: ButtonStyle {
    let gradient: LinearGradient
    public init(gradient: LinearGradient = SSMTheme.orangeGradient) { self.gradient = gradient }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ssmRounded(17, weight: .bold))
            .foregroundStyle(.white)
            .padding(.vertical, 14)
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity)
            .background(gradient, in: SSMTheme.pillShape)
            .shadow(color: .black.opacity(configuration.isPressed ? 0.05 : 0.18), radius: configuration.isPressed ? 3 : 8, x: 0, y: configuration.isPressed ? 1 : 4)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// Softer pill button for secondary actions (Previous, Cancel, etc.).
public struct SSMSoftPillButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ssmRounded(16, weight: .semibold))
            .foregroundStyle(SSMTheme.navy)
            .padding(.vertical, 14)
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity)
            .background(Color.white, in: SSMTheme.pillShape)
            .overlay(SSMTheme.pillShape.strokeBorder(SSMTheme.navy.opacity(0.12), lineWidth: 1.5))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

public extension ButtonStyle where Self == SSMPillButtonStyle {
    static var ssmPill: SSMPillButtonStyle { SSMPillButtonStyle() }
    static func ssmPill(_ gradient: LinearGradient) -> SSMPillButtonStyle { SSMPillButtonStyle(gradient: gradient) }
}

public extension ButtonStyle where Self == SSMSoftPillButtonStyle {
    static var ssmSoftPill: SSMSoftPillButtonStyle { SSMSoftPillButtonStyle() }
}
