// The same ordering is implemented by WorkoutEnvelope in Swift.
export const ENTITY_STORES = ['brands', 'machines', 'sets', 'bodyweights'];

export function entityKey(kind, id) {
  return `${kind}:${id}`;
}

export function compareEnvelopes(a, b) {
  if (!a) return -1;
  if (!b) return 1;
  for (const [left, right] of [[a.revision, b.revision], [Number(a.deleted), Number(b.deleted)], [a.value ?? '', b.value ?? '']]) {
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

export function revisionTime(revision) {
  return Number(revision.slice(0, 16));
}

export function makeEnvelope(kind, record, revision, deleted = false) {
  return { version: 1, key: entityKey(kind, record.id), kind, id: record.id, revision, deleted, value: deleted ? null : JSON.stringify(record) };
}

export function validateEnvelope(envelope) {
  if (!envelope || envelope.version !== 1 || !ENTITY_STORES.includes(envelope.kind)
      || typeof envelope.id !== 'string' || !envelope.id
      || envelope.key !== entityKey(envelope.kind, envelope.id)
      || !/^\d{16}-[a-zA-Z0-9-]+$/.test(envelope.revision)
      || !Number.isSafeInteger(revisionTime(envelope.revision))
      || typeof envelope.deleted !== 'boolean') throw new Error('Ongeldig iCloud-record');
  if (envelope.deleted) return null;
  const record = JSON.parse(envelope.value);
  if (!record || record.id !== envelope.id) throw new Error('Ongeldig iCloud-record');
  if (['brands', 'machines'].includes(envelope.kind) && typeof record.name !== 'string') throw new Error('Ongeldige naam');
  if (envelope.kind === 'machines' && typeof record.brandId !== 'string') throw new Error('Ongeldig merk');
  if (envelope.kind === 'sets' && typeof record.machineId !== 'string') throw new Error('Ongeldig apparaat');
  if (['sets', 'bodyweights'].includes(envelope.kind) && (!record.loggedAt || !Number.isFinite(Number(record.weight)))) throw new Error('Ongeldige meting');
  if (envelope.kind === 'sets' && !Number.isFinite(Number(record.reps))) throw new Error('Ongeldige herhalingen');
  return record;
}
