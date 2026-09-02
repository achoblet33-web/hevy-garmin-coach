import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            SessionsView()
                .tabItem { Label("Séances", systemImage: "list.bullet.rectangle") }
            AnalysisView()
                .tabItem { Label("Analyse", systemImage: "chart.xyaxis.line") }
            SuggestionsView()
                .tabItem { Label("Coach", systemImage: "sparkles") }
            SettingsView()
                .tabItem { Label("Réglages", systemImage: "gearshape.fill") }
        }
        .tint(.mint)
    }
}
