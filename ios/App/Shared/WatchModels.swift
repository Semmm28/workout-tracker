import Foundation

struct WatchBrand: Codable, Identifiable, Equatable, Sendable { let id: String; let name: String }
struct WatchMachine: Codable, Identifiable, Equatable, Sendable { let id: String; let name: String; let brandId: String }
struct WatchSet: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let machineId: String
    var weight: Double
    var reps: Int
    let loggedAt: String
    var createdAt: String?
    var updatedAt: String?
    var notes: String?
    var rpe: Double?
    let date: Date

    enum CodingKeys: String, CodingKey { case id, machineId, weight, reps, loggedAt, createdAt, updatedAt, notes, rpe }

    init(id: String, machineId: String, weight: Double, reps: Int, loggedAt: String,
         createdAt: String? = nil, updatedAt: String? = nil, notes: String? = nil, rpe: Double? = nil) {
        self.id = id; self.machineId = machineId; self.weight = weight; self.reps = reps
        self.loggedAt = loggedAt; self.createdAt = createdAt; self.updatedAt = updatedAt
        self.notes = notes; self.rpe = rpe; self.date = Self.date(loggedAt) ?? .distantPast
    }
    static func date(_ text: String) -> Date? {
        guard !text.isEmpty else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
    static func timestamp() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date())
    }
}

extension WatchSet {
    // Existing iPhone forms store numbers as strings; Watch records use numbers.
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        func number(_ key: CodingKeys) throws -> Double {
            if let value = try? values.decode(Double.self, forKey: key), value.isFinite { return value }
            if let text = try? values.decode(String.self, forKey: key), let value = Double(text), value.isFinite { return value }
            throw DecodingError.dataCorruptedError(forKey: key, in: values, debugDescription: "Invalid set number")
        }
        id = try values.decode(String.self, forKey: .id)
        machineId = try values.decode(String.self, forKey: .machineId)
        weight = try number(.weight)
        let count = try number(.reps)
        guard count.rounded() == count, (0...1000).contains(count) else {
            throw DecodingError.dataCorruptedError(forKey: .reps, in: values, debugDescription: "Invalid repetitions")
        }
        reps = Int(count)
        loggedAt = try values.decode(String.self, forKey: .loggedAt)
        date = Self.date(loggedAt) ?? .distantPast
        createdAt = try values.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try values.decodeIfPresent(String.self, forKey: .updatedAt)
        notes = try values.decodeIfPresent(String.self, forKey: .notes)
        rpe = try? number(.rpe)
    }
}

struct WatchSnapshot: Codable, Equatable, Sendable {
    var version = 1
    var brands: [WatchBrand] = []
    var machines: [WatchMachine] = []
    var lastSets: [WatchSet] = []
    var watchRecords: [WorkoutEnvelope] = []
}
struct WatchPacket: Codable, Sendable { let generation: Double; let snapshot: WatchSnapshot }

enum WatchFiles {
    static func url(_ filename: String) throws -> URL {
        let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return directory.appendingPathComponent(filename)
    }
    static func read<T: Decodable>(_ type: T.Type, from url: URL, fallback: T) throws -> T {
        guard FileManager.default.fileExists(atPath: url.path) else { return fallback }
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }
    static func write<T: Encodable>(_ value: T, to url: URL) throws {
        try JSONEncoder().encode(value).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}

extension WorkoutEnvelope {
    func watchSet() throws -> WatchSet? {
        try validate()
        guard kind == "sets", id.hasPrefix("watch-") else { throw WorkoutCloudError(code: "watch-schema") }
        if deleted { return nil }
        guard let value, let data = value.data(using: .utf8) else { throw WorkoutCloudError(code: "watch-schema") }
        let set = try JSONDecoder().decode(WatchSet.self, from: data)
        guard set.id == id, !set.machineId.isEmpty, set.weight.isFinite, (0...2000).contains(set.weight),
              (0...1000).contains(set.reps), set.date != .distantPast else { throw WorkoutCloudError(code: "watch-schema") }
        return set
    }
}

// Shared by the Watch and its command-line tests. Acknowledgements use the
// persisted phone revision so late/duplicate packets cannot erase a newer edit.
struct WatchReplica: Codable, Equatable, Sendable {
    var snapshot = WatchSnapshot()
    var generation: Double = 0
    var records: [String: WorkoutEnvelope] = [:]
    var pending: [String: WorkoutEnvelope] = [:]
    var restUntil: Date?
    var restSetId: String?
    var weightStep: Double = 2.5
    var restSeconds: Double = 90

    mutating func receive(_ packet: WatchPacket) throws {
        guard packet.snapshot.version == 1 else { throw WorkoutCloudError(code: "watch-version") }
        guard packet.generation >= generation else { return }
        // Validate the whole packet before applying acknowledgements or edits.
        for envelope in packet.snapshot.watchRecords where envelope != records[envelope.key] {
            _ = try envelope.watchSet()
        }
        for envelope in packet.snapshot.watchRecords {
            if envelope.isNewer(than: records[envelope.key]) { records[envelope.key] = envelope }
            if let local = pending[envelope.key], !local.isNewer(than: envelope) { pending.removeValue(forKey: envelope.key) }
        }
        snapshot = packet.snapshot
        generation = packet.generation
    }

