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

    @ViewBuilder
    func ssmNumberPad() -> some View {
        #if os(iOS)
        self.keyboardType(.numberPad)
        #else
        self
        #endif
    }

    @ViewBuilder
    func ssmDecimalPad() -> some View {
        #if os(iOS)
        self.keyboardType(.decimalPad)
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
    /// Merged-pack accent — violet, matching the website's merge cue (tuned
    /// lighter so it reads on the dark theme).
    public static let mergeAccent = Color(red: 0xa7/255, green: 0x8b/255, blue: 0xfa/255)

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
    public static let inactiveChipGradient = LinearGradient(colors: [cardBackground, cardBackgroundLight], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let goodGradient = LinearGradient(colors: [Color(red: 0x05/255, green: 0x96/255, blue: 0x69/255), good], startPoint: .topLeading, endPoint: .bottomTrailing)
    public static let amberGradient = LinearGradient(colors: [Color(red: 0xb4/255, green: 0x6a/255, blue: 0x06/255), Color(red: 0xf2/255, green: 0xa6/255, blue: 0x1d/255)], startPoint: .topLeading, endPoint: .bottomTrailing)

    public static let cornerRadius: CGFloat = 24
    public static let smallCornerRadius: CGFloat = 18
    public static let cardPadding: CGFloat = 18
    public static let pillShape = RoundedRectangle(cornerRadius: 999, style: .continuous)

    public static let cardShadow = Color.black.opacity(0.45)

    // ── Public surfaces ──────────────────────────────────────────────────
    // The spectator side (Meets / Live / Results) reads calmer than the
    // meet-running boards: the base is lifted off near-black, cards sit closer
    // to the background, corners are plumper, and edges are whispers rather
    // than outlines. These are SEPARATE tokens on purpose — the iPad
    // meet-running UI keeps its tighter, higher-contrast look.
    public static let publicBackground = Color(red: 0x0F/255, green: 0x18/255, blue: 0x2B/255)
    public static let publicCard = Color(red: 0x1A/255, green: 0x25/255, blue: 0x3D/255)
    public static let publicCardSoft = Color(red: 0x21/255, green: 0x2D/255, blue: 0x48/255)
    public static let publicBorder = Color.white.opacity(0.06)
    /// Gentle, low-saturation accents — calm next to the ops UI's bright sky/orange.
    public static let publicSky = Color(red: 0x7D/255, green: 0xD3/255, blue: 0xFC/255)
    public static let publicMint = Color(red: 0x6E/255, green: 0xE7/255, blue: 0xB7/255)
    public static let publicPeach = Color(red: 0xFD/255, green: 0xBA/255, blue: 0x74/255)

    public static let bubbleRadius: CGFloat = 28
    public static let bubbleRadiusSmall: CGFloat = 20
    public static let bubblePadding: CGFloat = 20
    public static let bubbleShadow = Color.black.opacity(0.22)
}

/// A plump, softly-lit card for the public tabs. Rounder and airier than
/// `SSMCard`, with a barely-there edge instead of a drawn border.
public struct SSMBubbleCard<Content: View>: View {
    private let tint: Color?
    private let content: Content

    public init(tint: Color? = nil, @ViewBuilder content: () -> Content) {
        self.tint = tint
        self.content = content()
    }

    public var body: some View {
        content
            .padding(SSMTheme.bubblePadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SSMTheme.bubbleRadius, style: .continuous)
                    .fill(SSMTheme.publicCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: SSMTheme.bubbleRadius, style: .continuous)
                            .fill((tint ?? .clear).opacity(tint == nil ? 0 : 0.10))
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: SSMTheme.bubbleRadius, style: .continuous)
                    .strokeBorder(tint?.opacity(0.28) ?? SSMTheme.publicBorder, lineWidth: 1)
            )
            .shadow(color: SSMTheme.bubbleShadow, radius: 14, x: 0, y: 6)
    }
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

/// A small violet division chip shown on each lane of a merged-pack sheet
/// (the `_div` tag — the lane's home group label, e.g. "Esquire Men").
public struct MergeDivTag: View {
    let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text)
            .font(.ssmRounded(10, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(SSMTheme.mergeAccent, in: Capsule())
    }
}

/// A small "RELAY" tag — relay lanes are teams, not individuals.
public struct RelayTag: View {
    public init() {}
    public var body: some View {
        Text("RELAY")
            .font(.ssmRounded(10, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(SSMTheme.orange, in: Capsule())
    }
}

/// Banner above a merged-pack lane sheet: two divisions start together as one
/// pack but are scored separately.
public struct MergePackBanner: View {
    let label: String
    public init(label: String) { self.label = label }
    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "link").font(.system(size: 12, weight: .bold))
            Text(label.isEmpty ? "One pack — scored separately"
                               : "One pack — \(label) — scored separately")
                .font(.ssmRounded(12, weight: .bold))
            Spacer(minLength: 0)
        }
        .foregroundStyle(SSMTheme.mergeAccent)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SSMTheme.mergeAccent.opacity(0.14),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .strokeBorder(SSMTheme.mergeAccent.opacity(0.4), lineWidth: 1))
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
