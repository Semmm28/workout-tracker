import test from 'node:test';
import assert from 'node:assert/strict';
import { newPlan, planItem, startTraining, replaceTrainingItem, trainingSetChange, validTraining } from '../js/training-model.js';
import { sanitizeImportData, buildExportPayload } from '../js/data-transfer.js';
import { state } from '../js/state.js';

const brands=[{id:'t',name:'Technogym'},{id:'l',name:'Life Fitness'}];
const machines=[{id:'tm',brandId:'t',name:'Chest Press'},{id:'lm',brandId:'l',name:'Chest Press'}];
const history=[{id:'old-t',machineId:'tm',weight:60,reps:10,loggedAt:'2026-10-20T10:00:00Z',createdAt:'2026-10-20T10:00:00Z'},
  {id:'old-l',machineId:'lm',weight:45,reps:12,loggedAt:'2026-10-20T10:00:00Z',createdAt:'2026-10-20T10:00:00Z'}];
function fixture(){return {...newPlan(),name:'Bovenlichaam A',items:[planItem(machines[0],brands)]};}

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
