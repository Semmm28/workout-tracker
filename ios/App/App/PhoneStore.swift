import SwiftUI
import CloudKit
import UniformTypeIdentifiers

@MainActor
final class PhoneStore: ObservableObject {
    static let shared = PhoneStore()
    enum Phase { case loading, migrating, ready, failed }
    @Published private(set) var phase = Phase.loading
    @Published private(set) var data = PhonePresentation()
    var snapshot: PhoneSnapshot { data.snapshot }
    var brands: [WorkoutRecord] { data.brands }
    var machines: [WorkoutRecord] { data.machines }
    var sets: [WorkoutRecord] { data.sets }
    var bodyweights: [WorkoutRecord] { data.bodyweights }
    @Published private(set) var cloudEnabled = false
    @Published private(set) var cloudCode = "disabled"
    @Published private(set) var syncBusy = false
    @Published private(set) var watchError = false
    @Published var error: String?
    @Published var notice: String?
    @Published private(set) var undoRecords: [String: [WorkoutRecord]]?
    @Published private(set) var migrationAttempt = 0
    private var repository: PhoneRepository?
    private var observers: [NSObjectProtocol] = []
    private var refreshAgain = false
    private var started = false

    func start() async {
        guard !started else { return }
        started = true
        do {
            var url = try WatchFiles.url("phone-native-v1.json")
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-test-empty") || ProcessInfo.processInfo.arguments.contains("--ui-test-migration") || ProcessInfo.processInfo.arguments.contains("--ui-test-large-history") {
                url = try WatchFiles.url("phone-ui-test-v1.json")
                if ProcessInfo.processInfo.arguments.contains("--ui-test-reset") { try? FileManager.default.removeItem(at: url) }
            }
            #endif
            let targetURL = url
            let repo = try await Task.detached(priority: .userInitiated) { try PhoneRepository(url: targetURL) }.value
            repository = repo
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-test-empty"), !(await repo.read()).migrated {
                _ = try await repo.migrate(Data("{\"backup\":{\"version\":1},\"journal\":[],\"owner\":\"\",\"chartMode\":\"e1rmMax\"}".utf8))
            }
            if ProcessInfo.processInfo.arguments.contains("--ui-test-large-history") { try await repo.seedLargeTestHistory() }
            #endif
            await reload()
            phase = snapshot.migrated ? .ready : .migrating
            observe()
            if phase == .ready { await refresh(manual: true) }
        } catch { phase = .failed; self.error = PhoneDataError.storage.localizedDescription }
    }
    func retryMigration() async {
        error = nil
        if repository == nil { started = false; await start() }
        else { migrationAttempt += 1; phase = .migrating }
    }
    func migrated(_ data: Data) async throws {
        guard let repository else { throw PhoneDataError.notReady }
        _ = try await repository.migrate(data); await reload(); phase = .ready
        Task { await refresh(manual: true) }
    }
    func migrationFailed() { phase = .failed; error = "Je bestaande gegevens konden niet worden overgenomen. Ze zijn niet verwijderd. Probeer opnieuw." }
    private func reload() async {
        guard let repository else { return }
        let next = await repository.presentation()
        // A later save may finish while an earlier refresh is suspended.
        guard next.generation > data.generation || (phase == .loading && next.generation == data.generation) else { return }
        data = next
    }
    private func observe() {
        guard observers.isEmpty else { return }
        observers.append(NotificationCenter.default.addObserver(forName: WorkoutWatchBridge.changed, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        })
        if #available(iOS 17, *) {
            observers.append(NotificationCenter.default.addObserver(forName: WorkoutCloudStore.changed, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in await self?.refresh() }
            })
            observers.append(NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
                Task { await WorkoutCloudStore.shared.accountChanged(); await self?.refresh() }
            })
        }
    }
    func save(kind: String, row: WorkoutRecord, existing: Bool) async throws {
        guard let repository else { throw PhoneDataError.notReady }
        _ = try await repository.save(kind: kind, record: row, existing: existing)
        await reload()
        Task { await refresh() }
    }
    func remove(kind: String, id: String) async {
        guard let repository else { return }
        do {
            let (_, removed) = try await repository.remove(kind: kind, id: id)
            await reload(); undoRecords = removed; notice = "Verwijderd"
            Task { await refresh() }
        } catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func undo() async {
        guard let repository, let rows = undoRecords else { return }
        do { _ = try await repository.restore(rows); await reload(); undoRecords = nil; notice = nil; Task { await refresh() } }
        catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func reorder(kind: String, ids: [String]) async {
        guard let repository else { return }
        do { _ = try await repository.reorder(kind: kind, ids: ids); await reload(); Task { await refresh() } }
        catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func setChartMode(_ mode: String) async {
        guard let repository else { return }
        do { _ = try await repository.preference(mode); await reload() } catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func importBackup(_ data: Data) async throws {
        guard let repository else { throw PhoneDataError.notReady }
        do { _ = try await repository.importBackup(data); await reload(); notice = "Back-up geïmporteerd"; undoRecords = nil; Task { await refresh() } }
        catch let error as PhoneDataError { throw error }
        catch is DecodingError { throw PhoneDataError.invalidBackup }
        catch { throw PhoneDataError.storage }
    }
    func exportBackup() async throws -> Data {
        guard let repository else { throw PhoneDataError.notReady }
        return try await repository.exportBackup()
    }
    func brandName(_ machine: WorkoutRecord) -> String { data.brandsByID[machine.text("brandId")]?.name ?? "Onbekend merk" }
    func machineName(_ entry: WorkoutRecord) -> String { data.machinesByID[entry.text("machineId")]?.name ?? "Verwijderd apparaat" }

    func refresh(manual: Bool = false) async {
        guard phase == .ready, let repository else { return }
        if syncBusy { refreshAgain = true; return }
        syncBusy = true
        do {
            WorkoutWatchBridge.shared.start()
            let pending = try WorkoutWatchBridge.shared.pending()
            try await repository.mergeJSON(pending, fromWatch: true)
            await reload()
            try await publishWatch(acknowledgements: pending)
            if watchError { watchError = false }
        } catch { if !watchError { watchError = true } }
        if #available(iOS 17, *) {
            do {
                let cloud = WorkoutCloudStore.shared
                let status = await cloud.status()
                updateCloud(status)
                if cloudEnabled {
                    let owner = status["owner"] as? String ?? ""
                    guard !owner.isEmpty, snapshot.owner.isEmpty || snapshot.owner == owner else { throw PhoneDataError.account }
                    _ = try await repository.merge([], owner: owner); await reload()
                    try await exchangeCloud(owner: owner)
                    if manual { updateCloud(await cloud.synchronize()); try await exchangeCloud(owner: owner) }
                    try? await publishWatch(acknowledgements: "[]")
                }
            } catch { cloudCode = error is PhoneDataError ? "account-changed" : "error" }
        } else { cloudCode = "unsupported" }
        syncBusy = false
        if refreshAgain { refreshAgain = false; Task { await refresh() } }
    }
    private func publishWatch(acknowledgements: String) async throws {
        guard let repository else { return }
        let text = try await repository.watchSnapshot()
        try WorkoutWatchBridge.shared.publish(snapshot: text, acknowledgements: acknowledgements)
    }
    @available(iOS 17, *)
    private func exchangeCloud(owner: String) async throws {
        guard let repository else { return }
        let changes = try await repository.cloudChanges()
        let response = try await WorkoutCloudStore.shared.exchange(owner: owner, changes: changes)
        guard response["owner"] as? String == owner, let text = response["changes"] as? String else { throw PhoneDataError.account }
        try await repository.mergeJSON(text, owner: owner); await reload()
        if let status = response["status"] as? [String: Any] { updateCloud(status) }
    }
    func setCloudEnabled(_ enabled: Bool) async {
        guard #available(iOS 17, *), !syncBusy, let repository else { return }
        syncBusy = true
        do {
            let cloud = WorkoutCloudStore.shared
            if enabled {
                let status = try await cloud.enable(expectedOwner: snapshot.owner)
                guard let owner = status["owner"] as? String, !owner.isEmpty else { throw PhoneDataError.account }
                _ = try await repository.merge([], owner: owner); await reload(); updateCloud(status)
                UIApplication.shared.registerForRemoteNotifications()
            } else { updateCloud(try await cloud.disable()) }
        } catch { self.error = error is PhoneDataError ? error.localizedDescription : "iCloud kon niet worden gewijzigd. Controleer je account en verbinding." }
        syncBusy = false
        await refresh(manual: enabled)
    }
    private func updateCloud(_ status: [String: Any]) {
        let enabled = status["enabled"] as? Bool ?? false, code = status["code"] as? String ?? "error"
        if cloudEnabled != enabled { cloudEnabled = enabled }
        if cloudCode != code { cloudCode = code }
    }
    var cloudMessage: String {
        switch cloudCode {
        case "disabled": return "Je gegevens staan op deze iPhone."
        case "ready": return "Verbonden met je persoonlijke iCloud."
        case "pending": return "Wijzigingen wachten op iCloud. Je kunt offline doorgaan."
        case "unsupported": return "iCloud-synchronisatie vereist iOS 17 of nieuwer."
        case "no-account": return "Log in bij iCloud in de instellingen van je iPhone."
        case "account-changed": return PhoneDataError.account.localizedDescription
        case "quota": return "Je iCloud-opslag is vol. Maak ruimte vrij om te synchroniseren."
        case "offline": return "iCloud is tijdelijk niet bereikbaar. Wijzigingen blijven lokaal bewaard."
        case "remote-reset": return "De iCloud-database is buiten de app verwijderd. Exporteer eerst je lokale gegevens."
        case "schema": return "De iCloud-database is nog niet gereed voor deze appversie."
        case "restricted": return "iCloud is niet beschikbaar door een beperking op dit apparaat."
        case "storage": return "De lokale iCloud-wachtrij is niet beschikbaar. Exporteer je gegevens."
        default: return "Synchronisatie is niet voltooid. Je lokale gegevens blijven bewaard; probeer opnieuw."
        }
    }
}

struct WorkoutBackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
