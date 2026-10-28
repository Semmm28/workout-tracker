import { icon } from '../constants.js';
import { state } from '../state.js';
import { safeText as s, escapeAttr as a, formatWeight, formatDate } from '../utils.js';
import { renderHeader } from '../ui/components.js';
import { trainingTarget } from '../training-model.js';

const ui = () => state.trainingUI;
const btn=(action,label,id='',cls='secondary-btn')=>`<button type="button" class="${cls}" data-action="training-${action}" data-id="${a(id)}">${s(label)}</button>`;
const heading=item=>`<p class="training-brand">${s(state.brands.find(b=>b.id===state.machines.find(m=>m.id===item.machineId)?.brandId)?.name||item.brandName)}</p><h2>${s(state.machines.find(m=>m.id===item.machineId)?.name||item.machineName)}</h2>`;
export function previousSet(machineId) {
  const previous=state.lastSets.get(machineId);
  return `<p class="meta-text">${previous?`Vorige set: ${s(formatWeight(previous.weight))} kg × ${s(previous.reps)}`:'Nog geen set opgeslagen'}</p>`;
}
function itemCard(item) {
  return `<article class="training-card">${heading(item)}<p class="meta-text">${item.setCount} × ${s(trainingTarget(item))} herhalingen${state.preferences.restTimerEnabled&&item.restSeconds>0?` · ${item.restSeconds} sec. rust`: ''}</p>${previousSet(item.machineId)}${state.machines.some(m=>m.id===item.machineId)?'':'<p>Apparaat verwijderd. Kies een vervanger.</p>'}</article>`;
}
function plans() {
  const active=state.sessions.filter(x=>x.status==='active');
  return `<div class="training-segment"><button data-action="nav-workouts" aria-pressed="false">Apparaten</button><button class="active" data-action="training-plans" aria-pressed="true">Schema’s</button></div>
    ${active.map(x=>`<article class="training-card"><p class="meta-text">Training bezig</p><h2>${s(x.name)}</h2>${btn('resume','Hervatten',x.id,'primary-btn')}</article>`).join('')}
    ${state.plans.length?state.plans.map((p,index)=>`<article class="training-card"><h2>${s(p.name)}</h2><p class="meta-text">${p.items.length} apparaten · ${p.items.reduce((n,i)=>n+i.setCount,0)} sets</p><p class="training-brand">${s([...new Set(p.items.map(i=>i.brandName))].join(' / '))}</p>${ui().managing?`<div class="training-actions">${btn('edit','Wijzig schema',p.id)}${btn('delete','Verwijder',p.id)}${index?btn('plan-up','Omhoog',p.id):''}${index<state.plans.length-1?btn('plan-down','Omlaag',p.id):''}</div>`:btn('plan','Bekijk schema',p.id)}</article>`).join(''):'<section class="empty-state"><h2>Je eigen trainingsschema</h2><p>Kies apparaten van je merken en stel sets, herhalingen en rust in.</p></section>'}
    `;
}
function plan() {
  const p=state.plans.find(p=>p.id===state.route.id);
  if(!p)return '<p>Dit schema is verwijderd.</p>';
  return `${p.items.map(itemCard).join('')}<div class="training-actions">${btn('start',state.sessions.some(x=>x.status==='active')?'Hervat actieve training':'Start training',p.id,'primary-btn')}${btn('edit','Wijzig schema',p.id)}${btn('delete','Schema verwijderen',p.id)}</div>`;
}
function editor() {
  const p=ui().draft;
  if(!p)return '<p>Open een schema om het te bewerken.</p>';
  return `<form id="training-plan-form"><label class="field-group">Naam<input name="name" maxlength="120" required value="${a(p.name)}" placeholder="Bijvoorbeeld Bovenlichaam A"></label>
    ${p.items.map((item,index)=>`<article class="training-card" data-plan-item="${a(item.id)}">${heading(item)}${previousSet(item.machineId)}<div class="training-fields">
      <label>Sets<input name="setCount" type="number" min="1" max="50" required value="${item.setCount}"></label>
      <label>Herh. vanaf<input name="repMin" type="number" min="1" max="1000" required value="${item.repMin}"></label>
      <label>Herh. tot<input name="repMax" type="number" min="1" max="1000" required value="${item.repMax}"></label>
      <label ${state.preferences.restTimerEnabled?'':'hidden'}>Rust (sec.)<input name="restSeconds" type="number" min="0" max="3600" required value="${item.restSeconds}"></label></div>
      <div class="training-actions training-reorder">${index?btn('up','Omhoog',item.id):''}${index<p.items.length-1?btn('down','Omlaag',item.id):''}${btn('remove','Verwijder',item.id)}</div></article>`).join('')}
    <div class="training-actions">${btn('add','Apparaat toevoegen')}<button class="primary-btn" type="submit">Schema bewaren</button></div></form>`;
}
function picker() {
  const brand=state.brands.find(b=>b.id===ui().brand);
  if(!brand)return `<p class="meta-text">Kies een merk.</p>${state.brands.map(b=>`<article class="training-card">${btn('brand',b.name,b.id)}</article>`).join('')}${!state.machines.length?'<p>Voeg eerst een merk en apparaat toe via Workouts → Apparaten.</p>':''}`;
  return `${btn('brands','Alle merken')}<h2>${s(brand.name)}</h2>${state.machines.filter(m=>m.brandId===brand.id).map(m=>`<article class="training-card"><h2>${s(m.name)}</h2><p class="training-brand">${s(brand.name)}</p>${previousSet(m.id)}${btn('choose','Kies apparaat',m.id)}</article>`).join('')}`;
}
function session() {
  const x=state.sessions.find(x=>x.id===state.route.id);
  if(!x)return '<p>Deze training is niet beschikbaar.</p>';
  const saved=state.sets.filter(s=>s.sessionId===x.id);
  if(x.status==='completed'||ui().finishing)return `<article class="training-card"><h2>${x.status==='completed'?'Training afgerond':'Training afronden?'}</h2><p>${saved.length} sets · ${s(formatWeight(saved.reduce((n,s)=>n+Number(s.weight)*Number(s.reps),0)))} kg volume</p><p class="meta-text">Alleen afgevinkte sets tellen mee. Je schema blijft hetzelfde.</p></article>
    ${x.status==='active'?`<div class="training-actions">${btn('finish-save','Training bewaren',x.id,'primary-btn')}${btn('continue','Verder trainen')}</div>`:''}
    ${saved.map(set=>{const item=x.items.find(i=>i.machineId===set.machineId);return `<article class="training-card">${item?heading(item):''}<p>${s(formatWeight(set.weight))} kg × ${s(set.reps)}</p></article>`;}).join('')}`;
  const index=Math.min(ui().current,x.items.length-1), item=x.items[index], existing=new Map(state.sets.map(s=>[s.id,s]));
  const available=state.machines.some(m=>m.id===item.machineId);
  const total=x.items.reduce((n,i)=>n+i.sets.length,0);
  return `<p class="meta-text">${saved.length} / ${total} sets voltooid</p><progress aria-label="Afgeronde sets" value="${saved.length}" max="${total}"></progress>
    <label class="field-group">Apparaat<select id="training-item-picker">${x.items.map((e,i)=>`<option value="${i}" ${i===index?'selected':''}>${s(e.brandName)} · ${s(e.machineName)}</option>`).join('')}</select></label>
    <article class="training-card">${heading(item)}<p class="meta-text">Doel: ${s(trainingTarget(item))} herhalingen per set</p>
    ${item.sets.map((set,i)=>{const done=existing.get(set.id);return `<form class="training-set-form" data-set="${a(set.id)}" data-item="${a(item.id)}">
      <div class="training-set-heading"><strong>Set ${i+1}</strong><span class="meta-text">${set.previousWeight!=null?`Vorige: ${s(formatWeight(set.previousWeight))} kg × ${set.previousReps}`:'Nog geen vorige set'}</span></div>
      ${done?`<div class="training-set-heading"><span>${s(formatWeight(done.weight))} kg × ${s(done.reps)}</span>${btn('undo','Ongedaan maken',set.id)}</div>`:`<div class="training-set-inputs"><label>kg<input name="weight" aria-label="Gewicht set ${i+1}" type="number" step="any" min="0" max="2000" required value="${set.weight}"></label><label>Herh.<input name="reps" aria-label="Herhalingen set ${i+1}" type="number" min="1" max="1000" required value="${set.reps}"></label><button type="submit" class="primary-btn" ${available?'':'disabled'} aria-label="Set ${i+1} opslaan">✓</button></div>`}</form>`;}).join('')}
    ${available?'':'<p>Apparaat verwijderd. Kies een ander apparaat.</p>'}</article>
    ${state.preferences.restTimerEnabled&&x.restUntil?`<div class="training-card"><p role="timer" data-rest-until="${a(x.restUntil)}">Rust</p>${btn('skip-rest','Rust overslaan')}</div>`:''}
    <div class="training-actions">${btn('swap','Ander apparaat',item.id)}${item.sets.length<50?btn('extra','Set toevoegen',item.id):''}${index+1<x.items.length?btn('next','Volgend apparaat','','primary-btn'):''}${btn('finish','Training afronden',x.id)}</div><p class="meta-text">Elke afgevinkte set wordt direct bewaard. Je kunt later verdergaan.</p>`;
}
export function renderTrainingScreen() {
  const route=state.route.screen;
  const title=route==='plans'?'Workouts':route==='plan'?state.plans.find(p=>p.id===state.route.id)?.name||'Schema':route==='training'?state.sessions.find(p=>p.id===state.route.id)?.name||'Training':route==='planEdit'?'Schema bewerken':'Kies een apparaat';
  const body=({plans,plan,planEdit:editor,trainingPicker:picker,training:session}[route]||plans)();
  return `<section class="screen-shell training-screen"><div class="screen-top">${renderHeader({title,showBack:route!=='plans',onBack:'training-back',extraButtons:route==='plans'?`<button class="small-btn" data-action="training-manage" aria-pressed="${Boolean(ui().managing)}" ${state.plans.length?'':'disabled'}>${ui().managing?'Gereed':'Wijzig'}</button><button class="round-btn" data-action="training-new" aria-label="Nieuw schema">${icon.plus}</button>`:''})}</div><div class="screen-scroll training-content">${body}${ui().error?`<p class="training-error" role="alert">${s(ui().error)}</p>`:''}</div></section>`;
}
export function renderTrainingHistory() {
  if(!state.sessions.length)return '';
  return `<section class="training-history"><h2>Trainingen</h2>${state.sessions.map(x=>`<article class="training-card"><h3>${s(x.name)}</h3><p class="meta-text">${s(formatDate(x.loggedAt))} · ${state.sets.filter(s=>s.sessionId===x.id).length} sets</p>${btn('resume',x.status==='active'?'Hervatten':'Bekijk training',x.id)}</article>`).join('')}</section>`;
}
