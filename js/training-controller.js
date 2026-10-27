import { state } from './state.js';
import { loadState } from './data.js';
import { getAll, writeChanges } from './database.js';
import { wireAsyncForm } from './ui/forms.js';
import { newPlan, planItem, validTraining, startTraining, replaceTrainingItem, trainingSetChange } from './training-model.js';

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
    form.querySelectorAll('[data-plan-item]').forEach(el=>{
      const item=ui.draft.items.find(i=>i.id===el.dataset.planItem);
      for(const field of ['setCount','repMin','repMax','restSeconds'])item[field]=Number(el.querySelector(`[name="${field}"]`).value);
    });
  };
  const freshest=async()=>{
    const stored=(await getAll('sessions')).find(x=>x.id===state.route.id);
    if(!stored||stored.status!=='active')throw new Error('De training is al afgerond. Open haar opnieuw.');
    return stored;
  };
  async function changeSet(itemId,setId,weight,reps,undo=false) {
    const session=await freshest(), sets=await getAll('sets');
    const machineId=session.items.find(i=>i.id===itemId)?.machineId;
    if(!(await getAll('machines')).some(m=>m.id===machineId))throw new Error('Het apparaat is verwijderd. Kies een vervanger.');
    await writeChanges(trainingSetChange(session,itemId,setId,weight,reps,sets,undo));await loadState();render();
  }
  async function handle(action,target) {
    if(busy)return;
    busy=true;target.disabled=true;ui.error='';
    const id=target.dataset.id;
    try {
      if(action==='training-plans')go('plans');
      if(action==='training-plan')go('plan',id);
      if(action==='training-new'||action==='training-edit'){
        ui.editing=action==='training-edit';ui.draft=ui.editing?structuredClone(state.plans.find(p=>p.id===id)):newPlan();go('planEdit');
      }
      if(action==='training-back'){
        if(state.route.screen==='trainingPicker')go(ui.picker==='add'?'planEdit':'training',ui.previous);
        else if(state.route.screen==='planEdit'&&ui.draft?.items.length){
          state.confirmSheet={title:'Schema sluiten?',message:'Niet bewaarde wijzigingen vervallen.',confirmLabel:'Sluiten',destructive:false,confirm:()=>{state.confirmSheet=null;go('plans');}};render();
        }else go('plans');
      }
      if(['training-add','training-swap'].includes(action)){
        capture();ui.picker=action==='training-add'?'add':id;ui.brand=null;ui.previous=state.route.id;go('trainingPicker');
      }
      if(action==='training-brand'){ui.brand=id;render();}
      if(action==='training-brands'){ui.brand=null;render();}
      if(action==='training-choose'){
        const machine=state.machines.find(m=>m.id===id);if(!machine)throw new Error('Dit apparaat is niet meer beschikbaar.');
        if(ui.picker==='add'){if(ui.draft.items.length>=100)throw new Error('Maximaal 100 apparaten per schema.');ui.draft.items.push(planItem(machine,state.brands));go('planEdit');}
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
        const next=await freshest(),item=next.items.find(i=>i.id===id);
        if(item.sets.length<50){item.sets.push({...item.sets.at(-1),id:'training-set-'+crypto.randomUUID()});item.setCount=item.sets.length;await persist('sessions',next);render();}
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
    const form=document.getElementById('training-plan-form');
    if(form)wireAsyncForm(form,async()=>{
      capture();if(!validTraining(ui.draft,'plans')){ui.error='Geef het schema een naam, kies een apparaat en controleer je doelen.';render();return;}
      await persist('plans',ui.draft);go('plan',ui.draft.id);
    },showToast);
    document.querySelectorAll('.training-set-form').forEach(form=>wireAsyncForm(form,async()=>{
      if(busy)return;busy=true;
      try{await changeSet(form.dataset.item,form.dataset.set,Number(form.elements.weight.value),Number(form.elements.reps.value));}finally{busy=false;}
    },showToast));
    document.getElementById('training-item-picker')?.addEventListener('change',event=>{ui.current=Number(event.target.value);render();});
    const updateTimer=()=>{const el=document.querySelector('[data-rest-until]');if(!el){clearInterval(timer);return;}const seconds=Math.max(0,Math.ceil((Date.parse(el.dataset.restUntil)-Date.now())/1000));el.textContent=seconds?`Rust: ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Rust voltooid';if(!seconds)clearInterval(timer);};
    if(document.querySelector('[data-rest-until]')){updateTimer();timer=setInterval(updateTimer,1000);}
  }
  return {handle,wire};
}
