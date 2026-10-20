import SwiftUI
import WatchKit

@main
struct WorkoutWatchApp: App {
    @StateObject private var store = WatchStore()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                if store.loading { ProgressView("Sets laden…") }
                else if store.ready { WatchHome() }
                else {
                    VStack {
                        Text("Je opgeslagen sets konden niet worden geladen.").font(.footnote)
                        Button("Opnieuw proberen") { store.refresh() }
                    }
                }
            }
                .environmentObject(store)
                .tint(.blue)
                .alert("Workout Log", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
                    Button("OK") { store.error = nil }
                } message: { Text(store.error ?? "") }
                .task(id: phase) { if phase == .active { store.refresh() } }
        }
    }
}

private struct MachineRow: View {
    let machine: WatchMachine
    let brandName: String
    var body: some View {
        NavigationLink { SetEditor(machine: machine) } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(machine.name).font(.headline)
                Text(brandName).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}

private struct WatchHome: View {
    @EnvironmentObject var store: WatchStore
    var body: some View {
        List {
            if store.replica.generation == 0 {
                Text("Open Workout Log op je iPhone om je merken en apparaten over te nemen.").font(.footnote)
                Button("Opnieuw verbinden") { store.refresh() }
            } else if store.replica.snapshot.machines.isEmpty {
                Text("Voeg op je iPhone een merk en apparaat toe.").font(.footnote)
            }
            if !store.recentMachines.isEmpty {
                Section("Recent") { ForEach(store.recentMachines) { MachineRow(machine: $0, brandName: store.brandName($0)) } }
            }
            NavigationLink("Alle apparaten") { BrandList() }
            NavigationLink("Vandaag · \(store.today.count)") { TodayList() }
            NavigationLink("Instellingen") { WatchSettings() }
        }
        .navigationTitle("Workout Log")
    }
}

private struct BrandList: View {
    @EnvironmentObject var store: WatchStore
    var body: some View {
        List {
            ForEach(store.replica.snapshot.brands) { brand in
                NavigationLink(brand.name) {
                    List {
                        let machines = store.data.machinesByBrand[brand.id] ?? []
                        if machines.isEmpty { Text("Nog geen apparaten. Voeg ze toe op je iPhone.").font(.footnote) }
                        ForEach(machines) { MachineRow(machine: $0, brandName: store.brandName($0)) }
                    }.navigationTitle(brand.name)
                }
            }
            if store.replica.snapshot.brands.isEmpty { Text("Je merken verschijnen zodra je de iPhone-app opent.").font(.footnote) }
        }.navigationTitle("Merken")
    }
}

private enum SetField: String, Identifiable { case weight, reps; var id: String { rawValue } }

private struct SetEditor: View {
    @EnvironmentObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    let machine: WatchMachine
    var existing: WatchSet?
    @State private var weight = 0.0
    @State private var reps = 10.0
    @State private var loaded = false
    @State private var field: SetField?
    @State private var showRest = false
    @ScaledMetric(relativeTo: .title2) private var valueSize = 29.0

    var body: some View {
        ScrollView {
            VStack(spacing: 9) {
                Text(store.brandName(machine)).font(.caption2).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    valueButton(weight, label: "kg", field: .weight)
                    valueButton(reps, label: "herhalingen", field: .reps)
                }
                if let last = store.data.lastSets[machine.id] {
                    Text("Laatste: \(last.weight.formatted()) kg × \(last.reps)").font(.caption2).foregroundStyle(.secondary)
                }
                Button {
                    Task {
                        if await store.log(machine: machine, weight: weight, reps: Int(reps), existing: existing) {
                            if existing == nil { showRest = true } else { dismiss() }
                        }
                    }
                } label: { Label(existing == nil ? "Log set" : "Bewaar wijziging", systemImage: "checkmark") }
                .buttonStyle(.borderedProminent)
                .disabled(store.saving || store.data.machinesByID[machine.id] == nil)
                if store.data.machinesByID[machine.id] == nil {
                    Text("Dit apparaat is op je iPhone verwijderd.").font(.caption2)
                }
                NavigationLink("Vandaag") { TodayList() }.font(.footnote)
            }
        }
        .navigationTitle(machine.name)
        .onAppear {
            // Seed this editing session once; incoming sync must not replace a draft.
            guard !loaded else { return }
            let last = existing ?? store.data.lastSets[machine.id]
            weight = last?.weight ?? 0; reps = Double(last?.reps ?? 10); loaded = true
            if existing == nil, let id = store.replica.restSetId, store.data.sets.contains(where: { $0.id == id && $0.machineId == machine.id }) { showRest = true }
        }
        .sheet(item: $field) { selected in
            ValuePicker(value: selected == .weight ? $weight : $reps,
                        title: selected == .weight ? "Gewicht" : "Herhalingen",
                        unit: selected == .weight ? "kg" : "herhalingen",
                        step: selected == .weight ? store.replica.weightStep : 1,
                        minimum: selected == .weight ? 0 : 1, maximum: selected == .weight ? 2000 : 1000)
        }
        .sheet(isPresented: $showRest) { RestView() }
    }

