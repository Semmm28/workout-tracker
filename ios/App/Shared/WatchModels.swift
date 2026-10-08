import Foundation

struct WatchBrand: Codable, Identifiable { let id: String; let name: String }
struct WatchMachine: Codable, Identifiable { let id: String; let name: String; let brandId: String }
struct WatchSet: Codable, Identifiable {
    let id: String
    let machineId: String
    var weight: Double
    var reps: Int
    let loggedAt: String
    var createdAt: String?
    var updatedAt: String?
    var notes: String?
    var rpe: Double?

    enum CodingKeys: String, CodingKey { case id, machineId, weight, reps, loggedAt, createdAt, updatedAt, notes, rpe }

    var date: Date { Self.date(loggedAt) ?? .distantPast }
    static func date(_ text: String) -> Date? {
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
        guard count.rounded() == count, (1...1000).contains(count) else {
            throw DecodingError.dataCorruptedError(forKey: .reps, in: values, debugDescription: "Invalid repetitions")
        }
        reps = Int(count)
        loggedAt = try values.decode(String.self, forKey: .loggedAt)
        createdAt = try values.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try values.decodeIfPresent(String.self, forKey: .updatedAt)
        notes = try values.decodeIfPresent(String.self, forKey: .notes)
        rpe = try? number(.rpe)
    }
}

struct WatchSnapshot: Codable {
    var version = 1
    var brands: [WatchBrand] = []
    var machines: [WatchMachine] = []
    var lastSets: [WatchSet] = []
    var watchRecords: [WorkoutEnvelope] = []
}
struct WatchPacket: Codable { let generation: Double; let snapshot: WatchSnapshot }

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
              (1...1000).contains(set.reps), WatchSet.date(set.loggedAt) != nil else { throw WorkoutCloudError(code: "watch-schema") }
        return set
    }
}

// Shared by the Watch and its command-line tests. Acknowledgements use the
// persisted phone revision so late/duplicate packets cannot erase a newer edit.
struct WatchReplica: Codable {
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
        for envelope in packet.snapshot.watchRecords {
            _ = try envelope.watchSet()
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

    var sets: [WatchSet] { records.values.compactMap { try? $0.watchSet() }.sorted { $0.date > $1.date } }
    func lastSet(_ machineId: String) -> WatchSet? {
        // Prefer local records for matching IDs, including local deletions.
        let remote = snapshot.lastSets.filter { $0.machineId == machineId && records["sets:\($0.id)"] == nil }
        return (sets.filter { $0.machineId == machineId } + remote).max { $0.date < $1.date }
    }
}
