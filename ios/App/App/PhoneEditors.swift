import SwiftUI
import UniformTypeIdentifiers

enum WorkoutNumberKind {
    case weight, bodyweight, repetitions, setCount, repTarget, rest, rpe

    var step: String {
        switch self {
        case .weight: return "2.5"
        case .bodyweight: return "0.1"
        case .rest: return "15"
        case .rpe: return "0.5"
        default: return "1"
        }
    }
    var keyboard: UIKeyboardType { self == .weight || self == .bodyweight || self == .rpe ? .decimalPad : .numberPad }
    var hasWheel: Bool { self != .weight && self != .bodyweight }
    var wheelRange: ClosedRange<Int> {
        switch self {
        case .setCount: return 1...50
        case .repTarget: return 1...1000
        default: return 0...1000
        }
    }
    func number(_ text: String) -> Double? {
        guard let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")), value.isFinite else { return nil }
        return value
    }
    func valid(_ text: String) -> Bool {
        if self == .rpe && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        guard let value = number(text) else { return false }
        switch self {
        case .weight: return value >= 0
        case .bodyweight: return value > 0
        case .repetitions: return value >= 0 && value.rounded() == value
        case .setCount: return (1...50).contains(value) && value.rounded() == value
        case .repTarget: return (1...1000).contains(value) && value.rounded() == value
        case .rest: return (0...3600).contains(value) && value.rounded() == value
        case .rpe: return (1...10).contains(value) && (value * 2).rounded() == value * 2
        }
    }
    func fitsWheel(_ text: String) -> Bool {
        guard hasWheel else { return false }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        guard valid(text) else { return false }
        return self != .repetitions || (number(text).map { $0 <= 1000 } ?? false)
    }
    var guidance: String {
        switch self {
        case .weight: return "Kilogram. Je kunt ook een exact gewicht met een komma invullen."
        case .bodyweight: return "Kilogram, groter dan 0. De knoppen veranderen het gewicht met 0,1 kg."
        case .repetitions: return "Vul een heel aantal herhalingen van 0 of meer in."
        case .setCount: return "Kies 1 tot 50 sets."
        case .repTarget: return "Kies 1 tot 1000 herhalingen."
        case .rest: return "Kies 0 tot 60 minuten. Bij 0 wordt geen rusttimer gestart."
        case .rpe: return "Optioneel, van 1 tot 10 in stappen van 0,5."
        }
    }
    func shifted(_ text: String, direction: Int) -> String? {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
        if normalized.isEmpty {
            guard direction > 0 else { return nil }
            return self == .rpe || self == .setCount || self == .repTarget ? "1" : step
        }
        guard valid(text), let current = Decimal(string: normalized, locale: Locale(identifier: "en_US_POSIX")), let change = Decimal(string: step, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        // Decimal arithmetic keeps exact typed values when applying a small step.
        let next = NSDecimalNumber(decimal: current + change * Decimal(direction)).stringValue
        return valid(next) ? next.replacingOccurrences(of: ".", with: ",") : nil
    }
}

struct WorkoutNumberField: View {
    let title: String
    @Binding var text: String
    let kind: WorkoutNumberKind
    let identifier: String
    @State private var editing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline).foregroundStyle(.secondary)
            HStack(spacing: 8) {
                stepButton(-1)
                Button { editing = true } label: {
                    Text(text.isEmpty ? (kind == .rpe ? "Niet ingevuld" : "Invullen") : text.replacingOccurrences(of: ".", with: ","))
                        .font(.title3.weight(.semibold)).monospacedDigit()
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .padding(.horizontal, 8)
                        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(title).accessibilityValue(text.replacingOccurrences(of: ".", with: ","))
                .accessibilityHint("Tik om aan te passen").accessibilityIdentifier(identifier)
                stepButton(1)
            }.buttonStyle(.plain)
        }
        .sheet(isPresented: $editing) { WorkoutNumberSheet(title: title, text: $text, kind: kind, identifier: identifier) }
    }
    private func stepButton(_ direction: Int) -> some View {
        Button { if let next = kind.shifted(text, direction: direction) { text = next } } label: {
            Image(systemName: direction > 0 ? "plus" : "minus")
                .font(.headline).frame(width: 48, height: 56)
                .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        }
        .disabled(kind.shifted(text, direction: direction) == nil)
        .accessibilityLabel(title + (direction > 0 ? " verhogen" : " verlagen"))
        .accessibilityIdentifier(identifier + (direction > 0 ? "-increment" : "-decrement"))
    }
}

