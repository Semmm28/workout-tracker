import { renderHeader } from '../ui/components.js';

export function renderSettingsScreen() {
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
                <h3>App vernieuwen</h3>
                <p class="meta-text">Controleer op een nieuwe versie en herlaad de app zonder je lokaal opgeslagen data te verwijderen.</p>
              </div>
              <button class="secondary-btn" data-action="refresh-app">Refresh app</button>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}
