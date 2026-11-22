'use strict';
const FamilyLoans = (() => {
  const kinds=['Zakup na raty','Kredyt','Pożyczka'];
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date());
  const cash=c=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN',useGrouping:true}).format(c/100);
  const monthKey=d=>d.toISOString().slice(0,7);
  const cents=v=>/^\d{1,9}([,.]\d{1,2})?$/.test(v.trim())?Math.round(Number(v.trim().replace(',','.'))*100):NaN;
  const validDate=v=>typeof v==='string' && /^20\d\d-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().startsWith(v);
  const validId=v=>typeof v==='string' && /^[a-f0-9-]{36}$/i.test(v);
  function histories(rows){
    const loans=new Map();
    for(const [op,id,parent,date,kind,name,capital,interest,count,first] of rows){
      const log=loans.get(id)||[],last=log.at(-1);
      if(!validId(op)||!validId(id)||parent!==(last?.op||'START')||!validDate(date)||!validDate(first)||
         !kinds.includes(kind)||typeof name!=='string'||!name.trim()||name.length>100||
         ![capital,interest].every(n=>Number.isSafeInteger(n)&&n>=0)||!Number.isInteger(count)||count<1||count>600||
         (last && date<last.date))continue;
      log.push({op,id,date,kind,name,capital,interest,count,first});loans.set(id,log);
    }
    return loans;
  }
  function project(base,rows){
    if(!base||!rows.length)return base;
    const logs=histories(rows),periods=base.periods.slice(),latest=periods.at(-1);
    if(!latest)return base;
    const current=today().slice(0,7);
    if([...logs.values()].some(log=>log[0].date.slice(0,7)<=current)&&latest.key<current){
      const d=new Date(latest.key+'-01T12:00:00Z');
      while(monthKey(d)<current){
        d.setUTCMonth(d.getUTCMonth()+1);
        periods.push({...latest,key:monthKey(d),year:d.getUTCFullYear(),month:d.getUTCMonth()+1,inProgress:monthKey(d)===current});
      }
    }
    return {...base,periods:periods.map(p=>{
      let principal=0,interest=0;
      const items=p.items.slice();
      for(const log of logs.values()){
        const entry=log.filter(e=>e.date.slice(0,7)<=p.key).at(-1);
        if(!entry)continue;
        principal+=entry.capital;interest+=entry.interest;
        items.push({id:'family-'+entry.id,name:entry.name,subtitle:entry.kind,asOf:entry.date.slice(0,7),
          principal:entry.capital/100,interest:entry.interest/100,total:(entry.capital+entry.interest)/100,registration:entry});
      }
      return {...p,items,principal:(Math.round(p.principal*100)+principal)/100,interest:(Math.round(p.interest*100)+interest)/100,total:(Math.round(p.total*100)+principal+interest)/100};
    })};
  }
  let rows=[],sequence=0,warning='';
  function display(){
    if(typeof debtBase_!=='undefined' && debtBase_)debtAdopt_(debtBase_);
    if(typeof activeView_!=='undefined' && activeView_==='debts'){
      document.getElementById('app').dataset.balanceSignature='';renderDebts_();applyAmountPrivacy_();
    }
  }
  const cache='family-loans-register-test-v1';
  function restore(){
    if(!rows.length)try{const saved=JSON.parse(localStorage.getItem(cache));if(Array.isArray(saved))rows=saved;}catch{}
  }
  async function refresh(){
    const generation=++sequence;
    try{
      const fresh=await window.familyLoanApi.read();
      if(generation!==sequence)return;
      const changed=JSON.stringify(fresh)!==JSON.stringify(rows)||!!warning;
      rows=fresh;warning='';
      try{localStorage.setItem(cache,JSON.stringify(rows));}catch{}
      if(changed)display();
    }catch{
      if(generation===sequence && !warning){warning='Nie udało się odświeżyć dodatkowych zobowiązań.';display();}
    }
  }
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='back-button';b.textContent=label;b.onclick=fn;return b;};
  function open(old){
    if(window.budgetViewerRole!=='owner'||document.querySelector('dialog.family-loan'))return;
    const box=document.createElement('dialog'),form=document.createElement('form');
    box.className='loan-modal family-loan';box.setAttribute('aria-label',old?'Aktualizuj saldo':'Dodaj zobowiązanie');
    const title=document.createElement('h2');title.textContent=old?'Aktualizuj saldo':'Dodaj zobowiązanie';form.append(title);
    function field(text,type,value){
      const label=document.createElement('label'),c=document.createElement(type==='select'?'select':'input');label.textContent=text;
      if(type==='select')kinds.forEach(k=>c.add(new Option(k,k)));else c.type=type;
      c.value=value;c.required=true;label.append(c);form.append(label);return c;
    }
    const kind=field('Rodzaj','select',old?.kind||kinds[0]),name=field('Nazwa zobowiązania','text',old?.name||'');
    name.maxLength=100;name.placeholder='np. Telefon na raty';
    const date=field(old?'Data aktualizacji':'Data rozpoczęcia','date',today());date.max=today();
    if(old)date.min=old.date;
    const principal=field(old?'Pozostały kapitał (zł)':'Finansowana kwota (zł)','text',old?(old.capital/100).toFixed(2):'');
    const interest=field('Pozostałe odsetki według umowy (zł)','text',old?(old.interest/100).toFixed(2):'0');
    principal.inputMode=interest.inputMode='decimal';
    const count=field('Liczba rat w umowie','number',old?.count||'');count.min=1;count.max=600;count.step=1;
    const first=field('Termin pierwszej raty','date',old?.first||'');
    for(const c of [kind,name,count,first])c.disabled=!!old;
    const preview=document.createElement('p'),msg=document.createElement('p'),actions=document.createElement('div');
    msg.setAttribute('role','status');
    const save=button('Zapisz',()=>{}),close=button('Anuluj',()=>box.close());save.type='submit';actions.append(close,save);form.append(preview,msg,actions);
    function update(){const total=cents(principal.value)+cents(interest.value);
      preview.textContent=Number.isSafeInteger(total)?'Do spłaty: '+cash(total)+(!old&&Number(count.value)>0?' · średnia rata: '+cash(Math.round(total/Number(count.value))):''):'';}
    form.oninput=update;update();box.append(form);document.body.append(box);box.onclose=()=>box.remove();box.showModal();
    const operation=crypto.randomUUID();
    let sent;
    form.onsubmit=async event=>{
      event.preventDefault();if(save.disabled)return;
      const cap=cents(principal.value),cost=cents(interest.value);
      if(!name.value.trim()||![cap,cost].every(Number.isSafeInteger)||(!old&&!cap)||(!old&&first.value<date.value)){
        msg.textContent='Sprawdź nazwę, kwoty i datę pierwszej raty.';return;
      }
      const terms=[old?.op||'START',date.value,kind.value,name.value.trim(),cap,cost,Number(count.value),first.value];
      const receiptKey='family-loan-unconfirmed-v1';
      let previous;try{previous=JSON.parse(sessionStorage.getItem(receiptKey));}catch{}
      const retry=previous && JSON.stringify(previous.slice(2))===JSON.stringify(terms) && (!old||previous[1]===old.id);
      const op=retry?previous[0]:operation,id=old?.id||op;
      const row=[op,id,...terms];
      if(sent && JSON.stringify(sent)!==JSON.stringify(row)){msg.textContent='Sprawdź wynik poprzedniego zapisu przed zmianą danych.';return;}
      save.disabled=close.disabled=true;box.oncancel=e=>e.preventDefault();msg.textContent='Zapisywanie…';
      try{
        let latest=await window.familyLoanApi.read();
        if(!latest.some(r=>r[0]===op)){
          if((histories(latest).get(id)?.at(-1)?.op||'START')!==row[2])throw Error('Saldo zmieniono na innym urządzeniu. Otwórz formularz ponownie.');
          sent=row;sessionStorage.setItem(receiptKey,JSON.stringify(row));await window.familyLoanApi.append(row);latest=await window.familyLoanApi.read();
        }
        if(!histories(latest).get(id)?.some(e=>e.op===op))throw Error('Sprawdź wynik zapisu w zakładce Kredyty.');
        ++sequence;rows=latest;warning='';try{localStorage.setItem(cache,JSON.stringify(rows));}catch{}
        if(sessionStorage.getItem(receiptKey)===JSON.stringify(row))sessionStorage.removeItem(receiptKey);
        box.close();display();if(debtData_)debtSelect_(row[3].slice(0,7));
      }catch(e){msg.textContent=e.message||'Nie udało się potwierdzić zapisu.';save.disabled=close.disabled=false;box.oncancel=null;}
    };
  }
  function mount(item){
    const slot=document.getElementById('family-loan-actions');if(!slot)return;
    if(warning)slot.append(button(warning+' Ponów',refresh));
    if(item?.registration){
      const e=item.registration,p=document.createElement('p');p.textContent=e.kind+' · '+e.count+' rat · pierwsza rata '+new Date(e.first+'T12:00:00Z').toLocaleDateString('pl-PL');slot.append(p);
      if(window.budgetViewerRole==='owner' && e.op===histories(rows).get(e.id)?.at(-1)?.op)slot.append(button('Aktualizuj saldo',()=>open(e)));
    }else if(!debtId_ && window.budgetViewerRole==='owner')slot.append(button('+ Dodaj zobowiązanie',()=>open(null)));
  }
  return {project,restore,refresh,mount,histories,apply:base=>project(base,rows)};
})();
