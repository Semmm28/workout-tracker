import Foundation

@main
struct NativeTrainingTests {
    static func main() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("phone.json")
        let repo = try PhoneRepository(url: url)
        _ = try await repo.migrate(Data("{\"backup\":{\"version\":1},\"journal\":[],\"owner\":\"\",\"chartMode\":\"e1rmMax\"}".utf8))
        let fixture = try Data(contentsOf: URL(fileURLWithPath: "tests/fixtures/training-backup-v2.json"))
        _ = try await repo.importBackup(fixture)
        let initial = await repo.presentation()
        precondition(initial.plans.count == 1 && initial.sessions.count == 1 && initial.sets.count == 2)
        let plan = initial.plans[0]
        let session = try plan.started(using: initial)
        precondition(session.items[0].sets?.first?.weight == 60 && plan.items[0].sets == nil)
        _ = try await repo.save(kind: "sessions", record: session.record(), existing: false)
        let item = session.items[0], set = item.sets![0]
        try await repo.trainingSet(sessionID: session.id, itemID: item.id, setID: set.id, weight: 62.5, reps: 8, undo: false)
        try await repo.trainingSet(sessionID: session.id, itemID: item.id, setID: set.id, weight: 62.5, reps: 8, undo: false)
        let saved = await repo.presentation()
        precondition(saved.setsBySession[session.id]?.count == 1 && saved.sets.count == 3)
        precondition(saved.plans[0] == plan)
        var swapped = saved.sessions.first { $0.id == session.id }!
        try swapped.replace(itemID: item.id, with: saved.machinesByID["lm"]!, brand: "Life Fitness", data: saved)
        precondition(swapped.items.count == 2 && swapped.items[0].sets?.count == 1)
        precondition(swapped.items[1].sets?.first?.weight == 45 && swapped.items[1].machineId == "lm")
        _ = try await repo.save(kind: "sessions", record: swapped.record(), existing: true)
        let reopened = try PhoneRepository(url: url)
        let resumed = await reopened.presentation()
        precondition(resumed.sessions.first { $0.id == session.id } == swapped)
        precondition(resumed.setsBySession[session.id]?.count == 1)
        let output = try await repo.exportBackup()
        let backup = try JSONDecoder().decode(PhoneBackup.self, from: output)
        precondition(backup.version == 2 && backup.plans.count == 1 && backup.sessions.count == 2)
        try output.write(to: URL(fileURLWithPath: "build/native-training-backup.json"))
        var invalid = backup
        invalid.sessions[0].fields["items"] = .array([])
        let before = await repo.read()
        do { _ = try await repo.importBackup(PhoneSnapshot.encoder().encode(invalid)); fatalError("Invalid training accepted") } catch {}
        let after = await repo.read(); precondition(before == after)
        var finished = swapped; finished.status = "completed"; finished.finishedAt = WatchSet.timestamp()
        _ = try await repo.save(kind: "sessions", record: finished.record(), existing: true)
        do { try await repo.trainingSet(sessionID: session.id, itemID: item.id, setID: set.id, weight: 20, reps: 8, undo: true); fatalError("Finished workout edited") } catch {}
        do { _ = try await repo.save(kind: "sessions", record: swapped.record(), existing: true); fatalError("Stale session reopened") } catch {}
        _ = try await repo.remove(kind: "plans", id: plan.id)
        let deleted = await repo.presentation(); precondition(deleted.sets.count == 3 && deleted.sessions.count == 2)
        print("Native training: branded history, immutable plans, idempotent sets, swap, restart, v2 backup and completed-session protection passed.")
    }
}
