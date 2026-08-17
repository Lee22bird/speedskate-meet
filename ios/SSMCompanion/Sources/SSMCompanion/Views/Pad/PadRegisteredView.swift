import SwiftUI

/// iPad Registered — the website's roster page (views/registeredView.js):
/// stat band with the exact ready-for-race-generation math, full filter set,
/// division-grouped roster with Ready / "N to fix" pills, row issue flags,
/// entry chips, and Add/Edit/Delete through the shared registration sheet.
struct PadRegisteredView: View {
    let meetID: String

    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var model = FrontDeskViewModel()
    @State private var searchName = ""
    @State private var searchTeam = ""
    @State private var divisionFilter = "all"
    @State private var paymentFilter = "all"
    @State private var checkInFilter = "all"
    @State private var attentionOnly = false
    @State private var showAddSheet = false
    @State private var editingReg: ExportRegistration?
    @State private var confirmDeleteReg: ExportRegistration?
    @State private var confirmRebuild = false

    var body: some View {
        Group {
            if model.meet == nil, model.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if model.meet == nil {
                VStack(spacing: 14) {
                    PadPlaceholder(text: model.errorMessage ?? "Couldn't load the roster.")
                    Button("Try Again") {
                        Task { await model.refresh() }
                    }
                    .buttonStyle(.ssmPill)
                    .padding(.bottom, 40)
                }
            } else {
                rosterBody
            }
        }
        .background(SSMTheme.pageBackground)
        .task { await model.load(meetID: meetID) }
        .refreshable { await model.refresh() }
        .alert("Couldn't update",
               isPresented: Binding(get: { model.errorMessage != nil },
                                    set: { if !$0 { model.errorMessage = nil } }),
               presenting: model.errorMessage) { _ in
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: { message in
            Text(message)
        }
        .sheet(isPresented: $showAddSheet) {
            RegistrationFormSheet(model: model, editingReg: nil)
        }
        .sheet(item: $editingReg) { reg in
            RegistrationFormSheet(model: model, editingReg: reg)
        }
        .confirmationDialog("Delete Racer",
                            isPresented: Binding(get: { confirmDeleteReg != nil },
                                                 set: { if !$0 { confirmDeleteReg = nil } }),
                            titleVisibility: .visible,
                            presenting: confirmDeleteReg) { reg in
            Button("Delete Racer", role: .destructive) {
                Task { await model.deleteRegistration(reg) }
            }
        } message: { reg in
            Text("Remove \(reg.name) from all race assignments?")
        }
        .confirmationDialog("Rebuild assignments?", isPresented: $confirmRebuild, titleVisibility: .visible) {
            Button("Rebuild Assignments", role: .destructive) {
                Task { await model.rebuildAssignments() }
            }
        } message: {
            Text("Rebuild will re-split heats and reassign lanes. Your block structure will be preserved but lane assignments will change — and entered results on rebuilt races are cleared.")
        }
    }

    // ── Layout ───────────────────────────────────────────────────────────

    private var rosterBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                flashBanner
                statBand
                filterBar
                rosterList
            }
            .padding(24)
            .frame(maxWidth: 1100)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder private var flashBanner: some View {
        if model.statusFlash != nil {
            Text("✅ \(model.statusFlash ?? "")")
                .font(.ssmRounded(14, weight: .bold))
                .foregroundStyle(SSMTheme.good)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SSMTheme.good.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .task(id: model.flashID) {
                    try? await Task.sleep(nanoseconds: 4_000_000_000)
                    guard !Task.isCancelled else { return }
                    model.statusFlash = nil
                }
        }
    }

    // ── Stat band ────────────────────────────────────────────────────────

