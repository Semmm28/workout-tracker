import SwiftUI
import CloudKit
import UniformTypeIdentifiers

@MainActor
final class PhoneStore: ObservableObject {
    static let shared = PhoneStore()
    enum Phase { case loading, migrating, ready, failed }
    @Published private(set) var phase = Phase.loading
    @Published private(set) var snapshot = PhoneSnapshot()
    @Published private(set) var brands: [WorkoutRecord] = []
    @Published private(set) var machines: [WorkoutRecord] = []
    @Published private(set) var sets: [WorkoutRecord] = []
    @Published private(set) var bodyweights: [WorkoutRecord] = []
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
            if ProcessInfo.processInfo.arguments.contains("--ui-test-empty") || ProcessInfo.processInfo.arguments.contains("--ui-test-migration") {
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
            #endif
            apply(await repo.read())
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
        apply(try await repository.migrate(data)); phase = .ready
        Task { await refresh(manual: true) }
    }
    func migrationFailed() { phase = .failed; error = "Je bestaande gegevens konden niet worden overgenomen. Ze zijn niet verwijderd. Probeer opnieuw." }
    private func apply(_ next: PhoneSnapshot) {
        guard next != snapshot || phase == .loading else { return }
        snapshot = next
        let backup = next.backup()
        if brands != backup.brands { brands = backup.brands }
        let brandIDs = Set(backup.brands.map(\.id))
        let visibleMachines = backup.machines.filter { brandIDs.contains($0.text("brandId")) }
        if machines != visibleMachines { machines = visibleMachines }
        let machineIDs = Set(visibleMachines.map(\.id))
        let visibleSets = backup.sets.filter { machineIDs.contains($0.text("machineId")) }
        if sets != visibleSets { sets = visibleSets }
        if bodyweights != backup.bodyweights { bodyweights = backup.bodyweights }
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
        apply(try await repository.save(kind: kind, record: row, existing: existing))
        Task { await refresh() }
    }
    func remove(kind: String, id: String) async {
        guard let repository else { return }
        do {
            let (next, removed) = try await repository.remove(kind: kind, id: id)
            apply(next); undoRecords = removed; notice = "Verwijderd"
            Task { await refresh() }
        } catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func undo() async {
        guard let repository, let rows = undoRecords else { return }
        do { apply(try await repository.restore(rows)); undoRecords = nil; notice = nil; Task { await refresh() } }
        catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func reorder(kind: String, ids: [String]) async {
        guard let repository else { return }
        do { apply(try await repository.reorder(kind: kind, ids: ids)); Task { await refresh() } }
        catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func setChartMode(_ mode: String) async {
        guard let repository else { return }
        do { apply(try await repository.preference(mode)) } catch { self.error = PhoneDataError.storage.localizedDescription }
    }
    func importBackup(_ data: Data) async throws {
        guard let repository else { throw PhoneDataError.notReady }
        do { apply(try await repository.importBackup(data)); notice = "Back-up geïmporteerd"; undoRecords = nil; Task { await refresh() } }
        catch let error as PhoneDataError { throw error }
        catch is DecodingError { throw PhoneDataError.invalidBackup }
        catch { throw PhoneDataError.storage }
    }
    func exportBackup() throws -> Data { try PhoneSnapshot.encoder().encode(snapshot.backup()) }
    func brandName(_ machine: WorkoutRecord) -> String { brands.first { $0.id == machine.text("brandId") }?.name ?? "Onbekend merk" }
    func machineName(_ entry: WorkoutRecord) -> String { machines.first { $0.id == entry.text("machineId") }?.name ?? "Verwijderd apparaat" }

    func refresh(manual: Bool = false) async {
        guard phase == .ready, let repository else { return }
        if syncBusy { refreshAgain = true; return }
        syncBusy = true
        do {
            WorkoutWatchBridge.shared.start()
            let pending = try WorkoutWatchBridge.shared.pending()
            let entries = try JSONDecoder().decode([WorkoutEnvelope].self, from: Data(pending.utf8))
            for entry in entries { _ = try entry.watchSet() }
            apply(try await repository.merge(entries))
            try publishWatch(acknowledgements: pending)
            watchError = false
        } catch { watchError = true }
        if #available(iOS 17, *) {
            do {
                let cloud = WorkoutCloudStore.shared
                let status = await cloud.status()
                updateCloud(status)
                if cloudEnabled {
                    let owner = status["owner"] as? String ?? ""
                    guard !owner.isEmpty, snapshot.owner.isEmpty || snapshot.owner == owner else { throw PhoneDataError.account }
                    apply(try await repository.merge([], owner: owner))
                    try await exchangeCloud(owner: owner)
                    if manual { updateCloud(await cloud.synchronize()); try await exchangeCloud(owner: owner) }
                    try? publishWatch(acknowledgements: "[]")
                }
            } catch { cloudCode = error is PhoneDataError ? "account-changed" : "error" }
        } else { cloudCode = "unsupported" }
        syncBusy = false
        if refreshAgain { refreshAgain = false; Task { await refresh() } }
    }
    private func publishWatch(acknowledgements: String) throws {
        var watch = WatchSnapshot()
        watch.brands = brands.map { WatchBrand(id: $0.id, name: $0.name) }
        watch.machines = machines.map { WatchMachine(id: $0.id, name: $0.name, brandId: $0.text("brandId")) }
        watch.lastSets = machines.compactMap { machine in
            guard let last = sets.filter({ $0.text("machineId") == machine.id }).max(by: { $0.date < $1.date }) else { return nil }
            return try? JSONDecoder().decode(WatchSet.self, from: PhoneSnapshot.encoder().encode(last))
        }
        watch.watchRecords = snapshot.records.values.filter { $0.kind == "sets" && $0.id.hasPrefix("watch-") }.sorted { $0.key < $1.key }
        try WorkoutWatchBridge.shared.publish(snapshot: String(decoding: PhoneSnapshot.encoder().encode(watch), as: UTF8.self), acknowledgements: acknowledgements)
    }
    @available(iOS 17, *)
    private func exchangeCloud(owner: String) async throws {
        guard let repository else { return }
        let response = try await WorkoutCloudStore.shared.exchange(owner: owner, changes: String(decoding: PhoneSnapshot.encoder().encode(Array(snapshot.records.values)), as: UTF8.self))
        guard response["owner"] as? String == owner, let text = response["changes"] as? String else { throw PhoneDataError.account }
        apply(try await repository.merge(JSONDecoder().decode([WorkoutEnvelope].self, from: Data(text.utf8)), owner: owner))
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
                apply(try await repository.merge([], owner: owner)); updateCloud(status)
                UIApplication.shared.registerForRemoteNotifications()
            } else { updateCloud(try await cloud.disable()) }
        } catch { self.error = error is PhoneDataError ? error.localizedDescription : "iCloud kon niet worden gewijzigd. Controleer je account en verbinding." }
        syncBusy = false
        await refresh(manual: enabled)
    }
    private func updateCloud(_ status: [String: Any]) { cloudEnabled = status["enabled"] as? Bool ?? false; cloudCode = status["code"] as? String ?? "error" }
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
