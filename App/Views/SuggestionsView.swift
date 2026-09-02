import SwiftUI

struct SuggestionsView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Coach adaptatif", systemImage: "sparkles")
                            .font(.title2.bold())
                            .foregroundStyle(.mint)
                        Text("Les propositions utilisent tes dernières séances Hevy et Garmin. Ajuste ton objectif avant de générer le prochain entraînement.")
                            .foregroundStyle(.secondary)
                        Picker("Objectif", selection: $store.goal) {
                            ForEach(TrainingGoal.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.menu)
                        .tint(.mint)
                        Button {
                            Task { await store.generateSuggestions() }
                        } label: {
                            HStack {
                                if store.isGenerating { ProgressView().tint(.black) }
                                else { Image(systemName: "wand.and.stars") }
                                Text(store.isGenerating ? "Analyse en cours…" : "Générer mes séances")
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.mint)
                        .foregroundStyle(.black)
                        .disabled(store.isGenerating)
                    }
                    .padding()
                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))

                    ForEach(store.suggestions) { suggestion in
                        SuggestionCard(suggestion: suggestion)
                    }
                }
                .padding()
            }
            .navigationTitle("Suggestions")
            .alert("Coach", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(store.errorMessage ?? "") }
        }
    }
}

private struct SuggestionCard: View {
    let suggestion: CoachSuggestion
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .top) {
                Image(systemName: suggestion.kind.symbol)
                    .font(.title2)
                    .foregroundStyle(color)
                    .frame(width: 46, height: 46)
                    .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(suggestion.kind.rawValue.uppercased()).font(.caption.bold()).foregroundStyle(color)
                    Text(suggestion.title).font(.headline)
                }
                Spacer()
            }
            Text(suggestion.rationale).font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Label("\(suggestion.durationMinutes) min", systemImage: "clock")
                Spacer()
                Label(suggestion.intensity, systemImage: "gauge.with.dots.needle.50percent")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            if expanded {
                Divider()
                ForEach(Array(suggestion.steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top) {
                        Text("\(index + 1)").font(.caption.bold()).foregroundStyle(.black).frame(width: 24, height: 24).background(color, in: Circle())
                        Text(step).font(.subheadline)
                    }
                }
            }
            Button(expanded ? "Réduire" : "Voir la séance") { withAnimation { expanded.toggle() } }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
        }
        .padding()
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
    }

    private var color: Color {
        switch suggestion.kind {
        case .strength: .orange
        case .cardio: .cyan
        case .recovery: .green
        }
    }
}
