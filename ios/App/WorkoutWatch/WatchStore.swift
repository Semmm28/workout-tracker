import Foundation
import Combine
import WatchConnectivity
import WatchKit
import UserNotifications

final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var replica = WatchReplica()
    @Published var error: String?
    @Published private(set) var reachable = false
    private var writable = true

    override init() {
        super.init()
        do { replica = try WatchFiles.read(WatchReplica.self, from: WatchFiles.url("watch-workouts.json"), fallback: WatchReplica()) }
        catch { writable = false; self.error = "De opgeslagen sets kunnen niet worden gelezen. Verwijder de app niet; probeer je Watch opnieuw op te starten." }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    @discardableResult
    private func commit(_ update: (inout WatchReplica) throws -> Void) -> Bool {
        guard writable else { return false }
        do {
            var next = replica
            try update(&next)
            try WatchFiles.write(next, to: WatchFiles.url("watch-workouts.json"))
            replica = next
            return true
        } catch { self.error = "Opslaan is niet gelukt. Houd dit scherm open en probeer het opnieuw."; return false }
    }

    var today: [WatchSet] { replica.sets.filter { Calendar.current.isDateInToday($0.date) } }
    var syncLabel: String {
        if !replica.pending.isEmpty { return "\(replica.pending.count) wijziging(en) op Watch · wacht op iPhone" }
        return replica.generation == 0 ? "Open Workout Log op je iPhone" : "Sets op iPhone opgeslagen"
    }
    var recentMachines: [WatchMachine] {
        replica.snapshot.machines.filter { replica.lastSet($0.id) != nil }
            .sorted { (replica.lastSet($0.id)?.date ?? .distantPast) > (replica.lastSet($1.id)?.date ?? .distantPast) }
            .prefix(5).map { $0 }
    }
    func brandName(_ machine: WatchMachine) -> String { replica.snapshot.brands.first { $0.id == machine.brandId }?.name ?? "" }
    func machineName(_ set: WatchSet) -> String { replica.snapshot.machines.first { $0.id == set.machineId }?.name ?? "Verwijderd apparaat" }

    func log(machine: WatchMachine, weight: Double, reps: Int, existing: WatchSet? = nil) -> Bool {
        let timestamp = WatchSet.timestamp()
        var set = existing ?? WatchSet(id: "watch-" + UUID().uuidString, machineId: machine.id, weight: weight, reps: reps, loggedAt: timestamp, createdAt: timestamp)
        set.weight = weight; set.reps = reps; set.updatedAt = timestamp
        guard commit({ next in
            try next.save(set)
            if existing == nil { next.restUntil = Date().addingTimeInterval(next.restSeconds); next.restSetId = set.id }
        }) else { return false }
        WKInterfaceDevice.current().play(.success)
        if existing == nil { scheduleRestNotification() }
        sendPending()
        return true
    }

    func undoLastSet() -> Bool {
        guard let id = replica.restSetId, let set = replica.sets.first(where: { $0.id == id }) else { return false }
        guard commit({ next in try next.save(set, deleted: true); next.restUntil = nil; next.restSetId = nil }) else { return false }
        cancelRestNotification(); sendPending(); return true
    }
    func endRest() {
        if commit({ $0.restUntil = nil; $0.restSetId = nil }) { cancelRestNotification() }
    }
    func extendRest() {
        if commit({ $0.restUntil = max($0.restUntil ?? Date(), Date()).addingTimeInterval(30) }) { scheduleRestNotification() }
    }
    func preferences(weightStep: Double, restSeconds: Double) {
        guard [0.5, 1, 2.5, 5].contains(weightStep), (30...180).contains(restSeconds) else { return }
        _ = commit { $0.weightStep = weightStep; $0.restSeconds = restSeconds }
    }

    func refresh() {
        guard WCSession.default.activationState == .activated else { return }
        receive(WCSession.default.receivedApplicationContext)
        sendPending()
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(["requestSnapshot": true], replyHandler: { message in
                DispatchQueue.main.async { self.receive(message) }
            }, errorHandler: { _ in })
        }
    }

    private func receive(_ message: [String: Any]) {
        guard let text = message["snapshot"] as? String else { return }
        do {
            let packet = try JSONDecoder().decode(WatchPacket.self, from: Data(text.utf8))
            _ = commit { try $0.receive(packet) }
        } catch { error = "Werk Workout Log op je iPhone en Watch bij om opnieuw te synchroniseren." }
    }

    private func sendPending() {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        for record in replica.pending.values {
            guard let data = try? JSONEncoder().encode(record), let text = String(data: data, encoding: .utf8) else { continue }
            let message: [String: Any] = ["change": text, "key": record.key, "revision": record.revision]
            if !session.outstandingUserInfoTransfers.contains(where: { $0.userInfo["key"] as? String == record.key && $0.userInfo["revision"] as? String == record.revision }) {
                session.transferUserInfo(message)
            }
            if session.isReachable { session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in }) }
        }
    }

    private func cancelRestNotification() { UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["workout-rest"]) }
    private func scheduleRestNotification() {
        cancelRestNotification()
        let deadline = replica.restUntil
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { allowed, _ in
            guard allowed, let deadline else { return }
            DispatchQueue.main.async {
                guard self.replica.restUntil == deadline, deadline > Date() else { return }
                let content = UNMutableNotificationContent()
                content.title = "Rust voorbij"
                content.body = "Klaar voor je volgende set."
                content.sound = .default
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, deadline.timeIntervalSinceNow), repeats: false)
                UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "workout-rest", content: content, trigger: trigger))
            }
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.reachable = session.isReachable; self.refresh() }
    }
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.reachable = session.isReachable; self.refresh() }
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { self.receive(applicationContext) }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { self.receive(message) }
    }
    func session(_ session: WCSession, didReceiveFile file: WCSessionFile) {
        // WCSession deletes this temporary file after the delegate returns.
        guard file.metadata?["workoutSnapshot"] as? Bool == true, let text = try? String(contentsOf: file.fileURL, encoding: .utf8) else { return }
        DispatchQueue.main.async { self.receive(["snapshot": text]) }
    }
}
