import { icon } from '../constants.js';
import { state } from '../state.js';
import { safeText as s, escapeAttr as a, formatWeight, formatDate } from '../utils.js';
import { renderHeader } from '../ui/components.js';
import { trainingTarget, trainingMachineGroups } from '../training-model.js';
import { renderNumericField } from '../ui/forms.js';

const ui = () => state.trainingUI;
const btn=(action,label,id='',cls='secondary-btn')=>`<button type="button" class="${cls}" data-action="training-${action}" data-id="${a(id)}">${s(label)}</button>`;
const heading=item=>`<p class="training-brand">${s(state.brands.find(b=>b.id===state.machines.find(m=>m.id===item.machineId)?.brandId)?.name||item.brandName)}</p><h2>${s(state.machines.find(m=>m.id===item.machineId)?.name||item.machineName)}</h2>`;
export function previousSet(machineId) {
  const previous=state.lastSets.get(machineId);
  return `<p class="meta-text">${previous?`Vorige set: ${s(formatWeight(previous.weight))} kg × ${s(previous.reps)}`:'Nog geen set opgeslagen'}</p>`;
}
function itemCard(item) {
  return `<button type="button" class="training-card training-item-button" data-action="training-item-edit" data-id="${a(item.id)}" aria-label="${a(item.machineName)} wijzigen">${heading(item)}<p class="meta-text">${item.setCount} × ${s(trainingTarget(item))} herhalingen${state.preferences.restTimerEnabled&&item.restSeconds>0?` · ${item.restSeconds} sec. rust`: ''}</p>${previousSet(item.machineId)}<span class="training-edit-hint">Wijzig oefening ${icon.chevron}</span>${state.machines.some(m=>m.id===item.machineId)?'':'<p>Apparaat verwijderd. Kies een vervanger.</p>'}</button>`;
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
    ${p.items.map((item,index)=>`<div>${itemCard(item)}<div class="training-actions training-reorder">${index?btn('up','Omhoog',item.id):''}${index<p.items.length-1?btn('down','Omlaag',item.id):''}${btn('remove','Verwijder',item.id)}</div></div>`).join('')}
    <div class="training-actions">${btn('add','Apparaat toevoegen')}<button class="primary-btn" type="submit">Schema bewaren</button></div></form>`;
}
function itemEditor() {
  const item=ui().itemDraft;
  if(!item)return '<p>Open een oefening vanuit je schema.</p>';
  const number=(name,label,min,max,step=1)=>renderNumericField({id:`plan-item-${name}`,name,label,min,max,step,value:item[name],integer:true,scroll:true});
  return `<form id="training-item-form"><article class="training-card">${heading(item)}${previousSet(item.machineId)}${btn('item-replace','Ander apparaat',item.id)}<div class="training-fields">
    ${number('setCount','Aantal sets',1,50)}${number('repMin','Herhalingen vanaf',1,1000)}${number('repMax','Herhalingen tot',1,1000)}
    ${state.preferences.restTimerEnabled?number('restSeconds','Rust (seconden)',0,3600,15):''}
    </div></article><p class="meta-text">Je wijzigt alleen deze oefening in het schema. Eerdere en lopende trainingen blijven hetzelfde.</p>
    <div class="training-actions">${btn('item-cancel','Annuleren')}<button type="submit" class="primary-btn">Oefening bewaren</button></div></form>`;
}
function picker() {
  const query=ui().pickerSearch||'', groups=trainingMachineGroups(state.brands,state.machines,query);
  return `<label class="field-group">Zoek een merk of apparaat<input id="training-machine-search" type="search" value="${a(query)}" placeholder="Bijvoorbeeld Life Fitness of Chest Press"></label>
    ${groups.map(({brand,machines})=>`<details class="training-brand-group" data-training-brand="${a(brand.id)}" ${query.trim()||(ui().pickerExpanded||[]).includes(brand.id)?'open':''}>
      <summary><span>${s(brand.name)}</span><span class="meta-text">${machines.length} ${machines.length===1?'apparaat':'apparaten'}</span>${icon.chevron}</summary>
      <div>${machines.map(machine=>`<button type="button" class="training-machine-choice" data-action="training-choose" data-id="${a(machine.id)}"><strong>${s(machine.name)}</strong>${previousSet(machine.id)}</button>`).join('')}</div></details>`).join('')}
    ${groups.length?'':`<p>${state.machines.length?'Geen apparaten gevonden. Probeer een andere zoekterm.':'Voeg eerst een merk en apparaat toe via Workouts → Apparaten.'}</p>`}`;
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
    ${item.sets.map((set,i)=>{const done=existing.get(set.id),draft=ui().setDrafts?.[set.id]||{};
      const latest=state.lastSets.get(item.machineId);
      const weight=draft.weight??latest?.weight??(set.previousWeight==null&&set.weight===0?'':set.weight);
      return `<form class="training-set-form" aria-label="Set ${i+1}" data-set="${a(set.id)}" data-item="${a(item.id)}">
      <div class="training-set-heading"><strong>Set ${i+1}</strong><span class="meta-text">${set.previousWeight!=null?`Vorige: ${s(formatWeight(set.previousWeight))} kg × ${set.previousReps}`:'Nog geen vorige set'}</span></div>
      ${done?`<div class="training-set-heading"><span>${s(formatWeight(done.weight))} kg × ${s(done.reps)}</span>${btn('undo','Ongedaan maken',set.id)}</div>`:`<div class="training-set-inputs">
        ${renderNumericField({id:`${set.id}-weight`,name:'weight',label:'Gewicht (kg)',value:weight,min:0,max:2000,step:2.5})}
        ${renderNumericField({id:`${set.id}-reps`,name:'reps',label:'Herhalingen',value:draft.reps??set.reps,min:1,max:1000,integer:true,scroll:true})}
        <button type="submit" class="primary-btn" ${available?'':'disabled'} aria-label="Set ${i+1} opslaan">Set ${i+1} opslaan</button></div>`}</form>`;}).join('')}
    ${available?'':'<p>Apparaat verwijderd. Kies een ander apparaat.</p>'}</article>
    ${state.preferences.restTimerEnabled&&x.restUntil?`<div class="training-card"><p role="timer" data-rest-until="${a(x.restUntil)}">Rust</p>${btn('skip-rest','Rust overslaan')}</div>`:''}
    <div class="training-actions">${btn('swap','Ander apparaat',item.id)}${item.sets.length<50?btn('extra','Set toevoegen',item.id):''}${index+1<x.items.length?btn('next','Volgend apparaat','','primary-btn'):''}${btn('finish','Training afronden',x.id)}</div><p class="meta-text">Elke afgevinkte set wordt direct bewaard. Je kunt later verdergaan.</p>`;
}
export function renderTrainingScreen() {
  const route=state.route.screen;
  const title=route==='plans'?'Workouts':route==='plan'?state.plans.find(p=>p.id===state.route.id)?.name||'Schema':route==='training'?state.sessions.find(p=>p.id===state.route.id)?.name||'Training':route==='planEdit'?'Schema bewerken':route==='planItemEdit'?'Oefening wijzigen':'Kies een apparaat';
  const body=({plans,plan,planEdit:editor,planItemEdit:itemEditor,trainingPicker:picker,training:session}[route]||plans)();
  return `<section class="screen-shell training-screen"><div class="screen-top">${renderHeader({title,showBack:route!=='plans',onBack:'training-back',extraButtons:route==='plans'?`<button class="small-btn" data-action="training-manage" aria-pressed="${Boolean(ui().managing)}" ${state.plans.length?'':'disabled'}>${ui().managing?'Gereed':'Wijzig'}</button><button class="round-btn" data-action="training-new" aria-label="Nieuw schema">${icon.plus}</button>`:''})}</div><div class="screen-scroll training-content">${body}${ui().error?`<p class="training-error" role="alert">${s(ui().error)}</p>`:''}</div></section>`;
}
export function renderTrainingHistory() {
  if(!state.sessions.length)return '';
  return `<section class="training-history"><h2>Trainingen</h2>${state.sessions.map(x=>`<article class="training-card"><h3>${s(x.name)}</h3><p class="meta-text">${s(formatDate(x.loggedAt))} · ${state.sets.filter(s=>s.sessionId===x.id).length} sets</p>${btn('resume',x.status==='active'?'Hervatten':'Bekijk training',x.id)}</article>`).join('')}</section>`;
}
