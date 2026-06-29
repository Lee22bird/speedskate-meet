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

    @ViewBuilder
    func ssmNavigationBarHidden(_ hidden: Bool) -> some View {
        #if os(iOS)
        self.toolbar(hidden ? .hidden : .visible, for: .navigationBar)
        #else
        self
        #endif
    }
}

// A dark, "race broadcast" theme — near-black navy backgrounds, glowing
// blue/orange accents, and bold display type. Matches the SSM app icon and
// the approved app mockup (dark cards, orange "LIVE"/CTA pills, floating
// bottom nav).
public enum SSMTheme {
    public static let navy = Color(red: 0x13/255, green: 0x21/255, blue: 0x3a/255)
    public static let navy2 = Color(red: 0x1b/255, green: 0x2c/255, blue: 0x4a/255)
    public static let navy3 = Color(red: 0x26/255, green: 0x3c/255, blue: 0x61/255)
    public static let orange = Color(red: 0xF9/255, green: 0x73/255, blue: 0x16/255)
    public static let orange2 = Color(red: 0xea/255, green: 0x58/255, blue: 0x0c/255)
    public static let orange3 = Color(red: 0xfb/255, green: 0x92/255, blue: 0x3c/255)
    public static let sky = Color(red: 0x38/255, green: 0xBD/255, blue: 0xF8/255)
    public static let sky2 = Color(red: 0x0e/255, green: 0xa5/255, blue: 0xe9/255)
    public static let good = Color(red: 0x1c/255, green: 0xd9/255, blue: 0x8a/255)
    public static let danger = Color(red: 0xff/255, green: 0x5a/255, blue: 0x5a/255)

    // Dark surfaces
    public static let pageBackground = Color(red: 0x07/255, green: 0x0b/255, blue: 0x16/255)
    public static let pageBackground2 = Color(red: 0x0c/255, green: 0x14/255, blue: 0x26/255)
    public static let cardBackground = Color(red: 0x11/255, green: 0x1a/255, blue: 0x30/255)
    public static let cardBackgroundLight = Color(red: 0x16/255, green: 0x21/255, blue: 0x3a/255)
    public static let cardBorder = Color.white.opacity(0.08)

    // Text on dark surfaces
    public static let textPrimary = Color.white
    public static let muted = Color(red: 0x8a/255, green: 0x96/255, blue: 0xb0/255)

    public static let pageGradient = LinearGradient(colors: [pageBackground, pageBackground2], startPoint: .top, endPoint: .bottom)
    public static let navyGradient = LinearGradient(colors: [navy, navy2, navy3], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let orangeGradient = LinearGradient(colors: [orange2, orange, orange3], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let skyGradient = LinearGradient(colors: [sky2, sky], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let goodGradient = LinearGradient(colors: [Color(red: 0x05/255, green: 0x96/255, blue: 0x69/255), good], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let amberGradient = LinearGradient(colors: [Color(red: 0xb4/255, green: 0x6a/255, blue: 0x06/255), Color(red: 0xf2/255, green: 0xa6/255, blue: 0x1d/255)], startPoint: .topLeading, endPoint: .bottomTrailing)

    public static let cornerRadius: CGFloat = 24
    public static let smallCornerRadius: CGFloat = 18
    public static let cardPadding: CGFloat = 18
    public static let pillShape = RoundedRectangle(cornerRadius: 999, style: .continuous)

    public static let cardShadow = Color.black.opacity(0.45)
}

/// Diagonal blue/orange motion streaks — the racing-broadcast graphic behind
/// hero banners (login screen, meet detail header). Pure SwiftUI shapes, no
/// image asset required.
public struct SpeedStreaksBackground: View {
    public var accentTop: Color = SSMTheme.sky
    public var accentBottom: Color = SSMTheme.orange
    public init(accentTop: Color = SSMTheme.sky, accentBottom: Color = SSMTheme.orange) {
        self.accentTop = accentTop
        self.accentBottom = accentBottom
    }

    public var body: some View {
        ZStack {
            SSMTheme.navyGradient
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                ZStack {
                    streak(width: w * 1.4, height: 10, color: accentTop, opacity: 0.55)
                        .offset(x: -w * 0.1, y: h * 0.18)
                    streak(width: w * 1.6, height: 18, color: accentTop, opacity: 0.35)
                        .offset(x: -w * 0.05, y: h * 0.30)
                    streak(width: w * 1.3, height: 7, color: .white, opacity: 0.25)
                        .offset(x: -w * 0.15, y: h * 0.40)
                    streak(width: w * 1.5, height: 14, color: accentBottom, opacity: 0.45)
                        .offset(x: -w * 0.1, y: h * 0.72)
                    streak(width: w * 1.3, height: 6, color: accentBottom, opacity: 0.3)
                        .offset(x: -w * 0.1, y: h * 0.82)
                }
                .rotationEffect(.degrees(-8))
            }
        }
        .clipped()
    }

    private func streak(width: CGFloat, height: CGFloat, color: Color, opacity: Double) -> some View {
        Capsule()
            .fill(color.opacity(opacity))
            .frame(width: width, height: height)
            .blur(radius: height * 0.5)
    }
}

/// Small "● LIVE" pulse badge used on Live Race Day / Live Board headers.
public struct LiveBadge: View {
    public init() {}
    public var body: some View {
        HStack(spacing: 5) {
            Circle().fill(.white).frame(width: 6, height: 6)
            Text("LIVE").font(.ssmRounded(11, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(SSMTheme.good, in: SSMTheme.pillShape)
    }
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
                    .strokeBorder(SSMTheme.cardBorder, lineWidth: 1)
            )
            .shadow(color: SSMTheme.cardShadow, radius: 12, x: 0, y: 6)
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

/// Softer pill button for secondary actions (Previous, Cancel, etc.) — a
/// dark slate pill so it recedes behind the orange primary action.
public struct SSMSoftPillButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.ssmRounded(16, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.vertical, 14)
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity)
            .background(SSMTheme.cardBackgroundLight, in: SSMTheme.pillShape)
            .overlay(SSMTheme.pillShape.strokeBorder(SSMTheme.cardBorder, lineWidth: 1.5))
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
