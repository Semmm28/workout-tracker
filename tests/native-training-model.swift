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
        let machine = initial.machinesByID["tm"]!
        precondition(TrainingItem(machine: machine, brand: "Technogym").setCount == 2)
        precondition(TrainingItem(machine: machine, brand: "Technogym", setCount: 5).setCount == 5)
        precondition(TrainingItem(machine: machine, brand: "Technogym", setCount: 0).setCount == 2)
        let newItem = TrainingItem(machine: machine, brand: "Technogym")
        precondition(newItem.repMin == 5 && newItem.repMax == 8)
        let customItem = TrainingItem(machine: machine, brand: "Technogym", repMin: 6, repMax: 10)
        precondition(customItem.repMin == 6 && customItem.repMax == 10)
        precondition(TrainingItem(machine: machine, brand: "Technogym", repMin: 10, repMax: 5).target == "5–8")
        precondition(plan.items[0].target == "8–12")
        let newer = WorkoutRecord(["id": .string("newer-t"), "machineId": .string("tm"), "weight": .number(65.125), "reps": .number(7),
                                   "loggedAt": .string("2026-10-20T10:05:00Z"), "createdAt": .string("2026-10-20T10:05:00Z")])
        let prepared = newItem.prepared(history: [newer] + initial.sets)
        precondition(prepared.sets?.allSatisfy { $0.weight == 65.125 && $0.previousWeight == 65.125 } == true)
        precondition(newItem.newSet(history: initial.sets.filter { $0.text("machineId") == "lm" }).previousWeight == nil)
        for count in [1001.0, 1e30] {
            var historical = newer; historical.fields["reps"] = .number(count)
            try historical.validate(kind: "sets")
            let suggestion = newItem.newSet(history: [historical])
            precondition(suggestion.reps == 5 && suggestion.previousReps == nil && historical.number("reps") == count)
        }
        let session = try plan.started(using: initial)
        precondition(session.items[0].sets?.first?.weight == 60 && plan.items[0].sets == nil)
        _ = try await repo.save(kind: "sessions", record: session.record(), existing: false)
        let item = session.items[0], set = item.sets![0]
        try await repo.trainingSet(sessionID: session.id, itemID: item.id, setID: set.id, weight: 62.5, reps: 8, undo: false, restTimerEnabled: false)
        let noTimer = await repo.presentation()
        precondition(noTimer.sessions.first { $0.id == session.id }?.restUntil == nil)
        precondition(noTimer.setsByID[set.id]?.number("weight") == 62.5)
        let actualItem = noTimer.sessions.first { $0.id == session.id }!.items[0]
        precondition(actualItem.sets?.first?.weight == 62.5 && actualItem.sets?.first?.reps == 8)
        precondition(actualItem.newSet(history: noTimer.sets).weight == 62.5)
        let savedOnDisk = try PhoneRepository(url: url)
        let reloaded = await savedOnDisk.presentation()
        precondition(reloaded.sessions.first { $0.id == session.id }?.items[0].sets?.first?.weight == 62.5)
        try await repo.trainingSet(sessionID: session.id, itemID: item.id, setID: set.id, weight: 62.5, reps: 8, undo: true)
        try await repo.trainingSet(sessionID: session.id, itemID: item.id, setID: set.id, weight: 62.5, reps: 8, undo: false)
        try await repo.trainingSet(sessionID: session.id, itemID: item.id, setID: set.id, weight: 62.5, reps: 8, undo: false)
        let saved = await repo.presentation()
        precondition(saved.sessions.first { $0.id == session.id }?.restUntil != nil)
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
        var a = plan; a.id = "ordered-a"; a.name = "A schema"
        var z = plan; z.id = "ordered-z"; z.name = "Z schema"
        _ = try await repo.save(kind: "plans", record: a.record(), existing: false)
        _ = try await repo.save(kind: "plans", record: z.record(), existing: false)
        _ = try await repo.reorder(kind: "plans", ids: [z.id, a.id])
        let ordered = await repo.presentation(); precondition(ordered.plans.map(\.id) == [z.id, a.id])
        a.name = "Renamed"
        _ = try await repo.save(kind: "plans", record: a.record(preserving: ordered.planRecords[a.id]), existing: true)
        let afterEdit = await repo.presentation(); precondition(afterEdit.plans.map(\.id) == [z.id, a.id])
        print("Native training: branded history, immutable plans, idempotent sets, swap, restart, v2 backup and completed-session protection passed.")
    }
}
