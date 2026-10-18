import SwiftUI
import UniformTypeIdentifiers

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
        }.tint(WorkoutStyle.accent).preferredColorScheme(.dark)
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
            LabeledContent { TextField("0", text: $weight).keyboardType(.decimalPad).multilineTextAlignment(.trailing).focused($focused, equals: "weight").accessibilityLabel("Gewicht in kilogram").accessibilityIdentifier("set-weight") } label: { Text("Gewicht (kg)") }
            if request.kind == "sets" {
                LabeledContent { TextField("0", text: $reps).keyboardType(.numberPad).multilineTextAlignment(.trailing).focused($focused, equals: "reps").accessibilityLabel("Herhalingen").accessibilityIdentifier("set-reps") } label: { Text("Herhalingen") }
            } else { DatePicker("Datum", selection: $date, displayedComponents: .date) }
        }
        if request.kind == "sets" {
            Section {
                DisclosureGroup("Extra", isExpanded: $showExtra) {
                    DatePicker("Datum en tijd", selection: $date, displayedComponents: [.date, .hourAndMinute])
                    LabeledContent { TextField("Optioneel", text: $rpe).keyboardType(.decimalPad).multilineTextAlignment(.trailing).focused($focused, equals: "rpe").accessibilityLabel("RPE").accessibilityIdentifier("set-rpe") } label: { Text("RPE (1–10)") }
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
    @State private var importing = false
    @State private var exporting = false
    @State private var working = false
    @State private var enableCloud = false
    @State private var document = WorkoutBackupDocument(data: Data())
    var body: some View {
        Form {
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
                Text("Back-ups zijn uitwisselbaar met de PWA. Import voegt gegevens samen; bestaande record-ID’s worden bijgewerkt. Je andere gegevens blijven staan.")
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
        do { document = WorkoutBackupDocument(data: try store.exportBackup()); exporting = true }
        catch { store.error = "De back-up kon niet worden gemaakt. Probeer opnieuw." }
    }
}
