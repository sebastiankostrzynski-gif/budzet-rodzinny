(() => {
  'use strict';
  const dateFormat = new Intl.DateTimeFormat('pl-PL', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
  const format = iso => dateFormat.format(new Date(iso+'T00:00:00Z'));
  const valid = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(Date.parse(iso)) && new Date(iso).toISOString().startsWith(iso);
  function gap(first, current) {
    if (first === current) return 'Termin zgodny z pierwotnym';
    const [early, late] = [first,current].sort().map(x=>new Date(x+'T00:00:00Z'));
    let months=(late.getUTCFullYear()-early.getUTCFullYear())*12+late.getUTCMonth()-early.getUTCMonth();
    function shift(n) {
      const d=new Date(early);
      d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n+1);d.setUTCDate(0);
      d.setUTCDate(Math.min(d.getUTCDate(),early.getUTCDate()));return d;
    }
    if (shift(months)>late) months--;
    const days=(late-shift(months))/86400000;
    const span=[months?months+' mies.':'',days?days+(days===1?' dzień':' dni'):''].filter(Boolean).join(' i ');
    return span+(current<first?' wcześniej':' później')+' względem pierwotnego terminu';
  }
  // Each change references the previous accepted change. Concurrent edits cannot overwrite it.
  function history(rows,loan) {
    const accepted=[];
    for (const [id,key,parent,first,current,stamp] of rows) {
      const prior=accepted.at(-1);
      if(key===loan && id && valid(first) && valid(current) && parent===(prior?.id||'START') && (!prior||prior.first===first))
        accepted.push({id,first,current,stamp});
    }
    return accepted;
  }
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
  async function sheet(options) {
    if(!['owner','viewer'].includes(window.budgetViewerRole) || (options && window.budgetViewerRole!=='owner')) throw Error('Brak dostępu do terminów.');
    const file=localStorage.getItem('budget-verified-test-file-v1');
    const session=[sessionStorage,localStorage].map(store=>JSON.parse(store.getItem('budget-google-session-v1')||'null'))
      .find(s=>s?.token && s.expires>Date.now());
    if(!file||!session)throw Error('Zaloguj się ponownie, aby otworzyć terminy.');
    const range=encodeURIComponent("'Terminy kredytów'!A2:F");
    const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(file)+'/values/'+range;
    const res=await fetch(url+(options?':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS':''),{
      method:options?'POST':'GET',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},
      body:options?JSON.stringify({values:[options]}):undefined,cache:'no-store',redirect:'error'});
    if(!res.ok)throw Error('Nie udało się połączyć z arkuszem ('+res.status+').');
    return res.json();
  }
  let rows=[], generation=0;
  const app=document.getElementById('app');
  function dialog(loan,title) {
    const log=history(rows,loan),prior=log.at(-1);
    const box=el('dialog');box.className='loan-modal';
    box.setAttribute('aria-label','Termin ostatniej raty');
    const form=el('form'), heading=el('h2','Termin ostatniej raty'), sub=el('p',title);
    function field(label,value,locked) {
      const l=el('label',label), input=el('input');input.type='date';input.required=true;input.value=value||'';input.readOnly=locked;
      l.append(input);form.append(l);return input;
    }
    form.append(heading,sub);
    const first=field('Pierwotny termin z harmonogramu',prior?.first,!!prior);
    const current=field('Aktualny termin ostatniej raty',prior?.current,false);
    const preview=el('p'),status=el('p'),footer=el('div'),save=el('button','Zapisz termin'),back=el('button','Zamknij');
    save.type='submit';back.type='button';status.setAttribute('role','status');preview.setAttribute('aria-live','polite');
    function update(){preview.textContent=valid(first.value)&&valid(current.value)?gap(first.value,current.value):'';}
    first.oninput=update;first.onchange=()=>{if(!current.value && valid(first.value))current.value=first.value;update();};current.oninput=update;update();
    footer.append(back,save);form.append(preview,status,footer);box.append(form);document.body.append(box);
    back.onclick=()=>box.close();box.onclose=()=>box.remove();
    let operation;
    form.onsubmit=async event=>{
      event.preventDefault();if(save.disabled||!valid(first.value)||!valid(current.value))return;
      if(prior?.current===current.value){box.close();return;}
      save.disabled=true;back.disabled=true;first.disabled=true;current.disabled=true;box.oncancel=e=>e.preventDefault();
      const base=prior?.id||'START';
      if(!operation||operation[3]!==first.value||operation[4]!==current.value)
        operation=[crypto.randomUUID(),loan,base,first.value,current.value,new Date().toISOString()];
      try{
        const latest=(await sheet()).values||[];
        if(!history(latest,loan).some(e=>e.id===operation[0])){
          if((history(latest,loan).at(-1)?.id||'START')!==base)throw Error('Termin zmieniono na innym urządzeniu. Zamknij formularz i sprawdź nową datę.');
          await sheet(operation);
        }
        rows=(await sheet()).values||[];
        if(!history(rows,loan).some(e=>e.id===operation[0]))throw Error('Termin zmieniono równocześnie. Sprawdź aktualną datę.');
        box.close();mount();
      }catch(e){status.textContent=e.message;mount();}finally{save.disabled=false;back.disabled=false;first.disabled=false;current.disabled=false;box.oncancel=null;}
    };
    box.showModal();
  }
  function panel(node,id,title,detail){
    const log=history(rows,id),last=log.at(-1);
    node.replaceChildren(el('small','Termin ostatniej raty'),el('strong',last?format(last.current):'Termin nieuzupełniony'));
    if(last)node.append(el('span','Pierwotnie: '+format(last.first)),el('b',gap(last.first,last.current)));
    if(window.budgetViewerRole==='owner'){
      const edit=el('button',last?'Zmień termin':'Ustaw termin');edit.type='button';edit.onclick=()=>dialog(id,title);node.append(edit);
    }
    if(detail&&last){
      const details=el('details');details.append(el('summary','Historia zmian terminu'));
      const list=el('ul');
      log.forEach((item,i)=>{const from=i?log[i-1].current:item.first;const li=el('li',(item.stamp?new Date(item.stamp).toLocaleDateString('pl-PL')+' · ':'')+(from===item.current?format(from):format(from)+' → '+format(item.current)));list.prepend(li);});
      details.append(list);node.append(details);
    }
  }
  async function mount(){
    const run=++generation,wrap=app.querySelector('.debt-wrap');
    if(!wrap||!window.budgetViewerRole)return;
    const slots=[];
    function add(anchor,id,title,detail){
      let node=anchor.nextElementSibling;
      if(!node?.classList.contains('loan-term')){node=el('section','Pobieranie terminu…');node.className='loan-term';anchor.after(node);}
      slots.push({node,id,title,detail});
    }
    for(const card of wrap.querySelectorAll('.debt-active [data-debt-id]')){
      if(!card.parentElement.classList.contains('loan-pair')){const pair=el('div');pair.className='loan-pair';card.before(pair);pair.append(card);}
      add(card,card.dataset.debtId,card.querySelector('.sav-name')?.textContent,false);
    }
    const hero=wrap.querySelector('.debt-hero'),id=app.dataset.debtView;
    if(hero&&id&&id!=='all')add(hero,id,wrap.querySelector('h1')?.textContent,true);
    if(!slots.length)return;
    try{
      const result=await sheet();if(run!==generation)return;rows=result.values||[];
      slots.forEach(s=>panel(s.node,s.id,s.title,s.detail));
    }catch(e){if(run===generation)slots.forEach(s=>{const retry=el('button','Ponów');retry.onclick=mount;s.node.replaceChildren(el('span',e.message),retry);});}
  }
  if(app){new MutationObserver(mount).observe(app,{childList:true});mount();}
})();
