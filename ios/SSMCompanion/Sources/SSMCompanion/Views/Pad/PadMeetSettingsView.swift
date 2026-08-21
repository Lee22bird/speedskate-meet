import SwiftUI

/// iPad Meet Settings editor (phase 1): a director edits identity + fees.
/// Saves a safe partial update — lanes, divisions, publishing, rink, and the
/// registration window are intentionally not here (they rebuild races or change
/// public state) and come in later phases.
struct PadMeetSettingsView: View {
    let meetID: String
    @StateObject private var vm = PadMeetSettingsViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                intro
                if vm.isLoading && !vm.loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    basicsCard
                    feesCard
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

    private var actionBar: some View {
        VStack(spacing: 10) {
            if vm.savedFlash {
                Text("✓ Settings saved.").font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.good)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error = vm.errorMessage {
                Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button {
                Task { await vm.save(meetID: meetID) }
            } label: {
                Label(vm.isSaving ? "Saving…" : "Save Settings", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(vm.isSaving || !vm.canSave)
            .opacity(vm.isSaving || !vm.canSave ? 0.6 : 1)
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
