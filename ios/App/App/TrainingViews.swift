import SwiftUI

struct WorkoutsScreen: View {
    @State private var plans = false
    var body: some View {
        VStack(spacing: 0) {
            Picker("Weergave", selection: $plans) {
                Text("Apparaten").tag(false)
                Text("Schema’s").tag(true)
            }.pickerStyle(.segmented).padding(.horizontal).padding(.vertical, 8)
            if plans { TrainingPlansScreen() } else { BrandScreen() }
        }
        .navigationTitle("Workouts").navigationBarTitleDisplayMode(.inline)
        .background(WorkoutStyle.background)
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
    @State private var editMode = EditMode.inactive
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
                    HStack {
                        if editMode.isEditing {
                            Button { editor = plan } label: { planLabel(plan) }.buttonStyle(.plain)
                                .accessibilityIdentifier("edit-plan-\(plan.id)")
                            Spacer()
                            Button { deletion = plan } label: { Image(systemName: "trash").frame(minWidth: 44, minHeight: 44) }
                                .buttonStyle(.borderless).tint(.red).accessibilityLabel("Verwijder \(plan.name)")
                        } else {
                            NavigationLink { TrainingPlanScreen(planID: plan.id) } label: { planLabel(plan) }
                        }
                    }
                    .swipeActions {
                        Button("Verwijder", role: .destructive) { deletion = plan }
                        Button("Wijzig") { editor = plan }.tint(.blue)
                    }
                }.onMove { indices, destination in
                    var rows = store.data.plans; rows.move(fromOffsets: indices, toOffset: destination)
                    Task { await store.reorder(kind: "plans", ids: rows.map(\.id)) }
                }
            }
        }
        .environment(\.editMode, $editMode)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(editMode.isEditing ? "Gereed" : "Wijzig") { editMode = editMode.isEditing ? .inactive : .active }
                    .disabled(store.data.plans.isEmpty).accessibilityIdentifier("edit-plans")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { editor = TrainingDocument() } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Nieuw schema").accessibilityIdentifier("new-plan")
            }
        }
        .sheet(item: $editor) { TrainingPlanEditor(plan: $0) }
        .confirmationDialog("Schema verwijderen?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), titleVisibility: .visible) {
            if let deletion { Button("Verwijder schema", role: .destructive) { Task { await store.remove(kind: "plans", id: deletion.id) } } }
        } message: { Text("Je uitgevoerde trainingen en sets blijven bewaard.") }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
    private func planLabel(_ plan: TrainingDocument) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(plan.name).font(.headline)
            Text("\(plan.items.count) apparaten · \(plan.items.reduce(0) { $0 + $1.setCount }) sets").font(.subheadline).foregroundStyle(.secondary)
            Text(Array(Set(plan.items.map(\.brandName))).sorted().joined(separator: " / ")).font(.caption).foregroundStyle(WorkoutStyle.accent)
            if editMode.isEditing { Label("Schema wijzigen", systemImage: "pencil").font(.caption) }
        }.padding(.vertical, 8)
    }
}

