import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showHevyKey = false
    @State private var showCoachToken = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Hevy") {
                    if showHevyKey {
                        TextField("Clé API Hevy Pro", text: $store.hevyAPIKey)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    } else {
                        SecureField("Clé API Hevy Pro", text: $store.hevyAPIKey)
                    }
                    Toggle("Afficher la clé", isOn: $showHevyKey)
                    Text("La clé est disponible dans les réglages développeur de Hevy Web pour les comptes Hevy Pro.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("Garmin via Apple Santé") {
                    Label("Autorise Garmin Connect à écrire les entraînements dans Santé, puis autorise cette app à les lire.", systemImage: "heart.text.square")
                        .font(.subheadline)
                    Button("Autoriser et synchroniser") { Task { await store.sync() } }
                }

                Section("Coach ChatGPT") {
                    TextField("URL du relais (https://…/recommend)", text: $store.coachEndpoint)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    if showCoachToken {
                        TextField("Jeton du relais (facultatif)", text: $store.coachToken)
                    } else {
                        SecureField("Jeton du relais (facultatif)", text: $store.coachToken)
                    }
                    Toggle("Afficher le jeton", isOn: $showCoachToken)
                    Text("Sans URL, l’app utilise son moteur local. La clé OpenAI reste uniquement sur ton serveur et n’est jamais stockée dans l’app.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section {
                    Button("Enregistrer") { store.saveSettings() }
                        .frame(maxWidth: .infinity)
                    Button("Réinitialiser la démo", role: .destructive) { store.resetDemo() }
                        .frame(maxWidth: .infinity)
                }

                Section("État") {
                    LabeledContent("Mode", value: store.isDemoMode ? "Démonstration" : "Données réelles")
                    if let lastSync = store.lastSync {
                        LabeledContent("Dernière synchro", value: lastSync.formatted(date: .abbreviated, time: .shortened))
                    }
                }
            }
            .navigationTitle("Réglages")
        }
    }
}
