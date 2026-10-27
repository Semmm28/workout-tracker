import SwiftUI

struct WorkoutsScreen: View {
    @State private var plans = false
    var body: some View {
        Group { if plans { TrainingPlansScreen() } else { BrandScreen() } }
            .safeAreaInset(edge: .top, spacing: 0) {
                Picker("Weergave", selection: $plans) {
                    Text("Apparaten").tag(false)
                    Text("Schema’s").tag(true)
                }.pickerStyle(.segmented).padding(.horizontal).padding(.bottom, 8).background(WorkoutStyle.background)
            }
    }
}

struct PreviousSetLabel: View {
    let set: WorkoutRecord?
    var body: some View {
        if let set {
            Text("Vorige set: \(WorkoutStyle.value(set.number("weight"))) kg × \(WorkoutStyle.value(set.number("reps")))")
                .font(.subheadline).foregroundStyle(.secondary).monospacedDigit()
        } else { Text("Nog geen set opgeslagen").font(.subheadline).foregroundStyle(.secondary) }
    }
}

struct TrainingPlansScreen: View {
    @EnvironmentObject private var store: PhoneStore
    @State private var editor: TrainingDocument?
    @State private var deletion: TrainingDocument?
    var body: some View {
        List {
            ForEach(store.data.sessions.filter { $0.status == "active" }) { session in
                Section("Training bezig") {
                    NavigationLink { TrainingSessionScreen(sessionID: session.id) } label: {
                        Label("Hervat \(session.name)", systemImage: "play.circle.fill")
                    }
                }
            }
            Section {
                if store.data.plans.isEmpty { WorkoutEmptyState(title: "Je eigen trainingsschema", message: "Kies apparaten van je merken en stel sets, herhalingen en rust in.") }
                ForEach(store.data.plans) { plan in
                    NavigationLink { TrainingPlanScreen(planID: plan.id) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(plan.name).font(.headline)
                            Text("\(plan.items.count) apparaten · \(plan.items.reduce(0) { $0 + $1.setCount }) sets").font(.subheadline).foregroundStyle(.secondary)
                            Text(Array(Set(plan.items.map(\.brandName))).sorted().joined(separator: " / ")).font(.caption).foregroundStyle(WorkoutStyle.accent)
                        }.padding(.vertical, 8)
                    }
                    .swipeActions {
                        Button("Verwijder", role: .destructive) { deletion = plan }
                        Button("Wijzig") { editor = plan }.tint(.blue)
                    }
                }
                Button { editor = TrainingDocument() } label: { Label("Nieuw schema", systemImage: "plus") }.accessibilityIdentifier("new-plan")
            }
        }.navigationTitle("Workouts")
        .sheet(item: $editor) { TrainingPlanEditor(plan: $0) }
        .confirmationDialog("Schema verwijderen?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), titleVisibility: .visible) {
            if let deletion { Button("Verwijder schema", role: .destructive) { Task { await store.remove(kind: "plans", id: deletion.id) } } }
        } message: { Text("Je uitgevoerde trainingen en sets blijven bewaard.") }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}

struct TrainingPlanScreen: View {
    @EnvironmentObject private var store: PhoneStore
    let planID: String
    @State private var editor: TrainingDocument?
    @State private var sessionID: String?
    @State private var busy = false
    private var plan: TrainingDocument? { store.data.plans.first { $0.id == planID } }
    var body: some View {
        List {
            if let plan {
                Section {
                    ForEach(plan.items) { item in
                        VStack(alignment: .leading, spacing: 5) {
                            TrainingItemHeading(item: item)
                            Text("\(item.setCount) × \(item.target) herhalingen · \(item.restSeconds) sec. rust").font(.subheadline).foregroundStyle(.secondary)
                            PreviousSetLabel(set: store.data.setsByMachine[item.machineId]?.last)
                        }.padding(.vertical, 6)
                    }
                }
                Section {
                    Button {
                        busy = true
                        Task {
                            do {
                                if let active = store.data.sessions.first(where: { $0.status == "active" }) { sessionID = active.id }
                                else { let session = try plan.started(using: store.data); try await store.saveTraining(session, kind: "sessions", existing: false); sessionID = session.id }
                            } catch { store.error = error.localizedDescription }
                            busy = false
                        }
                    } label: { Label(store.data.sessions.contains(where: { $0.status == "active" }) ? "Hervat actieve training" : "Start training", systemImage: "play.fill").frame(maxWidth: .infinity, minHeight: 44) }
                    .disabled(busy).accessibilityIdentifier("start-training")
                }
            } else { WorkoutEmptyState(title: "Schema verwijderd", message: "Je uitgevoerde sets blijven in je geschiedenis staan.") }
        }.navigationTitle(plan?.name ?? "Schema").navigationBarTitleDisplayMode(.inline)
        .toolbar { Button("Wijzig") { editor = plan }.disabled(plan == nil) }
        .sheet(item: $editor) { TrainingPlanEditor(plan: $0) }
        .navigationDestination(isPresented: Binding(get: { sessionID != nil }, set: { if !$0 { sessionID = nil } })) {
            if let sessionID { TrainingSessionScreen(sessionID: sessionID) }
        }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}

struct TrainingItemHeading: View {
    @EnvironmentObject private var store: PhoneStore
    let item: TrainingItem
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(store.data.machinesByID[item.machineId].map(store.brandName) ?? item.brandName).font(.subheadline).foregroundStyle(WorkoutStyle.accent)
            Text(store.data.machinesByID[item.machineId]?.name ?? item.machineName).font(.headline)
            if store.data.machinesByID[item.machineId] == nil { Text("Apparaat verwijderd — kies een vervanger").font(.caption).foregroundStyle(.secondary) }
        }
    }
}

