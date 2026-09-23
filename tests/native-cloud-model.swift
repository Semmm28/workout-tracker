import Foundation

@main
struct CloudModelTests {
    static func main() throws {
        let old = WorkoutEnvelope(version: 1, key: "brands:b1", kind: "brands", id: "b1",
                                  revision: "0001700000000000-a", deleted: false, value: "{\"id\":\"b1\",\"name\":\"Gym\"}")
        try old.validate()
        let edit = WorkoutEnvelope(version: 1, key: old.key, kind: old.kind, id: old.id,
                                   revision: "0001700000000001-b", deleted: false, value: old.value)
        precondition(edit.isNewer(than: old))
        precondition(!old.isNewer(than: edit))
        precondition(!edit.isNewer(than: edit))
        precondition(edit.recordName == old.recordName, "IDs must survive edits/renames")
        let deletion = edit.tombstone()
        precondition(deletion.isNewer(than: edit))
        precondition(deletion.deleted && deletion.value == nil)
        let encoded = try JSONEncoder().encode(deletion)
        let decoded = try JSONDecoder().decode(WorkoutEnvelope.self, from: encoded)
        precondition(decoded == deletion)
        let invalid = WorkoutEnvelope(version: 2, key: old.key, kind: old.kind, id: old.id,
                                      revision: old.revision, deleted: false, value: old.value)
        do { try invalid.validate(); fatalError("Future schema was accepted") } catch {}
        let other = WorkoutEnvelope(version: 1, key: "machines:b1", kind: "machines", id: "b1",
                                    revision: old.revision, deleted: false, value: old.value)
        precondition(other.recordName != old.recordName, "Entity types must not collide")
        print("Native CloudKit model tests passed")
    }
}
