import SwiftUI
import Charts

struct AnalysisView: View {
    @EnvironmentObject private var store: AppStore

    private var recent: [WorkoutSession] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -28, to: Date())!
        return store.sessions.filter { $0.startedAt >= cutoff }
    }

    private var weekly: [WeeklyLoad] {
        let calendar = Calendar.current
        let groups = Dictionary(grouping: recent) { session in
            calendar.dateInterval(of: .weekOfYear, for: session.startedAt)?.start ?? session.startedAt
        }
        return groups.map { week, sessions in
            WeeklyLoad(week: week, minutes: sessions.reduce(0) { $0 + $1.duration / 60 }, count: sessions.count)
        }.sorted { $0.week < $1.week }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        MetricCard(title: "Séances", value: "\(recent.count)", subtitle: "sur 28 jours", symbol: "calendar", color: .mint)
                        MetricCard(title: "Temps", value: "\(Int(recent.reduce(0) { $0 + $1.duration } / 3600)) h", subtitle: "entraînement", symbol: "timer", color: .cyan)
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Volume", value: recent.compactMap(\.volumeKg).reduce(0, +).compact, subtitle: "kg soulevés", symbol: "dumbbell.fill", color: .orange)
                        MetricCard(title: "Distance", value: String(format: "%.1f", recent.compactMap(\.distanceKm).reduce(0, +)), subtitle: "kilomètres", symbol: "figure.run", color: .green)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("Charge hebdomadaire").font(.title2.bold())
                        Text("Minutes d’entraînement par semaine").font(.subheadline).foregroundStyle(.secondary)
                        Chart(weekly) { item in
                            BarMark(x: .value("Semaine", item.week, unit: .weekOfYear), y: .value("Minutes", item.minutes))
                                .foregroundStyle(.mint.gradient)
                                .cornerRadius(6)
                        }
                        .frame(height: 210)
                    }
                    .padding()
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Répartition").font(.title2.bold())
                        ForEach(WorkoutCategory.allCases, id: \.rawValue) { category in
                            let count = recent.filter { $0.category == category }.count
                            if count > 0 {
                                HStack {
                                    Label(category.rawValue, systemImage: category.symbol)
                                    Spacer()
                                    Text("\(count) séance\(count > 1 ? "s" : "")").foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .padding()
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
                }
                .padding()
            }
            .navigationTitle("Analyse")
        }
    }
}

private struct WeeklyLoad: Identifiable {
    let week: Date
    let minutes: Double
    let count: Int
    var id: Date { week }
}
