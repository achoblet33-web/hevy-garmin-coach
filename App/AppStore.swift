import Foundation
import Combine

@MainActor
final class AppStore: ObservableObject {
    @Published var sessions: [WorkoutSession] = SampleData.sessions
    @Published var suggestions: [CoachSuggestion] = SampleData.suggestions
    @Published var isSyncing = false
    @Published var isGenerating = false
    @Published var lastSync: Date?
    @Published var errorMessage: String?
    @Published var isDemoMode = true
    @Published var goal: TrainingGoal = .balanced

    @Published var hevyAPIKey = KeychainStore.read("hevy-api-key")
    @Published var coachEndpoint = UserDefaults.standard.string(forKey: "coach-endpoint") ?? ""
    @Published var coachToken = KeychainStore.read("coach-token")

    private let hevy = HevyAPIClient()
    private let health = HealthKitService()
    private let coach = CoachAPIClient()

    func saveSettings() {
        KeychainStore.save(hevyAPIKey, for: "hevy-api-key")
        KeychainStore.save(coachToken, for: "coach-token")
        UserDefaults.standard.set(coachEndpoint, forKey: "coach-endpoint")
    }

    func sync() async {
        isSyncing = true
        errorMessage = nil
        defer { isSyncing = false }

        let garminSessions = await fetchGarminSafely()
        let hevySessions = await fetchHevySafely()
        let merged = garminSessions + hevySessions
        if !merged.isEmpty {
            sessions = Dictionary(grouping: merged, by: \.id).compactMap { $0.value.first }.sorted { $0.startedAt > $1.startedAt }
            isDemoMode = false
        }
        lastSync = Date()
    }

    private func fetchGarminSafely() async -> [WorkoutSession] {
        do {
            try await health.requestAuthorization()
            return try await health.fetchGarminWorkouts()
        } catch {
            errorMessage = error.localizedDescription
            return []
        }
    }

    private func fetchHevySafely() async -> [WorkoutSession] {
        guard !hevyAPIKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        do {
            return try await hevy.fetchWorkouts(apiKey: hevyAPIKey)
        } catch {
            errorMessage = error.localizedDescription
            return []
        }
    }

    func generateSuggestions() async {
        isGenerating = true
        errorMessage = nil
        defer { isGenerating = false }
        guard !coachEndpoint.isEmpty else {
            suggestions = LocalCoach.suggestions(goal: goal, sessions: sessions)
            return
        }
        do {
            suggestions = try await coach.suggestions(endpoint: coachEndpoint, token: coachToken, goal: goal, sessions: sessions)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func resetDemo() {
        sessions = SampleData.sessions
        suggestions = SampleData.suggestions
        isDemoMode = true
        lastSync = nil
    }
}

enum LocalCoach {
    static func suggestions(goal: TrainingGoal, sessions: [WorkoutSession]) -> [CoachSuggestion] {
        let latestStrength = sessions.first { $0.category == .strength }
        let latestRun = sessions.first { $0.category == .running }
        let daysSinceStrength = latestStrength.map { Calendar.current.dateComponents([.day], from: $0.startedAt, to: Date()).day ?? 0 } ?? 7
        let daysSinceRun = latestRun.map { Calendar.current.dateComponents([.day], from: $0.startedAt, to: Date()).day ?? 0 } ?? 7

        var primary: CoachSuggestion
        if goal == .endurance || daysSinceRun > daysSinceStrength {
            primary = .init(id: UUID().uuidString, kind: .cardio, title: "Course progressive", rationale: "Le volume de course récent permet une séance structurée sans pic brutal.", durationMinutes: 45, intensity: "Facile à modérée", steps: ["10 min faciles", "3 × 6 min soutenues / 2 min faciles", "7 min de retour au calme"])
        } else {
            primary = .init(id: UUID().uuidString, kind: .strength, title: "Full body progressif", rationale: "Cette séance équilibre les principaux groupes musculaires d’après ton historique récent.", durationMinutes: 55, intensity: "RPE 7", steps: ["Squat : 4 × 6", "Développé couché : 4 × 6", "Rowing : 4 × 8", "Soulevé de terre roumain : 3 × 8"])
        }
        return [
            primary,
            .init(id: UUID().uuidString, kind: .cardio, title: "Zone 2 sans fatigue résiduelle", rationale: "Une séance facile améliore la base aérobie et la récupération.", durationMinutes: 35, intensity: "Facile", steps: ["5 min progressives", "25 min en aisance respiratoire", "5 min très faciles"]),
            .init(id: UUID().uuidString, kind: .recovery, title: "Récupération active", rationale: "Choisis cette option en cas de fatigue, courbatures fortes ou sommeil insuffisant.", durationMinutes: 25, intensity: "Très facile", steps: ["15 min de marche", "Mobilité hanches et chevilles", "Respiration lente 3 min"])
        ]
    }
}
