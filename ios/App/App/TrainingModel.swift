import Foundation

struct TrainingSet: Codable, Equatable, Identifiable, Sendable {
    var id = "training-set-" + UUID().uuidString
    var weight: Double = 0
    var reps = 8
    var previousWeight: Double?
    var previousReps: Int?
}

struct TrainingItem: Codable, Equatable, Identifiable, Sendable {
    var id = UUID().uuidString
    var machineId: String
    var machineName: String
    var brandName: String
    var setCount = 3
    var repMin = 8
    var repMax = 12
    var restSeconds = 90
    var sets: [TrainingSet]?
    var target: String { repMin == repMax ? "\(repMin)" : "\(repMin)–\(repMax)" }

    init(machine: WorkoutRecord, brand: String) {
        machineId = machine.id; machineName = machine.name; brandName = brand
    }
    func prepared(history: [WorkoutRecord]) -> TrainingItem {
        var result = self
        let previous = WorkoutMetrics.days(history).first?.entries ?? []
        result.sets = (0..<setCount).map { index in
            let last = previous.isEmpty ? nil : previous[min(index, previous.count - 1)]
            return TrainingSet(weight: last?.number("weight") ?? 0, reps: last.map { max(1, Int($0.number("reps"))) } ?? repMin,
                               previousWeight: last?.number("weight"), previousReps: last.map { Int($0.number("reps")) })
        }
        return result
    }
}

// A session owns a copy of the plan. Completed sets remain ordinary set records.
struct TrainingDocument: Codable, Equatable, Identifiable, Sendable {
    var id = UUID().uuidString
    var name = ""
    var items: [TrainingItem] = []
    var createdAt = WatchSet.timestamp()
    var planId: String?
    var status: String?
    var loggedAt: String?
    var finishedAt: String?
    var restUntil: String?

    init() {}
    init(record: WorkoutRecord) throws { self = try JSONDecoder().decode(Self.self, from: PhoneSnapshot.encoder().encode(record)) }
    func record(preserving original: WorkoutRecord? = nil) throws -> WorkoutRecord {
        let fields = try JSONDecoder().decode(WorkoutRecord.self, from: PhoneSnapshot.encoder().encode(self)).fields
        var result = original ?? WorkoutRecord([:])
        result.fields.merge(fields) { _, new in new }
        if restUntil == nil { result.fields.removeValue(forKey: "restUntil") }
        return result
    }
    func validate(kind: String) throws {
        guard !id.isEmpty, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 120,
              !items.isEmpty, items.count <= 100, WatchSet.date(createdAt) != nil,
              Set(items.map(\.id)).count == items.count else { throw PhoneDataError.invalidBackup }
        var setIDs = Set<String>()
        for item in items {
            guard !item.id.isEmpty, !item.machineId.isEmpty, !item.machineName.isEmpty, !item.brandName.isEmpty,
                  (1...50).contains(item.setCount), (1...1000).contains(item.repMin),
                  (item.repMin...1000).contains(item.repMax), (0...3600).contains(item.restSeconds) else { throw PhoneDataError.invalidBackup }
            if kind == "sessions" {
                guard let sets = item.sets, !sets.isEmpty, sets.count <= 50 else { throw PhoneDataError.invalidBackup }
                for set in sets {
                    guard !set.id.isEmpty, setIDs.insert(set.id).inserted, set.weight.isFinite, (0...2000).contains(set.weight),
                          (1...1000).contains(set.reps), set.previousWeight.map({ $0.isFinite && (0...2000).contains($0) }) ?? true,
                          set.previousReps.map({ (0...1000).contains($0) }) ?? true else { throw PhoneDataError.invalidBackup }
                }
            }
        }
        if kind == "sessions" {
            guard ["active", "completed"].contains(status ?? ""), WatchSet.date(loggedAt ?? "") != nil,
                  restUntil.map({ WatchSet.date($0) != nil }) ?? true,
                  finishedAt.map({ WatchSet.date($0) != nil }) ?? true else { throw PhoneDataError.invalidBackup }
        }
    }
    func started(using data: PhonePresentation) throws -> TrainingDocument {
        var result = self
        result.id = UUID().uuidString; result.planId = id; result.status = "active"
        result.createdAt = WatchSet.timestamp(); result.loggedAt = result.createdAt
        result.items = try items.map { item in
            guard let machine = data.machinesByID[item.machineId] else { throw PhoneDataError.missingTrainingMachine }
            var next = item
            next.machineName = machine.name; next.brandName = data.brandsByID[machine.text("brandId")]?.name ?? item.brandName
            return next.prepared(history: data.setsByMachine[item.machineId] ?? [])
        }
        return result
    }
    mutating func replace(itemID: String, with machine: WorkoutRecord, brand: String, data: PhonePresentation) throws {
        guard status == "active", let index = items.firstIndex(where: { $0.id == itemID }), let sets = items[index].sets else { throw PhoneDataError.deleted }
        let done = sets.filter { data.setsByID[$0.id] != nil }
        let remaining = sets.count - done.count
        guard remaining > 0 else { throw PhoneDataError.trainingFinished }
        var next = TrainingItem(machine: machine, brand: brand)
        next.setCount = remaining; next.repMin = items[index].repMin; next.repMax = items[index].repMax; next.restSeconds = items[index].restSeconds
        next = next.prepared(history: data.setsByMachine[machine.id] ?? [])
        if done.isEmpty { items[index] = next }
        else { items[index].sets = done; items[index].setCount = done.count; items.insert(next, at: index + 1) }
        restUntil = nil
    }
}
