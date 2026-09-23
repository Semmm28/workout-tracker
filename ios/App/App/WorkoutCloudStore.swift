import CloudKit
import Foundation

@available(iOS 17.0, *)
private struct WorkoutReplica: Codable {
    var version = 1
    var owner: String?
    var enabled = false
    var records: [String: WorkoutEnvelope] = [:]
    var serverFields: [String: Data] = [:]
    // Revision-specific acknowledgements cannot erase a newer offline edit.
    var dirty: [String: String] = [:]
    var engineState: CKSyncEngine.State.Serialization?
    var lastSync: String?
    var blocked: String?
}

@available(iOS 17.0, *)
actor WorkoutCloudStore: CKSyncEngineDelegate {
    static let shared = WorkoutCloudStore()
    static let changed = Notification.Name("WorkoutCloudChanged")
    private static let zoneID = CKRecordZone.ID(zoneName: "WorkoutLogV1")
    private let container = CKContainer(identifier: "iCloud.nl.sem.workouttracker")
    private let fileURL: URL
    private var replica = WorkoutReplica()
    private var engine: CKSyncEngine?
    private var problem: String?
    private var diskFailed = false
    private var syncing = false

    init() {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("WorkoutCloud", isDirectory: true)
        fileURL = directory.appendingPathComponent("replica-v1.json")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: fileURL.path) {
                replica = try JSONDecoder().decode(WorkoutReplica.self, from: Data(contentsOf: fileURL))
                guard replica.version == 1 else { throw WorkoutCloudError(code: "storage") }
                for entry in replica.records.values { try entry.validate() }
            }
        } catch {
            // Never replace an unreadable replica with an empty one.
            diskFailed = true
            problem = "storage"
        }
    }

    private func commit(_ next: WorkoutReplica) throws {
        guard !diskFailed else { throw WorkoutCloudError(code: "storage") }
        do {
            let data = try JSONEncoder().encode(next)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            replica = next
        } catch {
            problem = "storage"
            throw WorkoutCloudError(code: "storage")
        }
    }

    private func notify() { NotificationCenter.default.post(name: Self.changed, object: nil) }

    private func code(for error: Error) -> String {
        if let error = error as? WorkoutCloudError { return error.code }
        guard let error = error as? CKError else { return "error" }
        switch error.code {
        case .notAuthenticated: return "no-account"
        case .quotaExceeded: return "quota"
        case .networkUnavailable, .networkFailure, .serviceUnavailable, .requestRateLimited, .zoneBusy: return "offline"
        case .permissionFailure, .managedAccountRestricted: return "restricted"
        case .invalidArguments, .serverRejectedRequest: return "schema"
        default: return "error"
        }
    }

    func status() -> [String: Any] {
        ["supported": true, "enabled": replica.enabled, "owner": replica.owner ?? "",
         "code": problem ?? replica.blocked ?? (!replica.enabled ? "disabled" : (replica.dirty.isEmpty ? "ready" : "pending")),
         "pending": replica.dirty.count, "lastSync": replica.lastSync as Any? ?? NSNull()]
    }

    private func account(expected: String?) async throws -> String {
        switch try await container.accountStatus() {
        case .available: break
        case .noAccount: throw WorkoutCloudError(code: "no-account")
        case .restricted: throw WorkoutCloudError(code: "restricted")
        default: throw WorkoutCloudError(code: "offline")
        }
        let current = try await container.userRecordID().recordName
        if let expected, !expected.isEmpty, expected != current { throw WorkoutCloudError(code: "account-changed") }
        if let owner = replica.owner, owner != current { throw WorkoutCloudError(code: "account-changed") }
        return current
    }

    private func startEngine() throws {
        guard !diskFailed else { throw WorkoutCloudError(code: "storage") }
        guard replica.enabled, replica.blocked == nil else { throw WorkoutCloudError(code: replica.blocked ?? "disabled") }
        if engine != nil { return }
        var config = CKSyncEngine.Configuration(database: container.privateCloudDatabase,
                                                stateSerialization: replica.engineState, delegate: self)
        config.automaticallySync = true
        let newEngine = CKSyncEngine(config)
        engine = newEngine
        if replica.engineState == nil {
            newEngine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.zoneID))])
        }
        queueDirty(on: newEngine)
    }

    private func recordID(_ name: String) -> CKRecord.ID { CKRecord.ID(recordName: name, zoneID: Self.zoneID) }

    private func queueDirty(on engine: CKSyncEngine) {
        let changes = replica.dirty.keys.map { CKSyncEngine.PendingRecordZoneChange.saveRecord(recordID($0)) }
        if !changes.isEmpty { engine.state.add(pendingRecordZoneChanges: changes) }
    }

    func resumeIfEnabled() async {
        guard replica.enabled else { return }
        do {
            _ = try await account(expected: replica.owner)
            try startEngine()
            problem = nil
        } catch { problem = code(for: error) }
        notify()
    }

    func enable(expectedOwner: String) async throws -> [String: Any] {
        let owner = try await account(expected: expectedOwner)
        var next = replica
        next.owner = owner
        next.enabled = true
        try commit(next)
        try startEngine()
        problem = nil
        notify()
        return status()
    }

    func disable() async throws -> [String: Any] {
        var next = replica
        next.enabled = false
        try commit(next)
        let old = engine
        engine = nil
        await old?.cancelOperations()
        problem = nil
        notify()
        return status()
    }

    func accountChanged() async {
        let old = engine
        engine = nil
        problem = "account-changed"
        // Do not await an operation from its own delegate callback.
        Task { await old?.cancelOperations() }
        notify()
    }

    func exchange(owner: String, changes: String) async throws -> [String: Any] {
        guard replica.enabled, !owner.isEmpty, owner == replica.owner else { throw WorkoutCloudError(code: "account-changed") }
        guard let data = changes.data(using: .utf8) else { throw WorkoutCloudError(code: "schema") }
        let incoming = try JSONDecoder().decode([WorkoutEnvelope].self, from: data)
        var next = replica
        for entry in incoming {
            try entry.validate()
            let name = entry.recordName
            if entry.isNewer(than: next.records[name]) {
                next.records[name] = entry
                next.dirty[name] = entry.revision
            }
        }
        // This acknowledgement means durable native storage, not cloud upload.
        if !incoming.isEmpty { try commit(next) }
        do {
            _ = try await account(expected: owner)
            try startEngine()
            if let engine { queueDirty(on: engine) }
            if ["account-changed", "no-account"].contains(problem ?? "") { problem = nil }
        } catch { problem = code(for: error) }
        // Never expose a replica to a different locally bound account.
        let encoded = try JSONEncoder().encode(Array(replica.records.values))
        return ["owner": owner, "changes": String(decoding: encoded, as: UTF8.self), "status": status()]
    }

    func synchronize() async -> [String: Any] {
        guard replica.enabled, !syncing else { return status() }
        syncing = true
        defer { syncing = false; notify() }
        do {
            _ = try await account(expected: replica.owner)
            try startEngine()
            guard let current = engine else { return status() }
            problem = nil
            // First discover remote edits, then send only the merged winners.
            try await current.fetchChanges()
            guard engine === current else { return status() }
            queueDirty(on: current)
            try await current.sendChanges()
            guard engine === current else { return status() }
            try await current.fetchChanges()
            if replica.dirty.isEmpty && problem == nil {
                var next = replica
                next.lastSync = ISO8601DateFormatter().string(from: Date())
                try commit(next)
            }
        } catch { problem = code(for: error) }
        return status()
    }

    private func systemFields(_ record: CKRecord) -> Data {
        let coder = NSKeyedArchiver(requiringSecureCoding: true)
        record.encodeSystemFields(with: coder)
        coder.finishEncoding()
        return coder.encodedData
    }

    private func makeRecord(_ entry: WorkoutEnvelope, fields: Data?) throws -> CKRecord {
        var existing: CKRecord?
        if let fields {
            let coder = try NSKeyedUnarchiver(forReadingFrom: fields)
            coder.requiresSecureCoding = true
            existing = CKRecord(coder: coder)
            coder.finishDecoding()
        }
        let record = existing ?? CKRecord(recordType: "WorkoutEntry", recordID: recordID(entry.recordName))
        let payload = try JSONEncoder().encode(entry)
        guard payload.count < 900_000 else { throw WorkoutCloudError(code: "record-too-large") }
        record.encryptedValues["payload"] = String(decoding: payload, as: UTF8.self) as CKRecordValue
        return record
    }

    private func merge(_ record: CKRecord, into next: inout WorkoutReplica) throws {
        guard record.recordType == "WorkoutEntry", record.recordID.zoneID == Self.zoneID,
              let payload = record.encryptedValues["payload"] as? String else { throw WorkoutCloudError(code: "schema") }
        let incoming = try JSONDecoder().decode(WorkoutEnvelope.self, from: Data(payload.utf8))
        try incoming.validate()
        let name = record.recordID.recordName
        guard incoming.recordName == name else { throw WorkoutCloudError(code: "schema") }
        if incoming.isNewer(than: next.records[name]) { next.records[name] = incoming }
        next.serverFields[name] = systemFields(record)
        if let local = next.records[name], local.isNewer(than: incoming) { next.dirty[name] = local.revision }
        else { next.dirty[name] = nil }
    }

    func nextRecordZoneChangeBatch(_ context: CKSyncEngine.SendChangesContext, syncEngine: CKSyncEngine) async -> CKSyncEngine.RecordZoneChangeBatch? {
        guard engine === syncEngine, replica.enabled, replica.blocked == nil else { return nil }
        do {
            _ = try await account(expected: replica.owner)
            guard engine === syncEngine else { return nil }
            let changes = Array(syncEngine.state.pendingRecordZoneChanges.filter { context.options.scope.contains($0) }.prefix(100))
            var prepared: [CKRecord.ID: CKRecord] = [:]
            for change in changes {
                if case .saveRecord(let id) = change, let entry = replica.records[id.recordName] {
                    prepared[id] = try makeRecord(entry, fields: replica.serverFields[id.recordName])
                }
            }
            let records = prepared
            return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: changes) { id in records[id] }
        } catch { problem = code(for: error); notify(); return nil }
    }

    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        guard engine === syncEngine else { return }
        do {
            var next = replica
            switch event {
            case .stateUpdate(let event):
                next.engineState = event.stateSerialization
                try commit(next)
                return
            case .accountChange(let event):
                switch event.changeType {
                case .signIn:
                    _ = try await account(expected: replica.owner)
                case .signOut, .switchAccounts:
                    await accountChanged()
                @unknown default: await accountChanged()
                }
                return
            case .fetchedDatabaseChanges(let event):
                if event.deletions.contains(where: { $0.zoneID == Self.zoneID }) {
                    next.blocked = "remote-reset"
                    try commit(next)
                    await accountChanged()
                    problem = "remote-reset"
                }
            case .fetchedRecordZoneChanges(let event):
                for change in event.modifications { try merge(change.record, into: &next) }
                for deletion in event.deletions where deletion.recordID.zoneID == Self.zoneID {
                    let name = deletion.recordID.recordName
                    if let local = next.records[name] {
                        // Normal app deletes are tombstones. Honor a hard delete
                        // from CloudKit tools too, without resurrecting a record.
                        next.records[name] = local.tombstone()
                        next.dirty[name] = nil
                        next.serverFields[name] = nil
                    }
                }
                try commit(next)
                queueDirty(on: syncEngine)
            case .sentRecordZoneChanges(let event):
                if event.failedRecordSaves.isEmpty { problem = nil }
                for record in event.savedRecords { try merge(record, into: &next) }
                for failure in event.failedRecordSaves {
                    let name = failure.record.recordID.recordName
                    if failure.error.code == .serverRecordChanged, let server = failure.error.serverRecord {
                        try merge(server, into: &next)
                    } else if failure.error.code == .zoneNotFound && next.serverFields.isEmpty {
                        syncEngine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.zoneID))])
                    } else if failure.error.code == .unknownItem || failure.error.code == .zoneNotFound {
                        next.blocked = "remote-reset"
                    } else { problem = code(for: failure.error) }
                    if let local = next.records[name], next.dirty[name] != nil { next.dirty[name] = local.revision }
                }
                try commit(next)
                if next.blocked != nil { await accountChanged(); problem = next.blocked }
                else { queueDirty(on: syncEngine) }
            case .didSendChanges:
                if next.dirty.isEmpty && problem == nil {
                    next.lastSync = ISO8601DateFormatter().string(from: Date())
                    try commit(next)
                }
            default: break
            }
            notify()
        } catch {
            // Stop before persisting a newer change token on a failed disk/merge
            // write. The previous atomic snapshot will be replayed on restart.
            problem = code(for: error)
            let old = engine
            engine = nil
            Task { await old?.cancelOperations() }
            notify()
        }
    }
}
