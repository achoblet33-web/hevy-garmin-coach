import Foundation

struct CoachAPIClient {
    func suggestions(endpoint: String, token: String, goal: TrainingGoal, sessions: [WorkoutSession]) async throws -> [CoachSuggestion] {
        guard let url = URL(string: endpoint), !endpoint.isEmpty else { throw SyncError.coachConfiguration }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder.api.encode(CoachRequest(goal: goal.rawValue, sessions: Array(sessions.prefix(30))))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SyncError.invalidServerResponse
        }
        return try JSONDecoder.api.decode(CoachResponse.self, from: data).suggestions
    }
}

private struct CoachRequest: Encodable {
    let goal: String
    let sessions: [WorkoutSession]
}

private struct CoachResponse: Decodable {
    let suggestions: [CoachSuggestion]
}

private extension JSONEncoder {
    static var api: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var api: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
