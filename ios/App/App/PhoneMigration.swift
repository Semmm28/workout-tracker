import SwiftUI
import Capacitor

@objc(WorkoutMigrationPlugin)
public class WorkoutMigrationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutMigrationPlugin"
    public let jsName = "WorkoutMigration"
    public let pluginMethods = [CAPPluginMethod(name: "complete", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "failed", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise)]
    @objc func prepare(_ call: CAPPluginCall) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-test-migration") {
            call.resolve(["testFixture": true]); return
        }
        #endif
        call.resolve(["testFixture": false])
    }
    @objc func complete(_ call: CAPPluginCall) {
        guard let text = call.getString("payload") else { call.reject("Missing migration data"); return }
        Task { @MainActor in
            do { try await PhoneStore.shared.migrated(Data(text.utf8)); call.resolve() }
            catch { PhoneStore.shared.migrationFailed(); call.reject("Gegevensovername niet voltooid") }
        }
    }
    @objc func failed(_ call: CAPPluginCall) {
        Task { @MainActor in PhoneStore.shared.migrationFailed(); call.resolve() }
    }
}

// The original Capacitor origin is needed once to read existing IndexedDB data.
// It never renders the app UI or writes to the user's legacy database.
struct LegacyDatabaseReader: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WorkoutViewController { WorkoutViewController() }
    func updateUIViewController(_ controller: WorkoutViewController, context: Context) {}
}