struct TrainingPlanEditor: View {
    @EnvironmentObject private var store: PhoneStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft: TrainingDocument
    @State private var picker = false
    @State private var busy = false
    @State private var error: String?
    private let existing: Bool
    init(plan: TrainingDocument) {
        // Editing owns an isolated draft until the user saves it.
        _draft = State(initialValue: plan); existing = !plan.items.isEmpty
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Naam") { TextField("Bijvoorbeeld Bovenlichaam A", text: $draft.name).accessibilityIdentifier("plan-name") }
                Section("Apparaten in volgorde") {
                    ForEach($draft.items) { $item in
                        VStack(alignment: .leading, spacing: 12) {
                            TrainingItemHeading(item: item)
                            PreviousSetLabel(set: store.data.setsByMachine[item.machineId]?.last)
                            Stepper("Sets: \(item.setCount)", value: $item.setCount, in: 1...50)
                            HStack {
                                Text("Herhalingen")
                                Spacer()
                                TextField("Van", value: $item.repMin, format: .number).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(minWidth: 40).accessibilityLabel("Minimum herhalingen")
                                Text("–")
                                TextField("Tot", value: $item.repMax, format: .number).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(minWidth: 40).accessibilityLabel("Maximum herhalingen")
                            }
                            Stepper("Rust: \(item.restSeconds) seconden", value: $item.restSeconds, in: 0...3600, step: 15)
                        }.padding(.vertical, 6)
                    }.onDelete { draft.items.remove(atOffsets: $0) }.onMove { draft.items.move(fromOffsets: $0, toOffset: $1) }
                    Button { picker = true } label: { Label("Apparaat toevoegen", systemImage: "plus.circle") }
                        .disabled(draft.items.count >= 100).accessibilityIdentifier("plan-add-machine")
                }
                if let error { Text(error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
            }.navigationTitle(existing ? "Schema wijzigen" : "Nieuw schema").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .primaryAction) { Button("Bewaar") { save() }.disabled(busy).accessibilityIdentifier("save-plan") }
                ToolbarItem(placement: .bottomBar) { EditButton() }
            }
            .sheet(isPresented: $picker) { TrainingMachinePicker { machine in draft.items.append(TrainingItem(machine: machine, brand: store.brandName(machine))) } }
            .scrollContentBackground(.hidden).background(WorkoutStyle.background)
        }.interactiveDismissDisabled(busy)
    }
    private func save() {
        draft.name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.name.isEmpty, !draft.items.isEmpty, draft.items.allSatisfy({ (1...1000).contains($0.repMin) && $0.repMax >= $0.repMin && $0.repMax <= 1000 }) else {
            error = "Geef het schema een naam, voeg een apparaat toe en controleer je herhalingen."; return
        }
        busy = true
        Task { do { try await store.saveTraining(draft, kind: "plans", existing: existing); dismiss() } catch { self.error = error.localizedDescription }; busy = false }
    }
}

