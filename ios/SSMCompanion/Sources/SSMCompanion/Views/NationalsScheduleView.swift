import SwiftUI
#if os(iOS)
import WebKit
#endif

/// Full national-championship schedule, shown natively inside the app by
/// embedding the server-rendered schedule page (speedskatemeet.com/nationals).
/// The `?embed=1` variant strips the website's nav/footer so only the schedule
/// content shows — giving a native-feeling screen without re-implementing the
/// (large, frequently-updated) schedule in Swift.
public struct NationalsScheduleView: View {
    private let url = URL(string: "https://speedskatemeet.com/nationals?embed=1")!

    @State private var isLoading = true

    public init() {}

    public var body: some View {
        ZStack(alignment: .top) {
            SSMTheme.pageBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                ZStack {
                    ScheduleWebView(url: url, isLoading: $isLoading)
                    if isLoading {
                        ProgressView()
                            .controlSize(.large)
                            .tint(SSMTheme.sky)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(SSMTheme.pageBackground)
                    }
                }
            }
        }
        .ssmInlineNavigationTitle()
        .navigationTitle("Schedule")
    }

    private var header: some View {
        ZStack(alignment: .bottomLeading) {
            SpeedStreaksBackground()
            VStack(alignment: .leading, spacing: 4) {
                Text("2026 INDOOR NATIONALS")
                    .font(.ssmRounded(13, weight: .heavy))
                    .foregroundStyle(SSMTheme.sky)
                Text("Event Schedule")
                    .font(.system(size: 26, weight: .black, design: .rounded).italic())
                    .foregroundStyle(.white)
                Text("Lincoln, NE  •  July 7–15, 2026")
                    .font(.ssmRounded(13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .padding(16)
            .shadow(color: .black.opacity(0.4), radius: 5, x: 0, y: 2)
        }
        .frame(height: 118)
        .clipShape(RoundedRectangle(cornerRadius: SSMTheme.smallCornerRadius, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
    }
}

/// A tappable banner promoting the nationals schedule. Shown on the Meets list
/// when the "Nationals" filter is active.
public struct NationalsScheduleBanner: View {
    public init() {}
    public var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 46, height: 46)
                .background(SSMTheme.orangeGradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text("2026 Indoor Nationals")
                    .font(.ssmRounded(17, weight: .bold))
                    .foregroundStyle(.white)
                Text("View the full event schedule")
                    .font(.ssmRounded(13, weight: .semibold))
                    .foregroundStyle(SSMTheme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous)
                .fill(SSMTheme.cardBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous)
                .strokeBorder(SSMTheme.orange.opacity(0.4), lineWidth: 1.5)
        )
        .shadow(color: SSMTheme.cardShadow, radius: 12, x: 0, y: 6)
    }
}

// MARK: - WebView wrapper

#if os(iOS)
struct ScheduleWebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let parent: ScheduleWebView
        init(_ parent: ScheduleWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoading = false
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
        }
    }
}
#else
// macOS fallback so the package still compiles during `swift build` sanity
// checks. iOS is the only real target for this screen.
struct ScheduleWebView: View {
    let url: URL
    @Binding var isLoading: Bool
    var body: some View {
        Link("Open Schedule", destination: url)
            .onAppear { isLoading = false }
    }
}
#endif
