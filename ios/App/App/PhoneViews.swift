import SwiftUI
import Charts

enum WorkoutStyle {
    static let background = Color(red: 11/255, green: 11/255, blue: 15/255)
    static let surface = Color(red: 19/255, green: 20/255, blue: 26/255)
    static let accent = Color(red: 157/255, green: 184/255, blue: 1)
    static func value(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...2))) }
}

struct EditRequest: Identifiable {
    let kind: String
    let record: WorkoutRecord
    let existing: Bool
    var id: String { record.id }
    init(kind: String, record: WorkoutRecord? = nil, parent: String = "") {
        self.kind = kind; self.existing = record != nil
        self.record = record ?? WorkoutRecord(["id": .string(kind + "-" + UUID().uuidString), "createdAt": .string(WatchSet.timestamp()), "brandId": .string(kind == "machines" ? parent : ""), "machineId": .string(kind == "sets" ? parent : "")])
    }
}

struct PhoneRootView: View {
    @StateObject private var store = PhoneStore.shared
    @Environment(\.scenePhase) private var phase
    var body: some View {
        Group {
            switch store.phase {
            case .ready: tabs
            case .loading: ProgressView("Workout Log openen…")
            case .migrating:
                ZStack {
                    LegacyDatabaseReader().id(store.migrationAttempt).frame(width: 1, height: 1).opacity(0).accessibilityHidden(true)
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("Je workouts overnemen").font(.headline)
                        Text("Je bestaande gegevens blijven bewaard.").foregroundStyle(.secondary)
                    }.padding()
                }
            case .failed:
                VStack(spacing: 18) {
                    Image(systemName: "externaldrive.badge.exclamationmark").font(.largeTitle)
                    Text("Gegevens nog niet beschikbaar").font(.title2)
                    Text("Je opgeslagen workouts zijn niet verwijderd. Probeer de overname opnieuw.").multilineTextAlignment(.center)
                    Button("Opnieuw proberen") { Task { await store.retryMigration() } }.buttonStyle(.borderedProminent)
                }.padding()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WorkoutStyle.background).tint(WorkoutStyle.accent).preferredColorScheme(.dark)
        .environmentObject(store)
        .task { await store.start() }
        .task(id: phase) { if phase == .active { await store.refresh(manual: true) } }
        .alert("Workout Log", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK", role: .cancel) { store.error = nil }
        } message: { Text(store.error ?? "") }
    }
    private var tabs: some View {
        TabView {
            NavigationStack { WorkoutsScreen() }.tabItem { Label("Workouts", systemImage: "dumbbell") }
            NavigationStack { RecentScreen() }.tabItem { Label("Recent", systemImage: "clock") }
            NavigationStack { QuickLogScreen() }.tabItem { Label("Log set", systemImage: "plus.circle.fill") }
            NavigationStack { BodyweightScreen() }.tabItem { Label("Gewicht", systemImage: "scalemass") }
            NavigationStack { PhoneSettingsScreen() }.tabItem { Label("Instellingen", systemImage: "gearshape") }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let notice = store.notice {
                HStack {
                    Text(notice).font(.subheadline)
                    Spacer()
                    if store.undoRecords != nil { Button { Task { await store.undo() } } label: { Text("Herstel").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Verwijdering ongedaan maken") }
                    Button { store.notice = nil } label: { Image(systemName: "xmark").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Melding sluiten")
                }.padding().background(WorkoutStyle.surface).accessibilityElement(children: .contain)
            }
        }
    }
}

struct WorkoutEmptyState: View {
    let title: String
    let message: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            Text(message).foregroundStyle(.secondary)
        }.padding(.vertical, 12)
    }
}

struct BrandScreen: View {
    @EnvironmentObject private var store: PhoneStore
    @State private var search = ""
    @State private var editor: EditRequest?
    @State private var deletion: WorkoutRecord?
    private var visible: [WorkoutRecord] { store.brands.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) } }
    var body: some View {
        List {
            if visible.isEmpty {
                WorkoutEmptyState(title: search.isEmpty ? "Je eerste workout begint hier" : "Geen passende merken", message: search.isEmpty ? "Voeg een merk toe en daarna de apparaten waarop je traint." : "Probeer een andere zoekterm.")
                if search.isEmpty { Button("Merk toevoegen") { editor = EditRequest(kind: "brands") } }
            }
            ForEach(visible) { brand in
                NavigationLink { MachineScreen(brandID: brand.id) } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(brand.name).font(.headline)
                        let count = store.data.machinesByBrand[brand.id]?.count ?? 0
                        Text("\(count) \(count == 1 ? "apparaat" : "apparaten")").font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 5)
                }
                .swipeActions {
                    Button("Verwijder", role: .destructive) { deletion = brand }
                    Button("Wijzig") { editor = EditRequest(kind: "brands", record: brand) }.tint(.blue)
                }
                .contextMenu {
                    Button { editor = EditRequest(kind: "brands", record: brand) } label: { Label("Wijzig", systemImage: "pencil") }
                    Button("Verwijder", role: .destructive) { deletion = brand }
                }
            }.onMove { indices, destination in
                var rows = store.brands; rows.move(fromOffsets: indices, toOffset: destination)
                Task { await store.reorder(kind: "brands", ids: rows.map(\.id)) }
            }.moveDisabled(!search.isEmpty)
        }
        .navigationTitle("Workouts").searchable(text: $search, prompt: "Zoek een merk")
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) { EditButton().disabled(!search.isEmpty) }
            ToolbarItem(placement: .navigationBarTrailing) { Button { editor = EditRequest(kind: "brands") } label: { Image(systemName: "plus") }.accessibilityLabel("Merk toevoegen") }
        }
        .sheet(item: $editor) { WorkoutEditor(request: $0) }
        .confirmationDialog("Merk verwijderen?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), titleVisibility: .visible, presenting: deletion) { row in
            Button("Verwijder \(row.name)", role: .destructive) { Task { await store.remove(kind: "brands", id: row.id) } }
        } message: { _ in Text("Ook de bijbehorende apparaten en sets worden verwijderd.") }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}

