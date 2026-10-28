import { compareSetsChronologically } from './selectors.js';

const id = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();
const text = v => typeof v === 'string' && v.length > 0;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const number = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function validTraining(record, kind) {
  if (!record || !text(record.id) || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 120 || !date(record.createdAt)
      || !Array.isArray(record.items) || !record.items.length || record.items.length > 100) return false;
  const items = new Set(), sets = new Set();
  for (const item of record.items) {
    if (!item || !text(item.id) || items.has(item.id) || !text(item.machineId) || !text(item.machineName) || !text(item.brandName)
        || !int(item.setCount, 1, 50) || !int(item.repMin, 1, 1000) || !int(item.repMax, item.repMin, 1000) || !int(item.restSeconds, 0, 3600)) return false;
    items.add(item.id);
    if (kind === 'sessions') {
      if (!Array.isArray(item.sets) || !item.sets.length || item.sets.length > 50) return false;
      for (const set of item.sets) {
        if (!set || !text(set.id) || sets.has(set.id) || !number(set.weight, 0, 2000) || !int(set.reps, 1, 1000)
            || (set.previousWeight != null && !number(set.previousWeight, 0, 2000))
            || (set.previousReps != null && !int(set.previousReps, 0, 1000))) return false;
        sets.add(set.id);
      }
    }
  }
  return kind !== 'sessions' || (['active', 'completed'].includes(record.status) && date(record.loggedAt)
    && (record.restUntil == null || date(record.restUntil)) && (record.finishedAt == null || date(record.finishedAt)));
}

