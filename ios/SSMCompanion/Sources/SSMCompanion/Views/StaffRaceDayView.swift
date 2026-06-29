import SwiftUI

public struct StaffRaceDayView: View {
    let meetID: String
    let meetName: String
    let role: StaffRole

    @StateObject private var viewModel = StaffRaceDayViewModel()

    public init(meetID: String, meetName: String, role: StaffRole) {
        self.meetID = meetID
        self.meetName = meetName
        self.role = role
    }

    public var body: some View {
        ScrollView { 
            VStack(spacing: 16) {
                HStack {
                    SSMChip(role.displayName, color: SSMTheme.navy)
                    Spacer()
                }
                .padding(.horizontal)

                if viewModel.isLoading && viewModel.data == nil {
                    ProgressView().padding(.top, 60)
                } else if let error = viewModel.errorMessage {
                    ContentUnavailableFallback(text: error)
                } else if let data = viewModel.data {
                    StatusDeck(data: data)

                    if data.canControlRaceDay {
                        RaceControlsCard(meetID: meetID, data: data, viewModel: viewModel)
                    } else {
                        SSMCard {
                            Text("\(role.displayName)s have a read-only view here. Open Live Board or Results from below to follow along.")
                                .font(.subheadline)
                                .foregroundStyle(SSMTheme.muted)
                        }
                        .padding(.horizontal)
                    }

                    HStack(spacing: 12) {
                        NavigationLink {
                            LiveRaceDayView(meetID: meetID, meetName: meetName)
                        } label: {
                            ActionRow(title: "Live Board", icon: "tv", gradient: SSMTheme.skyGradient)
                        }
                        NavigationLink {
                            ResultsView(meetID: meetID, meetName: meetName)
                        } label: {
                            ActionRow(title: "Results", icon: "list.number", gradient: SSMTheme.navyGradient)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.vertical)
            .padding(.bottom, 70)
        }
        .background(SSMTheme.pageBackground)
        .navigationTitle(meetName)
        .ssmInlineNavigationTitle()
        .task { await viewModel.load(meetID: meetID) }
        .refreshable { await viewModel.load(meetID: meetID) }
    }
}

private struct StatusDeck: View {
    let data: RaceDayStateResponse

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                DeckTile(label: "Current Race", text: data.current?.groupLabel ?? "—", gradient: SSMTheme.orangeGradient)
                DeckTile(label: "In Staging", text: data.next?.groupLabel ?? "—", gradient: LinearGradient(colors: [Color(red: 0xd9/255, green: 0x77/255, blue: 0x06/255), Color(red: 0xf5/255, green: 0x9e/255, blue: 0x0b/255)], startPoint: .top, endPoint: .bottom))
            }
            DeckTile(
                label: "Progress",
                text: "\(data.progress.completed) / \(data.progress.total)  •  \(data.paused ? "Paused" : "Running")",
                gradient: SSMTheme.navyGradient
            )
        }
        .padding(.horizontal)
    }
}

private struct DeckTile: View {
    let label: String
    let text: String
    let gradient: LinearGradient

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased()).font(.ssmRounded(11, weight: .bold)).foregroundStyle(.white.opacity(0.85))
            Text(text).font(.ssmRounded(17, weight: .bold)).foregroundStyle(.white).lineLimit(2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(gradient, in: RoundedRectangle(cornerRadius: SSMTheme.cornerRadius, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 4)
    }
}

private struct RaceControlsCard: View {
    let meetID: String
    let data: RaceDayStateResponse
    @ObservedObject var viewModel: StaffRaceDayViewModel
    @State private var selectedRaceID: String?

    var body: some View {
        SSMCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Set Current Race").font(.subheadline.bold()).foregroundStyle(SSMTheme.muted)
                Picker("Race", selection: Binding(
                    get: { selectedRaceID ?? data.current?.id.stringValue ?? "" },
                    set: { newValue in
                        selectedRaceID = newValue
                        Task { await viewModel.setCurrentRace(meetID: meetID, raceID: newValue) }
                    }
                )) {
                    ForEach(data.orderedRaces) { item in
                        Text(item.label).tag(item.id.stringValue)
                    }
                }
                .pickerStyle(.menu)
                .disabled(viewModel.isSendingAction)

                HStack(spacing: 12) {
                    Button {
                        Task { await viewModel.step(meetID: meetID, direction: -1) }
                    } label: {
                        Label("Previous", systemImage: "chevron.left")
                    }
                    .buttonStyle(.ssmSoftPill)

                    Button {
                        Task { await viewModel.step(meetID: meetID, direction: 1) }
                    } label: {
                        Label("Next", systemImage: "chevron.right")
                    }
                    .buttonStyle(.ssmPill)
                }
                .disabled(viewModel.isSendingAction)

                HStack(spacing: 12) {
                    Button {
                        Task { await viewModel.togglePause(meetID: meetID) }
                    } label: {
                        Label(data.paused ? "Resume" : "Pause", systemImage: data.paused ? "play.fill" : "pause.fill")
                    }
                    .buttonStyle(.ssmSoftPill)

                    if let current = data.current, current.status == "closed" {
                        Button {
                            Task { await viewModel.unlockCurrentRace(meetID: meetID) }
                        } label: {
                            Label("Unlock Race", systemImage: "lock.open")
                        }
                        .buttonStyle(.ssmPill(LinearGradient(colors: [SSMTheme.danger, SSMTheme.danger.opacity(0.8)], startPoint: .top, endPoint: .bottom)))
                    }
                }
                .disabled(viewModel.isSendingAction)

                if let error = viewModel.errorMessage {
                    Text(error).font(.caption).foregroundStyle(SSMTheme.danger)
                }
            }
        }
        .padding(.horizontal)
    }
}
