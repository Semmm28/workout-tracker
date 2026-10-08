import Capacitor
import WatchConnectivity
import Foundation

private struct PhoneWatchState: Codable {
    var pending: [String: WorkoutEnvelope] = [:]
    var snapshot: String?
    var generation: Double = 0
}

final class WorkoutWatchBridge: NSObject, WCSessionDelegate {
    static let shared = WorkoutWatchBridge()
    static let changed = Notification.Name("WorkoutWatchChanged")
    private var state = PhoneWatchState()
    private var storageError = false
    private var started = false

    func start() {
        guard !started, WCSession.isSupported() else { return }
        started = true
        do { state = try WatchFiles.read(PhoneWatchState.self, from: WatchFiles.url("phone-watch.json"), fallback: PhoneWatchState()) }
        catch { storageError = true }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func pending() throws -> String {
        guard !storageError else { throw WorkoutCloudError(code: "watch-storage") }
        return String(data: try JSONEncoder().encode(Array(state.pending.values)), encoding: .utf8)!
    }

    func publish(snapshot: String, acknowledgements: String) throws {
        guard !storageError else { throw WorkoutCloudError(code: "watch-storage") }
        let decoded = try JSONDecoder().decode(WatchSnapshot.self, from: Data(snapshot.utf8))
        guard decoded.version == 1 else { throw WorkoutCloudError(code: "watch-schema") }
        let accepted = try JSONDecoder().decode([WorkoutEnvelope].self, from: Data(acknowledgements.utf8))
        var next = state
        for entry in accepted where next.pending[entry.key] == entry { next.pending.removeValue(forKey: entry.key) }
        let changed = next.snapshot != snapshot
        next.snapshot = snapshot
        if changed { next.generation = max(Date().timeIntervalSince1970 * 1000, next.generation + 1) }
        try WatchFiles.write(next, to: WatchFiles.url("phone-watch.json"))
        state = next
        if changed { sendSnapshot() }
    }

    private func packet() throws -> String? {
        guard let snapshot = state.snapshot else { return nil }
        let packet = WatchPacket(generation: state.generation, snapshot: try JSONDecoder().decode(WatchSnapshot.self, from: Data(snapshot.utf8)))
        return String(data: try JSONEncoder().encode(packet), encoding: .utf8)
    }

    private func sendSnapshot() {
        let session = WCSession.default
        guard session.activationState == .activated, session.isWatchAppInstalled else { return }
        do {
            guard let text = try packet() else { return }
            if text.utf8.count < 48_000 {
                try session.updateApplicationContext(["snapshot": text])
                if session.isReachable { session.sendMessage(["snapshot": text], replyHandler: nil, errorHandler: { _ in }) }
            } else {
                // File transfer has no application-context size ceiling.
                let file = try WatchFiles.url("watch-snapshot.json")
                try Data(text.utf8).write(to: file, options: .atomic)
                for transfer in session.outstandingFileTransfers { transfer.cancel() }
                session.transferFile(file, metadata: ["workoutSnapshot": true])
            }
        } catch { /* The persisted snapshot is retried on activation/reachability. */ }
    }

    private func receive(_ message: [String: Any], reply: (([String: Any]) -> Void)? = nil) {
        do {
            guard !storageError else { throw WorkoutCloudError(code: "watch-storage") }
            if let text = message["change"] as? String {
                let envelope = try JSONDecoder().decode(WorkoutEnvelope.self, from: Data(text.utf8))
                _ = try envelope.watchSet()
                if envelope.isNewer(than: state.pending[envelope.key]) {
                    var next = state
                    next.pending[envelope.key] = envelope
                    try WatchFiles.write(next, to: WatchFiles.url("phone-watch.json"))
                    state = next
                }
            }
            NotificationCenter.default.post(name: Self.changed, object: nil)
            if message["requestSnapshot"] as? Bool == true {
                let text = try packet()
                if let text, text.utf8.count < 48_000 { reply?(["snapshot": text]) }
                else { reply?(["received": true]); sendSnapshot() }
            } else { reply?(["received": true]) }
        } catch { reply?(["error": "watch-storage"]) }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.sendSnapshot() }
    }
    func sessionReachabilityDidChange(_ session: WCSession) { DispatchQueue.main.async { self.sendSnapshot() } }
    func sessionWatchStateDidChange(_ session: WCSession) { DispatchQueue.main.async { self.sendSnapshot() } }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async { self.receive(message, reply: replyHandler) }
    }
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        DispatchQueue.main.async { self.receive(userInfo) }
    }
}

@objc(WorkoutWatchPlugin)
public class WorkoutWatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutWatchPlugin"
    public let jsName = "WorkoutWatch"
    public let pluginMethods = [CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "publish", returnType: CAPPluginReturnPromise)]
    private var observer: NSObjectProtocol?
    public override func load() {
        DispatchQueue.main.async { WorkoutWatchBridge.shared.start() }
        observer = NotificationCenter.default.addObserver(forName: WorkoutWatchBridge.changed, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("watchChanged", data: [:])
        }
    }
    deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
    @objc func pending(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { WorkoutWatchBridge.shared.start(); call.resolve(["changes": try WorkoutWatchBridge.shared.pending()]) }
            catch { call.reject("Watch-opslag is niet beschikbaar", "watch-storage") }
        }
    }
    @objc func publish(_ call: CAPPluginCall) {
        guard let snapshot = call.getString("snapshot"), let acknowledgements = call.getString("acknowledgements") else { call.reject("Missing Watch data"); return }
        DispatchQueue.main.async {
            do { try WorkoutWatchBridge.shared.publish(snapshot: snapshot, acknowledgements: acknowledgements); call.resolve() }
            catch { call.reject("Watch-uitwisseling niet voltooid", "watch-storage") }
        }
    }
}
