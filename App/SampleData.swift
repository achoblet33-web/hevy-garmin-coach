import Foundation

enum SampleData {
    static let sessions: [WorkoutSession] = {
        let calendar = Calendar.current
        let now = Date()
        return [
            WorkoutSession(
                id: "demo-hevy-1", source: .hevy, category: .strength,
                title: "Push — Pectoraux & épaules",
                startedAt: calendar.date(byAdding: .day, value: -1, to: now)!, duration: 58 * 60,
                distanceKm: nil, calories: 430, averageHeartRate: 118, volumeKg: 7_840,
                exercises: [
                    .init(id: "bench", name: "Développé couché", sets: 4, volumeKg: 2_720),
                    .init(id: "ohp", name: "Développé militaire", sets: 4, volumeKg: 1_680),
                    .init(id: "fly", name: "Écartés poulie", sets: 3, volumeKg: 1_080)
                ]
            ),
            WorkoutSession(
                id: "demo-garmin-1", source: .garmin, category: .running,
                title: "Course facile",
                startedAt: calendar.date(byAdding: .day, value: -3, to: now)!, duration: 42 * 60,
                distanceKm: 7.2, calories: 515, averageHeartRate: 146, volumeKg: nil, exercises: []
            ),
            WorkoutSession(
                id: "demo-hevy-2", source: .hevy, category: .strength,
                title: "Pull — Dos & biceps",
                startedAt: calendar.date(byAdding: .day, value: -5, to: now)!, duration: 64 * 60,
                distanceKm: nil, calories: 470, averageHeartRate: 121, volumeKg: 8_920,
                exercises: [
                    .init(id: "row", name: "Rowing barre", sets: 4, volumeKg: 2_880),
                    .init(id: "pull", name: "Tractions", sets: 4, volumeKg: 0),
                    .init(id: "curl", name: "Curl incliné", sets: 3, volumeKg: 720)
                ]
            ),
            WorkoutSession(
                id: "demo-garmin-2", source: .garmin, category: .cycling,
                title: "Vélo endurance",
                startedAt: calendar.date(byAdding: .day, value: -8, to: now)!, duration: 75 * 60,
                distanceKm: 31.4, calories: 680, averageHeartRate: 137, volumeKg: nil, exercises: []
            ),
            WorkoutSession(
                id: "demo-hevy-3", source: .hevy, category: .strength,
                title: "Jambes",
                startedAt: calendar.date(byAdding: .day, value: -10, to: now)!, duration: 70 * 60,
                distanceKm: nil, calories: 560, averageHeartRate: 126, volumeKg: 11_350,
                exercises: [
                    .init(id: "squat", name: "Squat", sets: 5, volumeKg: 4_500),
                    .init(id: "rdl", name: "Soulevé de terre roumain", sets: 4, volumeKg: 3_200),
                    .init(id: "leg", name: "Presse à cuisses", sets: 4, volumeKg: 3_650)
                ]
            )
        ].sorted { $0.startedAt > $1.startedAt }
    }()

    static let suggestions: [CoachSuggestion] = [
        .init(
            id: "demo-suggestion-1", kind: .strength, title: "Bas du corps — progression contrôlée",
            rationale: "Ta dernière séance jambes remonte à plus d’une semaine, tandis que le haut du corps a été stimulé récemment.",
            durationMinutes: 55, intensity: "Modérée à soutenue",
            steps: ["Squat : 4 × 6 à RPE 7", "Soulevé de terre roumain : 3 × 8", "Fentes bulgares : 3 × 10/jambe", "Gainage : 3 × 45 s"]
        ),
        .init(
            id: "demo-suggestion-2", kind: .cardio, title: "Footing facile en zone 2",
            rationale: "Une sortie basse intensité complète le volume cardio sans gêner la récupération musculaire.",
            durationMinutes: 40, intensity: "Facile — conversation possible",
            steps: ["8 min d’échauffement", "27 min en aisance respiratoire", "5 min très faciles"]
        ),
        .init(
            id: "demo-suggestion-3", kind: .recovery, title: "Mobilité + marche",
            rationale: "Option légère si la fatigue perçue est élevée aujourd’hui.",
            durationMinutes: 30, intensity: "Très facile",
            steps: ["20 min de marche", "5 min mobilité hanches", "5 min mobilité épaules"]
        )
    ]
}
