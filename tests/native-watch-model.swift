import Foundation

@main
struct WatchModelTests {
    static func main() async throws {
        let legacy = Data(#"{"id":"phone-one","machineId":"m1","weight":"52.5","reps":"8","rpe":"","notes":"Keep this","loggedAt":"2026-10-08T10:00:00.000Z"}"#.utf8)
        let phoneSet = try JSONDecoder().decode(WatchSet.self, from: legacy)
        precondition(phoneSet.weight == 52.5 && phoneSet.reps == 8 && phoneSet.rpe == nil)
        var replica = WatchReplica()
        var set = WatchSet(id: "watch-one", machineId: "m1", weight: 55, reps: 8, loggedAt: phoneSet.loggedAt, notes: "Keep this")
        try replica.save(set)
        let first = replica.pending["sets:watch-one"]!
        set.weight = 60
        try replica.save(set)
        let edited = replica.pending["sets:watch-one"]!
        precondition(edited.isNewer(than: first))
        try replica.receive(WatchPacket(generation: 1, snapshot: WatchSnapshot(watchRecords: [first])))
        precondition(replica.pending[edited.key] == edited, "A late acknowledgement must preserve a newer edit")
        precondition(WatchPresentation(replica: replica).lastSets["m1"]?.weight == 60)
        try replica.receive(WatchPacket(generation: 2, snapshot: WatchSnapshot(watchRecords: [edited])))
        precondition(replica.pending.isEmpty)
        try replica.save(set, deleted: true)
        let deletion = replica.pending[edited.key]!
        try replica.receive(WatchPacket(generation: 3, snapshot: WatchSnapshot(lastSets: [set], watchRecords: [edited])))
        let deleted = WatchPresentation(replica: replica)
        precondition(deleted.sets.isEmpty && deleted.lastSets["m1"] == nil, "An old snapshot must not resurrect a deleted set")
        precondition(replica.pending[edited.key] == deletion)
        try replica.receive(WatchPacket(generation: 4, snapshot: WatchSnapshot(lastSets: [phoneSet], watchRecords: [deletion])))
        try replica.receive(WatchPacket(generation: 1, snapshot: WatchSnapshot(watchRecords: [first])))
        precondition(replica.generation == 4 && replica.pending.isEmpty)
        precondition(WatchPresentation(replica: replica).lastSets["m1"]?.id == phoneSet.id)
        replica.restUntil = Date().addingTimeInterval(90)
        let restored = try JSONDecoder().decode(WatchReplica.self, from: JSONEncoder().encode(replica))
        precondition(restored.records == replica.records && restored.restUntil == replica.restUntil)
        let invalid = WorkoutEnvelope(version: 2, key: first.key, kind: first.kind, id: first.id, revision: first.revision, deleted: false, value: first.value)
        do { _ = try invalid.watchSet(); fatalError("Future schema accepted") } catch {}
        var zero = set
        zero.weight = 0; zero.reps = 0
        let phoneEdit = WorkoutEnvelope(version: 1, key: first.key, kind: first.kind, id: first.id,
            revision: deletion.tombstone().revision, deleted: false, value: String(decoding: try JSONEncoder().encode(zero), as: UTF8.self))
        try replica.receive(WatchPacket(generation: 5, snapshot: WatchSnapshot(watchRecords: [phoneEdit])))
        precondition(WatchPresentation(replica: replica).lastSets["m1"]?.reps == 0, "A zero-value phone edit must not block the Watch snapshot")
        let beforeInvalid = replica
        do {
            try replica.receive(WatchPacket(generation: 6, snapshot: WatchSnapshot(watchRecords: [phoneEdit.tombstone(), invalid])))
            fatalError("Invalid packet accepted")
        } catch {}
        precondition(replica == beforeInvalid, "Invalid packets must not partially apply deletions or acknowledgements")
        let encodedSet = try JSONEncoder().encode(phoneSet)
        let fields = try JSONSerialization.jsonObject(with: encodedSet) as! [String: Any]
        precondition(fields["date"] == nil && fields["loggedAt"] as? String == phoneSet.loggedAt)
        let roundTrip = try JSONDecoder().decode(WatchSet.self, from: encodedSet)
        precondition(roundTrip == phoneSet, "Cached dates must preserve the version-1 wire format")
        try await largeHistory()
        print("Native Watch replay, acknowledgement, deletion and legacy data tests passed")
    }

    static func largeHistory() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("watch-history-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("watch-workouts.json")
        var stored = WatchReplica()
        stored.generation = 1
        stored.snapshot.brands = [WatchBrand(id: "b", name: "Testmerk")]
        stored.snapshot.machines = (0..<30).map { WatchMachine(id: "m\($0)", name: "Apparaat \($0)", brandId: "b") }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let start = Date(timeIntervalSince1970: 1_780_000_000)
        for index in 0..<5000 {
            let stamp = formatter.string(from: start.addingTimeInterval(Double(index) * 60))
            let set = WatchSet(id: "watch-\(index)", machineId: "m\(index % 30)", weight: 50, reps: 8, loggedAt: stamp, notes: "Bewaren")
            let record = WorkoutEnvelope(version: 1, key: "sets:\(set.id)", kind: "sets", id: set.id,
                                         revision: String(format: "%016d-fixture", index + 1), deleted: false,
                                         value: String(decoding: try JSONEncoder().encode(set), as: UTF8.self))
            stored.records[record.key] = record
        }
        stored.snapshot.watchRecords = Array(stored.records.values)
        let pending = stored.records["sets:watch-4999"]!
        stored.pending[pending.key] = pending
        stored.restUntil = start.addingTimeInterval(5000 * 60)
        stored.restSetId = pending.id
        try WatchFiles.write(stored, to: url)
        let originalBytes = try Data(contentsOf: url)
        let repo = WatchRepository(url: url)
        let loadStart = Date()
        let loaded = try await repo.presentation()
        let loadSeconds = Date().timeIntervalSince(loadStart)
        precondition(loaded.replica == stored && loaded.sets.count == 5000)
        precondition(loaded.recentMachines.map(\.id) == ["m19", "m18", "m17", "m16", "m15"])
        precondition(loaded.lastSets["m19"]?.id == "watch-4999")
        let redrawStart = Date()
        for _ in 0..<100 {
            let data = try await repo.presentation()
            precondition(data.revision == loaded.revision && data.recentMachines.count == 5)
        }
        let redrawSeconds = Date().timeIntervalSince(redrawStart)
        precondition(redrawSeconds < 1, "Drawing recent machines must reuse the prepared history")
        let afterLoadBytes = try Data(contentsOf: url)
        precondition(afterLoadBytes == originalBytes, "Loading must not rewrite stored or pending sets")

        let packet = WatchPacket(generation: 2, snapshot: stored.snapshot)
        let text = String(decoding: try JSONEncoder().encode(packet), as: UTF8.self)
        let accepted = try await repo.receive(text)
        precondition(accepted.replica.pending.isEmpty && accepted.sets == loaded.sets)
        let savedBytes = try Data(contentsOf: url)
        let repeatStart = Date()
        for _ in 0..<10 {
            let repeated = try await repo.receive(text)
            precondition(repeated.revision == accepted.revision)
        }
        let repeatSeconds = Date().timeIntervalSince(repeatStart)
        let repeatedBytes = try Data(contentsOf: url)
        precondition(repeatedBytes == savedBytes, "Repeated snapshots must not rewrite the storage")
        let stale = String(decoding: try JSONEncoder().encode(WatchPacket(generation: 0, snapshot: WatchSnapshot())), as: UTF8.self)
        let afterStale = try await repo.receive(stale)
        precondition(afterStale.revision == accepted.revision && afterStale.sets.count == 5000)

        var edited = loaded.sets[0]; edited.weight = 75
        let edit = edited
        let saveStart = Date()
        let saved = try await repo.update { try $0.save(edit) }
        let saveSeconds = Date().timeIntervalSince(saveStart)
        precondition(saved.lastSets[edit.machineId]?.weight == 75 && saved.replica.pending.count == 1)
        let replayed = try await repo.receive(text)
        precondition(replayed.lastSets[edit.machineId]?.weight == 75 && replayed.replica.pending.count == 1)
        let reopened = try await WatchRepository(url: url).presentation()
        precondition(reopened.replica == replayed.replica && reopened.sets.count == 5000)
        precondition(reopened.replica.restUntil == stored.restUntil && reopened.replica.restSetId == stored.restSetId)
        let removed = try await repo.update { try $0.save(edit, deleted: true) }
        precondition(removed.sets.count == 4999 && removed.lastSets[edit.machineId]?.id != edit.id)
        precondition(removed.replica.pending["sets:\(edit.id)"]?.deleted == true)

        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let day = try await repo.presentation(now: start, calendar: calendar)
        let nextDay = try await repo.presentation(now: start.addingTimeInterval(86400), calendar: calendar)
        precondition(day.day != nextDay.day && nextDay.revision > day.revision)
        precondition(nextDay.today.allSatisfy { calendar.isDate($0.date, inSameDayAs: start.addingTimeInterval(86400)) })

        let blockedURL = directory.appendingPathComponent("blocked.json")
        let blocked = WatchRepository(url: blockedURL)
        let before = try await blocked.presentation()
        try FileManager.default.createDirectory(at: blockedURL, withIntermediateDirectories: true)
        do { _ = try await blocked.update { try $0.save(edit) }; fatalError("Failed write accepted") } catch {}
        let after = try await blocked.presentation()
        precondition(after.replica == before.replica && after.revision == before.revision)
        let corruptURL = directory.appendingPathComponent("corrupt.json")
        let corruptBytes = Data("unreadable-existing-data".utf8)
        try corruptBytes.write(to: corruptURL)
        let corrupt = WatchRepository(url: corruptURL)
        do { _ = try await corrupt.update { try $0.save(edit) }; fatalError("Corrupt data overwritten") } catch {}
        let afterCorrupt = try Data(contentsOf: corruptURL)
        precondition(afterCorrupt == corruptBytes)
        print(String(format: "Watch 5000-set regression: reopen + prepare %.3fs; 100 recent-list reads %.3fs; save %.3fs; 10 identical packets %.3fs", loadSeconds, redrawSeconds, saveSeconds, repeatSeconds))
    }
}
