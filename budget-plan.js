'use strict';
const BudgetPlan = (() => {
  const money = cents => (cents / 100).toLocaleString('pl-PL', {style:'currency',currency:'PLN',useGrouping:true});
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
  // Cache only confirmed monthly adjustments. Dashboard amounts can refresh independently.
  const cacheKey='budget-2026-test-confirmed-plan-offsets-v1';
  let confirmed;
  function cachedOffsets(){
    if(confirmed)return confirmed;
    try{
      const value=JSON.parse(localStorage.getItem(cacheKey));
      if(value && Number.isSafeInteger(value.revision) && value.offsets &&
        Object.values(value.offsets).every(Number.isSafeInteger))confirmed=value;
    }catch{ /* Storage can be unavailable in private browsing. */ }
    return confirmed;
  }
  function available(data){
    const plan=cachedOffsets();
    if(!plan)return null;
    const month=data.year+'-'+String(data.monthNumber).padStart(2,'0');
    return (((window.budgetViewerRole==='owner'?window.expensePreview?.base(data):null)??Math.round(Number(data.wolneSrodki)*100))+(plan.offsets[month]||0))/100;
  }
  function remember(state){
    if(!Number.isSafeInteger(state?.revision)||!Array.isArray(state.entries))return;
    const previous=cachedOffsets();
    if(previous && (previous.revision>state.revision || (previous.revision===state.revision && previous.savings)))return;
    const offsets={}, savings={};
    for(const e of state.entries){
      if(!Number.isSafeInteger(e.cents))return;
      offsets[e.source]=(offsets[e.source]||0)-e.cents;
      if(e.kind==='save' && !e.cancelled && !e.transfer)savings[e.source]=(savings[e.source]||0)+e.cents;
      if(e.target)offsets[e.target]=(offsets[e.target]||0)+e.cents;
    }
    confirmed={revision:state.revision,offsets,savings};
    try{localStorage.setItem(cacheKey,JSON.stringify(confirmed));}catch{}
    document.dispatchEvent(new Event('budget-plan-balance'));
  }
  let updateActiveCard;
  const element=(tag,label)=>Object.assign(document.createElement(tag),{textContent:label});
  function action(label,run) {
    const button=element('button',label);
    button.type='button';button.onclick=run;return button;
  }
  async function mount(root,data,api) {
    if(!root)return;
    const month=data.year+'-'+String(data.monthNumber).padStart(2,'0');
    const base=Math.round(Number(data.wolneSrodki)*100);
    const canEdit=window.budgetViewerRole==='owner';
    if(canEdit || window.budgetViewerRole==='viewer'){
      if(updateActiveCard)document.removeEventListener('budget-plan-balance',updateActiveCard);
      updateActiveCard=()=>{
        if(!root.isConnected || data.isClosedMonth)return;
        const card=root.closest('.monthly-settlement')?.querySelector('.main-card');
        if(!card)return;
        const value=available(data);
        const amount=card.querySelector('.main-card-value');
        amount.textContent=value===null?'…':money(Math.round(value*100));
        card.classList.toggle('main-card-negative',value!==null && value<0);
        const status=card.querySelector('.main-card-status');
        if(status)status.lastChild.textContent=canEdit && window.expensePreview?.base(data)!=null?'Po przypisaniu · podgląd':value===null?'Obliczanie…':value<0?'Saldo ujemne':value>0?'Dostępne':'Brak wolnych środków';
      };
      document.addEventListener('budget-plan-balance',updateActiveCard);
      updateActiveCard();
    }
    let state;
    const notice=element('p','');notice.setAttribute('role','status');
    root.append(notice);
    try {state=await api.read();}catch {notice.textContent='Nie udało się odczytać planu miesiąca.';root.append(action('Spróbuj ponownie',()=>{root.replaceChildren();mount(root,data,api);}));return;}
    function render(){
      if(!root.isConnected)return;
      remember(state);
      const t=totals(state.entries,month,base);
      const grid=root.closest('.monthly-settlement')?.querySelector('.disposition-grid');
      if(grid){
        const total=grid.parentElement.querySelector('.disposition-total-value[data-base-cents]');
        if(total){
          const cents=Number(total.dataset.baseCents)+t.saved;
          total.textContent=money(cents);
          total.style.color=cents<0?'#e74c3c':cents>0?'#39aa6b':'#777';
        }
        const recorded=Math.round((Number(data.financialFlows?.savings)||0)*100);
        const recordedTile=recorded>0 && grid.querySelector('.disposition-item:not([data-saved-plan]) [data-art="cash"]')?.parentElement;
        if(recordedTile)recordedTile.querySelector('.disposition-item-value').textContent='+'+money(recorded+t.saved);
        let tile=grid.querySelector('[data-saved-plan]');
        if(t.saved>0&&!recordedTile){
          if(!tile){
            tile=element('div','');tile.className='disposition-item positive';tile.dataset.savedPlan='';
            const icon=element('span','');icon.className='glass-mini';icon.dataset.art='cash';icon.setAttribute('aria-hidden','true');
            const label=element('div','Odłożono na oszczędności');label.className='disposition-item-label';
            const value=element('div','');value.className='disposition-item-value';
            tile.append(icon,label,value);grid.append(tile);
          }
          tile.querySelector('.disposition-item-value').textContent='+'+money(t.saved);
        }else if(tile){tile.remove();}
      }
      root.replaceChildren(element('h2',canEdit?'Zarządzaj nadwyżką':'Podsumowanie rezerwacji'));
      const dl=document.createElement('dl');
      for(const [label,value] of [['Wolne środki przed decyzjami',base],['Przeniesione z wcześniejszych miesięcy',t.incoming],['Odłożono na oszczędności',t.saved],['Na przyszłe miesiące',t.reserved],['Pozostałe wolne środki',t.available]]){
        const row=element('div','');row.append(element('dt',label),element('dd',money(value)));dl.append(row);
      }
      root.append(dl);
      if(!canEdit)return;
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
    if(!canEdit)return;
    const pending=api.pending();
    if(canEdit && pending && api.resume){
      try{const confirmed=await api.resume(pending);if(confirmed){state=confirmed;notice.textContent='Decyzja zapisana.';render();}}
      catch(error){notice.textContent=error.message;render();}
    }
  }
  function reservedSavings(month){
    const byMonth=cachedOffsets()?.savings || {};
    return Object.entries(byMonth).reduce((sum,[source,cents])=>source<=month?sum+cents:sum,0)/100;
  }
  return {mount,totals,available,remember,reservedSavings};
})();