struct WorkoutIntegerField: View {
    let title: String
    @Binding var value: Int
    let kind: WorkoutNumberKind
    let identifier: String
    var body: some View {
        WorkoutNumberField(title: title, text: Binding(get: { String(value) }, set: {
            if kind.valid($0), let number = kind.number($0), let integer = Int(exactly: number) { value = integer }
        }), kind: kind, identifier: identifier)
    }
}

private struct WorkoutNumberSheet: View {
    let title: String
    @Binding var text: String
    let kind: WorkoutNumberKind
    let identifier: String
    @Environment(\.dismiss) private var dismiss
    @State private var draft: String
    @State private var typing: Bool
    @FocusState private var inputFocused: Bool

    init(title: String, text: Binding<String>, kind: WorkoutNumberKind, identifier: String) {
        self.title = title; _text = text; self.kind = kind; self.identifier = identifier
        // A sheet owns its draft; cancelling never changes the original value.
        _draft = State(initialValue: text.wrappedValue)
        _typing = State(initialValue: !kind.fitsWheel(text.wrappedValue))
    }
    private var whole: Int { Int(min(3600, max(0, kind.number(draft) ?? 0))) }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if kind.hasWheel {
                        Picker("Invoer", selection: $typing) {
                            Text("Scrollen").tag(false)
                            Text("Typen").tag(true)
                        }.pickerStyle(.segmented).disabled(!kind.fitsWheel(draft)).accessibilityIdentifier("numeric-entry-mode")
                    }
                    if typing || !kind.fitsWheel(draft) {
                        TextField(title, text: $draft).keyboardType(kind.keyboard).focused($inputFocused)
                            .font(.title2).monospacedDigit().frame(minHeight: 56)
                            .textFieldStyle(.roundedBorder).accessibilityLabel(title).accessibilityIdentifier(identifier + "-input")
                        HStack {
                            Button("− " + kind.step.replacingOccurrences(of: ".", with: ",")) { change(-1) }
                                .disabled(kind.shifted(draft, direction: -1) == nil)
                            Spacer()
                            Button("+ " + kind.step.replacingOccurrences(of: ".", with: ",")) { change(1) }
                                .disabled(kind.shifted(draft, direction: 1) == nil)
                        }.buttonStyle(.bordered).controlSize(.large)
                    } else { wheel }
                    Text(kind.guidance).font(.footnote).foregroundStyle(.secondary)
                    if kind == .rpe {
                        Button("Niet ingevuld") { draft = "" }.frame(minHeight: 44)
                    }
                }.padding()
            }
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gereed", action: confirm)
                        .disabled(!kind.valid(draft)).accessibilityIdentifier("numeric-done")
                }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Sluit toetsenbord") { inputFocused = false } }
            }
        }
        .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        .tint(WorkoutStyle.accent).preferredColorScheme(.dark)
    }
    @ViewBuilder private var wheel: some View {
        if kind == .rest {
            HStack {
                Picker("Minuten", selection: Binding(get: { whole / 60 }, set: { draft = String(min(3600, $0 * 60 + whole % 60)) })) {
                    ForEach(0...60, id: \.self) { Text("\($0) min").tag($0) }
                }
                Picker("Seconden", selection: Binding(get: { whole % 60 }, set: { draft = String(whole / 60 * 60 + $0) })) {
                    ForEach(0...59, id: \.self) { Text("\($0) sec").tag($0) }
                }.disabled(whole >= 3600)
            }.pickerStyle(.wheel)
        } else if kind == .rpe {
            Picker(title, selection: Binding(get: { Int(min(10, max(0, kind.number(draft) ?? 0)) * 2) }, set: { draft = $0 == 0 ? "" : String(Double($0) / 2) })) {
                Text("Niet ingevuld").tag(0)
                ForEach(2...20, id: \.self) { Text((Double($0) / 2).formatted()).tag($0) }
            }.pickerStyle(.wheel)
        } else {
            Picker(title, selection: Binding(get: { min(kind.wheelRange.upperBound, max(kind.wheelRange.lowerBound, whole)) }, set: { draft = String($0) })) {
                ForEach(kind.wheelRange, id: \.self) { Text(String($0)).tag($0) }
            }.pickerStyle(.wheel)
        }
    }
    private func change(_ direction: Int) { if let next = kind.shifted(draft, direction: direction) { draft = next } }
    private func confirm() {
        guard kind.valid(draft) else { return }
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        switch kind {
        case .repetitions, .setCount, .repTarget, .rest:
            if let number = kind.number(trimmed), let integer = Int(exactly: number) { text = String(integer) }
            else { text = trimmed }
        default: text = trimmed
        }
        dismiss()
    }
}

