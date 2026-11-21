'use strict';
const BudgetPlan = (() => {
  const money = cents => (cents / 100).toLocaleString('pl-PL', {style:'currency',currency:'PLN'});
  function totals(entries, month, base) {
    let saved=0, reserved=0, incoming=0;
    for (const entry of entries) {
      if(entry.target===month) incoming+=entry.cents;
      if(entry.source!==month) continue;
      if(entry.kind==='save') saved+=entry.cents;
      else reserved+=entry.cents;
    }
    return {saved,reserved,incoming,available:base+incoming-saved-reserved};
  }
  const element=(tag,label)=>Object.assign(document.createElement(tag),{textContent:label});
  function action(label,run) {
    const button=element('button',label);
    button.type='button';button.onclick=run;return button;
  }
  async function mount(root,data,api) {
    if(!root)return;
    const month=data.year+'-'+String(data.monthNumber).padStart(2,'0');
    const base=Math.round(Number(data.wolneSrodki)*100);
    let state;
    const notice=element('p','');notice.setAttribute('role','status');
    root.append(notice);
    try {state=await api.read();}catch {notice.textContent='Nie udało się odczytać planu miesiąca.';root.append(action('Spróbuj ponownie',()=>{root.replaceChildren();mount(root,data,api);}));return;}
    function render(){
      const t=totals(state.entries,month,base);
      root.replaceChildren(element('h2','Zarządzaj nadwyżką'));
      const dl=document.createElement('dl');
      for(const [label,value] of [['Wolne środki przed decyzjami',base],['Przeniesione z wcześniejszych miesięcy',t.incoming],['Odłożono na oszczędności',t.saved],['Na przyszłe miesiące',t.reserved],['Pozostałe wolne środki',t.available]]){
        const row=element('div','');row.append(element('dt',label),element('dd',money(value)));dl.append(row);
      }
      root.append(dl);
      if(root.isConnected&&!data.isClosedMonth){
        const card=document.querySelector('.main-card-value');if(card)card.textContent=money(t.available);
      }
      if(t.available<0)root.append(Object.assign(element('p','Do pokrycia po zmianach w budżecie: '+money(-t.available)),{className:'plan-warning'}));
      const actions=element('div','');actions.className='plan-actions';
      const form=document.createElement('div');
      function open(kind,old){
        form.replaceChildren();notice.textContent='';
        const input=document.createElement('input');input.inputMode='decimal';input.placeholder='0,00';if(old)input.value=(old.cents/100).toFixed(2).replace('.',',');
        const field=(name,control)=>{const l=element('label',name);l.append(control);form.append(l);};
        field('Kwota w zł',input);
        const dest=document.createElement('input');dest.type='month';
        const next=new Date(Date.UTC(+data.year,+data.monthNumber,1)).toISOString().slice(0,7);
        dest.min=next;dest.value=old?.target||next;
        if(kind==='carry')field('Miesiąc docelowy',dest);
        const link=document.createElement('select');
        if(kind==='save'){
          link.add(new Option('Bez powiązania','')); if(old?.transfer)link.add(new Option('Powiązany przelew',old.transfer,true,true));
          const more=action('Powiąż z przelewem',async()=>{more.disabled=true;
            try{const transfers=await api.transfers();for(const r of transfers){if(![...link.options].some(o=>o.value===r[0]))link.add(new Option(r[1]+' · '+money(Math.round(Number(r[4])*100)),r[0]));}field('Przelew na oszczędności',link);more.remove();}catch{notice.textContent='Nie udało się pobrać przelewów.';more.disabled=false;}});
          form.append(more);
        }
        const preview=element('p','');form.append(preview);
        const amount=()=>/^\d+(?:[,.]\d{1,2})?$/.test(input.value.trim())?Math.round(Number(input.value.trim().replace(',','.'))*100):0;
        const submit=action('Zatwierdź',()=>write(false));submit.className='primary';
        const id=old?.id||crypto.randomUUID();let pending,signature;
        function update(){
          const cents=amount(), available=t.available+(old?.cents||0);
          submit.disabled=cents<=0||(cents>available&&(!old||cents>old.cents))||(kind==='carry'&&(!dest.value||dest.value<=month));
          preview.textContent='Pozostanie w '+month+': '+money(available-cents);
          if(kind==='carry'&&dest.value)preview.textContent+=' · Rezerwa w '+dest.value+': '+money(totals(state.entries,dest.value,0).incoming-(old?.target===dest.value?old.cents:0)+cents);
        }
        async function write(cancelled){
          const req={id,revision:state.revision,source:month,target:kind==='carry'?dest.value:'',kind,cents:cancelled?old.cents:amount(),transfer:link.value,cancelled};
          const key=JSON.stringify(req);if(key!==signature){pending=crypto.randomUUID();signature=key;}
          root.inert=true;notice.textContent='Zapisywanie decyzji…';
          try{state=await api.save({...req,requestId:pending},()=>{
            root.inert=false;notice.textContent='Przyjęto do realizacji. Możesz zamknąć rozliczenie. Kwoty zaktualizują się po potwierdzeniu.';
            render();
          });notice.textContent='Decyzja zapisana.';render();}
          catch(e){notice.textContent=e.message||'Nie udało się potwierdzić zapisu.';if(api.pending()){render();return;}form.append(action('Odczytaj aktualny plan',async()=>{try{state=await api.read();render();}catch{notice.textContent='Nie udało się pobrać planu.';}}));}
          finally{root.inert=false;}
        }
        input.oninput=dest.oninput=update;update();form.append(submit,action('Anuluj',()=>form.replaceChildren()));
        if(old)form.append(action('Cofnij decyzję',()=>{if(confirm('Cofnąć tę decyzję budżetową?'))write(true);}));
        input.focus();
      }
      const pending=api.pending();
      if(pending){
        if(!notice.textContent)notice.textContent='Decyzja oczekuje na potwierdzenie.';
        actions.append(action('Sprawdź poprzedni zapis',async()=>{
          root.inert=true;notice.textContent='Sprawdzanie decyzji…';
          try{state=await api.save(pending);notice.textContent='Zapis potwierdzony.';}
          catch(e){notice.textContent=e.message;state=await api.read().catch(()=>state);}
          finally{root.inert=false;render();}
        }));
      }else if(!data.isClosedMonth){actions.append(action('Odłóż na oszczędności',()=>open('save')),action('Przenieś na inny miesiąc',()=>open('carry')));}
      root.append(actions,form,notice);
      for(const e of state.entries.filter(e=>e.source===month||e.target===month)){
        const row=element('div',(e.kind==='save'?'Oszczędności':e.target===month?'Przeniesione z '+e.source:'Rezerwa na '+e.target)+' · '+money(e.cents));row.className='plan-row';
        if(!pending&&!data.isClosedMonth&&e.source===month)row.append(action('Edytuj',()=>open(e.kind,e)));root.append(row);
      }
    }
    render();
    const pending=api.pending();
    if(pending && api.resume){
      try{const confirmed=await api.resume(pending);if(confirmed){state=confirmed;notice.textContent='Decyzja zapisana.';render();}}
      catch(error){notice.textContent=error.message;render();}
    }
  }
  return {mount,totals};
})();