struct TrainingPlanScreen: View {
    @EnvironmentObject private var store: PhoneStore
    let planID: String
    @State private var editor: TrainingDocument?
    @State private var itemEditor: TrainingItem?
    @State private var sessionID: String?
    @State private var busy = false
    private var plan: TrainingDocument? { store.data.plans.first { $0.id == planID } }
    var body: some View {
        List {
            if let plan {
                Section {
                    ForEach(plan.items) { item in
                        Button { itemEditor = item } label: { TrainingPlanItemLabel(item: item) }
                            .buttonStyle(.plain).accessibilityIdentifier("edit-plan-item-\(item.id)")
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
        .sheet(item: $itemEditor) { item in
            TrainingItemEditor(item: item) { changed in try await store.updatePlanItem(planID: planID, item: changed) }
        }
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

private struct TrainingPlanItemLabel: View {
    @EnvironmentObject private var store: PhoneStore
    @AppStorage("trainingRestTimerEnabled") private var restTimerEnabled = true
    let item: TrainingItem
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 5) {
                TrainingItemHeading(item: item)
                Text("\(item.setCount) × \(item.target) herhalingen" + (restTimerEnabled && item.restSeconds > 0 ? " · \(item.restSeconds) sec. rust" : ""))
                    .font(.subheadline).foregroundStyle(.secondary)
                PreviousSetLabel(set: store.data.setsByMachine[item.machineId]?.last)
            }
            Spacer(minLength: 12)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle()).padding(.vertical, 6)
    }
}

struct TrainingItemEditor: View {
    @EnvironmentObject private var store: PhoneStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("trainingRestTimerEnabled") private var restTimerEnabled = true
    @State private var draft: TrainingItem
    @State private var picker = false
    @State private var busy = false
    @State private var error: String?
    let saveItem: (TrainingItem) async throws -> Void

    init(item: TrainingItem, saveItem: @escaping (TrainingItem) async throws -> Void) {
        // Keep changes local until Bewaar, including an optional replacement machine.
        _draft = State(initialValue: item); self.saveItem = saveItem
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TrainingItemHeading(item: draft)
                    PreviousSetLabel(set: store.data.setsByMachine[draft.machineId]?.last)
                    Button("Apparaat wijzigen") { picker = true }.accessibilityIdentifier("plan-item-replace")
                }
                Section("Doelen") {
                    WorkoutIntegerField(title: "Sets", value: $draft.setCount, kind: .setCount, identifier: "plan-item-sets")
                    WorkoutIntegerField(title: "Herhalingen vanaf", value: $draft.repMin, kind: .repTarget, identifier: "plan-item-rep-min")
                    WorkoutIntegerField(title: "Herhalingen tot", value: $draft.repMax, kind: .repTarget, identifier: "plan-item-rep-max")
                    if restTimerEnabled {
                        WorkoutIntegerField(title: "Rust", value: $draft.restSeconds, kind: .rest, identifier: "plan-item-rest")
                    }
                }
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("plan-item-error") }
            }.navigationTitle("Oefening wijzigen").navigationBarTitleDisplayMode(.inline)
            .disabled(busy)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) { Button("Bewaar") { save() }.disabled(busy).accessibilityIdentifier("save-plan-item") }
            }
            .sheet(isPresented: $picker) {
                TrainingMachinePicker { machine in
                    draft.machineId = machine.id; draft.machineName = machine.name; draft.brandName = store.brandName(machine)
                }
            }
            .scrollContentBackground(.hidden).background(WorkoutStyle.background)
        }.interactiveDismissDisabled(busy)
    }
    private func save() {
        guard (1...1000).contains(draft.repMin), (draft.repMin...1000).contains(draft.repMax) else {
            error = "Het maximum aantal herhalingen moet minstens gelijk zijn aan het minimum."; return
        }
        busy = true; error = nil
        Task {
            do { try await saveItem(draft); dismiss() } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}

struct TrainingPlanEditor: View {
    @EnvironmentObject private var store: PhoneStore
    @AppStorage("trainingDefaultSetCount") private var defaultSetCount = 2
    @AppStorage("trainingDefaultRepMin") private var defaultRepMin = 5
    @AppStorage("trainingDefaultRepMax") private var defaultRepMax = 8
    @Environment(\.dismiss) private var dismiss
    @State private var draft: TrainingDocument
    @State private var picker = false
    @State private var itemEditor: TrainingItem?
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
                    ForEach(draft.items) { item in
                        Button { itemEditor = item } label: { TrainingPlanItemLabel(item: item) }
                            .buttonStyle(.plain).accessibilityIdentifier("edit-plan-item-\(item.id)")
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
            .sheet(isPresented: $picker) {
                TrainingMachinePicker { machine in
                    draft.items.append(TrainingItem(machine: machine, brand: store.brandName(machine), setCount: defaultSetCount, repMin: defaultRepMin, repMax: defaultRepMax))
                }
            }
            .sheet(item: $itemEditor) { item in
                TrainingItemEditor(item: item) { changed in
                    guard let index = draft.items.firstIndex(where: { $0.id == changed.id }) else { throw PhoneDataError.deleted }
                    draft.items[index] = changed
                }
            }
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
    @State private var expanded = Set<String>()
    let choose: (WorkoutRecord) -> Void
    private var query: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func machines(for brand: WorkoutRecord) -> [WorkoutRecord] {
        (store.data.machinesByBrand[brand.id] ?? []).filter {
            query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || brand.name.localizedCaseInsensitiveContains(query)
        }
    }
    private var brands: [WorkoutRecord] { store.brands.filter { !machines(for: $0).isEmpty } }
    var body: some View {
        NavigationStack {
            List {
                if store.machines.isEmpty { WorkoutEmptyState(title: "Nog geen apparaten", message: "Voeg eerst een merk en apparaat toe via Workouts → Apparaten.") }
                else if brands.isEmpty { WorkoutEmptyState(title: "Geen apparaten gevonden", message: "Zoek op apparaat of merk.") }
                ForEach(brands) { brand in
                    if query.isEmpty {
                        DisclosureGroup(isExpanded: Binding(get: { expanded.contains(brand.id) }, set: { open in
                            if open { expanded.insert(brand.id) } else { expanded.remove(brand.id) }
                        })) {
                            machineRows(for: brand)
                        } label: {
                            Button {
                                if expanded.contains(brand.id) { expanded.remove(brand.id) } else { expanded.insert(brand.id) }
                            } label: {
                                HStack {
                                    Text(brand.name).font(.headline)
                                    Spacer()
                                    let count = machines(for: brand).count
                                    Text("\(count) \(count == 1 ? "apparaat" : "apparaten")").font(.subheadline).foregroundStyle(.secondary)
                                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                            }.buttonStyle(.plain)
                                .accessibilityValue(expanded.contains(brand.id) ? "Uitgeklapt" : "Ingeklapt")
                                .accessibilityIdentifier("training-brand-\(brand.id)")
                        }
                    } else {
                        Section(brand.name) {
                            machineRows(for: brand)
                        }
                    }
                }
            }.navigationTitle("Kies een apparaat").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Apparaat of merk")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } } }
            .scrollContentBackground(.hidden).background(WorkoutStyle.background)
        }
    }
    private func machineRows(for brand: WorkoutRecord) -> some View {
        ForEach(machines(for: brand)) { machine in
            Button { choose(machine); dismiss() } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(machine.name).font(.headline)
                    Text(brand.name).font(.caption).foregroundStyle(.secondary)
                    PreviousSetLabel(set: store.data.setsByMachine[machine.id]?.last)
                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle()).padding(.vertical, 5)
            }.accessibilityIdentifier("choose-machine-\(machine.id)")
        }
    }
}

struct TrainingSessionScreen: View {
    @EnvironmentObject private var store: PhoneStore
    @AppStorage("trainingRestTimerEnabled") private var restTimerEnabled = true
    let sessionID: String
    @State private var selected = ""
    @State private var picker = false
    @State private var finishing = false
    @State private var busy = false
    @State private var drafts: [String: TrainingSetDraft] = [:]
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
                                           saved: store.data.setsByID[set.id], previous: store.data.setsByMachine[item.machineId]?.last,
                                           available: store.data.machinesByID[item.machineId] != nil,
                                           draft: Binding(get: { drafts[set.id] ?? TrainingSetDraft() }, set: { drafts[set.id] = $0 }))
                        }
                        Button {
                            var next = session
                            if let index = next.items.firstIndex(where: { $0.id == item.id }), (item.sets?.count ?? 0) < 50 {
                                let added = item.newSet(history: store.data.setsByMachine[item.machineId] ?? [])
                                next.items[index].sets?.append(added); next.items[index].setCount = next.items[index].sets?.count ?? 1
                                save(next)
                            }
                        } label: { Label("Set toevoegen", systemImage: "plus") }
                        .disabled(busy || (item.sets?.count ?? 0) >= 50)
                    }
                    if restTimerEnabled, let until = session.restUntil.flatMap(WatchSet.date) {
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

private struct TrainingSetDraft {
    var weight: String?
    var reps: String?
}

private struct TrainingSetRow: View {
    @EnvironmentObject private var store: PhoneStore
    @AppStorage("trainingRestTimerEnabled") private var restTimerEnabled = true
    let sessionID: String
    let itemID: String
    let set: TrainingSet
    let number: Int
    let saved: WorkoutRecord?
    let previous: WorkoutRecord?
    let available: Bool
    @Binding var draft: TrainingSetDraft
    @State private var busy = false
    private var weight: String {
        // Session-owned drafts survive row recycling; only untouched fields follow the latest saved weight.
        if let weight = draft.weight { return weight }
        let initial = saved?.number("weight") ?? previous?.number("weight") ?? (set.previousWeight != nil || set.weight != 0 ? set.weight : nil)
        return initial.map { String($0) } ?? ""
    }
    private var reps: String { draft.reps ?? String(set.reps) }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Set \(number)").font(.subheadline.weight(.semibold))
                Spacer()
                if saved == nil, let previous {
                    Text("Vorige: \(WorkoutStyle.value(previous.number("weight"))) kg × \(WorkoutStyle.value(previous.number("reps")))")
                        .font(.caption).foregroundStyle(.secondary)
                } else if let old = set.previousWeight, let count = set.previousReps {
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
                WorkoutNumberField(title: "Gewicht", text: Binding(get: { weight }, set: { draft.weight = $0 }), kind: .weight, identifier: "training-weight-\(number)")
                    .disabled(busy || !available)
                WorkoutNumberField(title: "Herhalingen", text: Binding(get: { reps }, set: { draft.reps = $0 }), kind: .repTarget, identifier: "training-reps-\(number)")
                    .disabled(busy || !available)
                Button { submit(undo: false) } label: {
                    Label("Set \(number) opslaan", systemImage: "checkmark.circle").frame(maxWidth: .infinity, minHeight: 44)
                }.accessibilityIdentifier("training-save-\(number)").disabled(busy || !available)
            }
        }.padding(.vertical, 4)
    }
    private func submit(undo: Bool) {
        guard let value = WorkoutNumberKind.weight.number(weight), let repetitionValue = WorkoutNumberKind.repTarget.number(reps),
              let count = Int(exactly: repetitionValue), (0...2000).contains(value), (1...1000).contains(count) else {
            store.error = "Vul een gewicht van 0 tot 2000 kg en 1 tot 1000 herhalingen in."; return
        }
        busy = true
        Task {
            do { try await store.trainingSet(sessionID: sessionID, itemID: itemID, setID: set.id, weight: value, reps: count, undo: undo, restTimerEnabled: restTimerEnabled) }
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