struct MachineScreen: View {
    @EnvironmentObject private var store: PhoneStore
    let brandID: String
    @State private var search = ""
    @State private var editor: EditRequest?
    @State private var deletion: WorkoutRecord?
    private var all: [WorkoutRecord] { store.data.machinesByBrand[brandID] ?? [] }
    private var visible: [WorkoutRecord] { all.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) } }
    private var brand: WorkoutRecord? { store.data.brandsByID[brandID] }
    var body: some View {
        List {
            if visible.isEmpty {
                WorkoutEmptyState(title: search.isEmpty ? "Nog geen apparaten" : "Geen passende apparaten", message: search.isEmpty ? "Voeg een apparaat toe om je sets bij te houden." : "Probeer een andere zoekterm.")
                if search.isEmpty && brand != nil { Button("Apparaat toevoegen") { editor = EditRequest(kind: "machines", parent: brandID) } }
            }
            ForEach(visible) { machine in
                NavigationLink { MachineDetailScreen(machineID: machine.id) } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(machine.name).font(.headline)
                        let count = store.data.setsByMachine[machine.id]?.count ?? 0
                        Text("\(count) \(count == 1 ? "set" : "sets")").font(.subheadline).foregroundStyle(.secondary)
                        PreviousSetLabel(set: store.data.setsByMachine[machine.id]?.last)
                        if !machine.text("note").isEmpty { Text(machine.text("note")).font(.footnote).foregroundStyle(.secondary) }
                    }.padding(.vertical, 4)
                }
                .swipeActions {
                    Button("Verwijder", role: .destructive) { deletion = machine }
                    Button("Wijzig") { editor = EditRequest(kind: "machines", record: machine) }.tint(.blue)
                }
                .contextMenu {
                    Button { editor = EditRequest(kind: "machines", record: machine) } label: { Label("Wijzig", systemImage: "pencil") }
                    Button("Verwijder", role: .destructive) { deletion = machine }
                }
            }.onMove { indices, destination in
                var rows = all; rows.move(fromOffsets: indices, toOffset: destination)
                Task { await store.reorder(kind: "machines", ids: rows.map(\.id)) }
            }.moveDisabled(!search.isEmpty)
        }
        .navigationTitle(brand?.name ?? "Merk verwijderd")
        .searchable(text: $search, prompt: "Zoek een apparaat")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) { HStack {
                EditButton().disabled(!search.isEmpty)
                Button { editor = EditRequest(kind: "machines", parent: brandID) } label: { Image(systemName: "plus") }.accessibilityLabel("Apparaat toevoegen").disabled(brand == nil)
            } }
        }
        .sheet(item: $editor) { WorkoutEditor(request: $0) }
        .confirmationDialog("Apparaat verwijderen?", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), titleVisibility: .visible, presenting: deletion) { row in
            Button("Verwijder \(row.name)", role: .destructive) { Task { await store.remove(kind: "machines", id: row.id) } }
        } message: { _ in Text("Ook de bijbehorende sets worden verwijderd.") }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}

