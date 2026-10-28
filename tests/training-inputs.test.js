import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { parseNumericInput, steppedValue, renderNumericField, wireNumericFields } from '../js/ui/forms.js';
import { readTrainingPreferences, persistTrainingPreferences } from '../js/utils.js';
import { planItem, newPlan, startTraining, trainingSetChange, addTrainingSet, latestMachineSet, updatePlanItem, trainingMachineGroups } from '../js/training-model.js';
import { createTrainingController } from '../js/training-controller.js';
import { createController } from '../js/controller.js';
import { renderTrainingScreen } from '../js/screens/training.js';
import { renderModal } from '../js/ui/components.js';
import { renderBodyweightScreen } from '../js/screens/bodyweight.js';

const brands=[{id:'t',name:'Technogym'},{id:'l',name:'Life Fitness'},{id:'empty',name:'Leeg'}];
const machines=[{id:'tm',brandId:'t',name:'Chest Press'},{id:'lm',brandId:'l',name:'Chest Press'},{id:'lr',brandId:'l',name:'Row'}];
const history=[{id:'t1',machineId:'tm',weight:60,reps:8,loggedAt:'2026-10-20T10:00:00Z'},
  {id:'t2',machineId:'tm',weight:62.25,reps:7,loggedAt:'2026-10-20T10:10:00Z'},
  {id:'l1',machineId:'lm',weight:45,reps:9,loggedAt:'2026-10-21T10:00:00Z'}];
const plan=()=>({...newPlan(),name:'Bovenlichaam',items:[planItem(machines[0],brands,3),planItem(machines[1],brands)]});

test('numeric entry accepts exact decimal commas and quick steps preserve precision and bounds',()=>{
  assert.equal(parseNumericInput(' 62,25 '),62.25);
  assert.equal(parseNumericInput('0'),0);
  assert.equal(parseNumericInput(',5'),.5);
  for(const invalid of ['', ' ', '1,2.3', '-1', '1e3', 'Infinity'])assert.ok(Number.isNaN(parseNumericInput(invalid)));
  assert.equal(steppedValue('62,25',1,2.5,0,2000),64.75);
  assert.equal(steppedValue('82.1',1,.1,.1,2000),82.2);
  assert.equal(steppedValue('0',-1,2.5,0,2000),0);
  assert.equal(steppedValue('1000',1,1,1,1000),1000);
  assert.equal(steppedValue('',1,1,1,1000),1);
  const html=renderNumericField({id:'reps',name:'reps',label:'Herhalingen',value:8,min:1,max:1000,integer:true,scroll:true});
  assert.match(html,/label for="reps"/);assert.match(html,/inputmode="numeric"/);assert.match(html,/select size="5"/);
  assert.doesNotMatch(html,/<option/, 'Scroll values are generated only when their picker opens');
});

test('numeric control validates optional RPE, selects the whole value, and emits dirty/change events',()=>{
  const listeners={}, buttons=[{dataset:{numberStep:'-1'}},{dataset:{numberStep:'1'}}];
  const input={value:'',dataset:{min:'1',max:'10',step:'.5',integer:'false',quantum:'.5'},
    addEventListener:(name,fn)=>listeners[name]=fn,setCustomValidity(message){this.error=message;},select(){this.selected=true;},
    dispatchEvent(event){listeners[event.type]?.();events.push(event.type);}};
  const events=[];
  for(const button of buttons)button.addEventListener=(_name,fn)=>button.click=fn;
  const field={querySelector:selector=>selector==='[data-number]'?input:selector==='[data-number-step="-1"]'?buttons[0]:selector==='[data-number-step="1"]'?buttons[1]:null,
    querySelectorAll:()=>buttons};
  wireNumericFields({querySelectorAll:()=>[field]});
  assert.equal(input.error,'');
  listeners.focus();assert.equal(input.selected,true);
  input.value='7,5';listeners.input();assert.equal(input.error,'');
  buttons[1].click();assert.equal(input.value,'8');assert.deepEqual(events,['input','change']);
  input.value='7.3';listeners.input();assert.match(input.error,/stappen/);
});

