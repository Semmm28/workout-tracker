import test from 'node:test';
import assert from 'node:assert/strict';
import { newPlan, planItem, startTraining, replaceTrainingItem, trainingSetChange, validTraining } from '../js/training-model.js';
import { sanitizeImportData, buildExportPayload } from '../js/data-transfer.js';
import { state } from '../js/state.js';

const brands=[{id:'t',name:'Technogym'},{id:'l',name:'Life Fitness'}];
const machines=[{id:'tm',brandId:'t',name:'Chest Press'},{id:'lm',brandId:'l',name:'Chest Press'}];
const history=[{id:'old-t',machineId:'tm',weight:60,reps:10,loggedAt:'2026-10-20T10:00:00Z',createdAt:'2026-10-20T10:00:00Z'},
  {id:'old-l',machineId:'lm',weight:45,reps:12,loggedAt:'2026-10-20T10:00:00Z',createdAt:'2026-10-20T10:00:00Z'}];
function fixture(){return {...newPlan(),name:'Bovenlichaam A',items:[planItem(machines[0],brands,3)]};}

test('a workout snapshots its plan and takes previous values only from the selected branded machine',()=>{
  const plan=fixture(),session=startTraining(plan,machines,brands,history);
  assert.equal(session.items[0].sets[0].weight,60);
  assert.equal(session.items[0].sets[0].previousReps,10);
  assert.equal(history.length,2);assert.equal(plan.items[0].sets,undefined);
  plan.name='Edited';plan.items[0].repMin=2;
  assert.equal(session.name,'Bovenlichaam A');assert.equal(session.items[0].repMin,8);
  assert.ok(validTraining(session,'sessions'));
  assert.throws(()=>startTraining(plan,[],brands,history));
});
test('saving is idempotent and a brand swap preserves completed sets while loading the other history',()=>{
  const session=startTraining(fixture(),machines,brands,history),item=session.items[0],set=item.sets[0];
  const changes=trainingSetChange(session,item.id,set.id,62.5,8,history);
  const done=[...history,changes[0].record];
  assert.equal(changes[0].record.sessionId,session.id);
  assert.deepEqual(trainingSetChange(session,item.id,set.id,62.5,8,done),[]);
  const swapped=replaceTrainingItem(session,item.id,machines[1],brands,done);
  assert.equal(swapped.items.length,2);assert.equal(swapped.items[0].sets[0].id,set.id);
  assert.equal(swapped.items[0].machineId,'tm');assert.equal(swapped.items[1].machineId,'lm');
  assert.equal(swapped.items[1].sets.length,2);assert.equal(swapped.items[1].sets[0].weight,45);
  assert.notEqual(swapped.items[1].sets[0].id,set.id);
  assert.throws(()=>trainingSetChange({...session,status:'completed'},item.id,set.id,20,8,done));
  assert.throws(()=>trainingSetChange(session,item.id,set.id,20,1.5,history));
});
test('v2 backups preserve plans, in-progress workouts, original IDs and unknown fields',()=>{
  const plan={...fixture(),futureField:{keep:true}},session=startTraining(plan,machines,brands,history);
  Object.assign(state,{brands,machines,sets:history,bodyweights:[],plans:[plan],sessions:[session]});
  const backup=buildExportPayload(),restored=sanitizeImportData(JSON.parse(JSON.stringify(backup)));
  assert.equal(backup.version,2);
  for(const kind of ['brands','machines','sets','bodyweights','plans','sessions'])assert.deepEqual(restored[kind],backup[kind]);
  const invalid=structuredClone(backup);invalid.sessions[0].items[0].sets[1].id=invalid.sessions[0].items[0].sets[0].id;
  assert.throws(()=>sanitizeImportData(invalid));
  assert.throws(()=>sanitizeImportData({...backup,version:3}));
  assert.deepEqual(sanitizeImportData({version:1,brands}).plans,[]);
});

