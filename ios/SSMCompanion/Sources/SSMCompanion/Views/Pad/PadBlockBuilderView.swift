import SwiftUI

/// iPad Block Builder — the website's /portal/meet/:id/blocks page as a
/// native touch UI. Same server endpoints, same day/ordering semantics,
/// same time-estimate math; drag-and-drop is replaced with taps (move
/// menus, nudge buttons, multi-select).
struct PadBlockBuilderView: View {
    let meetID: String

    @EnvironmentObject private var session: PadSessionViewModel
    @StateObject private var model = BlockBuilderViewModel()
    @State private var editingBlock: ExportBlock?
    @State private var confirmRebuild = false
    @State private var confirmAutoFlow = false
    @State private var confirmDeleteBlock: ExportBlock?

    var body: some View {
        Group {
            if model.meet == nil, model.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if model.meet == nil {
                PadPlaceholder(text: model.errorMessage ?? "Couldn't load the schedule.")
            } else {
                builderBody
            }
        }
        .background(SSMTheme.pageBackground)
        .task { await model.load(meetID: meetID) }
        .refreshable { await model.refresh() }
        // Mutation failures surface as an alert wherever the user is
        // scrolled (the website's failed writes alert-and-resync the same
        // way); the screen has already re-synced to server truth by now.
        .alert("Couldn't update the schedule",
               isPresented: Binding(get: { model.errorMessage != nil },
                                    set: { if !$0 { model.errorMessage = nil } }),
               presenting: model.errorMessage) { _ in
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: { message in
            Text(message)
        }
        .sheet(item: $editingBlock) { block in
            BlockEditSheet(model: model, block: block)
        }
        .confirmationDialog("Rebuild races?", isPresented: $confirmRebuild, titleVisibility: .visible) {
            Button("Rebuild Races", role: .destructive) {
                Task { await model.rebuildAssignments() }
            }
        } message: {
            Text("Rebuild recalculates heats, finals, race assignments, and lanes. Your manual block schedule is preserved — but entered results on rebuilt races are cleared.")
        }
        .confirmationDialog("Optimize race flow?", isPresented: $confirmAutoFlow, titleVisibility: .visible) {
            Button("Optimize Flow") {
                Task { await model.autoFlow() }
            }
        } message: {
            Text("Optimize Race Flow reorders races already assigned inside each block. It does NOT rebuild races or move races between blocks.")
        }
        .confirmationDialog("Remove this block?",
                            isPresented: Binding(get: { confirmDeleteBlock != nil },
                                                 set: { if !$0 { confirmDeleteBlock = nil } }),
                            titleVisibility: .visible) {
            Button("Remove Block", role: .destructive) {
                if let block = confirmDeleteBlock {
                    Task { await model.deleteBlock(block) }
                }
                confirmDeleteBlock = nil
            }
        } message: {
            Text("Its races move back to Unassigned — nothing is deleted.")
        }
        .confirmationDialog(
            "Replace the whole schedule?",
            isPresented: Binding(get: { model.pendingGenerate != nil },
                                 set: { if !$0 { model.pendingGenerate = nil } }),
            titleVisibility: .visible,
            presenting: model.pendingGenerate
        ) { pending in
            // `presenting:` hands the value into these closures directly, so
            // the dismiss-binding nilling pendingGenerate can't race them.
            Button("Replace Entire Schedule", role: .destructive) {
                Task { await model.confirmGenerate(pending) }
            }
            Button("Append Blocks for Unassigned Only") {
                Task { await model.appendGenerate(pending) }
            }
        } message: { pending in
            Text("Your schedule already has \(pending.assignedCount) assigned race\(pending.assignedCount == 1 ? "" : "s"). Replace discards the current block layout; Append keeps it and only schedules unassigned races.")
        }
    }

    // ── Layout ───────────────────────────────────────────────────────────

    private var builderBody: some View {
        GeometryReader { proxy in
            ScrollView {
                if proxy.size.width >= 900 {
                    HStack(alignment: .top, spacing: 20) {
                        VStack(spacing: 20) { mainColumn }
                            .frame(maxWidth: .infinity)
                        VStack(spacing: 20) { unassignedCard }
                            .frame(width: 360)
                    }
                    .padding(24)
                } else {
                    VStack(spacing: 20) {
                        mainColumn
                        unassignedCard
                    }
                    .padding(20)
                }
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
    }

    @ViewBuilder private var mainColumn: some View {
        banners
        prepCard
        controlCenterCard
        if !model.selectedRaceIDs.isEmpty {
            selectionBar
        }
        blockList
    }

    @ViewBuilder private var banners: some View {
        if let flash = model.statusFlash {
            Text(flash)
                .font(.ssmRounded(14, weight: .bold))
                .foregroundStyle(SSMTheme.good)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SSMTheme.good.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .task(id: flash) {
                    // Keyed to the message so each flash gets its full 4s;
                    // the guard keeps a cancelled older timer (try? swallows
                    // CancellationError) from wiping a newer flash.
                    try? await Task.sleep(nanoseconds: 4_000_000_000)
                    guard !Task.isCancelled, model.statusFlash == flash else { return }
                    model.statusFlash = nil
                }
        }
        if let message = model.errorMessage {
            Text(message)
                .font(.ssmRounded(14, weight: .bold))
                .foregroundStyle(SSMTheme.danger)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SSMTheme.danger.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    // ── Race Day Prep ────────────────────────────────────────────────────

    private var prepCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("🏁 RACE DAY PREP")
                            .font(.ssmRounded(13, weight: .heavy))
                            .foregroundStyle(SSMTheme.orange)
                        Text("Work top to bottom to get the meet ready — then run it. Everything stays fully editable.")
                            .font(.ssmRounded(12, weight: .medium))
                            .foregroundStyle(SSMTheme.muted)
                    }
                    Spacer()
                    Button {
                        session.selectedSection = .director
                    } label: {
                        Label("Go to Race Day", systemImage: "play.fill")
                    }
                    .buttonStyle(.ssmPill)
                }

                prepStep(number: "1", title: "Rebuild Races",
                         note: "After late adds, scratches, division changes, or a lane-count change. Recalcs heats, semis, finals & lanes — your blocks stay put.") {
                    Button("🔄 Rebuild Races") { confirmRebuild = true }
                        .buttonStyle(.ssmSoftPill)
                }

                prepStep(number: "2", title: "Generate the Schedule",
                         note: "Auto-build the blocks — League is your MSSL house style, Nationals is per-distance heats→semis→finals. Or hand-build below.") {
                    HStack(spacing: 10) {
                        Button("⚡ League Schedule") {
                            Task { await model.generateSchedule(style: "league") }
                        }
                        .buttonStyle(.ssmSoftPill)
                        Button("🏆 Nationals Schedule") {
                            Task { await model.generateSchedule(style: "championship") }
                        }
                        .buttonStyle(.ssmSoftPill)
                    }
                }

                prepStep(number: "3", title: "Optimize Flow",
                         note: "Tidy the running order inside each block (heats earlier, finals later). Add breaks, lunch & awards below.") {
                    Button("⚡ Optimize Flow") { confirmAutoFlow = true }
                        .buttonStyle(.ssmPill(SSMTheme.goodGradient))
                }
            }
            .disabled(model.isWorking)
            .opacity(model.isWorking ? 0.6 : 1)
        }
    }