struct TrainingMachinePicker: View {
    @EnvironmentObject private var store: PhoneStore
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    let choose: (WorkoutRecord) -> Void
    var body: some View {
        NavigationStack {
            List {
                if store.machines.isEmpty { WorkoutEmptyState(title: "Nog geen apparaten", message: "Voeg eerst een merk en apparaat toe via Workouts → Apparaten.") }
                ForEach(store.brands) { brand in
                    Section(brand.name) {
                        ForEach((store.data.machinesByBrand[brand.id] ?? []).filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || brand.name.localizedCaseInsensitiveContains(search) }) { machine in
                            Button { choose(machine); dismiss() } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(machine.name).font(.headline)
                                    Text(brand.name).font(.caption).foregroundStyle(.secondary)
                                    PreviousSetLabel(set: store.data.setsByMachine[machine.id]?.last)
                                }.padding(.vertical, 5)
                            }.accessibilityIdentifier("choose-machine-\(machine.id)")
                        }
                    }
                }
            }.navigationTitle("Kies een apparaat").searchable(text: $search, prompt: "Apparaat of merk")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } } }
            .scrollContentBackground(.hidden).background(WorkoutStyle.background)
        }
    }
}

struct TrainingSessionScreen: View {
    @EnvironmentObject private var store: PhoneStore
    let sessionID: String
    @State private var selected = ""
    @State private var picker = false
    @State private var finishing = false
    @State private var busy = false
    private var session: TrainingDocument? { store.data.sessions.first { $0.id == sessionID } }
    private var saved: [WorkoutRecord] { store.data.setsBySession[sessionID] ?? [] }
    private var focused: TrainingItem? { session?.items.first { $0.id == selected } ?? session?.items.first }
    var body: some View {
        List {
            if let session {
                if session.status == "completed" { summary(session) }
                else if let item = focused {
                    Section {
                        Text("\(saved.count) / \(session.items.reduce(0) { $0 + ($1.sets?.count ?? 0) }) sets voltooid").foregroundStyle(.secondary)
                        Picker("Apparaat", selection: Binding(get: { item.id }, set: { selected = $0 })) {
                            ForEach(session.items) { option in Text("\(option.brandName) · \(option.machineName)").tag(option.id) }
                        }
                    }
                    Section {
                        TrainingItemHeading(item: item)
                        Text("Doel: \(item.target) herhalingen per set").font(.subheadline).foregroundStyle(.secondary)
                        ForEach(Array((item.sets ?? []).enumerated()), id: \.element.id) { index, set in
                            TrainingSetRow(sessionID: sessionID, itemID: item.id, set: set, number: index + 1,
                                           saved: store.data.setsByID[set.id], available: store.data.machinesByID[item.machineId] != nil)
                        }
                        Button {
                            var next = session
                            if let index = next.items.firstIndex(where: { $0.id == item.id }), (item.sets?.count ?? 0) < 50 {
                                var added = item.sets?.last ?? TrainingSet(); added.id = "training-set-" + UUID().uuidString
                                next.items[index].sets?.append(added); next.items[index].setCount = next.items[index].sets?.count ?? 1
                                save(next)
                            }
                        } label: { Label("Set toevoegen", systemImage: "plus") }
                        .disabled(busy || (item.sets?.count ?? 0) >= 50)
                    }
                    if let until = session.restUntil.flatMap(WatchSet.date) {
                        Section {
                            TrainingRestTimer(until: until)
                            Button("Rust overslaan") { var next = session; next.restUntil = nil; save(next) }.disabled(busy)
                        }
                    }
                    Section {
                        Button("Ander apparaat") { picker = true }.disabled(busy).accessibilityIdentifier("replace-training-machine")
                        if let index = session.items.firstIndex(where: { $0.id == item.id }), index + 1 < session.items.count {
                            Button("Volgend apparaat") { selected = session.items[index + 1].id }
                        }
                        Button("Training afronden") { finishing = true }.disabled(busy).accessibilityIdentifier("finish-training")
                    } footer: { Text("Elke afgevinkte set wordt direct bewaard. Je kunt deze training later hervatten.") }
                }
            } else { WorkoutEmptyState(title: "Training niet beschikbaar", message: "Je sets staan nog bij de apparaten.") }
        }.navigationTitle(session?.name ?? "Training").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $picker) {
            TrainingMachinePicker { machine in
                guard var next = session, let item = focused else { return }
                do {
                    let previousIDs = Set(next.items.map(\.id))
                    try next.replace(itemID: item.id, with: machine, brand: store.brandName(machine), data: store.data)
                    selected = next.items.first { !previousIDs.contains($0.id) }?.id ?? ""
                    save(next)
                }
                catch { store.error = error.localizedDescription }
            }
        }
        .confirmationDialog("Training afronden?", isPresented: $finishing, titleVisibility: .visible) {
            Button("Bewaar training") { if var next = session { next.status = "completed"; next.finishedAt = WatchSet.timestamp(); next.restUntil = nil; save(next) } }
        } message: { Text("\(saved.count) sets uitgevoerd. Niet afgevinkte sets tellen niet mee. Je schema blijft hetzelfde.") }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
    private func save(_ next: TrainingDocument) {
        busy = true
        Task { do { try await store.saveTraining(next, kind: "sessions", existing: true) } catch { store.error = error.localizedDescription }; busy = false }
    }
    @ViewBuilder private func summary(_ session: TrainingDocument) -> some View {
        Section("Training afgerond") {
            Text("\(saved.count) sets · \(WorkoutStyle.value(saved.reduce(0) { $0 + $1.volume })) kg volume").font(.headline)
            ForEach(saved) { set in
                VStack(alignment: .leading, spacing: 4) {
                    Text(store.machineName(set)).font(.headline)
                    if let machine = store.data.machinesByID[set.text("machineId")] { Text(store.brandName(machine)).font(.caption).foregroundStyle(.secondary) }
                    Text("\(WorkoutStyle.value(set.number("weight"))) kg × \(WorkoutStyle.value(set.number("reps")))").monospacedDigit()
                }
            }
        }
    }
}

