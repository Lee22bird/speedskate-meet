import SwiftUI

/// Director relay builder (iPad): pick eligible skaters into team slots per
/// division, save the teams, then generate the relay races. Generated races
/// are placed into the running order via the Block Builder (same as the web).
struct PadRelayBuilderView: View {
    let meetID: String
    @StateObject private var vm = RelayBuilderViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                intro
                if vm.isLoading && vm.divisions.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.divisions.isEmpty {
                    ContentUnavailableFallback(text: "No relay divisions have enough eligible skaters yet. Relay eligibility is by age and gender from the registrations.")
                        .padding(.top, 40)
                } else {
                    ForEach(vm.divisions) { div in divisionCard(div) }
                    actionBar
                }
            }
            .padding(24)
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .task { await vm.load(meetID: meetID) }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Relay Builder")
                .font(.ssmRounded(24, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
            Text("Build teams from eligible skaters, then generate the races. "
                 + (vm.relayRaceCount > 0 ? "\(vm.relayRaceCount) relay race\(vm.relayRaceCount == 1 ? "" : "s") generated so far. " : "")
                 + "Place generated races in the running order in Block Builder.")
                .font(.ssmRounded(13, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
        }
    }

    private func divisionCard(_ div: RelayDivision) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text(div.label)
                        .font(.ssmRounded(17, weight: .bold))
                        .foregroundStyle(SSMTheme.textPrimary)
                    SSMChip("\(div.size)-PERSON", color: SSMTheme.sky2)
                    Spacer()
                    Text("\(div.eligible.count) eligible")
                        .font(.caption).foregroundStyle(SSMTheme.muted)
                }
                Text("\(div.ageRange) · \(div.gender.capitalized) · \(div.distance)")
                    .font(.caption).foregroundStyle(SSMTheme.muted)

                ForEach(vm.draftTeams[div.id] ?? []) { team in
                    teamRow(div: div, team: team)
                }

                Button { vm.addTeam(division: div) } label: {
                    Label("Add team", systemImage: "plus.circle").font(.ssmRounded(13, weight: .bold))
                }
                .buttonStyle(.ssmSoftPill)
            }
        }
    }

    private func teamRow(div: RelayDivision, team: RelayDraftTeam) -> some View {
        HStack(spacing: 8) {
            ForEach(0..<div.size, id: \.self) { slot in
                slotMenu(div: div, team: team, slot: slot)
            }
            Button { vm.removeTeam(division: div.id, team: team.id) } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 20)).foregroundStyle(SSMTheme.muted.opacity(0.7))
            }
            .buttonStyle(.plain)
        }
    }

    private func slotMenu(div: RelayDivision, team: RelayDraftTeam, slot: Int) -> some View {
        let current = team.slots[slot]
        let used = vm.usedSkaters(inDivision: div.id, excluding: team.id, slot: slot)
        return Menu {
            if !current.isEmpty {
                Button("Clear") { vm.setSlot(division: div.id, team: team.id, slot: slot, regID: "") }
            }
            ForEach(div.eligible) { s in
                Button {
                    vm.setSlot(division: div.id, team: team.id, slot: slot, regID: s.id)
                } label: {
                    Text(used.contains(s.id) ? "\(s.name) — on another team" : "\(s.name)\(s.age.map { " · \($0)" } ?? "")")
                }
                .disabled(used.contains(s.id))
            }
        } label: {
            Text(current.isEmpty ? "Skater \(slot + 1)" : vm.skaterName(current, in: div))
                .font(.ssmRounded(14, weight: .semibold))
                .foregroundStyle(current.isEmpty ? SSMTheme.muted : SSMTheme.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private var actionBar: some View {
        VStack(spacing: 10) {
            if let flash = vm.flash {
                Text(flash).font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.good)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error = vm.errorMessage {
                Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 14) {
                Button { Task { await vm.save(meetID: meetID) } } label: {
                    Label("Save Teams (\(vm.completeTeamCount))", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmPill(SSMTheme.goodGradient))
                .disabled(vm.isSaving || vm.isGenerating)

                Button { Task { await vm.generate(meetID: meetID) } } label: {
                    Label("Generate Races", systemImage: "wand.and.stars").frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmPill)
                .disabled(vm.isSaving || vm.isGenerating || vm.completeTeamCount == 0)
            }
            .opacity(vm.isSaving || vm.isGenerating ? 0.6 : 1)
        }
    }
}
