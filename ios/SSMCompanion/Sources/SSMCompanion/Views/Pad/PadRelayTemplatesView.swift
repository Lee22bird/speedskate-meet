import SwiftUI

/// Relay setup (director): choose which relay divisions this meet offers and
/// tune their age ranges / distances. Enabling a division generates its relay
/// race; team entry happens afterwards in the Relay Builder.
struct PadRelayTemplatesView: View {
    let meetID: String
    @StateObject private var vm = PadRelayTemplatesViewModel()
    @State private var pendingDeleteRaceID: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                intro
                if vm.isLoading && !vm.loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if !vm.loaded {
                    SSMCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(vm.errorMessage ?? "Couldn't load relay divisions.")
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
                    filterBar
                    ForEach($vm.rows) { $row in
                        if !vm.showEnabledOnly || row.enabled { rowCard($row) }
                    }
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
        .confirmationDialog("Remove this relay race?",
                            isPresented: Binding(get: { pendingDeleteRaceID != nil },
                                                 set: { if !$0 { pendingDeleteRaceID = nil } }),
                            titleVisibility: .visible, presenting: pendingDeleteRaceID) { raceID in
            Button("Remove Race", role: .destructive) {
                Task { await vm.deleteRace(meetID: meetID, raceID: raceID) }
            }
        } message: { _ in
            Text("Deletes the generated relay race and turns this division off. Any teams you built for it stay saved.")
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text("Relays").font(.ssmRounded(24, weight: .heavy)).foregroundStyle(SSMTheme.textPrimary)
                if !vm.ruleset.isEmpty { SSMChip(vm.ruleset.uppercased(), color: SSMTheme.sky2) }
            }
            Text("Pick which relays this meet runs. Turning one on creates its race — then build the teams in Relay Builder.")
                .font(.ssmRounded(13, weight: .medium)).foregroundStyle(SSMTheme.muted)
        }
    }

    private var filterBar: some View {
        HStack(spacing: 10) {
            Text("\(vm.enabledCount) of \(vm.rows.count) on")
                .font(.ssmRounded(13, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
            Spacer()
            Toggle(isOn: $vm.showEnabledOnly) {
                Text("Only show what's on")
                    .font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.muted)
            }
            .tint(SSMTheme.orange)
            .fixedSize()
        }
    }

    private func rowCard(_ row: Binding<EditableRelayTemplate>) -> some View {
        let r = row.wrappedValue
        return SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Toggle(isOn: row.enabled) {
                        Text(r.label)
                            .font(.ssmRounded(15, weight: .bold))
                            .foregroundStyle(SSMTheme.textPrimary)
                    }
                    .tint(SSMTheme.orange)
                    if r.discipline == "quad" { SSMChip("QUAD", color: SSMTheme.sky2) }
                }
                if r.enabled {
                    HStack(spacing: 10) {
                        labeled("Ages") { input(row.ageRange, placeholder: "e.g. 8-11") }
                        labeled("Distance") { input(row.distance, placeholder: "e.g. 2000m") }
                        if let raceID = r.raceId {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("RACE").font(.ssmRounded(10, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                                if r.raceHasResults {
                                    Text("Already raced")
                                        .font(.ssmRounded(12, weight: .bold))
                                        .foregroundStyle(SSMTheme.good)
                                } else {
                                    Button(role: .destructive) { pendingDeleteRaceID = raceID } label: {
                                        Label("Remove", systemImage: "trash")
                                            .font(.ssmRounded(12, weight: .bold))
                                    }
                                    .buttonStyle(.plain)
                                    .foregroundStyle(SSMTheme.danger)
                                }
                            }
                            .frame(maxWidth: 120, alignment: .leading)
                        }
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
            Button { Task { await vm.save(meetID: meetID) } } label: {
                Label(vm.isSaving ? "Saving…" : "Save Relays (\(vm.enabledCount) on)", systemImage: "checkmark.circle")
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

    private func input(_ text: Binding<String>, placeholder: String) -> some View {
        TextField(placeholder, text: text)
            .font(.ssmRounded(14, weight: .semibold))
            .foregroundStyle(SSMTheme.textPrimary)
            .autocorrectionDisabled()
            .padding(.horizontal, 10).padding(.vertical, 9)
            .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
