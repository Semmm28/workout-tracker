import Foundation

@main struct PhoneModelTests {
    static func main() async throws {
        let input = try Data(contentsOf: URL(fileURLWithPath: "tests/fixtures/pwa-backup-v1.json"))
        let backup = try JSONDecoder().decode(PhoneBackup.self, from: input)
        try backup.validate()
        precondition(backup.count == 6)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("phone-model-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let url = dir.appendingPathComponent("native.json")
        let repo = try PhoneRepository(url: url)
        let envelope = WorkoutEnvelope(version: 1, key: "sets:deleted", kind: "sets", id: "deleted", revision: "0000000000000001-legacy", deleted: true, value: nil)
        let migration = LegacyPhoneData(backup: backup, journal: [envelope], owner: "account-one", chartMode: "set2")
        let data = try PhoneSnapshot.encoder().encode(migration)
        var snapshot = try await repo.migrate(data)
        precondition(snapshot.migrated && snapshot.owner == "account-one" && snapshot.chartMode == "set2")
        precondition(snapshot.backup().count == 6 && snapshot.records[envelope.key]?.deleted == true)
        precondition(snapshot.rows("sets").first?.fields["extra"] == backup.sets[0].fields["extra"])
        let again = try await repo.migrate(Data("invalid".utf8))
        precondition(again == snapshot, "Migration must be idempotent")
        let reopened = try PhoneRepository(url: url)
        let restored = await reopened.read()
        precondition(restored == snapshot)
        let before = snapshot
        for invalid in [Data("invalid".utf8), Data("{\"version\":99}".utf8), Data("{\"version\":1,\"sets\":[{\"id\":\"bad\"}]}".utf8)] {
            do { _ = try await repo.importBackup(invalid); fatalError("Invalid import accepted") } catch {}
            let after = await repo.read(); precondition(after == before)
        }
        snapshot = try await repo.importBackup(input)
        snapshot = try await repo.importBackup(input)
        precondition(snapshot.backup().count == 6, "Repeat imports must update IDs without duplicates")
        precondition(snapshot.rows("sets").first?.text("createdAt") == backup.sets.first?.text("createdAt"))
        do { _ = try await repo.merge([], owner: "other-account"); fatalError("Account mixing accepted") } catch {}
        let (deleted, undo) = try await repo.remove(kind: "brands", id: "b1")
        precondition(deleted.rows("brands").isEmpty && deleted.rows("machines").isEmpty && deleted.rows("sets").isEmpty)
        precondition(deleted.rows("bodyweights").count == 1)
        snapshot = try await repo.restore(undo)
        precondition(snapshot.backup().count == 6)
        let sets = snapshot.rows("sets")
        precondition(WorkoutMetrics.records(sets) == Set(["s1","s2"]))
        precondition(WorkoutMetrics.chart(sets, mode: "set2").map(\.id) == ["s2"])
        precondition(WorkoutMetrics.chart(sets, mode: "volumeMax").first?.value == 800)
        for values in [[0.0], [80.5], [70.0, 80.0], [-1.0]] {
            let range = WorkoutMetrics.valueRange(values)
            precondition(range.lowerBound < range.upperBound && values.allSatisfy(range.contains), "A constant chart must keep an increasing scale that contains every value")
        }
        let dateRange = WorkoutMetrics.dateRange([sets[0].date])
        precondition(dateRange.lowerBound < sets[0].date && dateRange.upperBound > sets[0].date)
        let late = WorkoutEnvelope(version: 1, key: "sets:s1", kind: "sets", id: "s1", revision: "0000000000000001-old", deleted: true, value: nil)
        snapshot = try await repo.merge([late])
        precondition(snapshot.rows("sets").count == 3, "Stale sync must not erase newer data")
        let blockedURL = dir.appendingPathComponent("blocked")
        let blocked = try PhoneRepository(url: blockedURL)
        try FileManager.default.createDirectory(at: blockedURL, withIntermediateDirectories: true)
        do { _ = try await blocked.migrate(data); fatalError("Failed disk write accepted") } catch {}
        let failed = await blocked.read(); precondition(!failed.migrated && failed.records.isEmpty)
        try PhoneSnapshot.encoder().encode(snapshot.backup()).write(to: URL(fileURLWithPath: "build/native-backup.json"))
        print("Native phone migration, persistence, backup round-trip, failure atomicity, conflicts, cascade/undo and chart tests passed")
    }
}
