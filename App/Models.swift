import Foundation

enum WorkoutSource: String, Codable, CaseIterable, Identifiable {
    case hevy = "Hevy"
    case garmin = "Garmin"

    var id: String { rawValue }
    var symbol: String { self == .hevy ? "dumbbell.fill" : "figure.run" }
}

enum WorkoutCategory: String, Codable, CaseIterable {
    case strength = "Musculation"
    case running = "Course"
    case cycling = "Vélo"
    case walking = "Marche"
    case cardio = "Cardio"
    case other = "Autre"

    var symbol: String {
        switch self {
        case .strength: "dumbbell.fill"
        case .running: "figure.run"
        case .cycling: "bicycle"
        case .walking: "figure.walk"
        case .cardio: "heart.fill"
        case .other: "figure.mixed.cardio"
        }
    }
}

struct ExerciseSummary: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let sets: Int
    let volumeKg: Double
}

struct WorkoutSession: Identifiable, Codable, Hashable {
    let id: String
    let source: WorkoutSource
    let category: WorkoutCategory
    let title: String
    let startedAt: Date
    let duration: TimeInterval
    let distanceKm: Double?
    let calories: Double?
    let averageHeartRate: Double?
    let volumeKg: Double?
    let exercises: [ExerciseSummary]

    var durationMinutes: Int { Int(duration / 60) }
}

enum SuggestionKind: String, Codable {
    case strength = "Musculation"
    case cardio = "Cardio"
    case recovery = "Récupération"

    var symbol: String {
        switch self {
        case .strength: "dumbbell.fill"
        case .cardio: "figure.run"
        case .recovery: "leaf.fill"
        }
    }
}

struct CoachSuggestion: Identifiable, Codable, Hashable {
    let id: String
    let kind: SuggestionKind
    let title: String
    let rationale: String
    let durationMinutes: Int
    let intensity: String
    let steps: [String]
}

enum TrainingGoal: String, CaseIterable, Identifiable {
    case balanced = "Équilibre"
    case strength = "Force"
    case muscle = "Prise de muscle"
    case endurance = "Endurance"
    case recovery = "Récupération"

    var id: String { rawValue }
}
