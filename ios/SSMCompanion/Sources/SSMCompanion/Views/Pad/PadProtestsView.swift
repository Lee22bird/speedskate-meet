import SwiftUI

/// Officials' Protests inbox (director + tabulator). Mirrors the website's
/// /portal/meet/:id/protests page: review each coach-filed protest, rule it
/// upheld or denied with a note, mark the in-person fee collected (director
/// only), and — when an upheld protest is tied to a race — jump straight into
/// Correction Mode with the reason prefilled.
struct PadProtestsView: View {
    let meetID: String

    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var vm = ProtestsViewModel()
    @State private var correctionSheet: ProtestCorrection?

    private var sortedProtests: [Protest] {
        vm.protests.sorted { a, b in
            if a.isUnresolved != b.isUnresolved { return a.isUnresolved } // open first
            return a.id < b.id
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if let error = vm.errorMessage {
                    Text(error)
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if vm.isLoading && vm.protests.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.protests.isEmpty {
                    ContentUnavailableFallback(text: "No protests filed for this meet.")
                        .padding(.top, 40)
                } else {
                    ForEach(sortedProtests) { protest in
                        ProtestCard(protest: protest,
                                    meetID: meetID,
                                    canCollectFee: vm.canCollectFee,
                                    canOpenCorrection: vm.canOpenCorrection,
                                    isBusy: vm.actioningID == protest.id,
                                    onRule: { state, ruling in
                                        Task {
                                            if let correction = await vm.rule(meetID: meetID, protestID: protest.id,
                                                                              state: state, ruling: ruling) {
                                                correctionSheet = correction
                                            }
                                        }
                                    },
                                    onCollectFee: {
                                        Task { await vm.collectFee(meetID: meetID, protestID: protest.id) }
                                    },
                                    onOpenCorrection: { correctionSheet = $0 })
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .task { await vm.load(meetID: meetID) }
        .refreshable { await vm.load(meetID: meetID) }
        .sheet(item: $correctionSheet) { correction in
            PadCorrectionView(meetID: meetID,
                              initialRaceID: correction.raceId,
                              initialReason: correction.reason)
                .environmentObject(session)
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Protests")
                    .font(.ssmRounded(24, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                Text(headerSubtitle)
                    .font(.ssmRounded(13, weight: .semibold))
                    .foregroundStyle(SSMTheme.muted)
            }
            Spacer()
            if vm.unresolvedCount > 0 {
                Text("\(vm.unresolvedCount) OPEN")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(SSMTheme.danger, in: Capsule())
            }
        }
    }

    private var headerSubtitle: String {
        var parts: [String] = []
        parts.append(vm.protests.isEmpty ? "None filed" : "\(vm.protests.count) filed")
        if vm.protestFee > 0 {
            parts.append("\(ProtestFormat.money(vm.protestFee)) fee (in person)")
        }
        return parts.joined(separator: "  ·  ")
    }
}

/// One protest, with inline ruling controls when it's still open.
private struct ProtestCard: View {
    let protest: Protest
    let meetID: String
    let canCollectFee: Bool
    let canOpenCorrection: Bool
    let isBusy: Bool
    let onRule: (_ state: String, _ ruling: String) -> Void
    let onCollectFee: () -> Void
    let onOpenCorrection: (ProtestCorrection) -> Void

    @State private var ruling: String = ""

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                topRow
                whoRow
                Text(protest.statement)
                    .font(.ssmRounded(15, weight: .medium))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if protest.hasFee { feeRow }
                if !protest.deadlineAt.isEmpty {
                    label("Filing deadline", ProtestFormat.dateTime(protest.deadlineAt), icon: "clock")
                }

                Divider().overlay(SSMTheme.cardBorder)

                if protest.isResolved {
                    resolvedBlock
                } else {
                    rulingControls
                }
            }
        }
    }

    private var topRow: some View {
        HStack(spacing: 8) {
            Text(protest.id)
                .font(.ssmRounded(15, weight: .heavy))
                .foregroundStyle(SSMTheme.orange)
            SSMChip(protest.category.uppercased(), color: SSMTheme.navy3)
            if protest.isRaceSpecific, !protest.raceLabel.isEmpty {
                SSMChip(protest.raceLabel, color: SSMTheme.sky2)
            } else {
                SSMChip("MEET-WIDE", color: SSMTheme.navy3)
            }
            Spacer()
            stateBadge
        }
    }

    private var stateBadge: some View {
        let (text, color): (String, Color) = {
            switch protest.state {
            case "upheld": return ("UPHELD", SSMTheme.good)
            case "denied": return ("DENIED", SSMTheme.danger)
            case "review": return ("IN REVIEW", SSMTheme.sky2)
            default: return ("NEW", SSMTheme.orange)
            }
        }()
        return Text(text)
            .font(.ssmRounded(11, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(color, in: Capsule())
    }

    private var whoRow: some View {
        HStack(spacing: 6) {
            Image(systemName: "person.fill").font(.system(size: 11)).foregroundStyle(SSMTheme.muted)
            Text(protest.filedByName.isEmpty ? "Coach" : protest.filedByName)
                .font(.ssmRounded(13, weight: .bold))
                .foregroundStyle(SSMTheme.textPrimary)
            if !protest.team.isEmpty {
                Text("· \(protest.team)").font(.ssmRounded(13, weight: .medium)).foregroundStyle(SSMTheme.muted)
            }
            Spacer()
            if !protest.createdAt.isEmpty {
                Text(ProtestFormat.dateTime(protest.createdAt))
                    .font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
            }
        }
    }

    private var feeRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "dollarsign.circle").font(.system(size: 14)).foregroundStyle(SSMTheme.muted)
            if protest.feeCollected {
                Text("\(ProtestFormat.money(protest.feeAmount)) fee collected\(protest.feeCollectedBy.isEmpty ? "" : " by \(protest.feeCollectedBy)")")
                    .font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.good)
            } else {
                Text("\(ProtestFormat.money(protest.feeAmount)) fee — not collected")
                    .font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.muted)
                Spacer()
                if canCollectFee {
                    Button { onCollectFee() } label: {
                        Text("Mark Collected").font(.ssmRounded(13, weight: .bold))
                    }
                    .buttonStyle(.ssmSoftPill)
                    .frame(width: 170)
                    .disabled(isBusy)
                }
            }
        }
    }

    // Ruling controls for an open protest.
    private var rulingControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RULING NOTE (OPTIONAL)")
                .font(.ssmRounded(11, weight: .heavy)).foregroundStyle(SSMTheme.muted)
            TextField("Basis for the decision…", text: $ruling, axis: .vertical)
                .lineLimit(1...3)
                .font(.ssmRounded(14, weight: .medium))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(10)
                .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            HStack(spacing: 12) {
                Button { onRule("upheld", ruling) } label: {
                    Label("Uphold", systemImage: "checkmark.seal").frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmPill(SSMTheme.goodGradient))
                .disabled(isBusy)

                Button { onRule("denied", ruling) } label: {
                    Label("Deny", systemImage: "xmark.seal").frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmSoftPill)
                .disabled(isBusy)

                if isBusy { ProgressView().padding(.leading, 4) }
            }
            if protest.isRaceSpecific {
                Text("If upheld, you can open Correction Mode for \(protest.raceLabel.isEmpty ? "this race" : protest.raceLabel).")
                    .font(.ssmRounded(11, weight: .medium)).foregroundStyle(SSMTheme.muted)
            }
        }
    }

    // Resolved: show the ruling + who/when, plus a Correction entry point.
    private var resolvedBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !protest.ruling.isEmpty {
                Text(protest.ruling)
                    .font(.ssmRounded(14, weight: .medium)).foregroundStyle(SSMTheme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 6) {
                Text(protest.isUpheld ? "Upheld" : "Denied")
                    .font(.ssmRounded(13, weight: .bold))
                    .foregroundStyle(protest.isUpheld ? SSMTheme.good : SSMTheme.danger)
                if !protest.ruledByName.isEmpty {
                    Text("· \(protest.ruledByName)").font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
                }
                if !protest.ruledAt.isEmpty {
                    Text("· \(ProtestFormat.dateTime(protest.ruledAt))").font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
                }
            }
            if protest.isUpheld, protest.isRaceSpecific, canOpenCorrection {
                Button {
                    onOpenCorrection(ProtestCorrection(available: true,
                                                       raceId: protest.raceId,
                                                       reason: ProtestFormat.upheldReason(protest)))
                } label: {
                    Label("Open Correction Mode", systemImage: "pencil.and.outline")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmPill)
                .padding(.top, 2)
            }
        }
    }

    private func label(_ title: String, _ value: String, icon: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 12)).foregroundStyle(SSMTheme.muted)
            Text("\(title): ").font(.ssmRounded(12, weight: .semibold)).foregroundStyle(SSMTheme.muted)
            Text(value).font(.ssmRounded(12, weight: .semibold)).foregroundStyle(SSMTheme.textPrimary)
        }
    }
}

/// Small formatting helpers shared by the protest views.
enum ProtestFormat {
    static func money(_ amount: Double) -> String {
        amount.rounded() == amount ? "$\(Int(amount))" : String(format: "$%.2f", amount)
    }

    static func upheldReason(_ p: Protest) -> String {
        String("Protest \(p.id) upheld: \(p.ruling.isEmpty ? p.statement : p.ruling)".prefix(500))
    }

    private static let iso = ISO8601DateFormatter()
    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let display: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "MMM d, h:mm a"; return f
    }()

    static func dateTime(_ isoString: String) -> String {
        guard let date = iso.date(from: isoString) ?? isoFrac.date(from: isoString) else { return isoString }
        return display.string(from: date)
    }
}
