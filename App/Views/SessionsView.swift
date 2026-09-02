import SwiftUI

struct SessionsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var selectedSource: WorkoutSource?

    private var filtered: [WorkoutSession] {
        guard let selectedSource else { return store.sessions }
        return store.sessions.filter { $0.source == selectedSource }
    }

    var body: some View {
        NavigationStack {
            List {
                if store.isDemoMode {
                    Section {
                        Label("Données de démonstration — connecte tes comptes dans Réglages.", systemImage: "info.circle.fill")
                            .font(.footnote)
                            .foregroundStyle(.mint)
                    }
                }

                Section {
                    Picker("Source", selection: $selectedSource) {
                        Text("Toutes").tag(nil as WorkoutSource?)
                        ForEach(WorkoutSource.allCases) { Text($0.rawValue).tag($0 as WorkoutSource?) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }

                ForEach(groupedDates) { group in
                    Section(group.title) {
                        ForEach(group.sessions) { session in
                            NavigationLink {
                                SessionDetailView(session: session)
                            } label: {
                                SessionRow(session: session)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Tes séances")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await store.sync() } } label: {
                        if store.isSyncing { ProgressView() } else { Image(systemName: "arrow.clockwise") }
                    }
                    .disabled(store.isSyncing)
                }
            }
            .refreshable { await store.sync() }
            .alert("Synchronisation", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(store.errorMessage ?? "") }
        }
    }

    private var groupedDates: [SessionDateGroup] {
        let groups = Dictionary(grouping: filtered) { Calendar.current.startOfDay(for: $0.startedAt) }
        return groups.keys.sorted(by: >).map { date in
            SessionDateGroup(
                date: date,
                title: date.formatted(.dateTime.weekday(.wide).day().month(.wide)),
                sessions: groups[date]!.sorted { $0.startedAt > $1.startedAt }
            )
        }
    }
}

private struct SessionDateGroup: Identifiable {
    let date: Date
    let title: String
    let sessions: [WorkoutSession]
    var id: Date { date }
}

private struct SessionRow: View {
    let session: WorkoutSession

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: session.category.symbol)
                .font(.title3)
                .foregroundStyle(session.source == .hevy ? .orange : .cyan)
                .frame(width: 42, height: 42)
                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 6) {
                Text(session.title).font(.headline)
                HStack(spacing: 8) {
                    Text("\(session.durationMinutes) min")
                    if let distance = session.distanceKm { Text("• \(distance, specifier: "%.1f") km") }
                    if let volume = session.volumeKg { Text("• \(volume.compact) kg") }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            SourceBadge(source: session.source)
        }
        .padding(.vertical, 4)
    }
}

private struct SessionDetailView: View {
    let session: WorkoutSession

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack { SourceBadge(source: session.source); Spacer(); Text(session.startedAt.formatted(date: .abbreviated, time: .shortened)).foregroundStyle(.secondary) }
                HStack(spacing: 12) {
                    MetricCard(title: "Durée", value: "\(session.durationMinutes)", subtitle: "minutes", symbol: "clock.fill", color: .mint)
                    if let distance = session.distanceKm {
                        MetricCard(title: "Distance", value: String(format: "%.1f", distance), subtitle: "kilomètres", symbol: "point.topleft.down.to.point.bottomright.curvepath", color: .cyan)
                    } else {
                        MetricCard(title: "Volume", value: (session.volumeKg ?? 0).compact, subtitle: "kilogrammes", symbol: "scalemass.fill", color: .orange)
                    }
                }
                if !session.exercises.isEmpty {
                    Text("Exercices").font(.title2.bold())
                    ForEach(session.exercises) { exercise in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(exercise.name).font(.headline)
                                Text("\(exercise.sets) séries").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(exercise.volumeKg.compact) kg").font(.subheadline.monospacedDigit())
                        }
                        .padding()
                        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                    }
                }
            }
            .padding()
        }
        .navigationTitle(session.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
