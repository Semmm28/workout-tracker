import Foundation

@main
struct WatchModelTests {
    static func main() throws {
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
        precondition(replica.lastSet("m1")?.weight == 60)
        try replica.receive(WatchPacket(generation: 2, snapshot: WatchSnapshot(watchRecords: [edited])))
        precondition(replica.pending.isEmpty)
        try replica.save(set, deleted: true)
        let deletion = replica.pending[edited.key]!
        try replica.receive(WatchPacket(generation: 3, snapshot: WatchSnapshot(lastSets: [set], watchRecords: [edited])))
        precondition(replica.sets.isEmpty && replica.lastSet("m1") == nil, "An old snapshot must not resurrect a deleted set")
        precondition(replica.pending[edited.key] == deletion)
        try replica.receive(WatchPacket(generation: 4, snapshot: WatchSnapshot(lastSets: [phoneSet], watchRecords: [deletion])))
        try replica.receive(WatchPacket(generation: 1, snapshot: WatchSnapshot(watchRecords: [first])))
        precondition(replica.generation == 4 && replica.pending.isEmpty)
        precondition(replica.lastSet("m1")?.id == phoneSet.id)
        replica.restUntil = Date().addingTimeInterval(90)
        let restored = try JSONDecoder().decode(WatchReplica.self, from: JSONEncoder().encode(replica))
        precondition(restored.records == replica.records && restored.restUntil == replica.restUntil)
        let invalid = WorkoutEnvelope(version: 2, key: first.key, kind: first.kind, id: first.id, revision: first.revision, deleted: false, value: first.value)
        do { _ = try invalid.watchSet(); fatalError("Future schema accepted") } catch {}
        print("Native Watch replay, acknowledgement, deletion and legacy data tests passed")
    }
}