    mutating func save(_ set: WatchSet, deleted: Bool = false) throws {
        let key = "sets:\(set.id)"
        let clock = records.values.reduce(Int64(Date().timeIntervalSince1970 * 1000)) { max($0, Int64($1.revision.prefix(16)) ?? 0) } + 1
        let envelope = WorkoutEnvelope(version: 1, key: key, kind: "sets", id: set.id,
            revision: String(format: "%016lld", clock) + "-" + UUID().uuidString, deleted: deleted,
            value: deleted ? nil : String(data: try JSONEncoder().encode(set), encoding: .utf8))
        _ = try envelope.watchSet()
        records[key] = envelope
        pending[key] = envelope
    }

}

// Build once off the main actor; rendering a row must never decode the history.
struct WatchPresentation: Sendable {
    let replica: WatchReplica
    let revision: Int
    let calendar: Calendar
    let day: Date
    private var decoded: [String: WatchSet] = [:]
    var sets: [WatchSet] = []
    var today: [WatchSet] = []
    var lastSets: [String: WatchSet] = [:]
    var recentMachines: [WatchMachine] = []
    var brandsByID: [String: WatchBrand] = [:]
    var machinesByID: [String: WatchMachine] = [:]
    var machinesByBrand: [String: [WatchMachine]] = [:]

    init(replica: WatchReplica = WatchReplica(), revision: Int = 0, previous: WatchPresentation? = nil,
         now: Date = Date(), calendar: Calendar = .current) {
        self.replica = replica; self.revision = revision; self.calendar = calendar
        day = calendar.startOfDay(for: now)
        if let previous, previous.replica.records == replica.records {
            decoded = previous.decoded; sets = previous.sets
        } else {
            for entry in replica.records.values where !entry.deleted {
                if previous?.replica.records[entry.key] == entry { decoded[entry.key] = previous?.decoded[entry.key] }
                else { decoded[entry.key] = try? entry.watchSet() }
            }
            sets = decoded.values.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date > $1.date }
        }
        today = sets.filter { calendar.isDate($0.date, inSameDayAs: now) }
        for set in sets where lastSets[set.machineId] == nil { lastSets[set.machineId] = set }
        // Local edits and tombstones override the same ID from the phone.
        for set in replica.snapshot.lastSets where replica.records["sets:\(set.id)"] == nil {
            if lastSets[set.machineId] == nil || set.date > lastSets[set.machineId]!.date { lastSets[set.machineId] = set }
        }
        for brand in replica.snapshot.brands { brandsByID[brand.id] = brand }
        for machine in replica.snapshot.machines {
            machinesByID[machine.id] = machine
            machinesByBrand[machine.brandId, default: []].append(machine)
        }
        recentMachines = Array(replica.snapshot.machines.filter { lastSets[$0.id] != nil }.sorted {
            let a = lastSets[$0.id]!.date, b = lastSets[$1.id]!.date
            return a == b ? $0.id < $1.id : a > b
        }.prefix(5))
    }
}

actor WatchRepository {
    private var url: URL?
    private var replica: WatchReplica?
    private var revision = 0
    private var cached: WatchPresentation?
    private var receivedJSON: String?

    init(url: URL? = nil) { self.url = url }

    func presentation(now: Date = Date(), calendar: Calendar = .current) throws -> WatchPresentation {
        if replica == nil {
            let file = try url ?? WatchFiles.url("watch-workouts.json")
            let stored = try WatchFiles.read(WatchReplica.self, from: file, fallback: WatchReplica())
            guard stored.snapshot.version == 1 else { throw WorkoutCloudError(code: "watch-version") }
            url = file; replica = stored
        }
        if let cached, cached.revision == revision {
            if cached.calendar == calendar, calendar.isDate(cached.day, inSameDayAs: now) { return cached }
            revision += 1
        }
        let next = WatchPresentation(replica: replica!, revision: revision, previous: cached, now: now, calendar: calendar)
        cached = next
        return next
    }

    func update(_ change: @Sendable (inout WatchReplica) throws -> Void) throws -> WatchPresentation {
        _ = try presentation()
        var next = replica!
        try change(&next)
        if next != replica! {
            try WatchFiles.write(next, to: url!)
            replica = next; revision += 1
        }
        return try presentation()
    }

    func receive(_ text: String) throws -> WatchPresentation {
        if receivedJSON == text { return try presentation() }
        let packet = try JSONDecoder().decode(WatchPacket.self, from: Data(text.utf8))
        let result = try update { try $0.receive(packet) }
        receivedJSON = text
        return result
    }
}
