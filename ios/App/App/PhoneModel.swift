import Foundation

// Keep unrecognised record fields intact when exchanging backups with the PWA.
enum WorkoutJSON: Codable, Equatable, Sendable {
    case string(String), number(Double), bool(Bool), object([String: WorkoutJSON]), array([WorkoutJSON]), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([String: WorkoutJSON].self) { self = .object(v) }
        else { self = .array(try c.decode([WorkoutJSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    var text: String { if case .string(let v) = self { return v }; return "" }
    var number: Double? {
        switch self {
        case .number(let n): return n.isFinite ? n : nil
        case .string(let s): guard let n = Double(s), n.isFinite else { return nil }; return n
        default: return nil
        }
    }
}

struct WorkoutRecord: Codable, Identifiable, Equatable, Sendable {
    var fields: [String: WorkoutJSON] {
        didSet {
            if fields["loggedAt"] != oldValue["loggedAt"] { date = WatchSet.date(text("loggedAt")) ?? .distantPast }
            if fields["createdAt"] != oldValue["createdAt"] { createdDate = WatchSet.date(text("createdAt")) ?? .distantFuture }
        }
    }
    private(set) var date: Date
    private(set) var createdDate: Date
    init(_ fields: [String: WorkoutJSON]) {
        self.fields = fields
        date = WatchSet.date(fields["loggedAt"]?.text ?? "") ?? .distantPast
        createdDate = WatchSet.date(fields["createdAt"]?.text ?? "") ?? .distantFuture
    }
    init(from decoder: Decoder) throws { self.init(try decoder.singleValueContainer().decode([String: WorkoutJSON].self)) }
    func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encode(fields) }
    var id: String { text("id") }
    func text(_ key: String) -> String { fields[key]?.text ?? "" }
    func number(_ key: String) -> Double { fields[key]?.number ?? 0 }
    var name: String { text("name") }
    var e1rm: Double { number("weight") * (1 + number("reps") / 30) }
    var volume: Double { number("weight") * number("reps") }
    func validate(kind: String, strict: Bool = true) throws {
        guard !id.isEmpty else { throw PhoneDataError.invalidBackup }
        guard strict else { return }
        switch kind {
        case "brands": guard !name.isEmpty else { throw PhoneDataError.invalidBackup }
        case "machines": guard !name.isEmpty, !text("brandId").isEmpty else { throw PhoneDataError.invalidBackup }
        case "plans", "sessions": try TrainingDocument(record: self).validate(kind: kind)
        case "sets", "bodyweights":
            guard let weight = fields["weight"]?.number, weight >= 0, WatchSet.date(text("loggedAt")) != nil else { throw PhoneDataError.invalidBackup }
            if kind == "sets" {
                guard !text("machineId").isEmpty, let reps = fields["reps"]?.number, reps >= 0, reps.rounded() == reps else { throw PhoneDataError.invalidBackup }
            }
        default: throw PhoneDataError.invalidBackup
        }
    }
}

enum PhoneDataError: LocalizedError {
    case invalidBackup, unsupportedVersion, storage, notReady, deleted, account, missingTrainingMachine, trainingFinished
    var errorDescription: String? {
        switch self {
        case .missingTrainingMachine: return "Een apparaat uit dit schema is verwijderd. Wijzig het schema en kies een bestaand apparaat."
        case .trainingFinished: return "Deze training of dit apparaat is al afgerond. Je opgeslagen sets blijven bewaard."
        case .invalidBackup: return "Dit bestand bevat ongeldige gegevens. Er is niets geïmporteerd. Kies een Workout Log-back-up."
        case .unsupportedVersion: return "Deze back-up hoort bij een nieuwere versie. Werk de app bij om hem te importeren."
        case .storage: return "Opslaan of lezen is niet gelukt. Je bestaande gegevens blijven bewaard. Probeer opnieuw; verwijder de app niet."
        case .notReady: return "Je bestaande gegevens zijn nog niet overgenomen. Probeer opnieuw."
        case .deleted: return "Dit onderdeel is intussen verwijderd. Sluit dit scherm en probeer opnieuw."
        case .account: return "Er is een ander iCloud-account actief. Gebruik het oorspronkelijke account; je lokale gegevens blijven bewaard."
        }
    }
}

struct PhoneBackup: Codable, Sendable {
    var version = 2
    var exportedAt = WatchSet.timestamp()
    var brands: [WorkoutRecord] = []
    var machines: [WorkoutRecord] = []
    var sets: [WorkoutRecord] = []
    var bodyweights: [WorkoutRecord] = []
    var plans: [WorkoutRecord] = []
    var sessions: [WorkoutRecord] = []
    static let kinds = ["brands", "machines", "sets", "bodyweights", "plans", "sessions"]
    var collections: [(String, [WorkoutRecord])] { [("brands", brands), ("machines", machines), ("sets", sets), ("bodyweights", bodyweights), ("plans", plans), ("sessions", sessions)] }
    var count: Int { collections.reduce(0) { $0 + $1.1.count } }
    enum CodingKeys: String, CodingKey { case version, exportedAt, brands, machines, sets, bodyweights, plans, sessions }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 1
        guard (1...2).contains(version) else { throw PhoneDataError.unsupportedVersion }
        exportedAt = try c.decodeIfPresent(String.self, forKey: .exportedAt) ?? ""
        brands = try c.decodeIfPresent([WorkoutRecord].self, forKey: .brands) ?? []
        machines = try c.decodeIfPresent([WorkoutRecord].self, forKey: .machines) ?? []
        sets = try c.decodeIfPresent([WorkoutRecord].self, forKey: .sets) ?? []
        bodyweights = try c.decodeIfPresent([WorkoutRecord].self, forKey: .bodyweights) ?? []
        plans = try c.decodeIfPresent([WorkoutRecord].self, forKey: .plans) ?? []
        sessions = try c.decodeIfPresent([WorkoutRecord].self, forKey: .sessions) ?? []
    }
    func validate(strict: Bool = true) throws {
        guard (1...2).contains(version) else { throw PhoneDataError.unsupportedVersion }
        for (kind, rows) in collections {
            guard Set(rows.map(\.id)).count == rows.count else { throw PhoneDataError.invalidBackup }
            for row in rows { try row.validate(kind: kind, strict: strict) }
        }
    }
}

struct LegacyPhoneData: Codable {
    let backup: PhoneBackup
    let journal: [WorkoutEnvelope]
    let owner: String
    let chartMode: String
}

struct PhoneSnapshot: Codable, Equatable, Sendable {
    var version = 1
    var migrated = false
    var records: [String: WorkoutEnvelope] = [:]
    var owner = ""
    var chartMode = "e1rmMax"
    var clock: Int64 = 0

    func rows(_ kind: String) -> [WorkoutRecord] {
        records.values.filter { $0.kind == kind && !$0.deleted }.compactMap {
            guard let value = $0.value else { return nil }
            return try? JSONDecoder().decode(WorkoutRecord.self, from: Data(value.utf8))
        }.sorted { Self.ordered($0, $1, kind: kind) }
    }
    static func ordered(_ a: WorkoutRecord, _ b: WorkoutRecord, kind: String) -> Bool {
        if kind == "brands" || kind == "machines" || kind == "plans" {
            if a.number("sortOrder") != b.number("sortOrder") { return a.number("sortOrder") < b.number("sortOrder") }
            if a.name != b.name { return a.name.localizedStandardCompare(b.name) == .orderedAscending }
        } else if a.date != b.date { return a.date < b.date }
        return a.id < b.id
    }
    func backup() -> PhoneBackup {
        var b = PhoneBackup()
        b.brands = rows("brands"); b.machines = rows("machines"); b.sets = rows("sets"); b.bodyweights = rows("bodyweights")
        b.plans = rows("plans"); b.sessions = rows("sessions")
        return b
    }
    mutating func merge(_ entries: [WorkoutEnvelope]) throws {
        // Identical envelopes have already passed validation; sync often replays the whole history.
        for e in entries where e != records[e.key] {
            try e.validate()
            if !e.deleted {
                let record = try JSONDecoder().decode(WorkoutRecord.self, from: Data((e.value ?? "").utf8))
                if e.kind == "plans" || e.kind == "sessions" { try record.validate(kind: e.kind) }
            }
        }
        for e in entries {
            clock = max(clock, Int64(e.revision.prefix(16)) ?? 0)
            if e.isNewer(than: records[e.key]) { records[e.key] = e }
        }
    }
    mutating func put(kind: String, record: WorkoutRecord, deleted: Bool = false, updateTimestamp: Bool = true) throws {
        try record.validate(kind: kind, strict: false)
        guard PhoneBackup.kinds.contains(kind), clock < 9_007_199_254_740_990 else { throw PhoneDataError.invalidBackup }
        clock = max(clock, Int64(Date().timeIntervalSince1970 * 1000)) + 1
        var row = record
        if updateTimestamp { row.fields["updatedAt"] = .string(WatchSet.timestamp()) }
        let e = WorkoutEnvelope(version: 1, key: "\(kind):\(row.id)", kind: kind, id: row.id,
            revision: String(format: "%016lld", clock) + "-" + UUID().uuidString, deleted: deleted,
            value: deleted ? nil : String(decoding: try Self.encoder().encode(row), as: UTF8.self))
        try e.validate(); records[e.key] = e
    }
    mutating func migrate(_ legacy: LegacyPhoneData) throws {
        guard !migrated else { return }
        try legacy.backup.validate(strict: false)
        try merge(legacy.journal)
        for (kind, rows) in legacy.backup.collections {
            for row in rows {
                let key = "\(kind):\(row.id)"
                if records[key] == nil {
                    let date = WatchSet.date(row.text("updatedAt")) ?? WatchSet.date(row.text("createdAt")) ?? Date(timeIntervalSince1970: 0)
                    let time = max(0, min(Int64(date.timeIntervalSince1970 * 1000), Int64(Date().timeIntervalSince1970 * 1000)))
                    let e = WorkoutEnvelope(version: 1, key: key, kind: kind, id: row.id, revision: String(format: "%016lld", time) + "-legacy", deleted: false, value: String(decoding: try Self.encoder().encode(row), as: UTF8.self))
                    try merge([e])
                }
            }
        }
        owner = legacy.owner
        if Self.chartModes.contains(legacy.chartMode) { chartMode = legacy.chartMode }
        migrated = true
    }
    static let chartModes = ["e1rmMax", "volumeMax", "set1", "set2", "set3"]
    static func encoder() -> JSONEncoder { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return e }
}

actor PhoneRepository {
    private let url: URL
    private var snapshot: PhoneSnapshot
    private var generation = 0
    private var cachedPresentation: PhonePresentation?
    private var cachedWatch: (generation: Int, text: String)?
    init(url: URL) throws {
        self.url = url
        if FileManager.default.fileExists(atPath: url.path) {
            snapshot = try JSONDecoder().decode(PhoneSnapshot.self, from: Data(contentsOf: url))
            guard snapshot.version == 1 else { throw PhoneDataError.unsupportedVersion }
            for entry in snapshot.records.values { try entry.validate() }
        } else { snapshot = PhoneSnapshot() }
    }
    func read() -> PhoneSnapshot { snapshot }
    func presentation() -> PhonePresentation {
        if let cachedPresentation, cachedPresentation.generation == generation {
            if cachedPresentation.calendar == Calendar.current { return cachedPresentation }
            generation += 1
        }
        let next = PhonePresentation(snapshot: snapshot, generation: generation, previous: cachedPresentation)
        cachedPresentation = next
        return next
    }
    func exportBackup() throws -> Data { try PhoneSnapshot.encoder().encode(snapshot.backup()) }
    func cloudChanges() throws -> String {
        String(decoding: try PhoneSnapshot.encoder().encode(Array(snapshot.records.values)), as: UTF8.self)
    }
    func mergeJSON(_ text: String, owner: String? = nil, fromWatch: Bool = false) throws {
        let entries = try JSONDecoder().decode([WorkoutEnvelope].self, from: Data(text.utf8))
        if fromWatch { for entry in entries { _ = try entry.watchSet() } }
        _ = try merge(entries, owner: owner)
    }
    func watchSnapshot() throws -> String {
        let data = presentation()
        if let cachedWatch, cachedWatch.generation == generation { return cachedWatch.text }
        var watch = WatchSnapshot()
        watch.brands = data.brands.map { WatchBrand(id: $0.id, name: $0.name) }
        watch.machines = data.machines.map { WatchMachine(id: $0.id, name: $0.name, brandId: $0.text("brandId")) }
        watch.lastSets = data.machines.compactMap { machine in
            guard let last = data.setsByMachine[machine.id]?.last else { return nil }
            return try? JSONDecoder().decode(WatchSet.self, from: PhoneSnapshot.encoder().encode(last))
        }
        watch.watchRecords = snapshot.records.values.filter { $0.kind == "sets" && $0.id.hasPrefix("watch-") }.sorted { $0.key < $1.key }
        let text = String(decoding: try PhoneSnapshot.encoder().encode(watch), as: UTF8.self)
        cachedWatch = (generation, text)
        return text
    }
    #if DEBUG
    func seedLargeTestHistory() throws {
        guard !snapshot.migrated else { return }
        _ = try migrate(Data("{\"backup\":{\"version\":1},\"journal\":[],\"owner\":\"\",\"chartMode\":\"e1rmMax\"}".utf8))
        var backup = PhoneBackup()
        backup.brands = [WorkoutRecord(["id": .string("large-brand"), "name": .string("Testhistorie")])]
        backup.machines = (0..<30).map {
            WorkoutRecord(["id": .string("machine-\($0)"), "brandId": .string("large-brand"),
                           "name": .string(String(format: "Apparaat %02d", $0)), "sortOrder": .number(Double($0))])
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        backup.sets = (0..<5000).map {
            let stamp = formatter.string(from: Date(timeIntervalSince1970: 1_700_000_000 + Double($0) * 1800))
            return WorkoutRecord(["id": .string("large-set-\($0)"), "machineId": .string("machine-\($0 % 30)"),
                                  "weight": .number(Double(20 + $0 % 80)), "reps": .number(8),
                                  "loggedAt": .string(stamp), "createdAt": .string(stamp)])
        }
        _ = try importBackup(PhoneSnapshot.encoder().encode(backup))
    }
    #endif
    private func commit(_ next: PhoneSnapshot) throws -> PhoneSnapshot {
        let data = try PhoneSnapshot.encoder().encode(next)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        snapshot = next
        generation += 1
        return next
    }
    func migrate(_ data: Data) throws -> PhoneSnapshot {
        guard !snapshot.migrated else { return snapshot }
        let legacy = try JSONDecoder().decode(LegacyPhoneData.self, from: data)
        var next = snapshot; try next.migrate(legacy)
        // Keep a separate recovery copy before marking migration complete.
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url.deletingLastPathComponent().appendingPathComponent("legacy-recovery-v1.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return try commit(next)
    }
    func save(kind: String, record: WorkoutRecord, existing: Bool) throws -> PhoneSnapshot {
        guard snapshot.migrated else { throw PhoneDataError.notReady }
        guard !existing || snapshot.records["\(kind):\(record.id)"]?.deleted == false else { throw PhoneDataError.deleted }
        if kind == "machines", snapshot.records["brands:\(record.text("brandId"))"]?.deleted != false { throw PhoneDataError.deleted }
        if kind == "sets", snapshot.records["machines:\(record.text("machineId"))"]?.deleted != false { throw PhoneDataError.deleted }
        if kind == "sessions", existing,
           presentation().sessions.first(where: { $0.id == record.id })?.status == "completed", record.text("status") == "active" { throw PhoneDataError.trainingFinished }
        try record.validate(kind: kind)
        var next = snapshot; try next.put(kind: kind, record: record)
        return try commit(next)
    }
    func importBackup(_ data: Data) throws -> PhoneSnapshot {
        guard snapshot.migrated else { throw PhoneDataError.notReady }
        let backup = try JSONDecoder().decode(PhoneBackup.self, from: data)
        try backup.validate()
        guard backup.count > 0 else { throw PhoneDataError.invalidBackup }
        var next = snapshot
        for (kind, rows) in backup.collections { for row in rows { try next.put(kind: kind, record: row, updateTimestamp: false) } }
        return try commit(next)
    }
    func trainingSet(sessionID: String, itemID: String, setID: String, weight: Double, reps: Int, undo: Bool, restTimerEnabled: Bool = true) throws {
        let data = presentation()
        guard let original = data.sessionRecords[sessionID], var session = data.sessions.first(where: { $0.id == sessionID }), session.status == "active",
              let itemIndex = session.items.firstIndex(where: { $0.id == itemID }),
              let setIndex = session.items[itemIndex].sets?.firstIndex(where: { $0.id == setID }) else { throw PhoneDataError.trainingFinished }
        let item = session.items[itemIndex], planned = item.sets![setIndex]
        guard data.machinesByID[item.machineId] != nil else { throw PhoneDataError.missingTrainingMachine }
        guard weight.isFinite, (0...2000).contains(weight), (1...1000).contains(reps) else { throw PhoneDataError.invalidBackup }
        var next = snapshot
        if undo {
            guard let saved = data.setsByID[setID], saved.text("sessionId") == sessionID else { return }
            try next.put(kind: "sets", record: saved, deleted: true); session.restUntil = nil
        } else {
            // Repeated taps/retries use the planned ID and cannot create another set.
            guard data.setsByID[setID] == nil else { return }
            let stamp = WatchSet.timestamp()
            let saved = WorkoutRecord(["id": .string(planned.id), "machineId": .string(item.machineId), "sessionId": .string(sessionID),
                                       "trainingItemId": .string(itemID), "weight": .number(weight), "reps": .number(Double(reps)),
                                       "createdAt": .string(stamp), "loggedAt": .string(stamp)])
            try next.put(kind: "sets", record: saved)
            // Persist the actual values with the set so undo and resume cannot restore an old suggestion.
            session.items[itemIndex].sets?[setIndex].weight = weight
            session.items[itemIndex].sets?[setIndex].reps = reps
            session.restUntil = restTimerEnabled && item.restSeconds > 0 ? ISO8601DateFormatter().string(from: Date().addingTimeInterval(Double(item.restSeconds))) : nil
        }
        try next.put(kind: "sessions", record: session.record(preserving: original))
        _ = try commit(next)
    }
    func merge(_ entries: [WorkoutEnvelope], owner: String? = nil) throws -> PhoneSnapshot {
        guard snapshot.migrated else { throw PhoneDataError.notReady }
        if let owner, owner.isEmpty || (!snapshot.owner.isEmpty && snapshot.owner != owner) { throw PhoneDataError.account }
        var next = snapshot
        if let owner { next.owner = owner }
        try next.merge(entries)
        return next == snapshot ? snapshot : try commit(next)
    }
    func remove(kind: String, id: String) throws -> (PhoneSnapshot, [String: [WorkoutRecord]]) {
        guard snapshot.migrated else { throw PhoneDataError.notReady }
        var removed: [String: [WorkoutRecord]] = [kind: snapshot.rows(kind).filter { $0.id == id }]
        if kind == "brands" { removed["machines"] = snapshot.rows("machines").filter { $0.text("brandId") == id } }
        if kind == "brands" || kind == "machines" {
            let machines = kind == "machines" ? Set([id]) : Set((removed["machines"] ?? []).map(\.id))
            removed["sets"] = snapshot.rows("sets").filter { machines.contains($0.text("machineId")) }
        }
        var next = snapshot
        for (kind, rows) in removed { for row in rows { try next.put(kind: kind, record: row, deleted: true) } }
        return (try commit(next), removed)
    }
    func restore(_ rows: [String: [WorkoutRecord]]) throws -> PhoneSnapshot {
        var next = snapshot
        for (kind, records) in rows { for row in records { try next.put(kind: kind, record: row) } }
        return try commit(next)
    }
    func reorder(kind: String, ids: [String]) throws -> PhoneSnapshot {
        var next = snapshot
        let rows = Dictionary(uniqueKeysWithValues: next.rows(kind).map { ($0.id, $0) })
        for (index, id) in ids.enumerated() {
            guard var row = rows[id] else { continue }
            row.fields["sortOrder"] = .number(Double(index)); try next.put(kind: kind, record: row)
        }
        return try commit(next)
    }
    func preference(_ mode: String) throws -> PhoneSnapshot {
        guard PhoneSnapshot.chartModes.contains(mode) else { throw PhoneDataError.invalidBackup }
        var next = snapshot; next.chartMode = mode; return try commit(next)
    }
}

struct WorkoutDay: Identifiable, Sendable { let date: Date; let entries: [WorkoutRecord]; var id: Date { date } }
struct WorkoutPoint: Identifiable, Equatable, Sendable { let id: String; let date: Date; let value: Double }

struct WorkoutHistory: Sendable {
    var days: [WorkoutDay] = []
    var records = Set<String>()
    var points: [WorkoutPoint] = []
}

// Derived data is prepared on the repository actor, never while SwiftUI builds a row.
struct PhonePresentation: Sendable {
    let snapshot: PhoneSnapshot
    let generation: Int
    let calendar = Calendar.current
    private var decoded: [String: WorkoutRecord] = [:]
    var brands: [WorkoutRecord] = []
    var machines: [WorkoutRecord] = []
    var sets: [WorkoutRecord] = []
    var bodyweights: [WorkoutRecord] = []
    var brandsByID: [String: WorkoutRecord] = [:]
    var machinesByID: [String: WorkoutRecord] = [:]
    var machinesByBrand: [String: [WorkoutRecord]] = [:]
    var setsByMachine: [String: [WorkoutRecord]] = [:]
    var setsByID: [String: WorkoutRecord] = [:]
    var setsBySession: [String: [WorkoutRecord]] = [:]
    var plans: [TrainingDocument] = []
    var sessions: [TrainingDocument] = []
    var planRecords: [String: WorkoutRecord] = [:]
    var sessionRecords: [String: WorkoutRecord] = [:]
    var histories: [String: WorkoutHistory] = [:]
    var recentDays: [WorkoutDay] = []
    var bodyweightPoints: [WorkoutPoint] = []

    init(snapshot: PhoneSnapshot = PhoneSnapshot(), generation: Int = 0, previous: PhonePresentation? = nil) {
        self.snapshot = snapshot; self.generation = generation
        var collections: [String: [WorkoutRecord]] = [:]
        for entry in snapshot.records.values where !entry.deleted {
            let row: WorkoutRecord?
            if previous?.snapshot.records[entry.key] == entry { row = previous?.decoded[entry.key] }
            else { row = entry.value.flatMap { try? JSONDecoder().decode(WorkoutRecord.self, from: Data($0.utf8)) } }
            if let row { decoded[entry.key] = row; collections[entry.kind, default: []].append(row) }
        }
        func rows(_ kind: String) -> [WorkoutRecord] {
            (collections[kind] ?? []).sorted { PhoneSnapshot.ordered($0, $1, kind: kind) }
        }
        brands = rows("brands")
        brandsByID = Dictionary(uniqueKeysWithValues: brands.map { ($0.id, $0) })
        machines = rows("machines").filter { brandsByID[$0.text("brandId")] != nil }
        machinesByID = Dictionary(uniqueKeysWithValues: machines.map { ($0.id, $0) })
        machinesByBrand = Dictionary(grouping: machines) { $0.text("brandId") }
        sets = rows("sets").filter { machinesByID[$0.text("machineId")] != nil }
        setsByMachine = Dictionary(grouping: sets) { $0.text("machineId") }
        for id in Array(setsByMachine.keys) { setsByMachine[id]?.sort(by: WorkoutMetrics.chronological) }
        setsByID = Dictionary(uniqueKeysWithValues: sets.map { ($0.id, $0) })
        setsBySession = Dictionary(grouping: sets.filter { !$0.text("sessionId").isEmpty }) { $0.text("sessionId") }
        planRecords = Dictionary(uniqueKeysWithValues: rows("plans").map { ($0.id, $0) })
        sessionRecords = Dictionary(uniqueKeysWithValues: rows("sessions").map { ($0.id, $0) })
        plans = rows("plans").compactMap { try? TrainingDocument(record: $0) }
        sessions = rows("sessions").reversed().compactMap { try? TrainingDocument(record: $0) }
        for (id, entries) in setsByMachine {
            let days = WorkoutMetrics.days(entries)
            histories[id] = WorkoutHistory(days: days, records: WorkoutMetrics.records(entries),
                                           points: WorkoutMetrics.chart(days: days, mode: snapshot.chartMode))
        }
        recentDays = WorkoutMetrics.days(sets)
        bodyweights = rows("bodyweights")
        bodyweightPoints = bodyweights.filter { $0.date != .distantPast }.map { WorkoutPoint(id: $0.id, date: $0.date, value: $0.number("weight")) }
    }
}
enum WorkoutMetrics {
    static func valueRange(_ values: [Double]) -> ClosedRange<Double> {
        guard let low = values.min(), let high = values.max() else { return 0...1 }
        let padding = high > low ? (high - low) * 0.1 : max(abs(low) * 0.05, 1)
        return (low >= 0 ? max(0, low - padding) : low - padding)...(high + padding)
    }
    static func dateRange(_ dates: [Date]) -> ClosedRange<Date> {
        guard let first = dates.min(), let last = dates.max() else { return Date(timeIntervalSince1970: 0)...Date(timeIntervalSince1970: 86400) }
        if first != last { return first...last }
        return (Calendar.current.date(byAdding: .day, value: -1, to: first) ?? first.addingTimeInterval(-86400))...(Calendar.current.date(byAdding: .day, value: 1, to: last) ?? last.addingTimeInterval(86400))
    }
    static func chronological(_ a: WorkoutRecord, _ b: WorkoutRecord) -> Bool {
        if a.date != b.date { return a.date < b.date }
        let ac = a.createdDate
        let bc = b.createdDate
        return ac != bc ? ac < bc : a.id < b.id
    }
    static func days(_ entries: [WorkoutRecord]) -> [WorkoutDay] {
        Dictionary(grouping: entries) { Calendar.current.startOfDay(for: $0.date) }.map {
            WorkoutDay(date: $0.key, entries: $0.value.sorted(by: chronological))
        }.sorted { $0.date > $1.date }
    }
    static func records(_ entries: [WorkoutRecord]) -> Set<String> {
        var result = Set<String>(), best = -Double.infinity
        for row in entries.sorted(by: chronological) where row.number("weight") > 0 && row.number("reps") > 0 && row.date != .distantPast {
            let tolerance = Double.ulpOfOne * max(1, abs(row.e1rm), best.isFinite ? abs(best) : 1) * 8
            if row.e1rm - best > tolerance { result.insert(row.id); best = row.e1rm }
        }
        return result
    }
    static func chart(_ entries: [WorkoutRecord], mode: String) -> [WorkoutPoint] {
        chart(days: days(entries), mode: mode)
    }
    static func chart(days: [WorkoutDay], mode: String) -> [WorkoutPoint] {
        days.reversed().filter { $0.entries.first?.date != .distantPast }.compactMap { day in
            let chosen: WorkoutRecord?
            if mode == "volumeMax" { chosen = day.entries.max { $0.volume == $1.volume ? $0.date < $1.date : $0.volume < $1.volume } }
            else if let number = Int(mode.replacingOccurrences(of: "set", with: "")), (1...3).contains(number) { chosen = day.entries.count >= number ? day.entries[number - 1] : nil }
            else { chosen = day.entries.max { $0.e1rm == $1.e1rm ? $0.date < $1.date : $0.e1rm < $1.e1rm } }
            guard let row = chosen else { return nil }
            return WorkoutPoint(id: row.id, date: day.date, value: mode == "volumeMax" ? row.volume : row.e1rm)
        }
    }
}
