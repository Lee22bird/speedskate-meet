import SwiftUI

/// Per-division editor (director): for each age group, toggle its Novice and
/// Elite divisions, set the ages, and list the distances. Saving regenerates the
/// meet's races from this config, so it confirms first. The division *scheme*
/// (Standard/USARS/MSSL) is chosen in Meet Settings.
struct PadDivisionsView: View {
    let meetID: String
    @StateObject private var vm = PadDivisionsViewModel()
    @State private var confirmSave = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                intro
                if vm.isLoading && !vm.loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.groups.isEmpty {
                    SSMCard {
                        Text("No division groups yet. Pick a division scheme in Meet Settings first.")
                            .font(.ssmRounded(14, weight: .medium)).foregroundStyle(SSMTheme.muted)
                    }
                } else {
                    ForEach($vm.groups) { $group in groupCard($group) }
                    saveBar
                }
            }
            .padding(24)
            .frame(maxWidth: 860)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .task { await vm.load(meetID: meetID) }
        .confirmationDialog("Save divisions?", isPresented: $confirmSave, titleVisibility: .visible) {
            Button("Save & Rebuild Races", role: .destructive) { Task { await vm.save(meetID: meetID) } }
        } message: {
            Text("This regenerates every race from your enabled divisions and distances. Do it before check-in, not mid-meet.")
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text("Divisions").font(.ssmRounded(24, weight: .heavy)).foregroundStyle(SSMTheme.textPrimary)
                if !vm.scheme.isEmpty { SSMChip(vm.scheme.uppercased(), color: SSMTheme.sky2) }
            }
            Text("Turn each group's Novice/Elite divisions on or off and set their distances. The scheme is chosen in Meet Settings; this fine-tunes it.")
                .font(.ssmRounded(13, weight: .medium)).foregroundStyle(SSMTheme.muted)
        }
    }

    private func groupCard(_ group: Binding<EditableGroup>) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(group.wrappedValue.label)
                        .font(.ssmRounded(16, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                    Spacer()
                    Text("\(group.wrappedValue.ages) · \(group.wrappedValue.gender.capitalized)")
                        .font(.caption).foregroundStyle(SSMTheme.muted)
                }
                slotRow("Novice", group.novice)
                Divider().overlay(SSMTheme.cardBorder)
                slotRow("Elite", group.elite)
            }
        }
    }

    private func slotRow(_ title: String, _ slot: Binding<EditableSlot>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: slot.enabled) {
                Text(title).font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
            }
            .tint(SSMTheme.orange)
            if slot.wrappedValue.enabled {
                HStack(spacing: 10) {
                    labeled("Ages") {
                        input(slot.ages, placeholder: "e.g. 8-9", keyboard: .numbersAndPunctuation)
                    }
                    .frame(maxWidth: 140)
                    labeled("Distances") {
                        input(slot.distances, placeholder: "500m, 1000m")
                    }
                }
            }
        }
    }

    private var saveBar: some View {
        VStack(spacing: 10) {
            if let msg = vm.savedMessage {
                Text("✓ \(msg)").font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.good)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error = vm.errorMessage {
                Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button { confirmSave = true } label: {
                Label(vm.isSaving ? "Saving…" : "Save Divisions (\(vm.enabledCount) on)", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(vm.isSaving)
            .opacity(vm.isSaving ? 0.6 : 1)
        }
        .padding(.top, 4)
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased()).font(.ssmRounded(10, weight: .heavy)).foregroundStyle(SSMTheme.muted)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func input(_ text: Binding<String>, placeholder: String,
                       keyboard: UIKeyboardType = .default) -> some View {
        TextField(placeholder, text: text)
            .font(.ssmRounded(14, weight: .semibold))
            .foregroundStyle(SSMTheme.textPrimary)
            .keyboardType(keyboard)
            .autocorrectionDisabled()
            .padding(.horizontal, 10).padding(.vertical, 9)
            .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
