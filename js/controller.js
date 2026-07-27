import { CHART_SERIES_OPTIONS } from './constants.js';
import { buildExportPayload, importDataFile } from './data-transfer.js';
import { loadState } from './data.js';
import { deleteById, saveRecord } from './database.js';
import {
  deleteBrandCascade,
  deleteMachineCascade,
  getMachineCascade,
  reorderItems,
  restoreSnapshot,
  saveBodyweight,
  saveBrand,
  saveMachine,
  saveSet,
} from './repository.js';
import { state } from './state.js';
import { wireSwipeRows } from './ui/gestures.js';
import {
  debounce,
  formatDateKey,
  formatWeight,
  normalizeOptionalRpe,
  parseBodyweightDate,
  parseDateTime,
  persistChartSeriesMode,
  todayInputValue,
} from './utils.js';

export function createController({ render, navigate, refreshApp }) {
  let toastTimer = null;

  function openBrandModal(mode, data = null) {
    state.modal = { type: 'brand', mode, data };
    render();
  }

  function openMachineModal(mode, data = null) {
    state.modal = { type: 'machine', mode, data };
    render();
  }

  function openSetModal(mode, data = null) {
    state.modal = { type: 'set', mode, data };
    render();
  }

  function openQuickLog() {
    if (state.route.screen === 'machineDetail' && state.route.machineId) {
      openSetModal('create');
      return;
    }
    if (!state.machines.length) {
      navigate({ screen: 'brands', brandId: null, machineId: null });
      showToast('Voeg eerst een apparaat toe om een set te loggen.');
      return;
    }
    state.modal = { type: 'set-picker' };
    render();
  }

  function closeModal() {
    state.modal = null;
    render();
  }

  function openConfirmSheet(config) {
    state.confirmSheet = config;
    render();
  }

  function closeConfirmSheet() {
    state.confirmSheet = null;
    render();
  }

  function showToast(message, undo) {
    clearTimeout(toastTimer);
    state.toast = { message, undo };
    render();
    toastTimer = setTimeout(() => {
      state.toast = null;
      render();
    }, 4500);
  }

  function closeToast() {
    clearTimeout(toastTimer);
    state.toast = null;
    render();
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportAllData() {
    downloadJson(`workout-tracker-export-${todayInputValue()}.json`, buildExportPayload());
    showToast('Data exported');
  }

  function wireInputs() {
    const brandSearch = document.getElementById('brand-search');
    const machineSearch = document.getElementById('machine-search');
    const importFileInput = document.getElementById('import-file-input');
    if (brandSearch) brandSearch.addEventListener('input', debounce((event) => {
      state.search.brands = event.target.value;
      render();
    }, 10));
    if (machineSearch) machineSearch.addEventListener('input', debounce((event) => {
      state.search.machines = event.target.value;
      render();
    }, 10));
    if (importFileInput) {
      importFileInput.addEventListener('change', async (event) => {
        const [file] = Array.from(event.target.files || []);
        if (!file) return;
        try {
          const total = await importDataFile(file);
          if (!total) showToast('No valid records found in import file');
          else showToast(`Imported ${total} record${total === 1 ? '' : 's'}`);
        } finally {
          event.target.value = '';
        }
      });
    }
  }

  function wireForms() {
    const entityForm = document.getElementById('entity-form');
    if (entityForm) {
      entityForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(entityForm);
        const name = String(form.get('name') || '').trim();
        if (!name) return;
        if (state.modal.type === 'brand') {
          await saveBrand(name, state.modal.mode === 'edit' ? state.modal.data : null);
        } else {
          const note = String(form.get('note') || '').trim();
          await saveMachine(name, note, state.modal.mode === 'edit' ? state.modal.data : null);
        }
        closeModal();
      });
    }

    const setForm = document.getElementById('set-form');
    if (setForm) {
      setForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(setForm);
        const weight = String(form.get('weight') || '').trim();
        const reps = String(form.get('reps') || '').trim();
        const rpe = normalizeOptionalRpe(form.get('rpe'));
        if (!weight || !reps) return;
        if (rpe === null) return;
        const payload = {
          weight,
          reps,
          loggedAt: parseDateTime(
            String(form.get('date') || ''),
            String(form.get('time') || ''),
            state.modal.mode === 'edit' ? state.modal.data.loggedAt : undefined,
          ),
          notes: String(form.get('notes') || '').trim(),
          rpe,
        };
        await saveSet(payload, state.modal.mode === 'edit' ? state.modal.data : null);
        closeModal();
      });
    }

    const bodyweightForm = document.getElementById('bodyweight-form');
    if (bodyweightForm) {
      bodyweightForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(bodyweightForm);
        const weight = Number(String(form.get('weight') || '').trim());
        const loggedAt = parseBodyweightDate(String(form.get('date') || '').trim());
        if (!Number.isFinite(weight) || weight <= 0 || !formatDateKey(loggedAt)) return;
        await saveBodyweight({ loggedAt, weight: formatWeight(weight) });
        bodyweightForm.reset();
        render();
      });
    }
  }

  async function moveBrand(direction, brandId) {
    const brands = state.brands.slice();
    const index = brands.findIndex((item) => item.id === brandId);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= brands.length) return;
    [brands[index], brands[swapIndex]] = [brands[swapIndex], brands[index]];
    await reorderItems('brands', brands);
    render();
  }

  async function moveMachine(direction, machineId) {
    const brandMachines = state.machines.filter((machine) => machine.brandId === state.route.brandId);
    const index = brandMachines.findIndex((item) => item.id === machineId);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= brandMachines.length) return;
    [brandMachines[index], brandMachines[swapIndex]] = [brandMachines[swapIndex], brandMachines[index]];
    const untouched = state.machines.filter((machine) => machine.brandId !== state.route.brandId);
    await reorderItems('machines', [...untouched, ...brandMachines]);
    render();
  }

  const findBrand = (id) => state.brands.find((item) => item.id === id);
  const findMachine = (id) => state.machines.find((item) => item.id === id);
  const findSet = (id) => state.sets.find((item) => item.id === id);
  const findBodyweight = (id) => state.bodyweights.find((item) => item.id === id);

  async function handleDeleteSet(id) {
    const target = findSet(id);
    if (!target) return;
    await deleteById('sets', id);
    await loadState();
    showToast('Set deleted', async () => {
      await saveRecord('sets', target);
      await loadState();
      closeToast();
    });
  }

  async function handleDeleteBodyweight(id) {
    const target = findBodyweight(id);
    if (!target) return;
    await deleteById('bodyweights', id);
    await loadState();
    showToast('Measurement deleted', async () => {
      await saveRecord('bodyweights', target);
      await loadState();
      closeToast();
    });
  }

  function attachEventDelegation() {
    document.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      const brandId = target.dataset.brandId;

      if (action === 'noop') return;
      if (action === 'backdrop-close' && event.target === target) return closeModal();
      if (action === 'close-modal') return closeModal();
      if (action === 'close-sheet') return closeConfirmSheet();
      if (action === 'undo-toast' && state.toast?.undo) return state.toast.undo();

      if (action === 'go-brands') return navigate({ screen: 'brands', brandId: null, machineId: null });
      if (action === 'go-machines') return navigate({ screen: 'machines', brandId: state.route.brandId, machineId: null });
      if (action === 'nav-workouts') return navigate({ screen: 'brands', brandId: null, machineId: null });
      if (action === 'nav-recent-activity') return navigate({ screen: 'recentActivity', brandId: null, machineId: null });
      if (action === 'nav-bodyweight') return navigate({ screen: 'bodyweight', brandId: null, machineId: null });
      if (action === 'nav-settings') return navigate({ screen: 'settings', brandId: null, machineId: null });
      if (action === 'quick-log-set') return openQuickLog();
      if (action === 'quick-log-machine') {
        const machine = findMachine(id);
        if (!machine) return;
        navigate({ screen: 'machineDetail', brandId: machine.brandId, machineId: machine.id });
        openSetModal('create');
        return;
      }
      if (action === 'export-data') return exportAllData();
      if (action === 'trigger-import') return document.getElementById('import-file-input')?.click();
      if (action === 'refresh-app') return refreshApp();
      if (action === 'set-chart-series-mode' && CHART_SERIES_OPTIONS[id]) {
        state.preferences.chartSeriesMode = id;
        persistChartSeriesMode(id);
        render();
        return;
      }

      if (action === 'open-brand-create') return openBrandModal('create');
      if (action === 'open-machine-create') return openMachineModal('create');
      if (action === 'open-set-create') return openSetModal('create');

      if (action === 'open-brand') return navigate({ screen: 'machines', brandId: id, machineId: null });
      if (action === 'open-machine') return navigate({ screen: 'machineDetail', brandId: state.route.brandId, machineId: id });
      if (action === 'open-recent-machine' && brandId) {
        return navigate({ screen: 'machineDetail', brandId, machineId: id });
      }

      if (action === 'toggle-brand-reorder') {
        state.reorder.brands = !state.reorder.brands;
        render();
        return;
      }
      if (action === 'toggle-machine-reorder') {
        state.reorder.machines = !state.reorder.machines;
        render();
        return;
      }
      if (action === 'toggle-recent-group') {
        state.recentActivityExpanded[id] = !state.recentActivityExpanded[id];
        render();
        return;
      }

      if (action === 'move-brand-up') return moveBrand('up', id);
      if (action === 'move-brand-down') return moveBrand('down', id);
      if (action === 'move-machine-up') return moveMachine('up', id);
      if (action === 'move-machine-down') return moveMachine('down', id);

      if (action === 'edit-brand') return openBrandModal('edit', findBrand(id));
      if (action === 'edit-machine') return openMachineModal('edit', findMachine(id));
      if (action === 'edit-set') return openSetModal('edit', findSet(id));

      if (action === 'delete-brand') {
        const brand = findBrand(id);
        if (!brand) return;
        const related = getMachineCascade(id);
        return openConfirmSheet({
          title: `Delete ${brand.name}?`,
          message: `This will remove ${related.machines.length} machine${related.machines.length === 1 ? '' : 's'} and ${related.sets.length} logged set${related.sets.length === 1 ? '' : 's'} stored under this brand.`,
          confirm: async () => {
            const snapshot = await deleteBrandCascade(id);
            if (state.route.brandId === id) navigate({ screen: 'brands', brandId: null, machineId: null }, true);
            closeConfirmSheet();
            showToast('Brand deleted', async () => {
              await restoreSnapshot(snapshot);
              closeToast();
            });
          },
        });
      }

      if (action === 'delete-machine') {
        const machine = findMachine(id);
        if (!machine) return;
        const relatedSets = state.sets.filter((entry) => entry.machineId === id);
        return openConfirmSheet({
          title: `Delete ${machine.name}?`,
          message: `This will remove ${relatedSets.length} logged set${relatedSets.length === 1 ? '' : 's'} for this machine.`,
          confirm: async () => {
            const snapshot = await deleteMachineCascade(id);
            if (state.route.machineId === id) {
              navigate({ screen: 'machines', brandId: state.route.brandId, machineId: null }, true);
            }
            closeConfirmSheet();
            showToast('Machine deleted', async () => {
              await restoreSnapshot(snapshot);
              closeToast();
            });
          },
        });
      }

      if (action === 'delete-set') return handleDeleteSet(id);
      if (action === 'delete-bodyweight') return handleDeleteBodyweight(id);
      if (action === 'confirm-sheet' && state.confirmSheet?.confirm) return state.confirmSheet.confirm();
    });

    document.addEventListener('change', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id || target.value;

      if (action === 'set-chart-series-mode' && CHART_SERIES_OPTIONS[id]) {
        state.preferences.chartSeriesMode = id;
        persistChartSeriesMode(id);
        render();
      }
    });
  }

  function wireRenderedUi() {
    wireInputs();
    wireForms();
    wireSwipeRows();
  }

  return {
    attachEventDelegation,
    showToast,
    wireRenderedUi,
  };
}