struct TrainingChart: View, Equatable {
    let points: [WorkoutPoint]
    let label: String
    private var dateStride: Int {
        let range = WorkoutMetrics.dateRange(points.map(\.date))
        let days = Calendar.current.dateComponents([.day], from: range.lowerBound, to: range.upperBound).day ?? 1
        return max(1, (days + 3) / 4)
    }
    var body: some View {
        if points.isEmpty {
            Text("Je grafiek verschijnt zodra er gegevens voor deze selectie zijn.").foregroundStyle(.secondary).padding(.vertical, 24)
        } else {
            Chart(points) { point in
                LineMark(x: .value("Datum", point.date), y: .value(label, point.value)).foregroundStyle(WorkoutStyle.accent)
                PointMark(x: .value("Datum", point.date), y: .value(label, point.value)).foregroundStyle(WorkoutStyle.accent)
                    .accessibilityLabel(point.date.formatted(date: .abbreviated, time: .omitted))
                    .accessibilityValue("\(WorkoutStyle.value(point.value)) \(label)")
            }
            .chartYScale(domain: WorkoutMetrics.valueRange(points.map(\.value)))
            .chartXScale(domain: WorkoutMetrics.dateRange(points.map(\.date)))
            .chartXAxis { AxisMarks(values: .stride(by: .day, count: dateStride)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.day().month(.abbreviated)) } }
            .frame(height: 200).padding(.vertical, 8).accessibilityLabel(label)
        }
    }
}

struct SetSummary: View, Equatable {
    let record: WorkoutRecord
    let index: Int?
    let personalRecord: Bool
    let showsVolume: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                if let index { Text("Set \(index)").font(.subheadline).foregroundStyle(.secondary) }
                Spacer()
                Text(record.date, style: .time).font(.caption).foregroundStyle(.secondary)
            }
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) { numbers; Spacer(); metric }
                VStack(alignment: .leading, spacing: 6) { numbers; metric }
            }
            if personalRecord { Label("Persoonlijk record · e1RM", systemImage: "trophy.fill").font(.caption).foregroundStyle(WorkoutStyle.accent) }
            if let rpe = record.fields["rpe"]?.number { Text("RPE \(WorkoutStyle.value(rpe))").font(.caption).foregroundStyle(.secondary) }
            if !record.text("notes").isEmpty { Text(record.text("notes")).font(.subheadline).foregroundStyle(.secondary) }
        }.padding(.vertical, 5).frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle()).accessibilityElement(children: .combine)
    }
    private var numbers: some View { Text("\(WorkoutStyle.value(record.number("weight"))) kg × \(WorkoutStyle.value(record.number("reps")))").font(.title3.weight(.semibold)).monospacedDigit().foregroundStyle(.primary) }
    private var metric: some View { Text("\(WorkoutStyle.value(showsVolume ? record.volume : record.e1rm)) kg \(showsVolume ? "volume" : "e1RM")").font(.caption).foregroundStyle(.secondary).monospacedDigit() }
}