    private func prepStep(number: String, title: String, note: String,
                          @ViewBuilder action: () -> some View) -> some View {
        // Buttons sit beside the note when there's room, under it when the
        // sidebar squeezes the column (they must never wrap letter-by-letter).
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 12) {
                prepStepBadge(number)
                prepStepText(title: title, note: note)
                Spacer()
                action().fixedSize()
            }
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 12) {
                    prepStepBadge(number)
                    prepStepText(title: title, note: note)
                    Spacer()
                }
                action()
                    .fixedSize()
                    .padding(.leading, 42)
            }
        }
    }

    private func prepStepBadge(_ number: String) -> some View {
        Text(number)
            .font(.ssmRounded(15, weight: .heavy))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(Circle().fill(SSMTheme.navy3))
    }

    private func prepStepText(title: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.ssmRounded(15, weight: .bold))
                .foregroundStyle(SSMTheme.textPrimary)
            Text(note)
                .font(.ssmRounded(12, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
        }
    }

    // ── Schedule Control Center ──────────────────────────────────────────

    private var controlCenterCard: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("SCHEDULE CONTROL CENTER")
                        .font(.ssmRounded(13, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    Spacer()
                    SSMChip("Unassigned: \(model.filteredUnassigned.count)", color: SSMTheme.orange)
                }

                let counts = model.summaryCounts
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        summaryTile("Inline", counts.inline)
                        summaryTile("Open", counts.open)
                        summaryTile("Quad", counts.quad)
                        summaryTile("Time Trials", counts.timeTrials)
                        summaryTile("Relays", counts.relays)
                        summaryTile("Additional", counts.additional)
                    }
                    .fixedSize()
                }
                .scrollIndicators(.hidden)

                Text("Build your race day by adding blocks, breaks, lunch, awards, or practice sessions.")
                    .font(.ssmRounded(12, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)

                ScrollView(.horizontal) {
                    HStack(spacing: 10) {
                        Button {
                            Task { await model.addBlock() }
                        } label: {
                            Label("New Race Block", systemImage: "plus")
                        }
                        .buttonStyle(.ssmPill)

                        dividerButton("☕ Break", type: "break", name: "☕ Break")
                        dividerButton("🍽 Lunch", type: "lunch", name: "🍽 Lunch")
                        dividerButton("🏆 Awards", type: "awards", name: "🏆 Awards")
                        dividerButton("🛼 Practice", type: "practice", name: "🛼 Practice")
                    }
                    .fixedSize()
                }
                .scrollIndicators(.hidden)
                .disabled(model.isWorking)
            }
        }
    }

    private func summaryTile(_ label: String, _ count: Int) -> some View {
        VStack(spacing: 2) {
            Text("\(count)")
                .font(.ssmRounded(18, weight: .heavy))
                .foregroundStyle(count > 0 ? SSMTheme.textPrimary : SSMTheme.muted)
            Text(label.uppercased())
                .font(.ssmRounded(10, weight: .bold))
                .foregroundStyle(SSMTheme.muted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func dividerButton(_ label: String, type: String, name: String) -> some View {
        Button(label) {
            Task { await model.addDivider(type: type, name: name, day: "", afterBlockID: "") }
        }
        .buttonStyle(.ssmSoftPill)
    }

    // ── Selection toolbar ────────────────────────────────────────────────

    private var selectionBar: some View {
        HStack(spacing: 12) {
            Text("\(model.selectedRaceIDs.count) selected")
                .font(.ssmRounded(14, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)

            moveDestinationMenu(title: "Send to block…") { destID in
                Task { await model.moveSelectedRaces(toBlockID: destID) }
            }

            if model.canMergeSelection {
                Button {
                    Task { await model.mergeSelection() }
                } label: {
                    Label("Merge", systemImage: "link")
                }
                .buttonStyle(.ssmPill)
            }

            Spacer()
            Button("Clear") { model.selectedRaceIDs = [] }
                .font(.ssmRounded(13, weight: .bold))
                .foregroundStyle(SSMTheme.muted)
        }
        .padding(14)
        .background(SSMTheme.sky.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .disabled(model.isWorking)
        .opacity(model.isWorking ? 0.6 : 1)
    }

    /// Destination menu for moves. Race blocks (website's numbering rule:
    /// anything that isn't a break-type divider) plus Unassigned. The item's
    /// current location is disabled — picking it would silently send the
    /// race to its own block's end (or no-op for pool rows).
    private func moveDestinationMenu(title: String, currentBlockID: String? = nil,
                                     inPool: Bool = false,
                                     onPick: @escaping (String) -> Void) -> some View {
        Menu {
            ForEach(model.blocks.filter { !$0.isBreakDivider }) { block in
                Button {
                    onPick(block.id)
                } label: {
                    if block.id == currentBlockID {
                        Label("\(model.displayName(for: block)) — current", systemImage: "checkmark")
                    } else {
                        Text("\(model.displayName(for: block)) — \(model.dayLabel(for: block.day))")
                    }
                }
                .disabled(block.id == currentBlockID)
            }
            Divider()
            Button("Unassigned") { onPick("__unassigned__") }
                .disabled(inPool)
        } label: {
            Label(title, systemImage: "arrow.turn.down.right")
                .font(.ssmRounded(13, weight: .bold))
        }
        .buttonStyle(.ssmSoftPill)
    }

    // ── Block list ───────────────────────────────────────────────────────

    @ViewBuilder private var blockList: some View {
        if model.blocks.isEmpty {
            SSMCard {
                VStack(spacing: 10) {
                    Text("Your schedule is empty.")
                        .font(.ssmRounded(18, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                    Text("Start by creating a race block, then move races into it.")
                        .font(.ssmRounded(13, weight: .medium))
                        .foregroundStyle(SSMTheme.muted)
                    Button("Create First Race Block") {
                        Task { await model.addBlock() }
                    }
                    .buttonStyle(.ssmPill)
                    .disabled(model.isWorking)
                }
                .frame(maxWidth: .infinity)
            }
        } else {
            let blocks = model.blocks
            ForEach(Array(blocks.enumerated()), id: \.element.id) { index, block in
                if index == 0 || blocks[index - 1].day != block.day {
                    dayHeader(block.day)
                }
                // Card style follows the website's breakTypes rule: league
                // warmup blocks (type 'divider') render as race blocks.
                if block.isBreakDivider {
                    dividerCard(block, index: index)
                } else {
                    blockCard(block, index: index)
                }
            }
        }
    }

    private func dayHeader(_ day: String) -> some View {
        HStack {
            Text("📅 \(model.dayLabel(for: day).uppercased())")
                .font(.ssmRounded(13, weight: .heavy))
                .foregroundStyle(SSMTheme.sky)
            Spacer()
            Text(model.dayTotalLabel(for: day))
                .font(.ssmRounded(12, weight: .bold))
                .foregroundStyle(SSMTheme.muted)
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
    }

    private func blockCard(_ block: ExportBlock, index: Int) -> some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 10) {
                blockHeader(block, index: index, icon: nil)

                if model.expandedBlockIDs.contains(block.id) {
                    Divider().overlay(SSMTheme.cardBorder)
                    blockContents(block)
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous)
                .strokeBorder(blockHoldsCurrentRace(block) ? SSMTheme.orange.opacity(0.6) : .clear, lineWidth: 2)
        )
    }

    private func dividerCard(_ block: ExportBlock, index: Int) -> some View {
        SSMCard {
            blockHeader(block, index: index, icon: model.dividerIcon(block))
        }
    }

    private func blockHeader(_ block: ExportBlock, index: Int, icon: String?) -> some View {
        HStack(spacing: 10) {
            if let icon {
                Text(icon).font(.system(size: 24))
            } else {
                Button {
                    if model.expandedBlockIDs.contains(block.id) {
                        model.expandedBlockIDs.remove(block.id)
                    } else {
                        model.expandedBlockIDs.insert(block.id)
                    }
                } label: {
                    Image(systemName: model.expandedBlockIDs.contains(block.id) ? "chevron.down" : "chevron.right")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(SSMTheme.orange)
                        .frame(width: 30, height: 30)
                        .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(block.isDivider ? block.name : model.displayName(for: block))
                        .font(.ssmRounded(17, weight: .heavy))
                        .foregroundStyle(SSMTheme.textPrimary)
                        .lineLimit(1)
                    SSMChip(model.timeChip(for: block), color: SSMTheme.sky)
                }
                HStack(spacing: 6) {
                    Text(model.dayLabel(for: block.day))
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                    if !block.isDivider {
                        let itemCount = model.races(in: block).count + Set(block.timeTrialEventIds).count
                        Text("· \(itemCount) item\(itemCount == 1 ? "" : "s")")
                            .font(.ssmRounded(11, weight: .semibold))
                            .foregroundStyle(SSMTheme.muted)
                    }
                    if !block.notes.isEmpty {
                        Text("· \(block.notes)")
                            .font(.ssmRounded(11, weight: .medium))
                            .foregroundStyle(SSMTheme.muted)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            HStack(spacing: 6) {
                Button {
                    Task { await model.moveBlock(block, direction: "up") }
                } label: {
                    Image(systemName: "arrow.up")
                }
                .buttonStyle(.plain)
                .disabled(index == 0)
                .foregroundStyle(index == 0 ? SSMTheme.muted.opacity(0.4) : SSMTheme.muted)

                Button {
                    Task { await model.moveBlock(block, direction: "down") }
                } label: {
                    Image(systemName: "arrow.down")
                }
                .buttonStyle(.plain)
                .disabled(index == model.blocks.count - 1)
                .foregroundStyle(index == model.blocks.count - 1 ? SSMTheme.muted.opacity(0.4) : SSMTheme.muted)

                Menu {
                    Button("Edit Block…") { editingBlock = block }
                    Button(block.isDivider ? "Remove" : "Delete Block", role: .destructive) {
                        confirmDeleteBlock = block
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 18))
                        .foregroundStyle(SSMTheme.muted)
                }
            }
            .font(.system(size: 15, weight: .bold))
            .disabled(model.isWorking)
        }
    }

    private func blockHoldsCurrentRace(_ block: ExportBlock) -> Bool {
        guard let currentID = model.meet?.currentRaceId else { return false }
        return block.raceIds.contains(currentID) || block.timeTrialEventIds.contains(currentID)
    }

    @ViewBuilder private func blockContents(_ block: ExportBlock) -> some View {
        let ttByID = model.ttEventsByID
        // Deduped — duplicate ids in stored arrays must not become duplicate
        // ForEach identities.
        let ttIDs = block.timeTrialEventIds.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        ForEach(ttIDs, id: \.self) { eventID in
            if let event = ttByID[eventID] {
                ttEventRow(event, in: block)
            }
        }

        let races = model.races(in: block)
        if races.isEmpty && block.timeTrialEventIds.isEmpty {
            Text("No races in this block yet — move some in from Unassigned.")
                .font(.ssmRounded(13, weight: .medium))
                .foregroundStyle(SSMTheme.muted)
                .padding(.vertical, 6)
        }
        ForEach(races) { race in
            // Edge-disable against the RESOLVED rows (dangling ids in
            // raceIds are invisible; nudging must match what's on screen).
            raceRow(race, in: block,
                    isFirst: races.first?.id == race.id,
                    isLast: races.last?.id == race.id)
        }
    }

    private func ttEventRow(_ event: ExportTimeTrialEvent, in block: ExportBlock) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("⏱ \(event.distance.isEmpty ? event.title : "\(event.distance) Time Trials")")
                    .font(.ssmRounded(14, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                Text("Queue event • \(event.completedCount)/\(event.participantCount) complete • Counts overall: \(event.countsForOverall ? "Yes" : "No")")
                    .font(.ssmRounded(11, weight: .semibold))
                    .foregroundStyle(SSMTheme.muted)
            }
            Spacer()
            moveDestinationMenu(title: "Move", currentBlockID: block.id) { destID in
                Task { await model.moveRace(event.id, toBlockID: destID) }
            }
            .disabled(model.isWorking)
        }
        .padding(.vertical, 5)
    }

    private func raceRow(_ race: ExportRace, in block: ExportBlock,
                         isFirst: Bool, isLast: Bool) -> some View {
        let isCurrent = model.meet?.currentRaceId == race.id
        let isSelected = model.selectedRaceIDs.contains(race.id)
        let isMerged = race.mergeGroupId != nil

        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                // Selection toggle (merged races must be unmerged first).
                Button {
                    if isSelected {
                        model.selectedRaceIDs.remove(race.id)
                    } else if !isMerged {
                        model.selectedRaceIDs.insert(race.id)
                    }
                } label: {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : (isMerged ? "link.circle" : "circle"))
                        .font(.system(size: 20))
                        .foregroundStyle(isSelected ? SSMTheme.orange : SSMTheme.muted)
                }
                .buttonStyle(.plain)
                .disabled(isMerged)

                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        if isCurrent {
                            Circle().fill(SSMTheme.good).frame(width: 8, height: 8)
                        }
                        Text(model.raceTitle(race))
                            .font(.ssmRounded(14, weight: .bold))
                            .foregroundStyle(SSMTheme.textPrimary)
                            .lineLimit(1)
                        if race.isClosed {
                            SSMChip("Closed", color: SSMTheme.muted)
                        }
                    }
                    Text(model.raceMeta(race))
                        .font(.ssmRounded(11, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                }

                Spacer()

                HStack(spacing: 2) {
                    Button {
                        Task { await model.nudgeRace(race.id, in: block, offset: -1) }
                    } label: {
                        Image(systemName: "chevron.up")
                            .frame(width: 36, height: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(isFirst)
                    .opacity(isFirst ? 0.3 : 1)

                    Button {
                        Task { await model.nudgeRace(race.id, in: block, offset: 1) }
                    } label: {
                        Image(systemName: "chevron.down")
                            .frame(width: 36, height: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(isLast)
                    .opacity(isLast ? 0.3 : 1)

                    moveDestinationMenu(title: "Move", currentBlockID: block.id) { destID in
                        Task { await model.moveRace(race.id, toBlockID: destID) }
                    }
                }
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(SSMTheme.muted)
                // Merged races are frozen in place (website: unmerge first) —
                // moving half a start-together pair breaks the pack.
                .disabled(model.isWorking || isMerged)
            }

            if isMerged {
                mergeBadge(race)
            }
        }
        .padding(.vertical, 5)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isCurrent ? SSMTheme.orange.opacity(0.08) : (isSelected ? SSMTheme.sky.opacity(0.08) : Color.clear))
        )
    }

    private func mergeBadge(_ race: ExportRace) -> some View {
        let partners = model.mergePartners(of: race)
        let partnerNames = partners.map(\.groupLabel).joined(separator: ", ")
        return HStack(spacing: 8) {
            Text(race.mergeLead
                 ? "🔗 Merged with \(partnerNames) — start together, scored separately"
                 : "🔗 Starts with \(partnerNames) — scored separately")
                .font(.ssmRounded(11, weight: .bold))
                .foregroundStyle(SSMTheme.sky)
            if race.mergeLead {
                Button("Unmerge") {
                    Task { await model.unmerge(race.id) }
                }
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(SSMTheme.danger)
                .buttonStyle(.plain)
                .disabled(model.isWorking)
            }
        }
        .padding(.leading, 30)
    }

    // ── Unassigned pool ──────────────────────────────────────────────────

    private var unassignedCard: some View {
        // Hoisted once — the filter runs O(races) and must not re-run per row.
        let filtered = model.filteredUnassigned
        let ttEvents = model.unassignedTTEvents
        let allShownSelected = !filtered.isEmpty && filtered.allSatisfy { model.selectedRaceIDs.contains($0.id) }

        return SSMCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("UNASSIGNED RACES")
                        .font(.ssmRounded(13, weight: .heavy))
                        .foregroundStyle(SSMTheme.muted)
                    Spacer()
                    if !filtered.isEmpty {
                        Button(allShownSelected ? "Clear shown" : "Select all shown") {
                            if allShownSelected {
                                model.selectedRaceIDs.subtract(filtered.map(\.id))
                            } else {
                                model.selectedRaceIDs.formUnion(
                                    filtered.filter { $0.mergeGroupId == nil }.map(\.id))
                            }
                        }
                        .font(.ssmRounded(11, weight: .heavy))
                        .foregroundStyle(SSMTheme.sky)
                        .buttonStyle(.plain)
                    }
                    SSMChip("\(filtered.count)", color: SSMTheme.orange)
                }

                Text("Running order within a division: Heats → Semifinals → Final. Schedule semifinals right after their heats — race day fills the lineups automatically when the heats close.")
                    .font(.ssmRounded(11, weight: .medium))
                    .foregroundStyle(SSMTheme.muted)

                // Unassigned time-trial events surface here like the website —
                // the generator never places them, so this is the only road
                // back onto the schedule. Not subject to the race filters.
                ForEach(ttEvents) { event in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("⏱ \(event.distance.isEmpty ? event.title : "\(event.distance) Time Trials")")
                                .font(.ssmRounded(13, weight: .bold))
                                .foregroundStyle(SSMTheme.textPrimary)
                            Text("Queue event • \(event.completedCount)/\(event.participantCount) complete")
                                .font(.ssmRounded(11, weight: .semibold))
                                .foregroundStyle(SSMTheme.muted)
                        }
                        Spacer()
                        moveDestinationMenu(title: "To…", inPool: true) { destID in
                            Task { await model.moveRace(event.id, toBlockID: destID) }
                        }
                        .disabled(model.isWorking)
                    }
                    .padding(.vertical, 4)
                    Divider().overlay(SSMTheme.cardBorder)
                }

                TextField("Search division…", text: $model.poolSearch)
                    .padding(10)
                    .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .font(.ssmRounded(13, weight: .medium))

                HStack(spacing: 8) {
                    Picker("Class", selection: $model.poolClass) {
                        Text("All Classes").tag("all")
                        Text("Novice").tag("novice")
                        Text("Elite").tag("elite")
                        Text("Open").tag("open")
                        Text("Quad").tag("quad")
                        Text("Additional").tag("additional")
                    }
                    Picker("Distance", selection: $model.poolDistance) {
                        Text("All Distances").tag(0)
                        Text("Distance 1").tag(1)
                        Text("Distance 2").tag(2)
                        Text("Distance 3").tag(3)
                        Text("Distance 4").tag(4)
                    }
                }
                .pickerStyle(.menu)
                .tint(SSMTheme.sky)

                if filtered.isEmpty {
                    Text(model.unassignedRaces.isEmpty
                         ? (ttEvents.isEmpty ? "All races assigned." : "All races assigned — the time trial event above still needs a block.")
                         : "No races match the filters.")
                        .font(.ssmRounded(13, weight: .semibold))
                        .foregroundStyle(SSMTheme.muted)
                        .padding(.vertical, 10)
                } else {
                    ForEach(filtered) { race in
                        poolRow(race)
                        if race.id != filtered.last?.id {
                            Divider().overlay(SSMTheme.cardBorder)
                        }
                    }
                }
            }
        }
    }

    private func poolRow(_ race: ExportRace) -> some View {
        let isSelected = model.selectedRaceIDs.contains(race.id)
        let isMerged = race.mergeGroupId != nil
        return HStack(spacing: 10) {
            Button {
                if isSelected {
                    model.selectedRaceIDs.remove(race.id)
                } else if !isMerged {
                    model.selectedRaceIDs.insert(race.id)
                }
            } label: {
                Image(systemName: isSelected ? "checkmark.circle.fill" : (isMerged ? "link.circle" : "circle"))
                    .font(.system(size: 20))
                    .foregroundStyle(isSelected ? SSMTheme.orange : SSMTheme.muted)
            }
            .buttonStyle(.plain)
            .disabled(isMerged)

            VStack(alignment: .leading, spacing: 1) {
                Text(model.raceTitle(race))
                    .font(.ssmRounded(13, weight: .bold))
                    .foregroundStyle(SSMTheme.textPrimary)
                    .lineLimit(1)
                Text(model.raceMeta(race))
                    .font(.ssmRounded(11, weight: .semibold))
                    .foregroundStyle(SSMTheme.muted)
            }
            Spacer()
            moveDestinationMenu(title: "To…", inPool: true) { destID in
                Task { await model.moveRace(race.id, toBlockID: destID) }
            }
            .disabled(model.isWorking || isMerged)
        }
        .padding(.vertical, 4)
    }
}

