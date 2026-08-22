import SwiftUI

/// iPad Score Sheets board: pick a scope + layout and print/share the printable
/// score-sheets PDF (one worksheet per race). Reuses the website's exact
/// `/score-sheets/print` output — display only, never touches results.
struct PadScoreSheetsView: View {
    let meetID: String
    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var vm = PadScoreSheetsViewModel()

    private var orderedRaces: [OrderedRaceOption] { session.state?.orderedRaces ?? [] }
    private var currentRaceID: String? { session.state?.current?.id.stringValue }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                intro
                scopeCard
                layoutCard
                actionBar
                otherReportsCard
            }
            .padding(24)
            .frame(maxWidth: 820)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .sheet(isPresented: Binding(get: { vm.pdfURL != nil },
                                    set: { if !$0 { vm.pdfURL = nil } })) {
            if let url = vm.pdfURL { PDFShareView(url: url) }
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Score Sheets")
                .font(.ssmRounded(24, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
            Text("Printable paper worksheets — one per race, for judges to record places by hand. Share to AirPrint, Files, or email.")
                .font(.ssmRounded(13, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
        }
    }

    /// The other printable paperwork — same fetch-and-share flow as score sheets.
    private var otherReportsCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("OTHER PRINTOUTS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Text("The rest of the meet paperwork, as PDFs you can AirPrint or save.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                ForEach(APIClient.PrintReport.allCases, id: \.rawValue) { report in
                    Button {
                        Task {
                            await vm.fetchReport(meetID: meetID,
                                                 meetName: session.selectedMeetName,
                                                 report: report)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: report.systemImage)
                                .font(.system(size: 16))
                                .foregroundStyle(SSMTheme.orange)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(report.title)
                                    .font(.ssmRounded(15, weight: .bold))
                                    .foregroundStyle(SSMTheme.textPrimary)
                                Text(report.detail)
                                    .font(.caption)
                                    .foregroundStyle(SSMTheme.muted)
                            }
                            Spacer()
                            Image(systemName: "square.and.arrow.up")
                                .font(.caption)
                                .foregroundStyle(SSMTheme.muted)
                        }
                        .contentShape(Rectangle())
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                    .disabled(vm.isWorking)
                }
            }
        }
    }

    private var scopeCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("WHAT TO PRINT")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                ForEach(PadScoreSheetsViewModel.Scope.allCases) { s in
                    scopeRow(s)
                }
                if vm.scope == .pickRace {
                    Menu {
                        ForEach(orderedRaces) { r in
                            Button {
                                vm.pickedRaceID = r.id.stringValue
                            } label: {
                                Text("\(r.index). \(r.label)\(r.isCurrent ? "  •  current" : "")")
                            }
                        }
                    } label: {
                        HStack {
                            Text(pickedRaceLabel ?? "Choose a race…")
                                .font(.ssmRounded(15, weight: .semibold))
                                .foregroundStyle(pickedRaceLabel == nil ? SSMTheme.muted : SSMTheme.textPrimary)
                                .lineLimit(1)
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(SSMTheme.muted)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 11)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .disabled(orderedRaces.isEmpty)
                }
            }
        }
    }

    private func scopeRow(_ s: PadScoreSheetsViewModel.Scope) -> some View {
        let selected = vm.scope == s
        let disabled = (s == .currentRace && currentRaceID == nil) || (s == .pickRace && orderedRaces.isEmpty)
        return Button {
            vm.scope = s
        } label: {
            HStack(spacing: 10) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? SSMTheme.orange : SSMTheme.muted)
                Text(s.title)
                    .font(.ssmRounded(15, weight: .semibold))
                    .foregroundStyle(disabled ? SSMTheme.muted : SSMTheme.textPrimary)
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }

    private var layoutCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("LAYOUT")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                HStack(spacing: 10) {
                    layoutPill("Compact", value: "compact", note: "2 per page")
                    layoutPill("Standard", value: "standard", note: "1 per page")
                }
            }
        }
    }

    private func layoutPill(_ title: String, value: String, note: String) -> some View {
        let selected = vm.layout == value
        return Button {
            vm.layout = value
        } label: {
            VStack(spacing: 2) {
                Text(title).font(.ssmRounded(14, weight: .bold))
                Text(note).font(.ssmRounded(11, weight: .medium)).opacity(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .foregroundStyle(selected ? .white : SSMTheme.textPrimary)
            .background(selected ? SSMTheme.orange : SSMTheme.cardBackgroundLight,
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var actionBar: some View {
        VStack(spacing: 10) {
            if let error = vm.errorMessage {
                Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button {
                Task {
                    await vm.generate(meetID: meetID,
                                      meetName: session.selectedMeetName,
                                      currentRaceID: currentRaceID)
                }
            } label: {
                Label(vm.isWorking ? "Fetching…" : "Print / Share Score Sheets", systemImage: "printer")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(vm.isWorking)
            .opacity(vm.isWorking ? 0.6 : 1)
        }
    }

    private var pickedRaceLabel: String? {
        guard let id = vm.pickedRaceID,
              let r = orderedRaces.first(where: { $0.id.stringValue == id }) else { return nil }
        return "\(r.index). \(r.label)"
    }
}