export function newPlan() { return { id:id(), name:'', createdAt:stamp(), items:[] }; }
export function planItem(machine, brands, setCount = 2, repMin = 5, repMax = 8) {
  const validRange = int(repMin,1,1000) && int(repMax,repMin,1000);
  return { id:id(), machineId:machine.id, machineName:machine.name, brandName:brands.find(b=>b.id===machine.brandId)?.name || 'Onbekend merk', setCount:int(setCount,1,50)?setCount:2, repMin:validRange?repMin:5, repMax:validRange?repMax:8, restSeconds:90 };
}
export function trainingTarget(item) { return item.repMin === item.repMax ? String(item.repMin) : `${item.repMin}–${item.repMax}`; }
export function latestMachineSet(history, machineId) {
  return history.filter(set => set.machineId === machineId).reduce((latest, set) => !latest || compareSetsChronologically(set, latest) > 0 ? set : latest, null);
}
export function trainingMachineGroups(brands, machines, query = '') {
  const search = query.trim().toLocaleLowerCase();
  return brands.map(brand => ({ brand, machines: machines.filter(machine => machine.brandId === brand.id && (!search || brand.name.toLocaleLowerCase().includes(search) || machine.name.toLocaleLowerCase().includes(search))) })).filter(group => group.machines.length);
}
export function updatePlanItem(plan, item) {
  if (!plan?.items.some(existing => existing.id === item.id)) throw new Error('Deze oefening is verwijderd. Open het schema opnieuw.');
  const next = { ...plan, items: plan.items.map(existing => existing.id === item.id ? structuredClone(item) : existing) };
  if (!validTraining(next, 'plans')) throw new Error('Controleer het aantal sets, de reprange en de rusttijd.');
  return next;
}
export function prepareItem(item, history) {
  const latest = latestMachineSet(history, item.machineId);
  return { ...item, sets:Array.from({length:item.setCount},()=>{
    return {id:'training-set-'+id(), weight:Number(latest?.weight ?? 0), reps:Math.max(1,Number(latest?.reps ?? item.repMin)),
      ...(latest?{previousWeight:Number(latest.weight),previousReps:Number(latest.reps)}:{})};
  }) };
}
export function startTraining(plan, machines, brands, history) {
  if (!validTraining(plan,'plans')) throw new Error('Controleer de naam, apparaten en doelen van je schema.');
  const now=stamp();
  return {...structuredClone(plan),id:id(),planId:plan.id,status:'active',createdAt:now,loggedAt:now,items:plan.items.map(item=>{
    const machine=machines.find(m=>m.id===item.machineId);
    if(!machine)throw new Error('Een apparaat is verwijderd. Wijzig het schema en kies een bestaand apparaat.');
    return prepareItem({...item,machineName:machine.name,brandName:brands.find(b=>b.id===machine.brandId)?.name||item.brandName},history.filter(s=>s.machineId===machine.id));
  })};
}
export function replaceTrainingItem(session, itemId, machine, brands, savedSets) {
  const next=structuredClone(session), index=next.items.findIndex(e=>e.id===itemId);
  if(next.status!=='active'||index<0)throw new Error('Deze training is niet meer actief.');
  const old=next.items[index], ids=new Set(savedSets.map(s=>s.id));
  const done=old.sets.filter(s=>ids.has(s.id)), count=old.sets.length-done.length;
  if(!count)throw new Error('Alle sets zijn al opgeslagen. Ga naar het volgende apparaat.');
  const replacement=prepareItem({...planItem(machine,brands),setCount:count,repMin:old.repMin,repMax:old.repMax,restSeconds:old.restSeconds},savedSets.filter(s=>s.machineId===machine.id));
  if(done.length){old.sets=done;old.setCount=done.length;next.items.splice(index+1,0,replacement);}else next.items[index]=replacement;
  delete next.restUntil;
  return next;
}
export function addTrainingSet(session, itemId, savedSets) {
  const next = structuredClone(session), item = next.items.find(item => item.id === itemId);
  if (next.status !== 'active' || !item) throw new Error('Deze training is niet meer actief.');
  if (item.sets.length >= 50) throw new Error('Maximaal 50 sets per apparaat.');
  const previous = latestMachineSet(savedSets, item.machineId);
  item.sets.push({ id:'training-set-'+id(), weight:Number(previous?.weight ?? item.sets.at(-1)?.weight ?? 0), reps:Math.max(1,Number(previous?.reps ?? item.repMin)), ...(previous ? {previousWeight:Number(previous.weight),previousReps:Number(previous.reps)} : {}) });
  item.setCount = item.sets.length;
  return next;
}
export function trainingSetChange(session, itemId, setId, weight, reps, savedSets, undo=false, restTimerEnabled=true, drafts={}) {
  const item=session.items.find(e=>e.id===itemId), planned=item?.sets?.find(s=>s.id===setId);
  if(session.status!=='active'||!planned)throw new Error('Deze training is niet meer actief.');
  if(!number(weight,0,2000)||!int(reps,1,1000))throw new Error('Vul 0 tot 2000 kg en 1 tot 1000 herhalingen in.');
  const existing=savedSets.find(s=>s.id===setId);
  if(undo?!existing:existing)return [];
  if(existing&&existing.sessionId!==session.id)throw new Error('Deze set hoort bij een andere training.');
  const now=stamp(), next=structuredClone(session);
  if (!undo) {
    const nextItem = next.items.find(entry => entry.id === itemId);
    const index = nextItem.sets.findIndex(set => set.id === setId);
    Object.assign(nextItem.sets[index], {weight,reps});
    const completed = new Set(savedSets.map(set => set.id));
    const following = nextItem.sets.slice(index + 1).find(set => !completed.has(set.id));
    if (following && !Object.hasOwn(drafts[following.id] || {}, 'weight')) following.weight = weight;
  }
  if(undo || !restTimerEnabled || item.restSeconds === 0)delete next.restUntil;else next.restUntil=new Date(Date.now()+item.restSeconds*1000).toISOString();
  return [{kind:'sets',id:setId,...(undo?{deleted:true}:{record:{id:setId,machineId:item.machineId,sessionId:session.id,trainingItemId:itemId,weight,reps,loggedAt:now,createdAt:now}})},
    {kind:'sessions',id:session.id,record:next}];
}
