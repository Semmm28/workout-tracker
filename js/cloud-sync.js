import { getAll, mergeCloudChanges, onDatabaseChange, seedSyncJournal, syncMeta } from './database.js';

export const cloudStatus = { supported: false, enabled: false, busy: false, code: 'disabled', pending: 0, lastSync: null };
let plugin;
let onChange = () => {};
let running;
let timer;
let rerun = false;

const messages = {
  disabled: 'iCloud-synchronisatie staat uit. Je gegevens staan op dit apparaat.',
  ready: 'Verbonden met je persoonlijke iCloud.',
  syncing: 'Wijzigingen uitwisselen met iCloud…',
  pending: 'Wijzigingen wachten op iCloud. Je kunt offline doorgaan.',
  'no-account': 'Log in bij iCloud in de instellingen van je iPhone.',
  'account-changed': 'Er is een ander iCloud-account actief. Synchronisatie is gepauzeerd. Log weer in met het oorspronkelijke account; je lokale gegevens blijven bewaard.',
  restricted: 'iCloud is niet beschikbaar door een beperking op dit apparaat.',
  offline: 'iCloud is tijdelijk niet bereikbaar. Je wijzigingen blijven lokaal bewaard en worden later opnieuw geprobeerd.',
  quota: 'Je iCloud-opslag is vol. Maak ruimte vrij om verder te synchroniseren.',
  schema: 'De iCloud-database is nog niet gereed voor deze appversie.',
  storage: 'De lokale iCloud-wachtrij kan niet worden gelezen of opgeslagen. Exporteer je gegevens en probeer de app opnieuw te openen.',
  'remote-reset': 'De iCloud-gegevens zijn buiten deze app verwijderd. Synchronisatie is gestopt; exporteer eerst je lokale gegevens voordat je verdergaat.',
  'record-too-large': 'Een record is te groot voor iCloud. Kort lange notities in; je gegevens blijven lokaal bewaard.',
  unsupported: 'iCloud-synchronisatie vereist iOS 17 of nieuwer. JSON-back-ups blijven beschikbaar.',
  error: 'Synchronisatie is niet gelukt. Je lokale gegevens blijven bewaard. Probeer het later opnieuw.',
};

export function cloudStatusMessage() {
  return messages[cloudStatus.busy ? 'syncing' : cloudStatus.code] || messages.error;
}

function update(status) {
  Object.assign(cloudStatus, status);
  onChange(false);
}

function schedule() {
  clearTimeout(timer);
  if (!cloudStatus.enabled) return;
  timer = setTimeout(() => { void syncCloud(); }, 600);
}

async function exchange() {
  const owner = await syncMeta('owner');
  const response = await plugin.exchange({ owner: owner || '', changes: JSON.stringify(await getAll('syncRecords')) });
  if (response.owner !== owner) throw Object.assign(new Error('Account mismatch'), { code: 'account-changed' });
  const changed = await mergeCloudChanges(JSON.parse(response.changes), owner);
  update(response.status);
  if (changed) await onChange(true);
}

export async function syncCloud(manual = false) {
  if (!plugin || !cloudStatus.enabled) return;
  if (running) { rerun = true; return running; }
  running = (async () => {
    update({ busy: true });
    try {
      // Native storage acknowledges the journal before a network request starts.
      await exchange();
      if (manual) {
        update(await plugin.synchronize());
        await exchange();
      }
    } catch (error) {
      update({ code: messages[error.code] ? error.code : 'error' });
    } finally {
      running = null;
      update({ busy: false });
      if (rerun) { rerun = false; schedule(); }
    }
  })();
  return running;
}

export async function setCloudEnabled(enabled) {
  if (!plugin) return;
  if (running) await running;
  try {
    update({ busy: true });
    if (enabled) {
      await seedSyncJournal();
      const status = await plugin.enable({ owner: await syncMeta('owner') || '' });
      if (!status.owner) throw new Error('Missing iCloud account');
      await syncMeta('owner', status.owner);
      update(status);
    } else {
      clearTimeout(timer);
      update(await plugin.disable());
    }
  } catch (error) {
    update({ code: messages[error.code] ? error.code : 'error' });
  } finally {
    update({ busy: false });
  }
  if (enabled && cloudStatus.enabled) await syncCloud(true);
}

export async function initializeCloudSync(changed) {
  plugin = globalThis.workoutNative?.cloud;
  if (!plugin) return;
  onChange = changed;
  try {
    await plugin.addListener('syncChanged', schedule);
    const status = await plugin.getStatus();
    update(status);
    if (!status.supported) return;
    await seedSyncJournal();
    const owner = await syncMeta('owner');
    if (owner && status.owner && owner !== status.owner) {
      await plugin.disable();
      update({ enabled: false, code: 'account-changed' });
      return;
    }
    if (!owner && status.owner) await syncMeta('owner', status.owner);
    onDatabaseChange(schedule);
    globalThis.addEventListener?.('online', schedule);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncCloud(true); });
    // Pull background arrivals while visible, without forcing cloud requests.
    setInterval(() => { if (!document.hidden) schedule(); }, 30_000);
    await syncCloud(true);
  } catch (error) {
    update({ supported: true, code: messages[error.code] ? error.code : 'error' });
  }
}
