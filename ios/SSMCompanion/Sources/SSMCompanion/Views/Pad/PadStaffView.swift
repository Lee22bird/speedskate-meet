import SwiftUI

/// Staff manager (director): who's assigned to each role on this meet, and
/// search-and-assign from SSL's approved directory. Assignments themselves are
/// stored on the meet; the people come from SSL, so searching needs a live
/// connection to it.
struct PadStaffView: View {
    let meetID: String
    @StateObject private var vm = PadStaffViewModel()
    @State private var pendingRemove: (role: String, assignment: StaffAssignment)?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                intro
                if let flash = vm.statusFlash {
                    Text("✓ \(flash)")
                        .font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.good)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if vm.isLoading && !vm.loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if !vm.loaded {
                    SSMCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(vm.errorMessage ?? "Couldn't load staff for this meet.")
                                .font(.ssmRounded(14, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                            Button { Task { await vm.load(meetID: meetID) } } label: {
                                Label("Retry", systemImage: "arrow.clockwise").font(.ssmRounded(13, weight: .bold))
                            }
                            .buttonStyle(.ssmSoftPill)
                        }
                    }
                } else {
                    if let error = vm.errorMessage {
                        Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                    }
                    ForEach(vm.roles) { role in roleCard(role) }
                }
            }
            .padding(24)
            .frame(maxWidth: 820)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .task { await vm.load(meetID: meetID) }
        .confirmationDialog("Remove from this meet?",
                            isPresented: Binding(get: { pendingRemove != nil },
                                                 set: { if !$0 { pendingRemove = nil } }),
                            titleVisibility: .visible) {
            if let p = pendingRemove {
                Button("Remove \(p.assignment.name)", role: .destructive) {
                    Task { await vm.remove(meetID: meetID, role: p.role, assignment: p.assignment) }
                }
            }
        } message: {
            Text("They lose access to this meet's staff screens. You can add them back any time.")
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Staff").font(.ssmRounded(24, weight: .heavy)).foregroundStyle(SSMTheme.textPrimary)
            Text("Assign the people working this meet. Names come from SpeedSkateLeague, so searching needs an internet connection.")
                .font(.ssmRounded(13, weight: .medium)).foregroundStyle(SSMTheme.muted)
        }
    }

    private func roleCard(_ role: StaffRoleRow) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(role.label.uppercased())
                        .font(.ssmRounded(12, weight: .heavy)).foregroundStyle(SSMTheme.muted)
                    Spacer()
                    Button { vm.openSearch(role: role.key) } label: {
                        Label("Add", systemImage: "plus.circle").font(.ssmRounded(13, weight: .bold))
                    }
                    .buttonStyle(.ssmSoftPill)
                    .disabled(vm.isWorking)
                }

                if role.assignments.isEmpty {
                    Text("Nobody assigned yet.")
                        .font(.ssmRounded(13, weight: .medium)).foregroundStyle(SSMTheme.muted)
                } else {
                    ForEach(role.assignments) { a in
                        HStack(spacing: 10) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 22)).foregroundStyle(SSMTheme.sky)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.name.isEmpty ? "Unnamed" : a.name)
                                    .font(.ssmRounded(15, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                                if !a.sslId.isEmpty {
                                    Text("SSL \(a.sslId)").font(.caption).foregroundStyle(SSMTheme.muted)
                                }
                            }
                            Spacer()
                            Button { pendingRemove = (role.key, a) } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 20)).foregroundStyle(SSMTheme.muted.opacity(0.7))
                            }
                            .buttonStyle(.plain)
                            .disabled(vm.isWorking)
                        }
                    }
                }

                if vm.searchRoleKey == role.key { searchPanel }
            }
        }
    }

    private var searchPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider().overlay(SSMTheme.cardBorder)
            HStack(spacing: 8) {
                TextField("Search SpeedSkateLeague by name…", text: $vm.searchQuery)
                    .font(.ssmRounded(15, weight: .semibold))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .autocorrectionDisabled()
                    .padding(10)
                    .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .onChange(of: vm.searchQuery) { _, _ in vm.search(meetID: meetID) }
                Button("Cancel") { vm.closeSearch() }
                    .font(.ssmRounded(13, weight: .bold)).foregroundStyle(SSMTheme.muted)
                    .buttonStyle(.plain)
            }
            if vm.isSearching {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Searching…").font(.ssmRounded(12, weight: .semibold)).foregroundStyle(SSMTheme.muted)
                }
            }
            if let err = vm.searchError {
                Text(err).font(.ssmRounded(12, weight: .semibold)).foregroundStyle(SSMTheme.danger)
            }
            ForEach(vm.searchResults) { person in
                Button {
                    Task { await vm.assign(meetID: meetID, person: person) }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "person.crop.circle.badge.plus")
                            .foregroundStyle(SSMTheme.orange)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(person.name.isEmpty ? "Unnamed" : person.name)
                                .font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                            if !person.sslId.isEmpty {
                                Text("SSL \(person.sslId)").font(.caption).foregroundStyle(SSMTheme.muted)
                            }
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle())
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                .disabled(vm.isWorking)
            }
        }
    }
}
