import SwiftUI

/// Shown in the phone Staff tab when the logged-in user is a coach: the meets
/// their team is registered in, each linking to the protest-filing screen.
/// Renders nothing (but still loads) when the user isn't a coach or has no meets.
public struct CoachMeetsSection: View {
    @StateObject private var vm = CoachMeetsViewModel()

    public init() {}

    public var body: some View {
        Group {
            if vm.isCoach && !vm.meets.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("My Team — File a Protest")  // coach section
                        .font(.ssmRounded(18, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal)
                    VStack(spacing: 12) {
                        ForEach(vm.meets) { meet in
                            NavigationLink {
                                CoachProtestView(meetID: meet.id.stringValue, meetName: meet.meetName)
                            } label: {
                                SSMCard {
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(meet.meetName)
                                                .font(.ssmRounded(16, weight: .bold))
                                                .foregroundStyle(SSMTheme.textPrimary)
                                            Text("\(meet.mySkaterCount) of your skaters"
                                                 + (meet.location.isEmpty ? "" : " · \(meet.location)"))
                                                .font(.caption).foregroundStyle(SSMTheme.muted)
                                        }
                                        Spacer()
                                        if meet.myProtestCount > 0 {
                                            SSMChip("\(meet.myProtestCount) filed", color: SSMTheme.sky2)
                                        }
                                        Image(systemName: "chevron.right").foregroundStyle(SSMTheme.muted)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
            } else {
                // Always render a zero-height anchor so `.task` fires even when
                // the coach has nothing to show yet (an empty Group never
                // appears, so the load would never run).
                Color.clear.frame(height: 0)
            }
        }
        .task { await vm.load() }
    }
}

/// One meet's coach protest screen — file a protest and see your filed ones.
public struct CoachProtestView: View {
    let meetID: String
    let meetName: String

    @StateObject private var vm = CoachProtestViewModel()

    public init(meetID: String, meetName: String) {
        self.meetID = meetID
        self.meetName = meetName
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if vm.isLoading && vm.form == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    fileCard
                    if !vm.myProtests.isEmpty { myProtestsCard }
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

    // MARK: File a protest

    private var fileCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("FILE A PROTEST")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)

                field("Category") {
                    menu(current: vm.category.isEmpty ? "Choose a category" : vm.category,
                         isPlaceholder: vm.category.isEmpty) {
                        ForEach(vm.categories) { c in
                            Button {
                                vm.category = c.name
                                if !c.raceSpecific { vm.raceID = "" }
                            } label: {
                                Text(c.raceSpecific ? "\(c.name) (race-specific)" : "\(c.name) (meet-wide)")
                            }
                        }
                    }
                }

                if vm.categoryIsRaceSpecific {
                    field("Race") {
                        menu(current: raceLabel(vm.raceID) ?? "Choose the race",
                             isPlaceholder: vm.raceID.isEmpty) {
                            ForEach(vm.races) { r in
                                Button(r.label) { vm.raceID = r.id }
                            }
                        }
                    }
                }

                if !vm.skaters.isEmpty {
                    field("Skater (optional)") {
                        menu(current: skaterLabel(vm.registrationID) ?? "Not skater-specific",
                             isPlaceholder: vm.registrationID.isEmpty) {
                            Button("Not skater-specific") { vm.registrationID = "" }
                            ForEach(vm.skaters) { s in
                                Button(skaterName(s)) { vm.registrationID = s.id }
                            }
                        }
                    }
                }

                field("What happened") {
                    TextField("Describe the protest…", text: $vm.statement, axis: .vertical)
                        .lineLimit(3...6)
                        .font(.ssmRounded(15, weight: .medium))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .padding(10)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                if vm.protestFee > 0 {
                    Text("A \(money(vm.protestFee)) fee applies, settled in person with the meet director. This form doesn't take payment — your protest is reviewed right away.")
                        .font(.ssmRounded(12, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                }

                if let error = vm.errorMessage {
                    Text(error).font(.ssmRounded(13, weight: .semibold)).foregroundStyle(SSMTheme.danger)
                }
                if vm.filedFlash {
                    Text("✓ Protest filed — the officials have it.")
                        .font(.ssmRounded(14, weight: .bold)).foregroundStyle(SSMTheme.good)
                }

                Button {
                    Task { await vm.file(meetID: meetID) }
                } label: {
                    Label("Submit Protest", systemImage: "paperplane.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.ssmPill)
                .disabled(!vm.canFile || vm.isFiling)
            }
        }
    }

    // MARK: My protests

    private var myProtestsCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("MY PROTESTS")
                    .font(.ssmRounded(12, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                ForEach(vm.myProtests) { p in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text(p.id).font(.ssmRounded(13, weight: .heavy)).foregroundStyle(SSMTheme.orange)
                            Text(p.category).font(.ssmRounded(13, weight: .bold)).foregroundStyle(SSMTheme.textPrimary)
                            Spacer()
                            coachStateBadge(p)
                        }
                        if p.isRaceSpecific, !p.raceLabel.isEmpty {
                            Text(p.raceLabel).font(.caption).foregroundStyle(SSMTheme.muted)
                        }
                        Text(p.statement).font(.caption).foregroundStyle(SSMTheme.muted).lineLimit(2)
                        if p.isResolved, !p.ruling.isEmpty {
                            Text("Ruling: \(p.ruling)").font(.caption).foregroundStyle(SSMTheme.textPrimary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if p.id != vm.myProtests.last?.id {
                        Divider().overlay(SSMTheme.cardBorder)
                    }
                }
            }
        }
    }

    private func coachStateBadge(_ p: Protest) -> some View {
        let (text, color): (String, Color) = {
            switch p.state {
            case "upheld": return ("UPHELD", SSMTheme.good)
            case "denied": return ("DENIED", SSMTheme.danger)
            case "review": return ("UNDER REVIEW", SSMTheme.sky2)
            default: return ("AWAITING REVIEW", SSMTheme.orange)
            }
        }()
        return Text(text)
            .font(.ssmRounded(10, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(color, in: Capsule())
    }

    // MARK: Small builders

    private func field<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased()).font(.ssmRounded(11, weight: .heavy)).foregroundStyle(SSMTheme.muted)
            content()
        }
    }

    private func menu<Content: View>(current: String, isPlaceholder: Bool,
                                     @ViewBuilder _ items: () -> Content) -> some View {
        Menu { items() } label: {
            HStack {
                Text(current)
                    .font(.ssmRounded(15, weight: .semibold))
                    .foregroundStyle(isPlaceholder ? SSMTheme.muted : SSMTheme.textPrimary)
                    .lineLimit(1)
                Spacer()
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(SSMTheme.muted)
            }
            .padding(12)
            .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func raceLabel(_ id: String) -> String? { vm.races.first(where: { $0.id == id })?.label }
    private func skaterLabel(_ id: String) -> String? {
        vm.skaters.first(where: { $0.id == id }).map(skaterName)
    }
    private func skaterName(_ s: ProtestSkaterOption) -> String {
        if let h = s.helmetNumber, !h.isEmpty { return "\(s.name) · #\(h)" }
        return s.name
    }
    private func money(_ v: Double) -> String {
        v.rounded() == v ? "$\(Int(v))" : String(format: "$%.2f", v)
    }
}
