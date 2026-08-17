import SwiftUI

/// iPad Check-In — the website's race-day front desk (views/checkinView.js)
/// as a native tap-first board: stat band, search + quick filters, a queue
/// sorted attention → waiting → done, focusable skater cards with paid /
/// check-in toggles and a helmet editor, and the needs-attention rail.
struct PadCheckInView: View {
    let meetID: String

    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var model = FrontDeskViewModel()
    @State private var search = ""
    @State private var statusFilter = "all"
    @State private var focusedRegID: String?
    @State private var helmetDraft = ""
    @State private var editingReg: ExportRegistration?
    @State private var confirmBulkPaid = false
    @State private var showReassignSheet = false

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
                deskBody
            }
        }
        .background(SSMTheme.pageBackground)
        .task { await model.load(meetID: meetID) }
        .refreshable { await model.refresh() }
        .sheet(isPresented: $showingAdd) {
            RegistrationFormSheet(model: model, editingReg: nil)
        }
        .alert("Couldn't update",
               isPresented: Binding(get: { model.errorMessage != nil },
                                    set: { if !$0 { model.errorMessage = nil } }),
               presenting: model.errorMessage) { _ in
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: { message in
            Text(message)
        }
        .sheet(item: $editingReg) { reg in
            RegistrationFormSheet(model: model, editingReg: reg)
        }
        .confirmationDialog("Mark everyone paid?", isPresented: $confirmBulkPaid, titleVisibility: .visible) {
            Button("Mark Everyone Paid") {
                Task { await model.bulkMarkPaid() }
            }
        } message: {
            Text("Sets Paid on every registration in the meet — there is no bulk undo.")
        }
        .sheet(isPresented: $showReassignSheet) {
            ReassignHelmetsSheet(model: model)
        }
    }

    // ── Layout ───────────────────────────────────────────────────────────

    private var deskBody: some View {
        GeometryReader { geo in
            ScrollViewReader { scroller in
                ScrollView {
                    if geo.size.width >= 900 {
                        HStack(alignment: .top, spacing: 20) {
                            VStack(spacing: 16) { mainColumn }
                                .frame(maxWidth: .infinity)
                            VStack(spacing: 16) { attentionRail(scroller) }
                                .frame(width: 330)
                        }
                        .padding(24)
                    } else {
                        VStack(spacing: 16) {
                            mainColumn
                            attentionRail(scroller)
                        }
                        .padding(20)
                    }
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
            }
        }
    }

    @ViewBuilder private var mainColumn: some View {
        flashBanner
        statBand
        searchRow
        quickPills
        queue
    }

    @ViewBuilder private var flashBanner: some View {
        if let flash = model.statusFlash {
            Text("✅ \(flash)")
                .font(.ssmRounded(14, weight: .bold))
                .foregroundStyle(SSMTheme.good)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SSMTheme.good.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                // Keyed to flashID, not the text — repeated identical
                // messages each get their full display time.
                .task(id: model.flashID) {
                    try? await Task.sleep(nanoseconds: 4_000_000_000)
                    guard !Task.isCancelled else { return }
                    model.statusFlash = nil
                }
        }
    }

    // ── Stat band ────────────────────────────────────────────────────────

    private var statBand: some View {
        let stats = model.checkInStats
        return ScrollView(.horizontal) {
            HStack(spacing: 12) {
                statTile(label: "CHECKED IN", accent: SSMTheme.sky) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("\(stats.checkedIn)")
                            .font(.ssmRounded(26, weight: .heavy))
                            .foregroundStyle(SSMTheme.textPrimary)
                        + Text("  of \(stats.total)")
                            .font(.ssmRounded(13, weight: .bold))
                            .foregroundStyle(SSMTheme.muted)
                        ProgressView(value: Double(stats.checkedIn), total: Double(max(stats.total, 1)))
                            .tint(SSMTheme.sky)
                        Text("\(stats.remaining) still to arrive")
                            .font(.ssmRounded(11, weight: .semibold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                }
                statTile(label: "COLLECTED", accent: SSMTheme.orange) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("\(FrontDeskViewModel.money(stats.totalPaid)) of \(FrontDeskViewModel.money(stats.totalOwed))")
                            .font(.ssmRounded(22, weight: .heavy))
                            .foregroundStyle(SSMTheme.textPrimary)
                        Text("Cash and card taken at the door")
                            .font(.ssmRounded(11, weight: .semibold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                }
                statTile(label: "NEEDS ATTENTION", accent: SSMTheme.orange3) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("\(stats.attention)")
                            .font(.ssmRounded(26, weight: .heavy))
                            .foregroundStyle(stats.attention > 0 ? SSMTheme.orange3 : SSMTheme.good)
                        Text("Helmet or payment before they skate")
                            .font(.ssmRounded(11, weight: .semibold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                }
                statTile(label: "FRONT DESK", accent: SSMTheme.muted) {
                    VStack(alignment: .leading, spacing: 8) {
                        Button("+ Walk-up registration") { editingReg = nil; showAddSheet() }
                            .buttonStyle(.ssmPill)
                        Menu {
                            Button("Mark everyone paid…") { confirmBulkPaid = true }
                            Button("Reassign all helmet #s…") { showReassignSheet = true }
                        } label: {
                            Label("Bulk actions", systemImage: "ellipsis.circle")
                                .font(.ssmRounded(13, weight: .bold))
                        }
                        .buttonStyle(.ssmSoftPill)
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .scrollIndicators(.hidden)
        .disabled(model.isWorking)
    }

    @State private var showingAdd = false

    private func showAddSheet() {
        showingAdd = true
    }

    private func statTile(label: String, accent: Color, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(accent)
            content()
        }
        .padding(14)
        .frame(minWidth: 190, alignment: .leading)
        .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // ── Search + quick filters ───────────────────────────────────────────

    private var searchRow: some View {
        TextField("Name, reg #, or helmet #", text: $search)
            .padding(12)
            .background(SSMTheme.cardBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(SSMTheme.textPrimary)
            .font(.ssmRounded(15, weight: .medium))
    }

    private var quickPills: some View {
        let stats = model.checkInStats
        let pills: [(String, String, Int, Bool)] = [
            ("all", "All", stats.total, false),
            ("not_in", "Not checked in", stats.remaining, false),
            ("not_paid", "Unpaid", stats.unpaid, true),
            ("no_helmet", "Missing helmet", stats.noHelmet, true),
            ("attention", "Needs attention", stats.attention, true),
            ("in", "Checked in", stats.checkedIn, false),
            ("paid", "Paid", stats.total - stats.unpaid, false),
        ]
        return ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(pills, id: \.0) { pill in
                    let isOn = statusFilter == pill.0
                    Button {
                        statusFilter = pill.0
                        focusedRegID = nil
                    } label: {
                        Text("\(pill.1) · \(pill.2)")
                            .font(.ssmRounded(13, weight: .bold))
                            .foregroundStyle(isOn ? .white : (pill.3 ? SSMTheme.orange3 : SSMTheme.muted))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                SSMTheme.pillShape.fill(isOn ? SSMTheme.navy3 : SSMTheme.cardBackground)
                            )
                            .overlay(SSMTheme.pillShape.strokeBorder(SSMTheme.cardBorder, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .fixedSize()
        }
        .scrollIndicators(.hidden)
    }

    // ── Queue ────────────────────────────────────────────────────────────

    private var filteredQueue: [ExportRegistration] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        return model.checkInQueue.filter { reg in
            if !query.isEmpty {
                let haystack = "\(reg.name) \(reg.meetNumber ?? "") \(reg.helmetDisplay ?? "")".lowercased()
                if !haystack.contains(query) { return false }
            }
            switch statusFilter {
            case "not_in": return !reg.checkedIn
            case "in": return reg.checkedIn
            case "not_paid": return !reg.paid
            case "paid": return reg.paid
            case "no_helmet": return reg.helmetDisplay == nil
            case "attention": return !model.checkInIssues(reg).isEmpty
            default: return true
            }
        }
    }

    @ViewBuilder private var queue: some View {
        let rows = filteredQueue
        if model.registrations.isEmpty {
            SSMCard { Text("No registrations yet.").font(.ssmRounded(14, weight: .semibold)).foregroundStyle(SSMTheme.muted) }
        } else if rows.isEmpty {
            SSMCard { Text("No registrations match those filters.").font(.ssmRounded(14, weight: .semibold)).foregroundStyle(SSMTheme.muted) }
        } else {
            // Pinned card if it's still visible, else the first visible one —
            // the website's focus fallback.
            let focusID = rows.contains(where: { $0.id == focusedRegID }) ? focusedRegID : rows.first?.id
            ForEach(rows) { reg in
                skaterCard(reg, isFocused: reg.id == focusID)
                    .id("ci-card-\(reg.id)")
            }
        }
    }

    private func skaterCard(_ reg: ExportRegistration, isFocused: Bool) -> some View {
        let issues = model.checkInIssues(reg)
        let ready = issues.isEmpty

        return SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    helmetBadge(reg)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 8) {
                            Text(reg.name)
                                .font(.ssmRounded(17, weight: .heavy))
                                .foregroundStyle(SSMTheme.textPrimary)
                            Text("#\(reg.meetNumber ?? "—")")
                                .font(.ssmRounded(12, weight: .bold))
                                .foregroundStyle(SSMTheme.sky)
                            SSMChip(ready ? "✔ Ready to race" : "⚠ Needs attention",
                                    color: ready ? SSMTheme.good : SSMTheme.orange3)
                        }
                        Text("\(reg.team.isEmpty ? "Independent" : reg.team) · \(reg.divisionGroupLabel.isEmpty ? "Unassigned" : reg.divisionGroupLabel)")
                            .font(.ssmRounded(12, weight: .semibold))
                            .foregroundStyle(SSMTheme.muted)
                        if !issues.isEmpty {
                            Text("⚠ \(issues.joined(separator: " · "))")
                                .font(.ssmRounded(12, weight: .bold))
                                .foregroundStyle(SSMTheme.orange3)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 8) {
                        Button {
                            Task { await model.togglePaid(reg) }
                        } label: {
                            Text(reg.paid ? "✔ Paid" : "Mark paid · \(FrontDeskViewModel.money(model.cost(reg))) due")
                                .font(.ssmRounded(13, weight: .heavy))
                                .foregroundStyle(reg.paid ? SSMTheme.good : SSMTheme.orange)
                        }
                        .buttonStyle(.ssmSoftPill)

                        if reg.checkedIn {
                            Button {
                                Task { await model.toggleCheckIn(reg) }
                            } label: {
                                Text("✔ Checked in")
                                    .font(.ssmRounded(14, weight: .heavy))
                                    .foregroundStyle(SSMTheme.good)
                            }
                            .buttonStyle(.ssmSoftPill)
                        } else {
                            Button {
                                Task { await model.toggleCheckIn(reg) }
                            } label: {
                                Text("Check in")
                                    .font(.ssmRounded(14, weight: .heavy))
                            }
                            .buttonStyle(.ssmPill(SSMTheme.goodGradient))
                        }
                    }
                    .disabled(model.isWorking)
                }

                if isFocused {
                    Divider().overlay(SSMTheme.cardBorder)
                    focusDetails(reg)
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous)
                .strokeBorder(!ready ? SSMTheme.orange3.opacity(0.5) : (reg.checkedIn ? SSMTheme.good.opacity(0.4) : .clear), lineWidth: 2)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            focusedRegID = reg.id
            helmetDraft = reg.helmetDisplay ?? ""
        }
    }

    private func helmetBadge(_ reg: ExportRegistration) -> some View {
        Group {
            if let helmet = reg.helmetDisplay {
                Text(helmet)
                    .font(.ssmRounded(18, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .frame(width: 52, height: 52)
                    .background(SSMTheme.navy3, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            } else {
                Text("?")
                    .font(.ssmRounded(18, weight: .heavy))
                    .foregroundStyle(SSMTheme.orange3)
                    .frame(width: 52, height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(SSMTheme.orange3, style: StrokeStyle(lineWidth: 2, dash: [5]))
                    )
            }
        }
    }

    @ViewBuilder private func focusDetails(_ reg: ExportRegistration) -> some View {
        if !reg.sponsor.isEmpty {
            Text("Sponsored by \(reg.sponsor)")
                .font(.ssmRounded(12, weight: .semibold))
                .foregroundStyle(SSMTheme.orange)
        }

        let chips = model.entryChips(reg)
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                if chips.isEmpty {
                    SSMChip("No entries", color: SSMTheme.danger)
                } else {
                    ForEach(chips, id: \.self) { SSMChip($0, color: SSMTheme.sky) }
                }
                SSMChip("\(FrontDeskViewModel.money(model.cost(reg))) total", color: SSMTheme.orange)
            }
            .fixedSize()
        }
        .scrollIndicators(.hidden)

        HStack(spacing: 10) {
            Text("HELMET #")
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)
            TextField("—", text: $helmetDraft)
                .ssmNumberPad()
                .multilineTextAlignment(.center)
                .font(.ssmRounded(16, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(.vertical, 8)
                .frame(width: 90)
                .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            Button("Save") {
                Task { await model.setHelmet(reg, to: helmetDraft) }
            }
            .buttonStyle(.ssmSoftPill)
            .disabled(model.isWorking || helmetDraft.trimmingCharacters(in: .whitespaces) == (reg.helmetDisplay ?? ""))

            Spacer()

            Button("Edit registration") { editingReg = reg }
                .font(.ssmRounded(13, weight: .bold))
                .foregroundStyle(SSMTheme.sky)
                .buttonStyle(.plain)
                .disabled(model.isWorking)
        }
        // Re-seed the draft whenever focus lands on a different card —
        // covers tap, rail-jump, quick-pill resets, AND the auto-focus
        // fallback (a stale draft could otherwise transplant one skater's
        // helmet onto another, or a blank one clear-and-renumber it).
        .task(id: reg.id) {
            helmetDraft = reg.helmetDisplay ?? ""
        }
    }

    // ── Needs-attention rail ─────────────────────────────────────────────

    private func attentionRail(_ scroller: ScrollViewProxy) -> some View {
        let list = model.attentionList
        return SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Circle().fill(SSMTheme.orange3).frame(width: 9, height: 9)
                    Text("NEEDS ATTENTION")
                        .font(.ssmRounded(12, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    SSMChip("\(list.count)", color: SSMTheme.orange3)
                }
                Text("Sorted to the top of the queue")
                    .font(.ssmRounded(11, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)

                if list.isEmpty {
                    Text("Everyone is ready to race.")
                        .font(.ssmRounded(14, weight: .bold))
                        .foregroundStyle(SSMTheme.good)
                        .padding(.vertical, 8)
                } else {
                    ForEach(list) { reg in
                        attentionItem(reg, scroller: scroller)
                        if reg.id != list.last?.id {
                            Divider().overlay(SSMTheme.cardBorder)
                        }
                    }
                }

                Text("Anyone listed here can still be checked in — the flag follows them to the start line.")
                    .font(.ssmRounded(10, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
        }
    }

    private func attentionItem(_ reg: ExportRegistration, scroller: ScrollViewProxy) -> some View {
        let issues = model.checkInIssues(reg)
        let helmetIssue = reg.helmetDisplay == nil || model.isDuplicateHelmet(reg)
        let action = reg.helmetDisplay == nil ? "Assign helmet # →"
            : (model.isDuplicateHelmet(reg) ? "Resolve duplicate →" : "Take payment →")

        return Button {
            search = ""
            statusFilter = "all"
            focusedRegID = reg.id
            helmetDraft = reg.helmetDisplay ?? ""
            // Jump the queue to the newly focused card (the website scrolls
            // it into view the same way).
            withAnimation {
                scroller.scrollTo("ci-card-\(reg.id)", anchor: .center)
            }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    SSMChip(helmetIssue ? "HELMET" : "PAYMENT",
                            color: helmetIssue ? SSMTheme.orange3 : SSMTheme.sky)
                    Text(reg.name)
                        .font(.ssmRounded(13, weight: .bold))
                        .foregroundStyle(SSMTheme.textPrimary)
                    Text("#\(reg.meetNumber ?? "—")")
                        .font(.ssmRounded(11, weight: .bold))
                        .foregroundStyle(SSMTheme.muted)
                }
                Text(issues.joined(separator: " · "))
                    .font(.ssmRounded(11, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
                Text(action)
                    .font(.ssmRounded(11, weight: .heavy))
                    .foregroundStyle(SSMTheme.orange)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

/// Renumber every skater's helmet from a starting number (meetNumber order).
struct ReassignHelmetsSheet: View {
    @ObservedObject var model: FrontDeskViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var start = "1"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Reassign All Helmet #s")
                .font(.ssmRounded(22, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(.top, 24)
            Text("Renumbers EVERY skater sequentially in skater-number order and rebuilds lane assignments. Skaters keep racing — their helmet numbers change.")
                .font(.ssmRounded(13, weight: .medium))
                .foregroundStyle(SSMTheme.muted)

            HStack(spacing: 10) {
                Text("START AT")
                    .font(.ssmRounded(11, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                TextField("1", text: $start)
                    .ssmNumberPad()
                    .multilineTextAlignment(.center)
                    .font(.ssmRounded(16, weight: .heavy))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .padding(.vertical, 8)
                    .frame(width: 90)
                    .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            Button {
                Task {
                    await model.reassignHelmets(startingAt: start)
                    dismiss()
                }
            } label: {
                Text("Reassign Helmets").frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(model.isWorking)

            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: 460)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
        .preferredColorScheme(.dark)
    }
}
