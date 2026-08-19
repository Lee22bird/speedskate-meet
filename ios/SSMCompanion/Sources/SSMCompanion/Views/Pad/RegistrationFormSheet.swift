import SwiftUI

/// Add/Edit Racer — the website's registrationForm as a native sheet.
/// Sends the complete record on save (the server's edit wholly replaces
/// options/paid/checkedIn); division, cost, and helmet auto-assignment stay
/// server-side. The cost preview uses the site's exact formula.
struct RegistrationFormSheet: View {
    @ObservedObject var model: FrontDeskViewModel
    let editingReg: ExportRegistration?
    @Environment(\.dismiss) private var dismiss

    @State private var form = RegistrationFormState.blank()
    @State private var saveError: String?

    private var meet: ExportMeet? { model.meet }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    identitySection
                    raceDaySection
                    eventsSection
                    costPreviewCard

                    if let editingReg, !editingReg.specialRaceIds.isEmpty {
                        // Server-inherited: the edit endpoint rebuilds options
                        // without specialRaceIds (the website's form does the
                        // same) — warn instead of silently dropping them.
                        Text("⚠ This racer has \(editingReg.specialRaceIds.count) special-race entr\(editingReg.specialRaceIds.count == 1 ? "y" : "ies") from an older version of SSM. Saving will remove them and recalculate the fee.")
                            .font(.ssmRounded(12, weight: .bold))
                            .foregroundStyle(SSMTheme.orange3)
                            .padding(12)
                            .background(SSMTheme.orange3.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }

                    if let saveError {
                        Text(saveError)
                            .font(.ssmRounded(13, weight: .bold))
                            .foregroundStyle(SSMTheme.danger)
                    }

                    Button {
                        Task {
                            saveError = nil
                            if await model.saveRegistration(form, editingID: editingReg?.id) {
                                dismiss()
                            } else {
                                saveError = model.errorMessage
                                model.errorMessage = nil
                            }
                        }
                    } label: {
                        Text(editingReg == nil ? "Add Racer" : "Save Racer")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.ssmPill)
                    .disabled(model.isWorking || form.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(24)
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(SSMTheme.pageBackground)
            .navigationTitle(editingReg == nil ? "Add Racer" : "Edit Racer")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            if let editingReg {
                form = RegistrationFormState(from: editingReg)
            } else {
                form = .blank()
            }
        }
    }

    // ── Identity ─────────────────────────────────────────────────────────

