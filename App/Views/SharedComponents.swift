import SwiftUI

struct SourceBadge: View {
    let source: WorkoutSource

    var body: some View {
        Label(source.rawValue, systemImage: source.symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(source == .hevy ? .orange : .cyan)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background((source == .hevy ? Color.orange : Color.cyan).opacity(0.14), in: Capsule())
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let subtitle: String
    let symbol: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: symbol)
                .foregroundStyle(color)
                .font(.title3)
            Text(value).font(.title2.bold())
            Text(title).font(.subheadline.weight(.semibold))
            Text(subtitle).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
    }
}

extension Double {
    var compact: String {
        if self >= 1_000 { return String(format: "%.1fk", self / 1_000) }
        return String(format: "%.0f", self)
    }
}