private struct TrainingSetRow: View {
    @EnvironmentObject private var store: PhoneStore
    let sessionID: String
    let itemID: String
    let set: TrainingSet
    let number: Int
    let saved: WorkoutRecord?
    let available: Bool
    @State private var weight: String
    @State private var reps: String
    @State private var busy = false
    init(sessionID: String, itemID: String, set: TrainingSet, number: Int, saved: WorkoutRecord?, available: Bool) {
        self.sessionID = sessionID; self.itemID = itemID; self.set = set; self.number = number; self.saved = saved; self.available = available
        // One-time draft values belong to the stable planned-set ID.
        _weight = State(initialValue: set.weight.formatted(.number.grouping(.never).precision(.fractionLength(0...2)))); _reps = State(initialValue: String(set.reps))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Set \(number)").font(.subheadline.weight(.semibold))
                Spacer()
                if let old = set.previousWeight, let count = set.previousReps {
                    Text("Vorige: \(WorkoutStyle.value(old)) kg × \(count)").font(.caption).foregroundStyle(.secondary)
                }
            }
            if let saved {
                HStack {
                    Text("\(WorkoutStyle.value(saved.number("weight"))) kg × \(WorkoutStyle.value(saved.number("reps")))").monospacedDigit()
                    Spacer()
                    Button { submit(undo: true) } label: { Image(systemName: "checkmark.circle.fill").frame(minWidth: 44, minHeight: 44) }
                        .accessibilityLabel("Set \(number) ongedaan maken").disabled(busy || !available)
                }
            } else {
                HStack(alignment: .bottom, spacing: 12) {
                    VStack(alignment: .leading) { Text("kg").font(.caption); TextField("Gewicht", text: $weight).keyboardType(.decimalPad).accessibilityIdentifier("training-weight-\(number)") }
                    VStack(alignment: .leading) { Text("Herh.").font(.caption); TextField("Herhalingen", text: $reps).keyboardType(.numberPad).accessibilityIdentifier("training-reps-\(number)") }
                    Button { submit(undo: false) } label: { Image(systemName: "checkmark.circle").frame(minWidth: 44, minHeight: 44) }
                        .accessibilityLabel("Set \(number) opslaan").accessibilityIdentifier("training-save-\(number)").disabled(busy || !available)
                }.textFieldStyle(.roundedBorder)
            }
        }.padding(.vertical, 4)
    }
    private func submit(undo: Bool) {
        guard let value = Double(weight.replacingOccurrences(of: ",", with: ".")), let count = Int(reps), value.isFinite, (0...2000).contains(value), (1...1000).contains(count) else {
            store.error = "Vul een gewicht van 0 tot 2000 kg en 1 tot 1000 herhalingen in."; return
        }
        busy = true
        Task {
            do { try await store.trainingSet(sessionID: sessionID, itemID: itemID, setID: set.id, weight: value, reps: count, undo: undo) }
            catch { store.error = error.localizedDescription }
            busy = false
        }
    }
}

private struct TrainingRestTimer: View {
    let until: Date
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = max(0, Int(ceil(until.timeIntervalSince(context.date))))
            HStack { Label(remaining > 0 ? "Rust" : "Rust voltooid", systemImage: "timer"); Spacer(); Text(String(format: "%d:%02d", remaining / 60, remaining % 60)).monospacedDigit() }
        }
    }
}
