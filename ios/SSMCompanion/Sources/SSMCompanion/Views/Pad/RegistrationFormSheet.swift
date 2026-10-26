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
            // Only the categories this meet offers — the website's form shows
            // exactly these (registrationAvailability) and the server drops
            // anything else on save.
            let available = meet?.registrationAvailability
            if available?.challengeUp == true { Toggle("Challenge Up", isOn: $form.challengeUp) }
            if available?.novice == true { Toggle("Novice", isOn: $form.novice) }
            if available?.elite == true { Toggle("Elite", isOn: $form.elite) }
            if available?.open == true { Toggle("Open", isOn: $form.open) }
            if available?.quad == true { Toggle("Quad", isOn: $form.quad) }
            if showTimeTrials {
                Toggle("Time Trials", isOn: $form.timeTrials)
            }

            // Relays by team size, one toggle per size the meet has an enabled
            // relay event for. Each size is one event; the server attaches the
            // matching inline and quad relay events.
            let relaySizes = meet?.registrationRelaySizes ?? []
            if !relaySizes.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("RELAY EVENTS")
                        .font(.ssmRounded(11, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    if relaySizes.contains(2) { Toggle("2 Person Relay", isOn: $form.relay2Person) }
                    if relaySizes.contains(3) { Toggle("3 Person Relay", isOn: $form.relay3Person) }
                    if relaySizes.contains(4) { Toggle("4 Person Relay", isOn: $form.relay4Person) }
                }
                .padding(.top, 4)
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