struct MachineDetailScreen: View {
    @EnvironmentObject private var store: PhoneStore
    let machineID: String
    @State private var editor: EditRequest?
    private var machine: WorkoutRecord? { store.data.machinesByID[machineID] }
    private var entries: [WorkoutRecord] { store.data.setsByMachine[machineID] ?? [] }
    private var history: WorkoutHistory { store.data.histories[machineID] ?? WorkoutHistory() }
    private var showsVolume: Bool { store.snapshot.chartMode == "volumeMax" }
    var body: some View {
        List {
            if let machine {
                if !machine.text("note").isEmpty { Section("Apparaatnotitie") { Text(machine.text("note")) } }
                Section("Voortgang") {
                    Picker("Grafiek", selection: Binding(get: { store.snapshot.chartMode }, set: { mode in Task { await store.setChartMode(mode) } })) {
                        Text("Hoogste e1RM per dag").tag("e1rmMax")
                        Text("Hoogste volume per dag").tag("volumeMax")
                        Text("Eerste set · e1RM").tag("set1")
                        Text("Tweede set · e1RM").tag("set2")
                        Text("Derde set · e1RM").tag("set3")
                    }.pickerStyle(.menu).accessibilityIdentifier("chart-mode")
                    TrainingChart(points: history.points, label: showsVolume ? "Volume (kg)" : "e1RM (kg)").equatable()
                }
                ForEach(history.days) { day in
                    Section(day.date.formatted(date: .abbreviated, time: .omitted)) {
                        ForEach(day.entries) { entry in
                            Button { editor = EditRequest(kind: "sets", record: entry) } label: {
                                SetSummary(record: entry, index: day.entries.firstIndex(where: { $0.id == entry.id }).map { $0 + 1 }, personalRecord: history.records.contains(entry.id), showsVolume: showsVolume).equatable()
                            }.buttonStyle(.plain).accessibilityIdentifier("set-\(entry.id)")
                            .swipeActions {
                                Button("Verwijder", role: .destructive) { Task { await store.remove(kind: "sets", id: entry.id) } }
                                Button("Wijzig") { editor = EditRequest(kind: "sets", record: entry) }.tint(.blue)
                            }
                        }
                    }
                }
                if entries.isEmpty { WorkoutEmptyState(title: "Nog geen sets", message: "Log gewicht en herhalingen om je voortgang te volgen.") }
                Button { editor = EditRequest(kind: "sets", parent: machineID) } label: { Label("Set toevoegen", systemImage: "plus.circle.fill") }
            } else { WorkoutEmptyState(title: "Apparaat verwijderd", message: "Ga terug om een ander apparaat te kiezen.") }
        }
        .navigationTitle(machine?.name ?? "Trainingshistorie").navigationBarTitleDisplayMode(.inline)
        .toolbar { Button { editor = EditRequest(kind: "sets", parent: machineID) } label: { Image(systemName: "plus") }.accessibilityLabel("Set toevoegen").disabled(machine == nil) }
        .sheet(item: $editor) { WorkoutEditor(request: $0) }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}

struct QuickLogScreen: View {
    @EnvironmentObject private var store: PhoneStore
    @State private var editor: EditRequest?
    @State private var search = ""
    var body: some View {
        List {
            if store.machines.isEmpty { WorkoutEmptyState(title: "Voeg eerst een apparaat toe", message: "Open Workouts en voeg een merk en apparaat toe.") }
            ForEach(store.machines.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || store.brandName($0).localizedCaseInsensitiveContains(search) }) { machine in
                Button { editor = EditRequest(kind: "sets", parent: machine.id) } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(machine.name).font(.headline).foregroundStyle(.primary)
                        Text(store.brandName(machine)).font(.subheadline).foregroundStyle(.secondary)
                        PreviousSetLabel(set: store.data.setsByMachine[machine.id]?.last)
                    }.padding(.vertical, 5)
                }
            }
        }.navigationTitle("Set loggen").searchable(text: $search, prompt: "Kies een apparaat")
        .sheet(item: $editor) { WorkoutEditor(request: $0) }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}

