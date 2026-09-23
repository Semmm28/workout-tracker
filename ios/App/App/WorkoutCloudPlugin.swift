import Capacitor
import CloudKit
import UIKit

@objc(WorkoutCloudPlugin)
public class WorkoutCloudPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutCloudPlugin"
    public let jsName = "WorkoutCloud"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exchange", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "synchronize", returnType: CAPPluginReturnPromise)
    ]
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        guard #available(iOS 17.0, *) else { return }
        observers.append(NotificationCenter.default.addObserver(forName: WorkoutCloudStore.changed, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("syncChanged", data: [:])
        })
        observers.append(NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { _ in
            Task { await WorkoutCloudStore.shared.accountChanged() }
        })
    }

    deinit { observers.forEach(NotificationCenter.default.removeObserver) }

    private func perform(_ call: CAPPluginCall, operation: String) {
        guard #available(iOS 17.0, *) else {
            if operation == "getStatus" { call.resolve(["supported": false, "enabled": false, "code": "unsupported"]) }
            else { call.reject("iOS 17 is required", "unsupported") }
            return
        }
        let owner = call.getString("owner") ?? ""
        let changes = call.getString("changes") ?? "[]"
        Task {
            do {
                let store = WorkoutCloudStore.shared
                let result: [String: Any]
                switch operation {
                case "getStatus":
                    await store.resumeIfEnabled()
                    result = await store.status()
                case "enable":
                    result = try await store.enable(expectedOwner: owner)
                    await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
                case "disable": result = try await store.disable()
                case "exchange": result = try await store.exchange(owner: owner, changes: changes)
                default: result = await store.synchronize()
                }
                call.resolve(result)
            } catch {
                // Never include records, account identifiers or CKError userInfo
                // in logs/bridge errors; the UI only needs an actionable code.
                let code = (error as? WorkoutCloudError)?.code ?? ((error as? CKError)?.code == .notAuthenticated ? "no-account" : "error")
                call.reject("iCloud sync: \(code)", code)
            }
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) { perform(call, operation: "getStatus") }
    @objc func enable(_ call: CAPPluginCall) { perform(call, operation: "enable") }
    @objc func disable(_ call: CAPPluginCall) { perform(call, operation: "disable") }
    @objc func exchange(_ call: CAPPluginCall) { perform(call, operation: "exchange") }
    @objc func synchronize(_ call: CAPPluginCall) { perform(call, operation: "synchronize") }
}

class WorkoutViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(WorkoutCloudPlugin()) }
}