    private var statBand: some View {
        let stats = model.registeredStats
        return ScrollView(.horizontal) {
            HStack(spacing: 12) {
                tile("CHECKED IN", accent: SSMTheme.sky) {
                    Text("\(stats.checkedIn)")
                        .font(.ssmRounded(26, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    + Text("  of \(stats.total)")
                        .font(.ssmRounded(13, weight: .bold))
                        .foregroundStyle(SSMTheme.muted)
                    ProgressView(value: Double(stats.checkedIn), total: Double(max(stats.total, 1)))
                        .tint(SSMTheme.sky)
                    Text("\(stats.total - stats.checkedIn) skater(s) still to arrive")
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                tile("ENTRY FEES COLLECTED", accent: SSMTheme.orange) {
                    Text("\(FrontDeskViewModel.money(stats.feesCollected)) of \(FrontDeskViewModel.money(stats.feesDue))")
                        .font(.ssmRounded(22, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    ProgressView(value: stats.feesCollected, total: max(stats.feesDue, 1))
                        .tint(SSMTheme.good)
                    // Always show the paid count and the fee structure (the
                    // website's tile does both, even when fully paid).
                    Text("\(stats.paidCount) of \(stats.total) paid • \(feeCaption)")
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                    let outstanding = stats.feesDue - stats.feesCollected
                    Text(outstanding > 0 ? "\(FrontDeskViewModel.money(outstanding)) outstanding" : "All entries paid")
                        .font(.ssmRounded(11, weight: .bold))
                        .foregroundStyle(outstanding > 0 ? SSMTheme.orange3 : SSMTheme.good)
                }
                tile("NEEDS ATTENTION", accent: SSMTheme.danger) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(stats.attention)")
                            .font(.ssmRounded(26, weight: .heavy))
                            .foregroundStyle(stats.attention > 0 ? SSMTheme.danger : SSMTheme.good)
                        Text("\(stats.blocking) block races")
                            .font(.ssmRounded(11, weight: .bold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                    Text("\(stats.blocking) helmet / entry problem(s)")
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                    Text("\(stats.onSiteUnpaid) checked in still owing \(FrontDeskViewModel.money(stats.onSiteUnpaidTotal))")
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                tile("READY FOR RACE GENERATION", accent: SSMTheme.muted) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(stats.readyPct)%")
                            .font(.ssmRounded(26, weight: .heavy))
                            .foregroundStyle(stats.readyPct == 100 ? SSMTheme.good : SSMTheme.textPrimary)
                        Text("\(stats.blocking) blocker(s)")
                            .font(.ssmRounded(11, weight: .bold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                    HStack(spacing: 8) {
                        Button("Rebuild Assignments") { confirmRebuild = true }
                            .buttonStyle(.ssmPill)
                        Button("+ Add Racer") { showAddSheet = true }
                            .buttonStyle(.ssmSoftPill)
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .scrollIndicators(.hidden)
        .disabled(model.isWorking)
    }

    /// "${base} base + ${add} / extra event" — the website's fee caption.
    private var feeCaption: String {
        guard let meet = model.meet else { return "Entry fees as configured in Meet Setup" }
        guard meet.baseEntryFee > 0 || meet.additionalRaceFee > 0 else {
            return "Entry fees as configured in Meet Setup"
        }
        var caption = "\(FrontDeskViewModel.money(meet.baseEntryFee)) base"
        if meet.additionalRaceFee > 0 {
            caption += " + \(FrontDeskViewModel.money(meet.additionalRaceFee)) / extra event"
        }
        return caption
    }

    private func tile(_ label: String, accent: Color, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(accent)
            content()
        }
        .padding(14)
        .frame(minWidth: 210, alignment: .leading)
        .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // ── Filters ──────────────────────────────────────────────────────────

    private var divisionOptions: [String] {
        let labels = Set(model.registrations.map(\.divisionGroupLabel).filter { !$0.isEmpty })
        return labels.sorted { $0.localizedCompare($1) == .orderedAscending }
    }

    private var filterBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                TextField("Search name…", text: $searchName)
                    .padding(10)
                    .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .font(.ssmRounded(13, weight: .medium))
                TextField("Team…", text: $searchTeam)
                    .padding(10)
                    .frame(maxWidth: 200)
                    .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .font(.ssmRounded(13, weight: .medium))
            }
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    Picker("Division", selection: $divisionFilter) {
                        Text("All Divisions").tag("all")
                        ForEach(divisionOptions, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Payment", selection: $paymentFilter) {
                        Text("Payment: All").tag("all")
                        Text("Paid").tag("paid")
                        Text("Unpaid").tag("unpaid")
                    }
                    Picker("Check-In", selection: $checkInFilter) {
                        Text("Check-In: All").tag("all")
                        Text("Checked In").tag("in")
                        Text("Not Checked In").tag("out")
                    }
                    let stats = model.registeredStats
                    Button {
                        attentionOnly.toggle()
                    } label: {
                        Text("Needs attention · \(stats.attention)")
                            .font(.ssmRounded(12, weight: .bold))
                            .foregroundStyle(attentionOnly ? .white : SSMTheme.danger)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(SSMTheme.pillShape.fill(attentionOnly ? SSMTheme.danger.opacity(0.7) : SSMTheme.cardBackground))
                            .overlay(SSMTheme.pillShape.strokeBorder(SSMTheme.cardBorder, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    Button("Clear") {
                        searchName = ""; searchTeam = ""
                        divisionFilter = "all"; paymentFilter = "all"; checkInFilter = "all"
                        attentionOnly = false
                    }
                    .font(.ssmRounded(12, weight: .bold))
                    .foregroundStyle(SSMTheme.muted)
                    .buttonStyle(.plain)
                }
                .pickerStyle(.menu)
                .tint(SSMTheme.sky)
                .fixedSize()
            }
            .scrollIndicators(.hidden)
        }
    }

    private var filteredRoster: [ExportRegistration] {
        let nameQuery = searchName.trimmingCharacters(in: .whitespaces).lowercased()
        let teamQuery = searchTeam.trimmingCharacters(in: .whitespaces).lowercased()
        // A stale filter value (division renamed/removed by a rebuild) must
        // not silently blank the whole list.
        let effectiveDivision = divisionOptions.contains(divisionFilter) ? divisionFilter : "all"
        return model.registrations.filter { reg in
            if !nameQuery.isEmpty, !reg.name.lowercased().contains(nameQuery) { return false }
            if !teamQuery.isEmpty, !reg.team.lowercased().contains(teamQuery) { return false }
            if effectiveDivision != "all", reg.divisionGroupLabel != effectiveDivision { return false }
            if paymentFilter == "paid", !reg.paid { return false }
            if paymentFilter == "unpaid", reg.paid { return false }
            if checkInFilter == "in", !reg.checkedIn { return false }
            if checkInFilter == "out", reg.checkedIn { return false }
            if attentionOnly, model.rosterIssues(reg).isEmpty { return false }
            return true
        }
    }

    // ── Roster ───────────────────────────────────────────────────────────

    @ViewBuilder private var rosterList: some View {
        let rows = filteredRoster
        if model.registrations.isEmpty {
            SSMCard { Text("No registrations yet.").font(.ssmRounded(14, weight: .semibold)).foregroundStyle(SSMTheme.muted) }
        } else if rows.isEmpty {
            SSMCard { Text("No registrations match those filters.").font(.ssmRounded(14, weight: .semibold)).foregroundStyle(SSMTheme.muted) }
        } else {
            ForEach(model.groupedRoster(rows), id: \.division) { group in
                divisionHeader(group.division, rows: group.rows)
                SSMCard {
                    VStack(spacing: 0) {
                        ForEach(group.rows) { reg in
                            rosterRow(reg)
                            if reg.id != group.rows.last?.id {
                                Divider().overlay(SSMTheme.cardBorder)
                            }
                        }
                    }
                }
            }
        }
    }

    private func divisionHeader(_ division: String, rows: [ExportRegistration]) -> some View {
        // Header numbers come from the FULL division, not the filtered rows —
        // filters hide skaters, they must never change what "Ready" means.
        let fullGroup = model.registrations.filter {
            ($0.divisionGroupLabel.isEmpty ? "No division assigned" : $0.divisionGroupLabel) == division
        }
        let checkedIn = fullGroup.filter(\.checkedIn).count
        let due = fullGroup.filter { !$0.paid }.map { model.cost($0) }.reduce(0, +)
        let blocking = fullGroup.filter { model.isBlocking($0) }.count
        return HStack(spacing: 10) {
            Text(division.uppercased())
                .font(.ssmRounded(13, weight: .heavy))
                .foregroundStyle(SSMTheme.sky)
            Text("\(fullGroup.count) skater(s) · \(checkedIn) checked in\(due > 0 ? " · \(FrontDeskViewModel.money(due)) due" : "")\(rows.count != fullGroup.count ? " · showing \(rows.count)" : "")")
                .font(.ssmRounded(11, weight: .semibold))
                .foregroundStyle(SSMTheme.muted)
            Spacer()
            SSMChip(blocking == 0 ? "Ready" : "\(blocking) to fix",
                    color: blocking == 0 ? SSMTheme.good : SSMTheme.danger)
        }
        .padding(.horizontal, 4)
        .padding(.top, 6)
    }

    private func rosterRow(_ reg: ExportRegistration) -> some View {
        let issues = model.rosterIssues(reg)
        let blocking = issues.contains(where: \.isBlocking)

        return HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 3) {
                Text("#\(reg.meetNumber ?? "—")")
                    .font(.ssmRounded(11, weight: .bold))
                    .foregroundStyle(SSMTheme.muted)
                if let helmet = reg.helmetDisplay {
                    Text(helmet)
                        .font(.ssmRounded(15, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .frame(width: 44, height: 34)
                        .background(SSMTheme.navy3, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                } else {
                    Text("—")
                        .font(.ssmRounded(15, weight: .heavy))
                        .foregroundStyle(SSMTheme.danger)
                        .frame(width: 44, height: 34)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(SSMTheme.danger, style: StrokeStyle(lineWidth: 1.5, dash: [4]))
                        )
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(reg.name)
                        .font(.ssmRounded(15, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    if let age = reg.age {
                        Text("Age \(age)")
                            .font(.ssmRounded(11, weight: .bold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                    Text(reg.team)
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                if !reg.sponsor.isEmpty {
                    Text("Sponsored by \(reg.sponsor)")
                        .font(.ssmRounded(11, weight: .medium))
                        .foregroundStyle(SSMTheme.orange)
                }
                if reg.challengeUp {
                    Text("Challenge: \(reg.options["novice"] == true ? "Elite in own division" : (reg.divisionGroupLabel.isEmpty ? "—" : reg.divisionGroupLabel))")
                        .font(.ssmRounded(11, weight: .medium))
                        .foregroundStyle(SSMTheme.sky)
                }
                ForEach(issues) { issue in
                    Text("⚠ \(issue.text)")
                        .font(.ssmRounded(11, weight: .bold))
                        .foregroundStyle(issue.isBlocking ? SSMTheme.danger : SSMTheme.orange3)
                }
                let chips = model.entryChips(reg)
                ScrollView(.horizontal) {
                    HStack(spacing: 5) {
                        if chips.isEmpty {
                            SSMChip("none", color: SSMTheme.danger)
                        } else {
                            ForEach(chips, id: \.self) { SSMChip($0, color: SSMTheme.sky) }
                        }
                    }
                    .fixedSize()
                }
                .scrollIndicators(.hidden)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: 5) {
                Text(FrontDeskViewModel.money(model.cost(reg)))
                    .font(.ssmRounded(15, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                HStack(spacing: 5) {
                    SSMChip(reg.paid ? "✔ Paid" : "Unpaid", color: reg.paid ? SSMTheme.good : SSMTheme.orange3)
                    SSMChip(reg.checkedIn ? "✔ In" : "—", color: reg.checkedIn ? SSMTheme.good : SSMTheme.muted)
                }
                HStack(spacing: 8) {
                    Button("Edit") { editingReg = reg }
                        .font(.ssmRounded(12, weight: .bold))
                        .foregroundStyle(SSMTheme.sky)
                    Button("Del") { confirmDeleteReg = reg }
                        .font(.ssmRounded(12, weight: .bold))
                        .foregroundStyle(SSMTheme.danger)
                }
                .buttonStyle(.plain)
                .disabled(model.isWorking)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(blocking ? SSMTheme.danger.opacity(0.06)
                      : (!reg.paid ? SSMTheme.orange.opacity(0.05) : Color.clear))
        )
    }
}