    private func valueButton(_ value: Double, label: String, field: SetField) -> some View {
        Button { self.field = field } label: {
            VStack(spacing: 2) {
                Text(value.formatted()).font(.system(size: valueSize, weight: .semibold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.65).lineLimit(1)
                Text(label).font(.caption2).lineLimit(1).minimumScaleFactor(0.8)
            }.frame(maxWidth: .infinity, minHeight: 55)
        }.accessibilityLabel(label).accessibilityValue(value.formatted()).accessibilityHint("Tik om aan te passen")
    }
}

private struct ValuePicker: View {
    @Binding var value: Double
    let title: String
    let unit: String
    let step: Double
    let minimum: Double
    let maximum: Double
    @Environment(\.dismiss) private var dismiss
    @State private var draft = 0.0
    @State private var loaded = false
    @ScaledMetric(relativeTo: .largeTitle) private var valueSize = 43.0
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(title).font(.headline)
                Text(draft.formatted(.number.precision(.fractionLength(0...(unit == "kg" ? 2 : 0))))).font(.system(size: valueSize, weight: .semibold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.65).lineLimit(1)
                    .focusable()
                    .digitalCrownRotation($draft, from: minimum, through: maximum, by: step, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                Text(unit).font(.caption2).foregroundStyle(.secondary)
                HStack {
                    Button { draft = max(minimum, draft - step) } label: { Image(systemName: "minus") }.accessibilityLabel("Verlagen")
                    Button { draft = min(maximum, draft + step) } label: { Image(systemName: "plus") }.accessibilityLabel("Verhogen")
                }
                Button("Gereed") { value = unit == "kg" ? (draft * 100).rounded() / 100 : draft.rounded(); dismiss() }.buttonStyle(.borderedProminent)
            }
        }.onAppear {
            // A presented picker owns its draft until the user chooses Gereed.
            guard !loaded else { return }
            draft = min(maximum, max(minimum, value)); loaded = true
        }
    }
}

private struct RestView: View {
    @EnvironmentObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    @ScaledMetric(relativeTo: .largeTitle) private var timerSize = 46.0
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Label("Set opgeslagen", systemImage: "checkmark.circle").font(.footnote).foregroundStyle(.green)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let seconds = max(0, Int(ceil((store.replica.restUntil ?? context.date).timeIntervalSince(context.date))))
                    Text(String(format: "%d:%02d", seconds / 60, seconds % 60)).font(.system(size: timerSize, weight: .medium, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.65)
                        .accessibilityLabel("Resterende rust").accessibilityValue("\(seconds) seconden")
                    Text(seconds == 0 ? "Klaar voor je volgende set" : "Rust").font(.caption2).foregroundStyle(.secondary)
                }
                VStack {
                    Button("+30 sec") { Task { await store.extendRest() } }
                    Button("Volgende set") { Task { if await store.endRest() { dismiss() } } }.tint(.blue)
                }.font(.footnote).disabled(store.saving)
                Button("Ongedaan maken") { Task { if await store.undoLastSet() { dismiss() } } }.font(.footnote).disabled(store.saving)
            }
        }
    }
}

private struct TodayList: View {
    @EnvironmentObject var store: WatchStore
    var body: some View {
        List {
            Section("Op je Watch gelogd") {
                if store.today.isEmpty { Text("Nog geen sets vandaag").font(.footnote) }
                ForEach(store.today) { set in
                    if let machine = store.data.machinesByID[set.machineId] {
                        NavigationLink { SetEditor(machine: machine, existing: set) } label: { setLabel(set) }
                    } else { setLabel(set) }
                }
            }
            Text(store.syncLabel).font(.caption2).foregroundStyle(.secondary)
            Button("Synchroniseer") { store.refresh() }
        }.navigationTitle("Vandaag")
    }
    private func setLabel(_ set: WatchSet) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(set.weight.formatted()) kg × \(set.reps)").font(.headline)
            Text(store.machineName(set)).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

private struct WatchSettings: View {
    @EnvironmentObject var store: WatchStore
    var body: some View {
        Form {
            Picker("Gewichtstap", selection: Binding(get: { store.replica.weightStep }, set: { value in Task { await store.preferences(weightStep: value) } })) {
                ForEach([0.5, 1.0, 2.5, 5.0], id: \.self) { Text("\($0.formatted()) kg").tag($0) }
            }
            Picker("Rust", selection: Binding(get: { store.replica.restSeconds }, set: { value in Task { await store.preferences(restSeconds: value) } })) {
                ForEach([30.0, 60, 90, 120, 150, 180], id: \.self) { Text("\(Int($0)) sec").tag($0) }
            }
            Text(store.syncLabel).font(.caption2)
            Text("Merken en apparaten beheer je op je iPhone.").font(.caption2).foregroundStyle(.secondary)
        }.navigationTitle("Instellingen").disabled(store.saving)
    }
}