struct WorkoutEditor: View {
    @EnvironmentObject private var store: PhoneStore
    @Environment(\.dismiss) private var dismiss
    let request: EditRequest
    @State private var name: String
    @State private var note: String
    @State private var weight: String
    @State private var reps: String
    @State private var rpe: String
    @State private var notes: String
    @State private var date: Date
    @State private var showExtra: Bool
    @State private var saving = false
    @State private var error: String?
    @State private var seededWeight = false
    @FocusState private var focused: String?

    init(request: EditRequest) {
        self.request = request
        // An editor owns its draft once; incoming sync must not overwrite typing.
        let row = request.record
        _name = State(initialValue: row.name); _note = State(initialValue: row.text("note"))
        _weight = State(initialValue: row.fields["weight"]?.number.map { String($0) } ?? "")
        _reps = State(initialValue: row.fields["reps"]?.number.map { WorkoutStyle.value($0) } ?? "")
        _rpe = State(initialValue: row.fields["rpe"]?.number.map { String($0) } ?? "")
        _notes = State(initialValue: row.text("notes"))
        _date = State(initialValue: row.date == .distantPast ? Date() : row.date)
        _showExtra = State(initialValue: request.existing)
    }
    private var isEntity: Bool { request.kind == "brands" || request.kind == "machines" }
    private var title: String {
        let noun = ["brands":"Merk", "machines":"Apparaat", "sets":"Set", "bodyweights":"Meting"][request.kind] ?? "Onderdeel"
        return noun + (request.existing ? " wijzigen" : " toevoegen")
    }
    private func decimal(_ text: String) -> Double? {
        guard let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")), value.isFinite else { return nil }
        return value
    }
    private var valid: Bool {
        if isEntity { return !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.count <= 80 && (request.kind != "machines" || note.count <= 180) }
        guard let w = decimal(weight), request.kind == "bodyweights" ? w > 0 : w >= 0 else { return false }
        if request.kind == "sets" {
            guard let count = decimal(reps), count >= 0, count.rounded() == count else { return false }
            if !rpe.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                guard let effort = decimal(rpe), (1...10).contains(effort), (effort * 2).rounded() == effort * 2 else { return false }
            }
        }
        return true
    }
    var body: some View {
        NavigationStack {
            Form {
                if isEntity { entityFields } else { numberFields }
                if let error { Section { Text(error).foregroundStyle(.red).accessibilityIdentifier("editor-error") } }
                Section { Button { Task { await save() } } label: { HStack { Spacer(); if saving { ProgressView() }; Text("Bewaar"); Spacer() } }.disabled(!valid || saving).accessibilityIdentifier("save-bottom") }
            }
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuleer") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button("Bewaar") { Task { await save() } }.disabled(!valid || saving).accessibilityIdentifier("save-top") }
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Gereed") { focused = nil } }
            }
            .interactiveDismissDisabled(saving)
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear {
            guard !seededWeight else { return }
            seededWeight = true
            if !request.existing, request.kind == "sets", weight.isEmpty,
               let last = store.data.setsByMachine[request.record.text("machineId")]?.last {
                weight = String(last.number("weight"))
            }
        }
        .tint(WorkoutStyle.accent).preferredColorScheme(.dark)
    }
    private var entityFields: some View {
        Section {
            TextField(request.kind == "brands" ? "Merknaam" : "Apparaatnaam", text: $name).focused($focused, equals: "name").accessibilityIdentifier("entity-name")
            if request.kind == "machines" { TextField("Apparaatnotitie", text: $note, axis: .vertical).lineLimit(3...6).focused($focused, equals: "note").accessibilityIdentifier("machine-note") }
        } footer: { Text(request.kind == "machines" ? "De notitie blijft zichtbaar bij je trainingshistorie. Naam: maximaal 80 tekens; notitie: 180." : "Gebruik de naam van het merk van je apparaten. Maximaal 80 tekens.") }
    }
    @ViewBuilder private var numberFields: some View {
        if request.kind == "sets", let machine = store.machines.first(where: { $0.id == request.record.text("machineId") }) {
            Section {
                Text(machine.name).font(.headline)
                Text(store.brandName(machine)).foregroundStyle(.secondary)
                if !machine.text("note").isEmpty { Text(machine.text("note")).font(.subheadline).foregroundStyle(.secondary) }
            }
        }
        Section {
            WorkoutNumberField(title: "Gewicht (kg)", text: $weight, kind: request.kind == "bodyweights" ? .bodyweight : .weight, identifier: "set-weight")
            if request.kind == "sets" {
                WorkoutNumberField(title: "Herhalingen", text: $reps, kind: .repetitions, identifier: "set-reps")
            } else { DatePicker("Datum", selection: $date, displayedComponents: .date) }
        }
        if request.kind == "sets" {
            Section {
                DisclosureGroup("Extra", isExpanded: $showExtra) {
                    DatePicker("Datum en tijd", selection: $date, displayedComponents: [.date, .hourAndMinute])
                    WorkoutNumberField(title: "RPE (1–10)", text: $rpe, kind: .rpe, identifier: "set-rpe")
                    TextField("Notities", text: $notes, axis: .vertical).lineLimit(3...6).focused($focused, equals: "notes").accessibilityIdentifier("set-notes")
                }
            } footer: { Text("Gewicht en herhalingen zijn verplicht. RPE is optioneel, in stappen van 0,5.") }
        }
    }
    private func save() async {
        guard valid, !saving else { return }
        saving = true; error = nil
        defer { saving = false }
        var row = request.record
        if isEntity {
            row.fields["name"] = .string(name.trimmingCharacters(in: .whitespacesAndNewlines))
            if request.kind == "machines" { row.fields["note"] = .string(note.trimmingCharacters(in: .whitespacesAndNewlines)) }
            if !request.existing { row.fields["sortOrder"] = .number(Double(request.kind == "brands" ? store.brands.count : store.machines.filter { $0.text("brandId") == row.text("brandId") }.count)) }
        } else {
            row.fields["weight"] = .number(decimal(weight)!)
            let stamp = ISO8601DateFormatter(); stamp.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            row.fields["loggedAt"] = .string(stamp.string(from: date))
            if request.kind == "sets" {
                row.fields["reps"] = .number(decimal(reps)!)
                row.fields["rpe"] = decimal(rpe).map(WorkoutJSON.number) ?? .string("")
                row.fields["notes"] = .string(notes.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }
        do { try await store.save(kind: request.kind, row: row, existing: request.existing); dismiss() }
        catch { self.error = (error as? PhoneDataError)?.localizedDescription ?? PhoneDataError.storage.localizedDescription }
    }
}

struct PhoneSettingsScreen: View {
    @EnvironmentObject private var store: PhoneStore
    @AppStorage("trainingDefaultSetCount") private var defaultSetCount = 2
    @AppStorage("trainingDefaultRepMin") private var defaultRepMin = 5
    @AppStorage("trainingDefaultRepMax") private var defaultRepMax = 8
    @AppStorage("trainingRestTimerEnabled") private var restTimerEnabled = true
    @State private var importing = false
    @State private var exporting = false
    @State private var working = false
    @State private var enableCloud = false
    @State private var document = WorkoutBackupDocument(data: Data())
    var body: some View {
        Form {
            Section {
                WorkoutIntegerField(title: "Standaard aantal sets", value: $defaultSetCount, kind: .setCount, identifier: "default-set-count")
                WorkoutIntegerField(title: "Standaard minimum herhalingen", value: Binding(get: { defaultRepMin }, set: { defaultRepMin = $0; defaultRepMax = max(defaultRepMax, $0) }), kind: .repTarget, identifier: "default-rep-min")
                WorkoutIntegerField(title: "Standaard maximum herhalingen", value: Binding(get: { defaultRepMax }, set: { defaultRepMax = $0; defaultRepMin = min(defaultRepMin, $0) }), kind: .repTarget, identifier: "default-rep-max")
                Toggle("Rusttimer gebruiken", isOn: $restTimerEnabled).accessibilityIdentifier("training-rest-timer")
            } header: { Text("Trainingsschema’s") } footer: {
                Text("Het aantal sets en de reprange gelden voor nieuwe apparaten in een schema. Bestaande schema’s blijven hetzelfde. De rusttimer start na het opslaan van een set tijdens een schematraining.")
            }
            Section("iCloud") {
                Toggle("Synchroniseer met iCloud", isOn: Binding(get: { store.cloudEnabled }, set: { enabled in
                    if enabled { enableCloud = true } else { Task { await store.setCloudEnabled(false) } }
                })).disabled(store.syncBusy || !cloudSupported)
                Text(store.cloudMessage).font(.footnote).foregroundStyle(.secondary)
                if store.cloudEnabled { Button("Synchroniseer nu") { Task { await store.refresh(manual: true) } }.disabled(store.syncBusy) }
                if store.syncBusy { ProgressView("Synchroniseren…") }
            }
            Section {
                Button { export() } label: { Label("Exporteer data", systemImage: "square.and.arrow.up") }.disabled(working)
                Button { importing = true } label: { Label("Importeer data", systemImage: "square.and.arrow.down") }.disabled(working)
                if working { ProgressView("Back-up verwerken…") }
            } header: { Text("Back-up") } footer: {
                Text("Back-ups zijn uitwisselbaar met de PWA. Import voegt gegevens samen; bestaande vermeldingen uit de back-up worden bijgewerkt. Je andere gegevens blijven staan.")
            }
            Section("Apple Watch") {
                Text(store.watchError ? "Watch-uitwisseling is niet voltooid. De sets blijven bewaard; probeer opnieuw." : "Merken, apparaten en sets worden met je gekoppelde Watch uitgewisseld.").font(.footnote).foregroundStyle(.secondary)
                Button("Watch bijwerken") { Task { await store.refresh() } }.disabled(store.syncBusy)
            }
            Section("App") {
                LabeledContent("Versie", value: "\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""))")
                Text("Nieuwe versies installeer je via TestFlight of de App Store.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Instellingen")
        .confirmationDialog("iCloud inschakelen?", isPresented: $enableCloud, titleVisibility: .visible) {
            Button("Schakel iCloud in") { Task { await store.setCloudEnabled(true) } }
        } message: { Text("Je merken, apparaten, sets en gewichtsmetingen worden samengevoegd met je persoonlijke iCloud. JSON-back-ups blijven beschikbaar.") }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            switch result {
            case .success(let url):
                working = true
                Task {
                    defer { working = false }
                    do {
                        let data = try await Task.detached(priority: .userInitiated) {
                            let access = url.startAccessingSecurityScopedResource()
                            defer { if access { url.stopAccessingSecurityScopedResource() } }
                            return try Data(contentsOf: url)
                        }.value
                        try await store.importBackup(data)
                    } catch { store.error = (error as? PhoneDataError)?.localizedDescription ?? "De back-up kon niet worden gelezen. Kies het bestand opnieuw." }
                }
            case .failure: store.error = "Het bestand kon niet worden geopend. Probeer opnieuw."
            }
        }
        .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "workout-tracker-export-\(Date().formatted(.iso8601.year().month().day().dateSeparator(.dash)))") { result in
            if case .failure = result { store.error = "Exporteren is niet gelukt. Probeer opnieuw." }
        }
    }
    private var cloudSupported: Bool { if #available(iOS 17, *) { return true }; return false }
    private func export() {
        working = true
        Task {
            defer { working = false }
            do { document = WorkoutBackupDocument(data: try await store.exportBackup()); exporting = true }
            catch { store.error = "De back-up kon niet worden gemaakt. Probeer opnieuw." }
        }
    }
}
