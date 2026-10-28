import { escapeAttr, safeText } from '../utils.js';

export function parseNumericInput(value) {
  const text = String(value ?? '').trim();
  return /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text) ? Number(text.replace(',', '.')) : NaN;
}

export function steppedValue(value, direction, step, min, max) {
  const current = parseNumericInput(value);
  const next = Number.isFinite(current) ? Number((current + direction * step).toFixed(10)) : Math.max(min, direction > 0 ? step : min);
  return Math.min(max, Math.max(min, next));
}

export function renderNumericField({ id, name, label, value = '', min = 0, max = 2000, step = 1, integer = false, optional = false, scroll = false, quantum = 0 }) {
  const a = escapeAttr, s = safeText;
  return `<div class="field-group numeric-field">
    <label for="${a(id)}">${s(label)}${optional ? ' <span class="meta-text">(optioneel)</span>' : ''}</label>
    <div class="numeric-controls">
      <button type="button" class="numeric-step" data-number-step="-1" aria-label="${a(label)} verlagen">−</button>
      <input id="${a(id)}" name="${a(name)}" type="text" inputmode="${integer ? 'numeric' : 'decimal'}" autocomplete="off" data-number data-min="${min}" data-max="${max}" data-step="${step}" data-integer="${integer}" data-quantum="${quantum}" ${optional ? '' : 'required'} placeholder="${optional ? '—' : 'Vul in'}" value="${a(value)}" />
      <button type="button" class="numeric-step" data-number-step="1" aria-label="${a(label)} verhogen">+</button>
    </div>
    ${scroll ? `<details class="numeric-picker"><summary>Scroll om te kiezen</summary><select size="5" aria-label="${a(label)} kiezen"></select></details>` : ''}
  </div>`;
}

export function wireNumericFields(root = document) {
  root.querySelectorAll('.numeric-field').forEach(field => {
    const input = field.querySelector('[data-number]');
    const { min, max, step, quantum } = Object.fromEntries(['min', 'max', 'step', 'quantum'].map(key => [key, Number(input.dataset[key])]));
    const integer = input.dataset.integer === 'true';
    const validate = () => {
      const value = parseNumericInput(input.value);
      const empty = input.value.trim() === '';
      const valid = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)) && (!quantum || Math.abs(value / quantum - Math.round(value / quantum)) < 1e-8);
      input.setCustomValidity(empty ? '' : valid ? '' : `Vul ${integer ? 'een geheel getal' : 'een getal'} ${Number.isFinite(max) ? `van ${min} tot ${max}` : `van ${min} of meer`} in${quantum ? ` in stappen van ${quantum}` : ''}.`);
      field.querySelector('[data-number-step="-1"]').disabled = !empty && value <= min;
      field.querySelector('[data-number-step="1"]').disabled = !empty && value >= max;
    };
    const change = value => {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('input', validate);
    input.addEventListener('focus', () => input.select());
    field.querySelectorAll('[data-number-step]').forEach(button => button.addEventListener('click', () => change(steppedValue(input.value, Number(button.dataset.numberStep), step, min, max))));
    const picker = field.querySelector('.numeric-picker');
    if (picker) {
      const select = picker.querySelector('select');
      picker.addEventListener('toggle', () => {
        if (!picker.open) return;
        const value = parseNumericInput(input.value), values = [];
        const pickerMax = Number.isFinite(max) ? max : 1000;
        for (let next = min; next <= pickerMax; next = Number((next + step).toFixed(10))) values.push(next);
        if (Number.isFinite(value) && value >= min && value <= max && !values.includes(value)) values.push(value);
        values.sort((a, b) => a - b);
        select.innerHTML = values.map(next => `<option value="${next}" ${next === value ? 'selected' : ''}>${next}</option>`).join('');
        select.focus({ preventScroll: true });
      });
      select.addEventListener('change', () => { change(select.value); picker.open = false; picker.querySelector('summary').focus({ preventScroll: true }); });
    }
    validate();
  });
}

export function wireAsyncForm(form, save, onError) {
  let saving = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const buttons = Array.from(document.querySelectorAll('button[type="submit"]'))
      .filter((button) => button.form === form);
    buttons.forEach((button) => { button.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    try {
      await save();
    } catch (error) {
      console.warn('Saving failed:', error);
      onError('Opslaan niet gelukt. Je invoer blijft staan; probeer het opnieuw.');
    } finally {
      saving = false;
      buttons.forEach((button) => { button.disabled = false; });
      form.removeAttribute('aria-busy');
    }
  });
}
