import Foundation

struct HevyAPIClient {
    private let baseURL = URL(string: "https://api.hevyapp.com/v1")!

    func fetchWorkouts(apiKey: String, maxPages: Int = 10) async throws -> [WorkoutSession] {
        var result: [WorkoutSession] = []
        var page = 1

        while page <= maxPages {
            var components = URLComponents(url: baseURL.appending(path: "workouts"), resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "page", value: String(page)),
                URLQueryItem(name: "pageSize", value: "10")
            ]
            var request = URLRequest(url: components.url!)
            request.setValue(apiKey, forHTTPHeaderField: "api-key")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw SyncError.hevyAuthentication
            }
            let decoded = try JSONDecoder.hevy.decode(HevyWorkoutsResponse.self, from: data)
            result.append(contentsOf: decoded.workouts.map(WorkoutSession.init))
            if page >= decoded.pageCount { break }
            page += 1
        }
        return result
    }
}

private struct HevyWorkoutsResponse: Decodable {
    let page: Int
    let pageCount: Int
    let workouts: [HevyWorkout]

    enum CodingKeys: String, CodingKey {
        case page, workouts
        case pageCount = "page_count"
    }
}

private struct HevyWorkout: Decodable {
    let id: String
    let title: String
    let startTime: Date
    let endTime: Date
    let exercises: [HevyExercise]

    enum CodingKeys: String, CodingKey {
        case id, title, exercises
        case startTime = "start_time"
        case endTime = "end_time"
    }
}

private struct HevyExercise: Decodable {
    let title: String
    let sets: [HevySet]
}

private struct HevySet: Decodable {
    let weightKg: Double?
    let reps: Int?

    enum CodingKeys: String, CodingKey {
        case reps
        case weightKg = "weight_kg"
    }
}

private extension WorkoutSession {
    init(_ workout: HevyWorkout) {
        let exerciseSummaries = workout.exercises.enumerated().map { index, exercise in
            ExerciseSummary(
                id: "\(workout.id)-\(index)",
                name: exercise.title,
                sets: exercise.sets.count,
                volumeKg: exercise.sets.reduce(0) { $0 + (($1.weightKg ?? 0) * Double($1.reps ?? 0)) }
            )
        }
        self.init(
            id: workout.id,
            source: .hevy,
            category: .strength,
            title: workout.title,
            startedAt: workout.startTime,
            duration: max(0, workout.endTime.timeIntervalSince(workout.startTime)),
            distanceKm: nil,
            calories: nil,
            averageHeartRate: nil,
            volumeKg: exerciseSummaries.reduce(0) { $0 + $1.volumeKg },
            exercises: exerciseSummaries
        )
    }
}

private extension JSONDecoder {
    static var hevy: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let withFraction = ISO8601DateFormatter()
            withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = withFraction.date(from: value) { return date }
            if let date = ISO8601DateFormatter().date(from: value) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Date Hevy invalide")
        }
        return decoder
    }
}

enum SyncError: LocalizedError {
    case hevyAuthentication
    case healthUnavailable
    case coachConfiguration
    case invalidServerResponse

    var errorDescription: String? {
        switch self {
        case .hevyAuthentication: "Connexion Hevy impossible. Vérifie la clé API Hevy Pro."
        case .healthUnavailable: "Apple Santé n’est pas disponible sur cet appareil."
        case .coachConfiguration: "Configure l’adresse du service Coach dans Réglages."
        case .invalidServerResponse: "Le service Coach a renvoyé une réponse invalide."
        }
    }
}
