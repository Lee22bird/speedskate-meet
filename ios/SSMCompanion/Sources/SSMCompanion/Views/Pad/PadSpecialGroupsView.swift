import SwiftUI

/// The Open and Quad builders (director). Same screen, two kinds: turn each
/// group on/off and set its distance(s). Saving regenerates the meet's races
/// from the enabled groups, so it confirms first.
struct PadSpecialGroupsView: View {
    let meetID: String
    @StateObject private var vm: PadSpecialGroupsViewModel
    @State private var confirmSave = false

    init(meetID: String, kind: String) {
        self.meetID = meetID
        _vm = StateObject(wrappedValue: PadSpecialGroupsViewModel(kind: kind))
    }

    private var title: String { vm.isOpen ? "Open Races" : "Quad Races" }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                intro
                if vm.isLoading && !vm.loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if !vm.loaded {
                    SSMCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(vm.errorMessage ?? "Couldn't load these race groups.")
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
                    ForEach($vm.groups) { $group in
                        if !vm.showEnabledOnly || group.enabled { groupCard($group) }
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
        .confirmationDialog("Save \(title.lowercased())?", isPresented: $confirmSave, titleVisibility: .visible) {
            Button("Save & Rebuild Races", role: .destructive) { Task { await vm.save(meetID: meetID) } }
        } message: {
            Text("This regenerates races from the groups you've turned on. Do it before check-in, not mid-meet.")
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(title).font(.ssmRounded(24, weight: .heavy)).foregroundStyle(SSMTheme.textPrimary)
                if !vm.scheme.isEmpty { SSMChip(vm.scheme.uppercased(), color: SSMTheme.sky2) }
            }
            Text(vm.isOpen
                 ? "Open races are one distance per group, skated by anyone who signed up for Open. Set the age range and distance."
                 : "Quad races use their own divisions. Each box is a race day — leave one blank to skip that day.")
                .font(.ssmRounded(13, weight: .medium)).foregroundStyle(SSMTheme.muted)
        }
    }

    private var filterBar: some View {
        HStack(spacing: 10) {
            Text("\(vm.enabledCount) of \(vm.groups.count) on")
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

    private func groupCard(_ group: Binding<EditableSpecialGroup>) -> some View {
        let g = group.wrappedValue
        return SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Toggle(isOn: group.enabled) {
                        Text(g.label)
                            .font(.ssmRounded(15, weight: .bold))
                            .foregroundStyle(SSMTheme.textPrimary)
                    }
                    .tint(SSMTheme.orange)
                    Spacer()
                    if !vm.isOpen {
                        Text(g.ages).font(.caption).foregroundStyle(SSMTheme.muted)
                    }
                }
                if g.enabled {
                    HStack(spacing: 10) {
                        if vm.isOpen {
                            labeled("Ages") { input(group.ages, placeholder: "e.g. 9 & under") }
                            labeled("Distance") { input(group.distance, placeholder: "e.g. 1500m") }
                        } else {
                            ForEach(g.distances.indices, id: \.self) { i in
                                labeled("Day \(i + 1)") { input(group.distances[i], placeholder: "—") }
                            }
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
            Button { confirmSave = true } label: {
                Label(vm.isSaving ? "Saving…" : "Save \(title) (\(vm.enabledCount) on)",
                      systemImage: "checkmark.circle")
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
