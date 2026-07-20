import { bodyweightSeries } from '../selectors.js';
import { state } from '../state.js';
import { formatDate, formatWeight, safeText, toInputDate } from '../utils.js';
import { buildChartSvg, renderHeader, renderSwipeContainer } from '../ui/components.js';

function renderBodyweightRow(entry) {
  const content = `
    <div class="list-item set-card">
      <div class="set-card-top">
        <div>
          <div class="set-name">${safeText(formatWeight(entry.weight))} kg</div>
          <div class="item-subtitle">${safeText(formatDate(entry.loggedAt))}</div>
        </div>
        <div class="muted">${safeText(toInputDate(entry.loggedAt))}</div>
      </div>
    </div>
  `;

  return renderSwipeContainer('bodyweight', entry.id, content, false);
}

export function renderBodyweightScreen() {
  const series = bodyweightSeries();
  const history = state.bodyweights
    .slice()
    .sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt));

  return `
    <section class="screen-shell">
      <div class="screen-top fade-in">
        ${renderHeader({
          title: 'Lichaamsgewicht',
          subtitle: `${state.bodyweights.length} saved`,
        })}
      </div>
      <div class="screen-scroll">
        <div class="detail-stack fade-in">
          <section class="chart-card slide-up">
            <form class="bodyweight-form" id="bodyweight-form">
              <div class="two-col">
                <div class="field-group">
                  <label>Date</label>
                  <input name="date" type="date" />
                </div>
                <div class="field-group">
                  <label>Weight (kg) <span class="required-dot">•</span></label>
                  <input name="weight" type="number" inputmode="decimal" step="0.1" min="0" required placeholder="0.0" />
                </div>
              </div>
              <div class="modal-footer bodyweight-footer">
                <button type="submit" class="primary-btn">Save measurement</button>
              </div>
            </form>
          </section>
          <section class="chart-card slide-up">
            <div class="chart-meta">
              <span>Bodyweight over time</span>
              <span>${series.length} point${series.length === 1 ? '' : 's'}</span>
            </div>
            <div class="chart-shell">
              ${series.length ? buildChartSvg(series) : '<div class="chart-empty">Your chart will appear here after your first saved measurement.</div>'}
            </div>
          </section>
          ${history.length ? `
            <section class="date-group slide-up">
              <div class="date-heading">
                <h3>Measurement History</h3>
                <div class="muted">${history.length} ${history.length === 1 ? 'entry' : 'entries'}</div>
              </div>
              <div class="set-stack">
                ${history.map((entry) => renderBodyweightRow(entry)).join('')}
              </div>
            </section>
          ` : `
            <section class="empty-state">
              <div class="loading-logo">BW</div>
              <h2>No bodyweight entries yet</h2>
              <p>Add your first measurement to start tracking the trend over time.</p>
            </section>
          `}
        </div>
      </div>
    </section>
  `;
}
