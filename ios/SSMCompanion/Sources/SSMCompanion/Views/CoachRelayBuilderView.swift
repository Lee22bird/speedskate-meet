import SwiftUI

/// Phone coach relay builder: a coach builds their own club's relay teams from
/// their eligible skaters and saves them. The meet director generates and places
/// the actual races on the iPad/web — this screen only submits teams.
public struct CoachRelayBuilderView: View {
    let meetID: String
    let meetName: String
    @StateObject private var vm = CoachRelayBuilderViewModel()

    public init(meetID: String, meetName: String) {
        self.meetID = meetID
        self.meetName = meetName
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                intro
                if vm.isLoading && vm.divisions.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if vm.divisions.isEmpty {
                    SSMCard {
                        Text("No relay divisions have enough of your skaters yet. Relay eligibility is by age and gender from your registered skaters — you need at least a full team (2, 3, or 4) in a division.")
                            .font(.ssmRounded(14, weight: .medium))
                            .foregroundStyle(SSMTheme.muted)
                    }
                } else {
                    ForEach(vm.divisions) { div in divisionCard(div) }
                    saveBar
                }
            }
            .padding()
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .background(SSMTheme.pageBackground)
        .navigationTitle(meetName)
        .ssmInlineNavigationTitle()
        .task { await vm.load(meetID: meetID) }
    }

    private var intro: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("BUILD YOUR RELAY TEAMS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Text(vm.team.isEmpty ? "Pick your skaters into teams by division, then save." : "\(vm.team) — pick your skaters into teams by division, then save.")
                    .font(.ssmRounded(15, weight: .semibold))
                    .foregroundStyle(SSMTheme.textPrimary)
                Text("Your meet director reviews these and places the races in the running order.")
                    .font(.ssmRounded(13, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)
            }
        }
    }

    private func divisionCard(_ div: RelayDivision) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text(div.label)
                        .font(.ssmRounded(16, weight: .bold))
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
        VStack(spacing: 8) {
            ForEach(0..<div.size, id: \.self) { slot in
                slotMenu(div: div, team: team, slot: slot)
            }
            HStack {
                Spacer()
                Button { vm.removeTeam(division: div.id, team: team.id) } label: {
                    Label("Remove team", systemImage: "xmark.circle")
                        .font(.ssmRounded(12, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(10)
        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
            HStack {
                Text(current.isEmpty ? "Skater \(slot + 1)" : vm.skaterName(current, in: div))
                    .font(.ssmRounded(15, weight: .semibold))
                    .foregroundStyle(current.isEmpty ? SSMTheme.muted : SSMTheme.textPrimary)
                    .lineLimit(1)
                Spacer()
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(SSMTheme.muted)
            }
            .padding(.horizontal, 12).padding(.vertical, 11)
            .background(SSMTheme.pageBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private var saveBar: some View {
        VStack(spacing: 10) {
            if let flash = vm.flash {
                Text(flash).font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.good)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error = vm.errorMessage {
                Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button { Task { await vm.save(meetID: meetID) } } label: {
                Label("Save Teams (\(vm.completeTeamCount))", systemImage: "square.and.arrow.down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(vm.isSaving)
            .opacity(vm.isSaving ? 0.6 : 1)
        }
    }
}
