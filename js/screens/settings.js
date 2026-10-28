import { state } from '../state.js';
import { renderHeader } from '../ui/components.js';

export function renderSettingsScreen() {
  return `
    <section class="screen-shell">
      <div class="screen-top fade-in">
        ${renderHeader({
          title: 'Instellingen',
          subtitle: 'Je training en gegevens',
        })}
      </div>
      <div class="screen-scroll">
        <div class="detail-stack fade-in">
          <section class="chart-card slide-up"><div class="settings-stack">
            <h3>Trainingsschema’s</h3>
            <label class="field-group">Standaard aantal sets
              <input id="training-default-sets" type="number" min="1" max="50" step="1" required value="${state.preferences.defaultSetCount}" aria-describedby="training-default-hint">
            </label>
            <p class="meta-text" id="training-default-hint">Voor nieuwe apparaten in een schema. Bestaande schema’s blijven hetzelfde.</p>
            <label class="training-toggle"><span>Rusttimer gebruiken</span><input id="training-rest-enabled" type="checkbox" role="switch" ${state.preferences.restTimerEnabled?'checked':''} aria-describedby="training-rest-hint"></label>
            <p class="meta-text" id="training-rest-hint">Start na het opslaan van een set tijdens een schematraining.</p>
          </div></section>
          <section class="chart-card slide-up">
            <div class="settings-stack">
              <div class="settings-copy">
                <h3>Data exporteren</h3>
                <p class="meta-text">Download al je merken, apparaten, sets, schema’s, trainingen en lichaamsgewichtmetingen als JSON-backup.</p>
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
