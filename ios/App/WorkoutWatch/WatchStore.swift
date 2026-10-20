import Foundation
import Combine
import WatchConnectivity
import WatchKit
import UserNotifications

@MainActor
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var data = WatchPresentation()
    @Published var error: String?
    @Published private(set) var loading = true
    @Published private(set) var ready = false
    @Published private(set) var saving = false
    private let repository = WatchRepository()
    private var refreshing = false
    var replica: WatchReplica { data.replica }

    override init() {
        super.init()
        WCSession.default.delegate = self
        WCSession.default.activate()
        Task { await load() }
    }

    private func apply(_ next: WatchPresentation) {
        guard !ready || next.revision > data.revision else { return }
        data = next
        if !ready { ready = true }
    }

    private func load() async {
        defer { loading = false }
        do { apply(try await repository.presentation()) }
        catch { self.error = "De opgeslagen sets kunnen niet worden gelezen. Verwijder de app niet; probeer je Watch opnieuw op te starten." }
    }

    @discardableResult
    private func commit(_ update: @Sendable (inout WatchReplica) throws -> Void) async -> Bool {
        guard ready, !saving else { return false }
        saving = true
        defer { saving = false }
        do {
            apply(try await repository.update(update))
            return true
        } catch { self.error = "Opslaan is niet gelukt. Houd dit scherm open en probeer het opnieuw."; return false }
    }

    var today: [WatchSet] { data.today }
    var syncLabel: String {
        if !replica.pending.isEmpty { return "\(replica.pending.count) wijziging(en) op Watch · wacht op iPhone" }
        return replica.generation == 0 ? "Open Workout Log op je iPhone" : "Sets op iPhone opgeslagen"
    }
    var recentMachines: [WatchMachine] { data.recentMachines }
    func brandName(_ machine: WatchMachine) -> String { data.brandsByID[machine.brandId]?.name ?? "" }
    func machineName(_ set: WatchSet) -> String { data.machinesByID[set.machineId]?.name ?? "Verwijderd apparaat" }

    func log(machine: WatchMachine, weight: Double, reps: Int, existing: WatchSet? = nil) async -> Bool {
        let timestamp = WatchSet.timestamp()
        var set = existing ?? WatchSet(id: "watch-" + UUID().uuidString, machineId: machine.id, weight: weight, reps: reps, loggedAt: timestamp, createdAt: timestamp)
        set.weight = weight; set.reps = reps; set.updatedAt = timestamp
        let savedSet = set
        guard await commit({ next in
            guard next.snapshot.machines.contains(where: { $0.id == machine.id }) else { throw WorkoutCloudError(code: "watch-machine-deleted") }
            try next.save(savedSet)
            if existing == nil { next.restUntil = Date().addingTimeInterval(next.restSeconds); next.restSetId = savedSet.id }
        }) else { return false }
        WKInterfaceDevice.current().play(.success)
        if existing == nil { scheduleRestNotification() }
        sendPending()
        return true
    }

    func undoLastSet() async -> Bool {
        guard let id = replica.restSetId, let set = data.sets.first(where: { $0.id == id }) else { return false }
        guard await commit({ next in try next.save(set, deleted: true); next.restUntil = nil; next.restSetId = nil }) else { return false }
        cancelRestNotification(); sendPending(); return true
    }
    func endRest() async -> Bool {
        guard await commit({ $0.restUntil = nil; $0.restSetId = nil }) else { return false }
        cancelRestNotification()
        return true
    }
    func extendRest() async {
        if await commit({ $0.restUntil = max($0.restUntil ?? Date(), Date()).addingTimeInterval(30) }) { scheduleRestNotification() }
    }
    func preferences(weightStep: Double? = nil, restSeconds: Double? = nil) async {
        guard weightStep.map({ [0.5, 1, 2.5, 5].contains($0) }) ?? true,
              restSeconds.map({ (30...180).contains($0) }) ?? true else { return }
        _ = await commit {
            if let weightStep { $0.weightStep = weightStep }
            if let restSeconds { $0.restSeconds = restSeconds }
        }
    }

    func refresh() {
        guard !refreshing else { return }
        refreshing = true
        Task {
            defer { refreshing = false }
            await load()
            guard ready, WCSession.default.activationState == .activated else { return }
            if let text = WCSession.default.receivedApplicationContext["snapshot"] as? String { await receive(text) }
            sendPending()
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(["requestSnapshot": true], replyHandler: { message in
                    guard let text = message["snapshot"] as? String else { return }
                    Task { @MainActor in await self.receive(text) }
                }, errorHandler: { _ in })
            }
        }
    }

    private func receive(_ text: String) async {
        do {
            apply(try await repository.receive(text))
        } catch { self.error = "Werk Workout Log op je iPhone en Watch bij om opnieuw te synchroniseren." }
    }

    private func sendPending() {
        Task {
            // Encoding and queuing an offline backlog must not monopolize the UI.
            await repository.sendPending()
        }
    }

    private func cancelRestNotification() { UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["workout-rest"]) }
    private func scheduleRestNotification() {
        cancelRestNotification()
        let deadline = replica.restUntil
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { allowed, _ in
            guard allowed, let deadline else { return }
            Task { @MainActor in
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

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.refresh() }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in self.refresh() }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let text = applicationContext["snapshot"] as? String else { return }
        Task { @MainActor in await self.receive(text) }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let text = message["snapshot"] as? String else { return }
        Task { @MainActor in await self.receive(text) }
    }
    nonisolated func session(_ session: WCSession, didReceive file: WCSessionFile) {
        // WCSession deletes this temporary file after the delegate returns.
        guard file.metadata?["workoutSnapshot"] as? Bool == true, let text = try? String(contentsOf: file.fileURL, encoding: .utf8) else { return }
        Task { @MainActor in await self.receive(text) }
    }
}

extension WatchRepository {
    func sendPending() {
        let session = WCSession.default
        guard session.activationState == .activated, let data = try? presentation() else { return }
        var queued = Set(session.outstandingUserInfoTransfers.compactMap { transfer -> String? in
            guard let key = transfer.userInfo["key"] as? String, let revision = transfer.userInfo["revision"] as? String else { return nil }
            return key + ":" + revision
        })
        for record in data.replica.pending.values {
            guard let encoded = try? JSONEncoder().encode(record) else { continue }
            let message: [String: Any] = ["change": String(decoding: encoded, as: UTF8.self), "key": record.key, "revision": record.revision]
            if queued.insert(record.key + ":" + record.revision).inserted { session.transferUserInfo(message) }
            if session.isReachable { session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in }) }
        }
    }
}