test('rep preferences upgrade older settings to 5–8 and only seed newly added items',t=>{
  const previous=globalThis.localStorage;let stored=JSON.stringify({defaultSetCount:4,restTimerEnabled:false});
  globalThis.localStorage={getItem:()=>stored,setItem:(_key,value)=>stored=value};
  t.after(()=>{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;});
  assert.deepEqual(readTrainingPreferences(),{defaultSetCount:4,defaultRepMin:5,defaultRepMax:8,restTimerEnabled:false});
  const existing=planItem(machines[0],brands,2,8,12);
  persistTrainingPreferences({defaultSetCount:2,defaultRepMin:6,defaultRepMax:9,restTimerEnabled:true});
  const prefs=readTrainingPreferences(),added=planItem(machines[0],brands,prefs.defaultSetCount,prefs.defaultRepMin,prefs.defaultRepMax);
  assert.equal(added.repMin,6);assert.equal(added.repMax,9);assert.equal(existing.repMin,8);assert.equal(existing.repMax,12);
  for(const [repMin,repMax] of [[0,8],[9,5],[5,1001],[5.5,8]])assert.throws(()=>persistTrainingPreferences({...prefs,defaultRepMin:repMin,defaultRepMax:repMax}));
  stored=JSON.stringify({...prefs,defaultRepMin:9,defaultRepMax:2});assert.equal(readTrainingPreferences().defaultRepMin,5);
});

test('new and extra sets use the latest actual values from the exact branded machine',()=>{
  const session=startTraining(plan(),machines,brands,history), item=session.items[0], second=session.items[1];
  assert.deepEqual(item.sets.map(set=>set.weight),[62.25,62.25,62.25]);
  assert.equal(item.sets[0].reps,7);assert.equal(second.sets[0].weight,45);
  assert.equal(latestMachineSet(history,'tm').id,'t2');
  const changes=trainingSetChange(session,item.id,item.sets[0].id,67.75,6,history);
  const next=changes[1].record;
  assert.equal(next.items[0].sets[0].weight,67.75);assert.equal(next.items[0].sets[0].reps,6);
  assert.equal(next.items[0].sets[1].weight,67.75);assert.equal(next.items[1].sets[0].weight,45);
  assert.equal(session.items[0].sets[0].weight,62.25);
  const extra=addTrainingSet(next,item.id,[...history,changes[0].record]);
  assert.equal(extra.items[0].sets.at(-1).weight,67.75);assert.equal(extra.items[0].sets.at(-1).reps,6);
  assert.equal(extra.items[0].setCount,4);
  const legacyZero=addTrainingSet(session,item.id,[{...history[1],reps:0}]);assert.equal(legacyZero.items[0].sets.at(-1).reps,1);
  const empty=startTraining(plan(),machines,brands,[]).items[0].sets[0];
  assert.equal(empty.weight,0);assert.equal(empty.previousWeight,undefined);
});

test('saving a previous set preserves a manually entered next weight and its rendered draft',()=>{
  const session=startTraining(plan(),machines,brands,history),item=session.items[0],drafts={[item.sets[1].id]:{weight:'64,25',reps:'5'}};
  const changes=trainingSetChange(session,item.id,item.sets[0].id,70,6,history,false,true,drafts);
  assert.equal(changes[1].record.items[0].sets[1].weight,62.25);
  Object.assign(state,{brands,machines,sets:[...history,changes[0].record],sessions:[changes[1].record],lastSets:new Map([['tm',changes[0].record],['lm',history[2]]]),route:{screen:'training',id:session.id}});
  Object.assign(state.trainingUI,{current:0,finishing:false,setDrafts:drafts});
  const html=renderTrainingScreen();
  assert.match(html,new RegExp(`id="${item.sets[1].id}-weight"[^>]*value="64,25"`));
  assert.match(html,new RegExp(`id="${item.sets[2].id}-weight"[^>]*value="70"`));
  state.trainingUI.setDrafts={};
});

