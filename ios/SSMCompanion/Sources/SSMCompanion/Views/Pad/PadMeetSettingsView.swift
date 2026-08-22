import SwiftUI

/// iPad Meet Settings editor (phase 1): a director edits identity + fees.
/// Saves a safe partial update — lanes, divisions, publishing, rink, and the
/// registration window are intentionally not here (they rebuild races or change
/// public state) and come in later phases.
struct PadMeetSettingsView: View {
    let meetID: String
    @StateObject private var vm = PadMeetSettingsViewModel()
    @State private var confirmRebuild = false
    @State private var pendingScheme: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                intro
                if vm.isLoading && !vm.loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    basicsCard
                    publishCard
                    venueCard
                    feesCard
                    racingCard
                    divisionsCard
                    actionBar
                }
            }
            .padding(24)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .task { await vm.load(meetID: meetID) }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Meet Settings")
                .font(.ssmRounded(24, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
            Text("Edit the meet's basics and fees. Racing setup (lanes, divisions, publishing) stays on the web for now — changing it rebuilds races.")
                .font(.ssmRounded(13, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
        }
    }

    private var basicsCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("BASICS").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                field("Meet name") {
                    textInput($vm.meetName, placeholder: "Meet name")
                }
                HStack(spacing: 12) {
                    field("Start date") { textInput($vm.date, placeholder: "YYYY-MM-DD", keyboard: .numbersAndPunctuation) }
                    field("End date (optional)") { textInput($vm.endDate, placeholder: "YYYY-MM-DD", keyboard: .numbersAndPunctuation) }
                }
                field("Start time") { textInput($vm.startTime, placeholder: "e.g. 9:00 AM") }
            }
        }
    }

    /// Publish = listed on the public site + open for online registration.
    private var publishCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("VISIBILITY").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                    Spacer()
                    SSMChip(vm.published ? "PUBLIC" : "DRAFT",
                            color: vm.published ? SSMTheme.good : SSMTheme.muted)
                }
                Toggle(isOn: $vm.published) {
                    Text("Publish this meet")
                        .font(.ssmRounded(15, weight: .bold))
                        .foregroundStyle(SSMTheme.textPrimary)
                }
                .tint(SSMTheme.orange)
                .disabled(vm.status == "archived")
                Text(vm.status == "archived"
                     ? "This meet is archived. Unarchive it on the website to change visibility."
                     : "Published meets appear on Find a Meet and accept online registration. Takes effect when you save.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
        }
    }

    private var venueCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("VENUE & REGISTRATION").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                field("Rink") {
                    Menu {
                        ForEach(vm.rinks) { r in
                            Button(r.label.isEmpty ? "Rink #\(r.id)" : r.label) { vm.selectRink(r) }
                        }
                        if !vm.rinks.isEmpty { Divider() }
                        Button("Clear venue", role: .destructive) { vm.rinkId = 0; vm.customRinkName = "" }
                    } label: {
                        HStack {
                            Text(vm.currentRinkLabel)
                                .font(.ssmRounded(15, weight: .semibold))
                                .foregroundStyle(vm.currentRinkLabel == "No venue set" ? SSMTheme.muted : SSMTheme.textPrimary)
                                .lineLimit(1)
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(SSMTheme.muted)
                        }
                        .padding(12)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
                field("Or type a custom venue") {
                    textInput(Binding(get: { vm.customRinkName },
                                      set: { vm.customRinkName = $0; if !$0.isEmpty { vm.rinkId = 0 } }),
                              placeholder: "e.g. Community Ice Center")
                }
                HStack(spacing: 12) {
                    field("Registration closes") { textInput($vm.registrationCloseDate, placeholder: "YYYY-MM-DD", keyboard: .numbersAndPunctuation) }
                    field("Close time") { textInput($vm.registrationCloseTime, placeholder: "HH:MM (24h)", keyboard: .numbersAndPunctuation) }
                }
            }
        }
    }

    private var feesCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("FEES").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                HStack(spacing: 12) {
                    field("Base entry ($)") { textInput($vm.baseEntryFee, placeholder: "0", keyboard: .decimalPad) }
                    field("Additional race ($)") { textInput($vm.additionalRaceFee, placeholder: "0", keyboard: .decimalPad) }
                }
                field("Registration cap ($)") { textInput($vm.maxRegistrationFee, placeholder: "0 = no cap", keyboard: .decimalPad) }
                HStack(spacing: 12) {
                    field("Protest fee ($)") { textInput($vm.protestFee, placeholder: "0", keyboard: .decimalPad) }
                    field("Protest window (min)") { textInput($vm.protestDeadlineMinutes, placeholder: "0 = none", keyboard: .numberPad) }
                }
                Text("The protest fee and window feed the coach protest form and the officials' inbox.")
                    .font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
            }
        }
    }

    private var divisionsCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("DIVISION SCHEME").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                Text("The division set that generates your races. Fine-tune individual divisions in the Divisions tab. Switching re-applies that template and rebuilds races.")
                    .font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
                VStack(spacing: 6) {
                    schemeRow("standard", "Standard", "24 age groups · Novice + Elite")
                    schemeRow("usars", "USARS National", "Full USARS divisions · SR832 tiebreak")
                    schemeRow("mssl", "MSSL League", "League template + auto schedule")
                }
                if vm.isSwitchingScheme {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Applying…").font(.ssmRounded(12, weight: .semibold)).foregroundStyle(SSMTheme.muted)
                    }
                }
            }
        }
        .confirmationDialog("Switch divisions?", isPresented: Binding(get: { pendingScheme != nil },
                                                                      set: { if !$0 { pendingScheme = nil } }),
                            titleVisibility: .visible, presenting: pendingScheme) { scheme in
            Button("Switch & Rebuild Races", role: .destructive) {
                Task { await vm.switchScheme(meetID: meetID, to: scheme) }
            }
        } message: { _ in
            Text("This replaces your divisions with the chosen template and rebuilds every race. Do it before check-in, not mid-meet.")
        }
    }

    private func schemeRow(_ key: String, _ title: String, _ detail: String) -> some View {
        let selected = vm.divisionScheme == key
        return Button {
            if !selected { pendingScheme = key }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? SSMTheme.orange : SSMTheme.muted)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.ssmRounded(15, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                    Text(detail).font(.caption).foregroundStyle(SSMTheme.muted)
                }
                Spacer()
            }
            .contentShape(Rectangle())
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .disabled(vm.isSwitchingScheme)
    }

    private var racingCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("RACING").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                HStack(spacing: 12) {
                    field("Lanes") { textInput($vm.lanes, placeholder: "e.g. 5", keyboard: .numberPad) }
                    field("Track length (m)") { textInput($vm.trackLength, placeholder: "e.g. 100", keyboard: .numberPad) }
                }
                Text("⚠️ Changing lanes or track length rebuilds every race's heats and lane assignments. Do this before check-in, not mid-meet.")
                    .font(.ssmRounded(12, weight: .semibold)).foregroundStyle(SSMTheme.orange)
            }
        }
    }

    private var actionBar: some View {
        VStack(spacing: 10) {
            if vm.savedFlash {
                Text(vm.rebuildFlash ? "✓ Saved — races were rebuilt for the new lanes/track."
                                     : "✓ Settings saved.")
                    .font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.good)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error = vm.errorMessage {
                Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button {
                if vm.racingChanged { confirmRebuild = true } else { Task { await vm.save(meetID: meetID) } }
            } label: {
                Label(vm.isSaving ? "Saving…" : "Save Settings", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(vm.isSaving || !vm.canSave)
            .opacity(vm.isSaving || !vm.canSave ? 0.6 : 1)
        }
        .confirmationDialog("Rebuild races?", isPresented: $confirmRebuild, titleVisibility: .visible) {
            Button("Save & Rebuild Races", role: .destructive) { Task { await vm.save(meetID: meetID) } }
        } message: {
            Text("You changed lanes or track length. Saving rebuilds every race's heats and lane assignments — do this before check-in, not mid-meet.")
        }
    }

    // MARK: builders

    private func field<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.ssmRounded(13, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func textInput(_ text: Binding<String>, placeholder: String,
                           keyboard: UIKeyboardType = .default) -> some View {
        TextField(placeholder, text: text)
            .font(.ssmRounded(15, weight: .semibold))
            .foregroundStyle(SSMTheme.textPrimary)
            .keyboardType(keyboard)
            .autocorrectionDisabled()
            .padding(12)
            .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