// Equal logged times and legacy missing creation times must match the chart/history order.
test('previous workout values use the existing history tie-breaker',()=>{
  const same=history[0];
  const entries=[{...same,id:'a',weight:50},{...same,id:'z',weight:70},{...same,id:'m',weight:80,createdAt:undefined}];
  const session=startTraining(fixture(),machines,brands,entries);
  assert.deepEqual(session.items[0].sets.map(s=>s.weight),[50,70,80]);
});


test('new machines use two sets by default or the chosen preference without changing existing plans',()=>{
  const existing=fixture();
  assert.equal(planItem(machines[0],brands).setCount,2);
  assert.equal(planItem(machines[0],brands,5).setCount,5);
  for(const invalid of [0,51,2.5,NaN,'4'])assert.equal(planItem(machines[0],brands,invalid).setCount,2);
  assert.equal(existing.items[0].setCount,3);
});
test('timer can be disabled without changing saved sets or plan rest durations',()=>{
  const plan=fixture(),session=startTraining(plan,machines,brands,history),item=session.items[0],set=item.sets[0];
  const active=trainingSetChange(session,item.id,set.id,60,8,history);
  assert.ok(active[1].record.restUntil);
  const disabled=trainingSetChange({...session,restUntil:active[1].record.restUntil},item.id,set.id,60,8,history,false,false);
  assert.equal(disabled[1].record.restUntil,undefined);
  assert.equal(disabled[0].record.weight,60);
  assert.equal(disabled[1].record.items[0].restSeconds,90);
  session.items[0].restSeconds=0;
  assert.equal(trainingSetChange(session,item.id,set.id,60,8,history)[1].record.restUntil,undefined);
});
test('training preferences persist and reject invalid values or failed writes',async()=>{
  const {readTrainingPreferences,persistTrainingPreferences}=await import('../js/utils.js');
  const previous=globalThis.localStorage;let stored=null;
  globalThis.localStorage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;}};
  try {
    assert.deepEqual(readTrainingPreferences(),{defaultSetCount:2,restTimerEnabled:true});
    persistTrainingPreferences({defaultSetCount:4,restTimerEnabled:false});
    assert.deepEqual(readTrainingPreferences(),{defaultSetCount:4,restTimerEnabled:false});
    assert.throws(()=>persistTrainingPreferences({defaultSetCount:0,restTimerEnabled:true}));
    assert.equal(readTrainingPreferences().defaultSetCount,4);
    stored='{"defaultSetCount":100,"restTimerEnabled":"false"}';
    assert.deepEqual(readTrainingPreferences(),{defaultSetCount:2,restTimerEnabled:true});
    stored='{broken';assert.equal(readTrainingPreferences().defaultSetCount,2);
    globalThis.localStorage.setItem=()=>{throw Error('Storage full');};
    assert.throws(()=>persistTrainingPreferences({defaultSetCount:2,restTimerEnabled:true}));
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('plans expose top edit and add controls and hide timers when disabled',async()=>{
  const {renderTrainingScreen}=await import('../js/screens/training.js');
  const plan=fixture(),session=startTraining(plan,machines,brands,history);
  Object.assign(state,{brands,machines,plans:[plan],sessions:[{...session,restUntil:new Date().toISOString()}],sets:history});
  state.route={screen:'plans'};state.trainingUI.managing=false;
  let html=renderTrainingScreen();
  assert.match(html,/data-action="training-manage"/);assert.match(html,/data-action="training-new"/);
  state.trainingUI.managing=true;html=renderTrainingScreen();
  assert.match(html,/data-action="training-edit"/);assert.match(html,/data-action="training-delete"/);
  state.route={screen:'training',id:session.id};state.trainingUI.current=0;
  state.preferences.restTimerEnabled=false;assert.doesNotMatch(renderTrainingScreen(),/data-rest-until/);
  state.preferences.restTimerEnabled=true;assert.match(renderTrainingScreen(),/data-rest-until/);
  state.trainingUI.managing=false;
});