test('brand picker is collapsed by default, searches matching brands/devices and omits empty sections',()=>{
  const all=trainingMachineGroups(brands,machines);
  assert.deepEqual(all.map(group=>[group.brand.id,group.machines.length]),[['t',1],['l',2]]);
  assert.deepEqual(trainingMachineGroups(brands,machines,'chest').flatMap(group=>group.machines.map(machine=>machine.id)),['tm','lm']);
  assert.deepEqual(trainingMachineGroups(brands,machines,'life').flatMap(group=>group.machines.map(machine=>machine.id)),['lm','lr']);
  assert.deepEqual(trainingMachineGroups(brands,machines,'unknown'),[]);
  Object.assign(state,{brands,machines,route:{screen:'trainingPicker'}});Object.assign(state.trainingUI,{pickerSearch:'',pickerExpanded:[]});
  assert.doesNotMatch(renderTrainingScreen(),/data-training-brand="[^"]+" open/);
  state.trainingUI.pickerSearch='row';const html=renderTrainingScreen();
  assert.match(html,/data-training-brand="l" open/);assert.match(html,/data-id="lr"/);
  assert.doesNotMatch(html,/data-training-brand="t"|data-id="lm"|data-training-brand="empty"/);
});

test('item editing isolates save/cancel and replacement preserves targets and history',async t=>{
  const original=globalThis.document;let form=null;
  globalThis.document={getElementById:id=>id==='training-item-form'?form:null,querySelectorAll:()=>[],querySelector:()=>null};
  t.after(()=>globalThis.document=original);
  const originalPlan=plan(),session=startTraining(originalPlan,machines,brands,history);
  Object.assign(state,{brands,machines,plans:[originalPlan],route:{screen:'plan',id:originalPlan.id}});
  const controller=createTrainingController({render(){},navigate:route=>state.route=route,showToast:message=>assert.fail(message)});
  const action=(name,id)=>controller.handle(name,{dataset:{id}});
  await action('training-item-edit',originalPlan.items[0].id);state.trainingUI.itemDraft.repMin=3;
  await action('training-item-cancel');assert.equal(originalPlan.items[0].repMin,5);assert.equal(state.route.screen,'plan');
  state.route={screen:'planEdit'};state.trainingUI.draft=structuredClone(originalPlan);
  await action('training-item-edit',originalPlan.items[0].id);
  const callbacks={};form={elements:{setCount:{value:'4'},repMin:{value:'6'},repMax:{value:'9'},restSeconds:{value:'120'}},
    addEventListener:(name,callback)=>callbacks[name]=callback,setAttribute(){},removeAttribute(){}};
  controller.wire();await action('training-item-replace');await action('training-choose','lr');
  await callbacks.submit({preventDefault(){}});
  const saved=state.trainingUI.draft.items[0];
  assert.equal(saved.id,originalPlan.items[0].id);assert.equal(saved.machineId,'lr');assert.equal(saved.brandName,'Life Fitness');
  assert.deepEqual([saved.setCount,saved.repMin,saved.repMax,saved.restSeconds],[4,6,9,120]);
  assert.equal(originalPlan.items[0].machineId,'tm');assert.equal(session.items[0].machineId,'tm');
  assert.deepEqual(state.trainingUI.draft.items[1],originalPlan.items[1]);
  assert.equal(state.route.screen,'planEdit');
  assert.throws(()=>updatePlanItem(originalPlan,{...saved,repMin:10,repMax:5}));
  assert.throws(()=>updatePlanItem(originalPlan,{...saved,id:'deleted'}));
});

test('set editor preserves exact decimal and zero values and leaves RPE optional',()=>{
  state.modal={type:'set',mode:'edit',data:{weight:62.25,reps:0,rpe:''}};
  const html=renderModal();
  assert.match(html,/id="set-weight"[^>]*value="62.25"/);
  assert.match(html,/id="set-reps"[^>]*value="0"/);
  const rpe=html.match(/<input id="set-rpe"[^>]+>/)[0];assert.doesNotMatch(rpe,/required/);
  state.modal=null;
});

test('quick logging prefills only the selected machine without copying the old date',t=>{
  const original=globalThis.document,handlers={};
  globalThis.document={addEventListener:(name,callback)=>handlers[name]=callback};
  t.after(()=>{globalThis.document=original;state.modal=null;});
  Object.assign(state,{machines,brands,lastSets:new Map([['tm',history[1]],['lm',history[2]]]),route:{screen:'machineDetail',machineId:'tm',brandId:'t'}});
  const controller=createController({render(){},navigate:route=>state.route=route});controller.attachEventDelegation();
  const click=(action,id)=>handlers.click({target:{closest:()=>({dataset:{action,id}})}});
  click('open-set-create');assert.deepEqual(state.modal.data,{weight:62.25,reps:7});
  click('quick-log-machine','lm');assert.deepEqual(state.modal.data,{weight:45,reps:9});
  click('quick-log-machine','lr');assert.equal(state.modal.data,null);
});

