import SwiftUI

/// iPad Meet Settings editor: identity, visibility, venue, registration window,
/// fees, racing basics, and the division scheme. Saves are safe partial updates;
/// anything that rebuilds races (lanes/track, scheme) confirms first.
struct PadMeetSettingsView: View {
    let meetID: String
    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var vm = PadMeetSettingsViewModel()
    @State private var confirmRebuild = false
    @State private var pendingScheme: String?
    @State private var pendingPresetLoad: SetupPreset?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                intro
                if vm.isLoading && !vm.loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if !vm.loaded {
                    // NEVER render the editable form when the load failed — an
                    // all-blank form + Save would wipe the meet's real values.
                    SSMCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(vm.errorMessage ?? "Couldn't load this meet's settings.")
                                .font(.ssmRounded(14, weight: .semibold))
                                .foregroundStyle(SSMTheme.danger)
                            Button { Task { await vm.load(meetID: meetID) } } label: {
                                Label("Retry", systemImage: "arrow.clockwise")
                                    .font(.ssmRounded(13, weight: .bold))
                            }
                            .buttonStyle(.ssmSoftPill)
                        }
                    }
                } else {
                    basicsCard
                    publishCard
                    venueCard
                    feesCard
                    racingCard
                    timeTrialsCard
                    divisionsCard
                    actionBar
                    presetsCard
                    desktopPinCard
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
            Text("Everything about this meet — basics, visibility, venue, fees, and racing setup. Changes that rebuild races always ask first.")
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
                     ? "This meet is archived. Unarchive it from Director Tools → Meet Actions."
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
                        Button("Clear custom name", role: .destructive) { vm.customRinkName = "" }
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
                    textInput($vm.customRinkName, placeholder: "e.g. Community Ice Center")
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
                if let flash = vm.schemeFlash {
                    Text("✓ \(flash)")
                        .font(.ssmRounded(12, weight: .bold))
                        .foregroundStyle(SSMTheme.good)
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
            Text("This replaces your divisions with the chosen template and reloads this screen — unsaved edits here are discarded. Races regenerate when you save the Divisions tab.")
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

    private var timeTrialsCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("TIME TRIALS").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                Toggle(isOn: $vm.ttEventEnabled) {
                    Text("Time Trial event")
                        .font(.ssmRounded(15, weight: .bold))
                        .foregroundStyle(SSMTheme.textPrimary)
                }
                .tint(SSMTheme.orange)
                if vm.ttEventEnabled {
                    HStack(spacing: 12) {
                        field("Distance") { textInput($vm.ttDistance, placeholder: "e.g. 100m") }
                            .frame(maxWidth: 180)
                        Toggle(isOn: $vm.ttCountsForOverall) {
                            Text("Counts for overall standings")
                                .font(.ssmRounded(13, weight: .semibold))
                                .foregroundStyle(SSMTheme.textPrimary)
                        }
                        .tint(SSMTheme.orange)
                    }
                }
                Text("Runs youngest to oldest. Skaters opt in on their registration; place the event in the running order in Block Builder.")
                    .font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
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
                if vm.racingChanged { confirmRebuild = true } else { Task { await saveAndSync() } }
            } label: {
                Label(vm.isSaving ? "Saving…" : "Save Settings", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(vm.isSaving || !vm.canSave || !vm.loaded)
            .opacity(vm.isSaving || !vm.canSave || !vm.loaded ? 0.6 : 1)
        }
        .confirmationDialog("Rebuild races?", isPresented: $confirmRebuild, titleVisibility: .visible) {
            Button("Save & Rebuild Races", role: .destructive) { Task { await saveAndSync() } }
        } message: {
            Text("You changed lanes or track length. Saving rebuilds every race's heats and lane assignments — do this before check-in, not mid-meet.")
        }
    }

    /// Save, then keep the sidebar's meet name in sync with a rename.
    private func saveAndSync() async {
        await vm.save(meetID: meetID)
        if vm.savedFlash, !vm.meetName.isEmpty {
            session.selectedMeetName = vm.meetName
        }
    }

    private var presetsCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("SETUP PRESETS").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                Text("Save this meet's racing setup — divisions, opens, quads, relays, fees, lanes — and reuse it next time. Loading one never changes a meet's name, dates, or registrations.")
                    .font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
                HStack(spacing: 10) {
                    textInput($vm.newPresetName, placeholder: "Name this setup…")
                    Button { Task { await vm.savePreset(meetID: meetID) } } label: {
                        Label("Save", systemImage: "square.and.arrow.down").font(.ssmRounded(13, weight: .bold))
                    }
                    .buttonStyle(.ssmSoftPill)
                    .disabled(vm.isPresetWorking || vm.newPresetName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if !vm.presets.isEmpty {
                    Divider().overlay(SSMTheme.cardBorder)
                    ForEach(vm.presets) { preset in
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(preset.name)
                                    .font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                                if !preset.scheme.isEmpty {
                                    Text(preset.scheme.uppercased()).font(.caption).foregroundStyle(SSMTheme.muted)
                                }
                            }
                            Spacer()
                            Button { pendingPresetLoad = preset } label: {
                                Label("Load", systemImage: "tray.and.arrow.up").font(.ssmRounded(12, weight: .bold))
                            }
                            .buttonStyle(.ssmSoftPill)
                            .disabled(vm.isPresetWorking)
                        }
                    }
                }
                if let flash = vm.presetFlash {
                    Text("✓ \(flash)").font(.ssmRounded(13, weight: .bold)).foregroundStyle(SSMTheme.good)
                }
                if let err = vm.presetError {
                    Text(err).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                }
            }
        }
        .confirmationDialog("Load this setup?",
                            isPresented: Binding(get: { pendingPresetLoad != nil },
                                                 set: { if !$0 { pendingPresetLoad = nil } }),
                            titleVisibility: .visible, presenting: pendingPresetLoad) { preset in
            Button("Load & Rebuild Races", role: .destructive) {
                Task { await vm.loadPreset(meetID: meetID, presetID: preset.id) }
            }
        } message: { _ in
            Text("Replaces this meet's divisions, fees, and racing setup, then regenerates races. Your meet name, dates, venue, and registrations stay as they are.")
        }
    }

    private var desktopPinCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("DESKTOP PIN").font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                    Spacer()
                    SSMChip(vm.hasDesktopPin ? "SET" : "NONE",
                            color: vm.hasDesktopPin ? SSMTheme.good : SSMTheme.muted)
                }
                Text("A 6-digit PIN that unlocks this meet in the SSM Desktop app on meet day.")
                    .font(.ssmRounded(12, weight: .medium)).foregroundStyle(SSMTheme.muted)
                if let pin = vm.freshPin {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(pin)
                            .font(.system(size: 34, weight: .heavy, design: .rounded))
                            .foregroundStyle(SSMTheme.orange)
                        Text("Write this down now — it can't be shown again.")
                            .font(.ssmRounded(12, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                HStack(spacing: 10) {
                    Button { Task { await vm.generateDesktopPin(meetID: meetID) } } label: {
                        Label(vm.hasDesktopPin ? "New PIN" : "Generate PIN", systemImage: "key")
                            .font(.ssmRounded(13, weight: .bold))
                    }
                    .buttonStyle(.ssmSoftPill)
                    .disabled(vm.isPresetWorking)
                    if vm.hasDesktopPin {
                        Button(role: .destructive) { Task { await vm.clearDesktopPin(meetID: meetID) } } label: {
                            Label("Clear", systemImage: "xmark.circle").font(.ssmRounded(13, weight: .bold))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(SSMTheme.danger)
                        .disabled(vm.isPresetWorking)
                    }
                }
            }
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