struct RecentScreen: View {
    @EnvironmentObject private var store: PhoneStore
    @State private var expanded = Set<Date>()
    var body: some View {
        List {
            if !store.data.sessions.isEmpty {
                Section("Trainingen") {
                    ForEach(store.data.sessions) { session in
                        NavigationLink { TrainingSessionScreen(sessionID: session.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(session.name).font(.headline)
                                Text("\(store.data.setsBySession[session.id]?.count ?? 0) sets · \(session.status == "active" ? "Hervatten" : "Afgerond")").font(.subheadline).foregroundStyle(.secondary)
                                if let date = session.loggedAt.flatMap(WatchSet.date) { Text(date, style: .date).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
            }
            if store.sets.isEmpty { WorkoutEmptyState(title: "Nog geen workouts", message: "Je gelogde sets verschijnen hier per dag.") }
            ForEach(store.data.recentDays) { day in
                DisclosureGroup(isExpanded: Binding(get: { expanded.contains(day.id) }, set: { if $0 { expanded.insert(day.id) } else { expanded.remove(day.id) } })) {
                    ForEach(day.entries) { row in
                        NavigationLink { MachineDetailScreen(machineID: row.text("machineId")) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(store.machineName(row)).font(.headline)
                                if let machine = store.data.machinesByID[row.text("machineId")] { Text(store.brandName(machine)).font(.caption).foregroundStyle(.secondary) }
                                Text("\(WorkoutStyle.value(row.number("weight"))) kg × \(WorkoutStyle.value(row.number("reps")))").monospacedDigit()
                                Text(row.date, style: .time).font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 5)
                        }
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(day.date.formatted(date: .abbreviated, time: .omitted)).font(.headline)
                        Text("\(day.entries.count) \(day.entries.count == 1 ? "set" : "sets")").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
        }.navigationTitle("Recent")
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}

struct BodyweightScreen: View {
    @EnvironmentObject private var store: PhoneStore
    @State private var editor: EditRequest?
    var body: some View {
        List {
            Section {
                Button { editor = EditRequest(kind: "bodyweights") } label: { Label("Meting toevoegen", systemImage: "plus.circle.fill") }
            }
            Section("Verloop lichaamsgewicht") {
                TrainingChart(points: store.data.bodyweightPoints, label: "Gewicht (kg)").equatable()
            }
            Section("Metingen") {
                if store.bodyweights.isEmpty { WorkoutEmptyState(title: "Nog geen metingen", message: "Voeg je gewicht toe om het verloop bij te houden.") }
                ForEach(store.bodyweights.reversed()) { row in
                    VStack(alignment: .leading, spacing: 5) {
                        Text("\(WorkoutStyle.value(row.number("weight"))) kg").font(.title3.weight(.semibold)).monospacedDigit()
                        Text(row.date.formatted(date: .abbreviated, time: .omitted)).font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                    .swipeActions { Button("Verwijder", role: .destructive) { Task { await store.remove(kind: "bodyweights", id: row.id) } } }
                }
            }
        }.navigationTitle("Gewicht").navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editor) { WorkoutEditor(request: $0) }
        .scrollContentBackground(.hidden).background(WorkoutStyle.background)
    }
}