test('settings controls persist valid ranges together and restore their value when storage fails',t=>{
  const originalDocument=globalThis.document,originalStorage=globalThis.localStorage,originalPreferences={...state.preferences};
  const inputs=Object.fromEntries(['training-default-sets','training-default-rep-min','training-default-rep-max','training-rest-enabled'].map(id=>[id,{value:'',checked:true,addEventListener(name,callback){this[name]=callback;},dispatchEvent(){}}]));
  globalThis.document={getElementById:id=>inputs[id]||null,querySelector:()=>null,querySelectorAll:()=>[]};
  let stored;globalThis.localStorage={getItem:()=>stored,setItem:(_key,value)=>stored=value};
  t.after(()=>{globalThis.document=originalDocument;globalThis.localStorage=originalStorage;Object.assign(state.preferences,originalPreferences);});
  Object.assign(state.preferences,{defaultSetCount:2,defaultRepMin:5,defaultRepMax:8,restTimerEnabled:true});
  const errors=[];createTrainingController({render(){},showToast:message=>errors.push(message)}).wire();
  const minimum=inputs['training-default-rep-min'],maximum=inputs['training-default-rep-max'];
  minimum.value='9';minimum.change({target:minimum});assert.equal(state.preferences.defaultRepMin,9);assert.equal(maximum.value,9);
  maximum.value='3';maximum.change({target:maximum});assert.equal(state.preferences.defaultRepMin,3);assert.equal(state.preferences.defaultRepMax,3);
  minimum.value='0';minimum.change({target:minimum});assert.equal(minimum.value,3);assert.equal(errors.length,1);
  assert.equal(JSON.parse(stored).defaultRepMax,3);
  globalThis.localStorage.setItem=()=>{throw Error('Storage full');};
  const timer=inputs['training-rest-enabled'];timer.checked=false;timer.change({target:timer});
  assert.equal(state.preferences.restTimerEnabled,true);assert.equal(timer.checked,true);assert.equal(errors.length,2);
});

test('ordinary entries keep their unbounded domain while scroll choices stay finite',()=>{
  state.modal={type:'set',mode:'edit',data:{weight:2500.25,reps:1500}};
  const markup=renderModal();
  for(const [id,value] of [['set-weight','2500.25'],['set-reps','1500']]){
    const field=markup.match(new RegExp(`<input id="${id}"[^>]+>`))[0];
    assert.match(field,/data-max="Infinity"/);assert.ok(field.includes(`value="${value}"`));
  }
  assert.match(renderBodyweightScreen(),/id="bodyweight-value"[^>]*data-max="Infinity"/);
  state.modal=null;
  const listeners={},buttons=[{},{}],select={innerHTML:'',addEventListener(){},focus(){}},picker={open:true,querySelector:()=>select,addEventListener:(name,fn)=>listeners[name]=fn};
  const input={value:'1500',dataset:{min:'0',max:'Infinity',step:'1',integer:'true',quantum:'0'},
    addEventListener:(name,fn)=>listeners[name]=fn,setCustomValidity(message){this.error=message;},select(){}};
  buttons.forEach(button=>button.addEventListener=()=>{});
  const field={querySelector:selector=>selector==='[data-number]'?input:selector==='[data-number-step="-1"]'?buttons[0]:selector==='[data-number-step="1"]'?buttons[1]:picker,querySelectorAll:()=>buttons};
  wireNumericFields({querySelectorAll:()=>[field]});assert.equal(input.error,'');
  listeners.toggle();assert.equal((select.innerHTML.match(/<option/g)||[]).length,1002);
  assert.match(select.innerHTML,/<option value="1500" selected>1500<\/option>/);
  input.value='2001';listeners.input();assert.equal(input.error,'');
  assert.equal(steppedValue('2500.25',1,2.5,0,Infinity),2502.75);
});
