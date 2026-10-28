import { debounce, persistTrainingPreferences } from './utils.js';
import { state } from './state.js';
import { loadState } from './data.js';
import { getAll, writeChanges } from './database.js';
import { parseNumericInput, wireAsyncForm } from './ui/forms.js';
import { newPlan, planItem, validTraining, startTraining, replaceTrainingItem, trainingSetChange, addTrainingSet, updatePlanItem } from './training-model.js';

export function createTrainingController({render,navigate,showToast}) {
  const ui=state.trainingUI;
  let busy=false, timer;
  const go=(screen,id)=>navigate({screen,id});
  const current=()=>state.sessions.find(x=>x.id===state.route.id);
  const persist=async(kind,record)=>{
    if(!validTraining(record,kind))throw new Error('Controleer de naam, apparaten en doelen.');
    await writeChanges([{kind,id:record.id,record}]);await loadState();
  };
  const capture=()=>{
    const form=document.getElementById('training-plan-form');if(!form)return;
    ui.draft.name=form.elements.name.value.trim();
  };
  const captureItem=()=>{
    const form=document.getElementById('training-item-form');if(!form||!ui.itemDraft)return;
    for(const field of ['setCount','repMin','repMax','restSeconds'])if(form.elements[field])ui.itemDraft[field]=parseNumericInput(form.elements[field].value);
  };
  const closeItem=()=>{const destination=ui.itemReturn;ui.itemDraft=null;ui.itemReturn=null;go(destination?.screen||'plans',destination?.id);};
  const freshest=async()=>{
    const stored=(await getAll('sessions')).find(x=>x.id===state.route.id);
    if(!stored||stored.status!=='active')throw new Error('De training is al afgerond. Open haar opnieuw.');
    return stored;
  };
  async function changeSet(itemId,setId,weight,reps,undo=false) {
    const session=await freshest(), sets=await getAll('sets');
    const machineId=session.items.find(i=>i.id===itemId)?.machineId;
    if(!(await getAll('machines')).some(m=>m.id===machineId))throw new Error('Het apparaat is verwijderd. Kies een vervanger.');
    await writeChanges(trainingSetChange(session,itemId,setId,weight,reps,sets,undo,state.preferences.restTimerEnabled,ui.setDrafts));
    delete ui.setDrafts[setId];await loadState();render();
  }
  async function handle(action,target) {
    if(busy)return;
    busy=true;target.disabled=true;ui.error='';
    const id=target.dataset.id;
    try {
      if(action==='training-plans')go('plans');
      if(action==='training-manage'){ui.managing=!ui.managing;render();}
      if(action==='training-plan-up'||action==='training-plan-down'){
        const plans=[...state.plans],from=plans.findIndex(p=>p.id===id),to=from+(action==='training-plan-up'?-1:1);
        if(from>=0&&to>=0&&to<plans.length){
          [plans[from],plans[to]]=[plans[to],plans[from]];
          await writeChanges(plans.map((p,sortOrder)=>({kind:'plans',id:p.id,record:{...p,sortOrder}})));await loadState();render();
        }
      }
      if(action==='training-plan')go('plan',id);
      if(action==='training-new'||action==='training-edit'){
        ui.editing=action==='training-edit';ui.draft=ui.editing?structuredClone(state.plans.find(p=>p.id===id)):newPlan();go('planEdit');
      }
      if(action==='training-item-edit'){
        capture();const plan=state.route.screen==='planEdit'?ui.draft:state.plans.find(p=>p.id===state.route.id);
        const item=plan?.items.find(item=>item.id===id);if(!item)throw new Error('Deze oefening is niet meer beschikbaar.');
        ui.itemDraft=structuredClone(item);ui.itemReturn={screen:state.route.screen,id:plan.id};go('planItemEdit');
      }
      if(action==='training-item-cancel')closeItem();
      if(action==='training-back'){
        if(state.route.screen==='planItemEdit')closeItem();
        else if(state.route.screen==='trainingPicker')go(ui.picker==='add'?'planEdit':ui.picker==='plan-replace'?'planItemEdit':'training',ui.previous);
        else if(state.route.screen==='planEdit'&&ui.draft?.items.length){
          state.confirmSheet={title:'Schema sluiten?',message:'Niet bewaarde wijzigingen vervallen.',confirmLabel:'Sluiten',destructive:false,confirm:()=>{state.confirmSheet=null;go('plans');}};render();
        }else go('plans');
      }
      if(['training-add','training-swap','training-item-replace'].includes(action)){
        capture();captureItem();ui.picker=action==='training-add'?'add':action==='training-item-replace'?'plan-replace':id;ui.pickerSearch='';ui.pickerExpanded=[];ui.previous=state.route.id;go('trainingPicker');
      }
      if(action==='training-choose'){
        const machine=state.machines.find(m=>m.id===id);if(!machine)throw new Error('Dit apparaat is niet meer beschikbaar.');
        if(ui.picker==='add'){if(ui.draft.items.length>=100)throw new Error('Maximaal 100 apparaten per schema.');ui.draft.items.push(planItem(machine,state.brands,state.preferences.defaultSetCount,state.preferences.defaultRepMin,state.preferences.defaultRepMax));go('planEdit');}
        else if(ui.picker==='plan-replace'){
          Object.assign(ui.itemDraft,{machineId:machine.id,machineName:machine.name,brandName:state.brands.find(brand=>brand.id===machine.brandId)?.name||'Onbekend merk'});go('planItemEdit');
        }
        else {
          const session=(await getAll('sessions')).find(x=>x.id===ui.previous);
          const next=replaceTrainingItem(session,ui.picker,machine,state.brands,await getAll('sets'));
          await persist('sessions',next);ui.current=next.items.findIndex(i=>!session.items.some(old=>old.id===i.id));go('training',next.id);
        }
      }
      if(['training-up','training-down','training-remove'].includes(action)){
        capture();const index=ui.draft.items.findIndex(i=>i.id===id);
        if(action==='training-remove')ui.draft.items.splice(index,1);
        else {const to=index+(action==='training-up'?-1:1);if(to>=0&&to<ui.draft.items.length)[ui.draft.items[index],ui.draft.items[to]]=[ui.draft.items[to],ui.draft.items[index]];}
        render();
      }
      if(action==='training-start'){
        await loadState();let session=state.sessions.find(x=>x.status==='active');
        if(!session){session=startTraining(state.plans.find(p=>p.id===id),state.machines,state.brands,state.sets);await persist('sessions',session);}
        ui.current=0;ui.finishing=false;go('training',session.id);
      }
      if(action==='training-resume'){ui.current=0;ui.finishing=false;go('training',id);}
      if(action==='training-next'){ui.current=Math.min(ui.current+1,current().items.length-1);render();}
      if(action==='training-extra'){
        const next=addTrainingSet(await freshest(),id,await getAll('sets'));await persist('sessions',next);render();
      }
      if(action==='training-undo'){
        const item=current().items.find(i=>i.sets.some(s=>s.id===id));const set=item.sets.find(s=>s.id===id);await changeSet(item.id,id,set.weight,set.reps,true);
      }
      if(action==='training-finish'){ui.finishing=true;render();}
      if(action==='training-skip-rest'){const next=await freshest();delete next.restUntil;await persist('sessions',next);render();}
      if(action==='training-continue'){ui.finishing=false;render();}
      if(action==='training-finish-save'){
        const next=await freshest();next.status='completed';next.finishedAt=new Date().toISOString();delete next.restUntil;
        await persist('sessions',next);ui.finishing=false;render();
      }
      if(action==='training-delete'){
        state.confirmSheet={title:'Schema verwijderen?',message:'Je uitgevoerde trainingen en sets blijven bewaard.',confirmLabel:'Verwijderen',confirm:async()=>{await writeChanges([{kind:'plans',id,deleted:true}]);await loadState();state.confirmSheet=null;go('plans');}};render();
      }
    }catch(error){ui.error=error.message;showToast(error.message);}finally{busy=false;target.disabled=false;}
  }
  function wire() {
    clearInterval(timer);
    for (const id of ['training-default-sets', 'training-default-rep-min', 'training-default-rep-max', 'training-rest-enabled']) {
      document.getElementById(id)?.addEventListener('change', event => {
        const input = event.target;
        const next = { defaultSetCount: state.preferences.defaultSetCount, defaultRepMin: state.preferences.defaultRepMin, defaultRepMax: state.preferences.defaultRepMax, restTimerEnabled: state.preferences.restTimerEnabled };
        const key=({'training-default-sets':'defaultSetCount','training-default-rep-min':'defaultRepMin','training-default-rep-max':'defaultRepMax'})[id];
        if(key)next[key]=parseNumericInput(input.value);else next.restTimerEnabled=input.checked;
        if(key==='defaultRepMin'&&next.defaultRepMin>next.defaultRepMax)next.defaultRepMax=next.defaultRepMin;
        if(key==='defaultRepMax'&&next.defaultRepMax<next.defaultRepMin)next.defaultRepMin=next.defaultRepMax;
        try {
          persistTrainingPreferences(next);Object.assign(state.preferences,next);
          for(const [field,property] of [['training-default-rep-min','defaultRepMin'],['training-default-rep-max','defaultRepMax']]){
            const other=document.getElementById(field);if(other&&other!==input){other.value=next[property];other.dispatchEvent(new Event('input',{bubbles:true}));}
          }
        }
        catch (error) {
          if (key) {input.value=state.preferences[key];input.dispatchEvent(new Event('input',{bubbles:true}));}
          else input.checked = state.preferences.restTimerEnabled;
          showToast(error.message || 'Instelling niet bewaard. Probeer opnieuw.');
        }
      });
    }
    const form=document.getElementById('training-plan-form');
    if(form)wireAsyncForm(form,async()=>{
      capture();if(!validTraining(ui.draft,'plans')){ui.error='Geef het schema een naam, kies een apparaat en controleer je doelen.';render();return;}
      await persist('plans',ui.draft);go('plan',ui.draft.id);
    },showToast);
    const itemForm=document.getElementById('training-item-form');
    if(itemForm)wireAsyncForm(itemForm,async()=>{
      captureItem();
      if(ui.itemReturn.screen==='planEdit'){
        // A new plan can still have an empty name while its first item is edited.
        const next=updatePlanItem({...ui.draft,name:ui.draft.name||'Schema'},ui.itemDraft);ui.draft.items=next.items;
      }else{
        const latest=(await getAll('plans')).find(plan=>plan.id===ui.itemReturn.id);
        await persist('plans',updatePlanItem(latest,ui.itemDraft));
      }
      closeItem();
    },showToast);
    document.querySelectorAll('.training-set-form').forEach(form=>{
      form.addEventListener('input',event=>{
        if(!['weight','reps'].includes(event.target.name))return;
        (ui.setDrafts[form.dataset.set]??={})[event.target.name]=event.target.value;
      });
      wireAsyncForm(form,async()=>{
        if(busy)return;busy=true;
        try{await changeSet(form.dataset.item,form.dataset.set,parseNumericInput(form.elements.weight.value),parseNumericInput(form.elements.reps.value));}finally{busy=false;}
      },showToast);
    });
    const search=document.getElementById('training-machine-search');
    search?.addEventListener('input',debounce(event=>{
      if(!event.target.isConnected)return;
      ui.pickerSearch=event.target.value;const start=event.target.selectionStart,end=event.target.selectionEnd;render();
      const replacement=document.getElementById('training-machine-search');replacement?.focus({preventScroll:true});replacement?.setSelectionRange(start,end);
    },10));
    document.querySelectorAll('[data-training-brand]').forEach(details=>details.addEventListener('toggle',()=>{
      if(ui.pickerSearch.trim())return;
      ui.pickerExpanded=ui.pickerExpanded.filter(id=>id!==details.dataset.trainingBrand);
      if(details.open)ui.pickerExpanded.push(details.dataset.trainingBrand);
    }));
    document.getElementById('training-item-picker')?.addEventListener('change',event=>{ui.current=Number(event.target.value);render();});
    const updateTimer=()=>{const el=document.querySelector('[data-rest-until]');if(!el){clearInterval(timer);return;}const seconds=Math.max(0,Math.ceil((Date.parse(el.dataset.restUntil)-Date.now())/1000));el.textContent=seconds?`Rust: ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Rust voltooid';if(!seconds)clearInterval(timer);};
    if(document.querySelector('[data-rest-until]')){updateTimer();timer=setInterval(updateTimer,1000);}
  }
  return {handle,wire};
}
