import { CHART_SERIES_MODE_KEY, CHART_SERIES_OPTIONS } from './constants.js';

export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseDateTime(inputDate, inputTime, fallbackIso = nowIso()) {
  if (!inputDate) return fallbackIso;
  const time = inputTime || '12:00';
  const local = new Date(`${inputDate}T${time}`);
  if (Number.isNaN(local.getTime())) return fallbackIso;
  return local.toISOString();
}

export function toInputDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toInputTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const h = `${date.getHours()}`.padStart(2, '0');
  const m = `${date.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayInputValue() {
  return toInputDate(nowIso());
}

export function parseBodyweightDate(inputDate, fallbackIso = nowIso()) {
  const value = String(inputDate || '').trim() || todayInputValue();
  const local = new Date(`${value}T12:00`);
  if (Number.isNaN(local.getTime())) return fallbackIso;
  return local.toISOString();
}

export function formatWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Number.isInteger(number) ? `${number}` : number.toFixed(1);
}

export function normalizeOptionalRpe(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 10) return null;
  if (!Number.isInteger(numeric * 2)) return null;
  return formatWeight(numeric);
}

export function buildInitials(name) {
  const value = String(name || '').trim();
  if (!value) return '--';

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const cleaned = words[0].replace(/[^\p{L}\p{N}]/gu, '');
    return (cleaned || words[0]).slice(0, 2).toUpperCase();
  }

  return words.map((word) => word[0]).join('').toUpperCase();
}

export function previewText(value, maxLength = 72) {
  const textValue = String(value || '').trim();
  if (!textValue) return '';
  if (textValue.length <= maxLength) return textValue;
  return `${textValue.slice(0, maxLength).trimEnd()}…`;
}

export function debounce(fn, ms = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function readChartSeriesMode() {
  try {
    const value = localStorage.getItem(CHART_SERIES_MODE_KEY);
    if (value === 'first') return 'set1';
    return CHART_SERIES_OPTIONS[value] ? value : 'e1rmMax';
  } catch (error) {
    return 'e1rmMax';
  }
}

export function persistChartSeriesMode(mode) {
  try {
    localStorage.setItem(CHART_SERIES_MODE_KEY, mode);
  } catch (error) {
    console.warn('Could not persist chart series mode:', error);
  }
}

export function estimateE1rm(weight, reps) {
  return weight * (1 + reps / 30);
}

export function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function escapeAttr(value) {
  return safeText(value).replace(/"/g, '&quot;');
}

export function clone(value) {
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
