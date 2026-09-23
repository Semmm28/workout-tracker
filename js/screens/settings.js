import { renderHeader } from '../ui/components.js';
import { cloudStatus, cloudStatusMessage } from '../cloud-sync.js';
import { safeText as escapeHtml } from '../utils.js';

export function renderCloudSettings() {
  if (!globalThis.workoutNative?.cloud) return '';
  const status = cloudStatus;
  return `<section class="chart-card slide-up"><div class="settings-stack">
    <div class="settings-copy"><h3>iCloud</h3>
      <p class="meta-text">Synchroniseer met je andere iPhones met hetzelfde iCloud-account. Je kunt altijd offline blijven loggen.</p>
      <p class="meta-text" role="status" aria-live="polite">${escapeHtml(cloudStatusMessage())}</p>
      ${status.lastSync ? `<p class="meta-text">Laatste synchronisatie: ${escapeHtml(new Date(status.lastSync).toLocaleString('nl-NL'))}</p>` : ''}
      ${status.enabled && status.pending ? `<p class="meta-text">${Number(status.pending)} wijziging(en) wachten op iCloud.</p>` : ''}
    </div>
    ${status.supported ? (status.enabled ? `
      <button class="primary-btn" data-action="cloud-sync" ${status.busy ? 'disabled' : ''}>Synchroniseer nu</button>
      <button class="secondary-btn" data-action="cloud-disable" ${status.busy ? 'disabled' : ''}>Synchronisatie uitzetten</button>
      <p class="meta-text">Uitzetten bewaart je gegevens op dit apparaat en in iCloud.</p>` : `
      <button class="primary-btn" data-action="cloud-enable" ${status.busy ? 'disabled' : ''}>iCloud inschakelen</button>`) : ''}
  </div></section>`;
}

export function renderSettingsScreen() {
  const isNative = globalThis.Capacitor?.isNativePlatform() ?? false;
  return `
    <section class="screen-shell">
      <div class="screen-top fade-in">
        ${renderHeader({
          title: 'Instellingen',
          subtitle: 'Importeer of exporteer je lokale data',
        })}
      </div>
      <div class="screen-scroll">
        <div class="detail-stack fade-in">
          ${renderCloudSettings()}
          <section class="chart-card slide-up">
            <div class="settings-stack">
              <div class="settings-copy">
                <h3>Data exporteren</h3>
                <p class="meta-text">Download al je brands, machines, sets en lichaamsgewichtmetingen als JSON-backup.</p>
              </div>
              <button class="primary-btn" data-action="export-data">Exporteer data</button>
            </div>
          </section>
          <section class="chart-card slide-up">
            <div class="settings-stack">
              <div class="settings-copy">
                <h3>Data importeren</h3>
                <p class="meta-text">Import voegt geldige records samen met je bestaande lokale data. Bestaande IDs worden bijgewerkt.</p>
              </div>
              <input id="import-file-input" class="hidden-file-input" type="file" accept="application/json" />
              <button class="secondary-btn" data-action="trigger-import">Importeer data</button>
            </div>
          </section>
          <section class="chart-card slide-up">
            <div class="settings-stack">
              <div class="settings-copy">
                <h3>${isNative ? 'App-updates' : 'App vernieuwen'}</h3>
                <p class="meta-text">${isNative ? 'Nieuwe versies installeer je via TestFlight of de App Store.' : 'Controleer op een nieuwe versie en herlaad de app zonder je lokaal opgeslagen data te verwijderen.'}</p>
              </div>
              ${isNative ? '' : '<button class="secondary-btn" data-action="refresh-app">Refresh app</button>'}
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}