// ── Block edit sheet ─────────────────────────────────────────────────────

/// Rename / day / notes / estimated minutes for one block — posts through
/// the website's update-meta endpoint. The server ignores empty name/day
/// (can't blank them) and treats 0 minutes as "automatic".
struct BlockEditSheet: View {
    @ObservedObject var model: BlockBuilderViewModel
    let block: ExportBlock
    @Environment(\.dismiss) private var dismiss

    @State private var name: String = ""
    @State private var day: String = ""
    @State private var notes: String = ""
    @State private var durationMin: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(block.isDivider ? "Edit Divider" : "Edit Block")
                .font(.ssmRounded(22, weight: .heavy))
                .foregroundStyle(SSMTheme.textPrimary)
                .padding(.top, 24)

            field("NAME") {
                TextField("Block name", text: $name)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("DAY")
                    .font(.ssmRounded(11, weight: .heavy))
                    .foregroundStyle(SSMTheme.muted)
                Picker("Day", selection: $day) {
                    ForEach(model.dayOptions) { option in
                        Text(option.label).tag(option.value)
                    }
                }
                .pickerStyle(.menu)
                .tint(SSMTheme.sky)
            }

            field("NOTES") {
                TextField("Optional notes", text: $notes)
            }

            field("ESTIMATED MINUTES (0 = AUTOMATIC)") {
                TextField("auto", text: $durationMin)
                    .ssmNumberPad()
            }

            Button {
                Task {
                    await model.updateMeta(block: block,
                                           name: name,
                                           day: day,
                                           type: block.type,
                                           notes: notes,
                                           durationMin: durationMin.isEmpty ? "0" : durationMin)
                    dismiss()
                }
            } label: {
                Text("Save").frame(maxWidth: .infinity)
            }
            .buttonStyle(.ssmPill)
            .disabled(model.isWorking)

            Spacer()
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SSMTheme.pageBackground)
        .preferredColorScheme(.dark)
        .onAppear {
            name = block.name
            day = block.day
            notes = block.notes
            durationMin = (block.durationMin ?? 0) > 0 ? String(block.durationMin ?? 0) : ""
        }
    }

    private func field(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.ssmRounded(11, weight: .heavy))
                .foregroundStyle(SSMTheme.muted)
            content()
                .padding(12)
                .background(SSMTheme.cardBackgroundLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundStyle(SSMTheme.textPrimary)
        }
    }
}
