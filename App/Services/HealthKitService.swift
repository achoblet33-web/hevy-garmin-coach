import Foundation
import HealthKit

final class HealthKitService {
    private let healthStore = HKHealthStore()

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw SyncError.healthUnavailable }
        let types: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKQuantityType.quantityType(forIdentifier: .heartRate)!
        ]
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            healthStore.requestAuthorization(toShare: [], read: types) { success, error in
                if let error { continuation.resume(throwing: error) }
                else if success { continuation.resume() }
                else { continuation.resume(throwing: SyncError.healthUnavailable) }
            }
        }
    }

    func fetchGarminWorkouts(days: Int = 180) async throws -> [WorkoutSession] {
        let start = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
            let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            healthStore.execute(query)
        }

        return workouts
            .filter { workout in
                let bundle = workout.sourceRevision.source.bundleIdentifier.lowercased()
                let name = workout.sourceRevision.source.name.lowercased()
                return bundle.contains("garmin") || name.contains("garmin") || name.contains("connect")
            }
            .map { workout in
                WorkoutSession(
                    id: workout.uuid.uuidString,
                    source: .garmin,
                    category: category(for: workout.workoutActivityType),
                    title: title(for: workout.workoutActivityType),
                    startedAt: workout.startDate,
                    duration: workout.duration,
                    distanceKm: workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)),
                    calories: workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()),
                    averageHeartRate: nil,
                    volumeKg: nil,
                    exercises: []
                )
            }
    }

    private func category(for type: HKWorkoutActivityType) -> WorkoutCategory {
        switch type {
        case .running: .running
        case .cycling: .cycling
        case .walking, .hiking: .walking
        case .traditionalStrengthTraining, .functionalStrengthTraining: .strength
        case .elliptical, .rowing, .stairClimbing, .highIntensityIntervalTraining: .cardio
        default: .other
        }
    }

    private func title(for type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: "Course Garmin"
        case .cycling: "Vélo Garmin"
        case .walking: "Marche Garmin"
        case .hiking: "Randonnée Garmin"
        case .swimming: "Natation Garmin"
        case .rowing: "Rameur Garmin"
        case .traditionalStrengthTraining, .functionalStrengthTraining: "Musculation Garmin"
        default: "Activité Garmin"
        }
    }
}