    private var identitySection: some View {
        formCard("SKATER") {
            labeledField("Skater Name (required)") {
                TextField("Full name", text: $form.name)
            }
            HStack(spacing: 12) {
                labeledField("Date of Birth") {
                    TextField("YYYY-MM-DD", text: $form.birthdate)
                        .ssmNoAutocapitalization()
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("GENDER")
                        .font(.ssmRounded(11, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    Picker("Gender", selection: $form.gender) {
                        Text("Male").tag("male")
                        Text("Female").tag("female")
                    }
                    .pickerStyle(.segmented)
                }
            }
            Text("USARS age and division are auto-calculated from birthdate and gender.")
                .font(.ssmRounded(11, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
            labeledField("Team") {
                TextField("Team", text: $form.team)
            }
            HStack(spacing: 12) {
                labeledField("Sponsor (optional)") {
                    TextField("Sponsor", text: $form.sponsor)
                }
                labeledField("Email (optional)") {
                    TextField("Email", text: $form.email)
                        .ssmNoAutocapitalization()
                }
            }
        }
    }

    // ── Race-day status ──────────────────────────────────────────────────

    private var raceDaySection: some View {
        formCard(editingReg == nil ? "RACE-DAY DEFAULTS" : "RACE-DAY STATUS") {
            labeledField("Helmet # (blank = \(editingReg == nil ? "auto-assign" : "keep current"))") {
                TextField("auto", text: $form.helmetNumber)
                    .ssmNumberPad()
            }
            Toggle("Paid", isOn: $form.paid)
            Toggle("Checked In", isOn: $form.checkedIn)
        }
    }

    // ── Events ───────────────────────────────────────────────────────────

    private var eventsSection: some View {
        formCard("EVENTS") {
            Toggle("Challenge Up", isOn: $form.challengeUp)
            Toggle("Novice", isOn: $form.novice)
            Toggle("Elite", isOn: $form.elite)
            Toggle("Open", isOn: $form.open)
            if meet?.quadEnabled == true {
                Toggle("Quad", isOn: $form.quad)
            }
            if showTimeTrials {
                Toggle("Time Trials", isOn: $form.timeTrials)
            }

            let inlineRelays = enabledRelays(discipline: "inline")
            if !inlineRelays.isEmpty {
                relayPicker("RELAY EVENTS", rows: inlineRelays, selection: $form.relayEventIds)
            }
            let quadRelaysAvailable = meet?.quadEnabled == true
            let quadRelays = quadRelaysAvailable ? enabledRelays(discipline: "quad") : []
            if !quadRelays.isEmpty {
                relayPicker("QUAD RELAY EVENTS", rows: quadRelays, selection: $form.quadRelayEventIds)
            }
            // Legacy plain flags only when the meet HAS relay events but no
            // usable templates (the website's hasRelayEvents gate — a meet
            // with no relay configuration shows no relay UI at all), or when
            // the racer already carries a legacy flag that must stay
            // clearable.
            let hasLegacyFlags = form.relay2Person || form.relay3Person || form.relay4Person
                || form.quadRelay2Person || form.quadRelay3Person
            if inlineRelays.isEmpty, quadRelays.isEmpty,
               (meet?.hasRelayEvents == true || hasLegacyFlags) {
                Toggle("2 Person Relay", isOn: $form.relay2Person)
                Toggle("3 Person Relay", isOn: $form.relay3Person)
                Toggle("4 Person Relay", isOn: $form.relay4Person)
                if quadRelaysAvailable || form.quadRelay2Person || form.quadRelay3Person {
                    Toggle("🛼 Quad 2 Person Relay", isOn: $form.quadRelay2Person)
                    Toggle("🛼 Quad 3 Person Relay", isOn: $form.quadRelay3Person)
                }
            }

            if let groups = meet?.additionalGroups, !groups.isEmpty {
                Toggle("Additional Races", isOn: $form.additional)
                if form.additional {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("ADDITIONAL RACE GROUP")
                            .font(.ssmRounded(11, weight: .heavy))
                            .foregroundStyle(SSMTheme.muted)
                        Picker("Additional Race Group", selection: $form.additionalGroupId) {
                            Text("— Select group —").tag("")
                            ForEach(groups) { group in
                                Text(group.displayLabel).tag(group.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(SSMTheme.sky)
                    }
                }
            }
        }
        #if !os(tvOS)
        .toggleStyle(SwitchToggleStyle(tint: SSMTheme.orange)) // no switch toggles on tvOS
        #endif
    }

    private var showTimeTrials: Bool {
        // Offer the toggle when the meet has a TT event, or the racer already
        // has TT set (so an edit can't silently clear it out of sight).
        (meet?.timeTrialEvents.isEmpty == false) || form.timeTrials
    }

    private func enabledRelays(discipline: String) -> [ExportRelayTemplate] {
        (meet?.relayTemplates ?? []).filter {
            $0.enabled && $0.discipline == discipline && !$0.divisionId.isEmpty
        }
    }

    private func relayPicker(_ label: String, rows: [ExportRelayTemplate],
                             selection: Binding<Set<String>>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)
            Text("Each selected relay division counts as one event.")
                .font(.ssmRounded(11, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
            ForEach(rows) { row in
                Toggle(isOn: Binding(
                    get: { selection.wrappedValue.contains(row.id) },
                    set: { on in
                        if on { selection.wrappedValue.insert(row.id) }
                        else { selection.wrappedValue.remove(row.id) }
                    }
                )) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.displayLabel)
                            .font(.ssmRounded(14, weight: .semibold))
                        Text("\(row.type)\(row.discipline == "quad" ? " · Quad" : "")")
                            .font(.ssmRounded(11, weight: .medium))
                            .foregroundStyle(SSMTheme.muted)
                    }
                }
            }
        }
        .padding(.top, 4)
    }

    // ── Cost preview ─────────────────────────────────────────────────────

    private var costPreviewCard: some View {
        formCard("REGISTRATION TOTAL PREVIEW") {
            if let meet {
                let preview = form.costPreview(for: meet)
                Text(FrontDeskViewModel.money(preview.total))
                    .font(.ssmRounded(34, weight: .heavy))
                    .foregroundStyle(SSMTheme.orange)
                Text(costBreakdown(preview, meet: meet))
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
        }
    }

    private func costBreakdown(_ preview: (total: Double, uncapped: Double, categories: Int, capped: Bool),
                               meet: ExportMeet) -> String {
        guard preview.categories > 0 else {
            return "Base registration includes the first selected event category."
        }
        let extra = max(0, preview.categories - 1)
        var text = "\(preview.categories) event categor\(preview.categories == 1 ? "y" : "ies") selected · "
            + "\(FrontDeskViewModel.money(meet.baseEntryFee)) base + \(extra) × \(FrontDeskViewModel.money(meet.additionalRaceFee)) additional = \(FrontDeskViewModel.money(preview.uncapped))"
        if preview.capped {
            text += " · Maximum cap applied: \(FrontDeskViewModel.money(meet.maxRegistrationFee)) (uncapped total was \(FrontDeskViewModel.money(preview.uncapped)))"
        }
        return text
    }

    // ── Shared pieces ────────────────────────────────────────────────────

    private func formCard(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                content()
            }
        }
    }

    private func labeledField(_ label: String, @ViewBuilder field: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)
            field()
                .padding(12)
                .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundStyle(SSMTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
