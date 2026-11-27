(() => {
  'use strict';
  const endpoint = 'https://script.googleapis.com/v1/scripts/AKfycbxJ3Y1YJVX-PdJ0Nn68KuHCBFmX0t2Nl8xbubKF4WflS-7uXlilJKxCDpHsc5jL9RGsTA:run';
  const clientId = '346154367588-kd2si4cjh6hgelh9jhujbiph73e67l5m.apps.googleusercontent.com';
  const testFileId = '1ZgQJZ6_7BzwhBtRZMAP5UdVuPi0ynDYPmkDZNU3PWMo';
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});
  const gate = document.getElementById('budget-login');
  const status = gate.querySelector('[role=status]');
  const button = gate.querySelector('button');
  let token = '', expires = 0, started = false, client;
  const verifiedKey = 'budget-verified-test-file-v1';
  const cacheKey = 'budget-fresh-cache-test-v1';
  const sessionKey = 'budget-google-session-v1';
  function clearSession() {
    for (const storage of [sessionStorage, localStorage]) {
      try { storage.removeItem(sessionKey); } catch (_) {}
    }
  }
  function rememberSession() {
    const saved=JSON.stringify({token, expires});
    // Keep the short-lived Google token across iOS PWA restarts. It is never
    // sent to GitHub Pages and is discarded as soon as it expires.
    for (const storage of [sessionStorage, localStorage]) {
      try { storage.setItem(sessionKey, saved); } catch (_) {}
    }
  }
  function restoreSession() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const saved=JSON.parse(storage.getItem(sessionKey)||'null');
        if(saved && typeof saved.token==='string' && saved.token && Number(saved.expires)>Date.now()+30000) {
          token=saved.token; expires=Number(saved.expires);
          rememberSession(); // Move a prior sessionStorage-only session to the new short-lived store.
          return true;
        }
      } catch (_) {}
    }
    clearSession(); return false;
  }
  const remembered = () => { try { return localStorage.getItem(verifiedKey) === testFileId; } catch (_) { return false; } };
  function script(src) {
    return new Promise((resolve,reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = () => reject(Error('Nie udało się pobrać logowania Google.')); document.head.append(el);
    });
  }
  function lock(message) {
    document.documentElement.classList.add('budget-locked');
    gate.hidden = false; status.textContent = message; button.disabled = !client;
  }

  // Opt-in, owner-only, local diagnostics. Never record arguments, URLs or responses.
  const diagnosticOps = new Set(['getViewerRole','getBudgetData','getBudgetDataFresh','getCategoryDetails','getCategoryDetailsBundle','getBudgetEntries','getRefreshState','getSavingsData','getDebtsData','getAccountBalances','saveInstallmentSplit','sheets-read','sheets-write','form-read','form-write']);
  const diagnosticKey = 'budget-performance-v1';
  let diagnosticEnabled = false, diagnosticRows = [], diagnosticTrial = 0, diagnosticPanel;
  let diagnosticNetwork = 'unknown', diagnosticCache = 'unknown', diagnosticPhase = 'before';
  try { const d=JSON.parse(localStorage.getItem(diagnosticKey)||'null');
    if(d){diagnosticEnabled=d.enabled===true;diagnosticRows=Array.isArray(d.rows)?d.rows.slice(-300):[];diagnosticTrial=Number(d.trial)||0;
      diagnosticNetwork=['wifi','cellular','cloud','unknown'].includes(d.network)?d.network:'unknown';
      diagnosticCache=['cold','warm','unknown'].includes(d.cache)?d.cache:'unknown'; diagnosticPhase=d.phase==='after'?'after':'before';}
  } catch(_){}
  function diagnosticStore(){try{localStorage.setItem(diagnosticKey,JSON.stringify({enabled:diagnosticEnabled,rows:diagnosticRows,trial:diagnosticTrial,network:diagnosticNetwork,cache:diagnosticCache,phase:diagnosticPhase}));}catch(_){} }
  function diagnosticRecord(kind,operation,ms,ok,bytes){
    if(!diagnosticEnabled||window.budgetViewerRole!=='owner')return;
    diagnosticRows.push({build:'perf-20261119-v119',trial:diagnosticTrial,phase:diagnosticPhase,network:diagnosticNetwork,cache:diagnosticCache,
      kind,operation,ms:Math.max(0,Math.round(ms)),ok:!!ok,bytes:null,
      atMs:Math.round(performance.now()),mode:matchMedia('(display-mode: standalone)').matches?'pwa':'browser'});
    if(diagnosticRows.length>300)diagnosticRows.shift(); diagnosticStore();
    const count=diagnosticPanel?.querySelector('[data-count]');if(count)count.textContent='Zdarzenia: '+diagnosticRows.length;
  }
  async function diagnosticMeasure(operation,task){
    if(!diagnosticEnabled||window.budgetViewerRole!=='owner')return task();
    const name=diagnosticOps.has(operation)?operation:'other',start=performance.now();
    try{const result=await task(); diagnosticRecord('request',name,performance.now()-start,true,0);return result;}
    catch(e){diagnosticRecord('request',name,performance.now()-start,false,0);throw e;}
  }
  window.budgetDiagnosticMark=(stage)=>{
    if(!['budget-current','category-current','category-cache','queue-current','write-confirmed','view-rendered'].includes(stage))return;
    diagnosticRecord('milestone',stage,performance.now()-diagnosticActionStart,true,0);
  };
  let diagnosticActionStart=0;
  function mountDiagnostics(){
    if(window.budgetViewerRole!=='owner'||diagnosticPanel)return;
    diagnosticPanel=document.createElement('details');diagnosticPanel.id='budget-diagnostics';
    diagnosticPanel.style.cssText='margin:24px 20px 120px;padding:12px;font:14px system-ui;color:#315849';
    diagnosticPanel.innerHTML=`<summary>Pomiary szybkości · tylko właściciel</summary><p>Pomiar lokalny, bez kwot i danych transakcji. Zdarzenia „request” mierzą komunikację, a nie trwałość zapisu. „write-confirmed” pojawia się dopiero po potwierdzeniu operacji. Eksportujesz raport samodzielnie.</p>
      <label><input type="checkbox" data-enable> Włącz pomiar</label>
      <p><label>Połączenie <select data-network><option value="unknown">Nieokreślone</option><option value="wifi">Wi-Fi</option><option value="cellular">LTE / 5G</option><option value="cloud">Przeglądarka chmurowa</option></select></label></p>
      <p><label>Pamięć <select data-cache><option value="unknown">Nieokreślona</option><option value="cold">Zimny start</option><option value="warm">Dane w pamięci</option></select></label></p>
      <p><label>Seria <select data-phase><option value="before">Przed</option><option value="after">Po</option></select></label></p>
      <button type="button" data-trial>Nowa próba</button> <button type="button" data-export>Eksportuj pomiary</button> <button type="button" data-clear>Wyczyść pomiary</button><p data-count></p><p>Po „Nowa próba” wykonaj jedną czynność. Dla startu zamknij i otwórz PWA. Powtórz pięć razy na każdej sieci. Nie twórz fikcyjnych płatności. Etapy bez znacznika pozostają niezmierzone. Wersja perf-20261119-v119.</p>`;
    diagnosticPanel.hidden=!new URLSearchParams(location.search).has('diagnostyka');
    document.body.append(diagnosticPanel);
    const q=x=>diagnosticPanel.querySelector(x);
    q('[data-enable]').checked=diagnosticEnabled;q('[data-network]').value=diagnosticNetwork;q('[data-cache]').value=diagnosticCache;q('[data-phase]').value=diagnosticPhase;
    q('[data-enable]').onchange=e=>{diagnosticEnabled=e.target.checked;diagnosticStore();};
    for(const field of ['network','cache','phase'])q('[data-'+field+']').onchange=e=>{if(field==='network')diagnosticNetwork=e.target.value;if(field==='cache')diagnosticCache=e.target.value;if(field==='phase')diagnosticPhase=e.target.value;diagnosticStore();};
    q('[data-trial]').onclick=()=>{diagnosticTrial++;diagnosticActionStart=performance.now();diagnosticStore();q('[data-count]').textContent='Próba '+diagnosticTrial;diagnosticPanel.open=false;};
    q('[data-clear]').onclick=()=>{diagnosticRows=[];diagnosticStore();q('[data-count]').textContent='Wyczyszczono';};
    q('[data-export]').onclick=()=>{if(window.budgetViewerRole!=='owner')return;const blob=new Blob([JSON.stringify({schema:1,units:'ms',note:'bytes not measured; no network auto-detection; milestones absent = unmeasured',rows:diagnosticRows},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='budzet-pomiary.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
    document.addEventListener('click',e=>{if(!diagnosticEnabled||diagnosticPanel.contains(e.target)||!e.target.closest('button,summary,select'))return;
      diagnosticActionStart=performance.now();const clickedAt=diagnosticActionStart;diagnosticRecord('interaction','click',0,true,0);
      requestAnimationFrame(()=>diagnosticRecord('interaction','next-frame',performance.now()-clickedAt,true,0));},true);
    diagnosticRecord('lifecycle','owner-ready',performance.now(),true,0);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){diagnosticActionStart=performance.now();diagnosticRecord('lifecycle','resume',0,true,0);}});
  }

  // Share only concurrent reads; never cache results or coalesce writes.
  const readFlights = new Map();
  const readMethods = new Set(['getBudgetData','getBudgetDataFresh','getCategoryDetails',
    'getCategoryDetailsBundle','getBudgetEntries','getRefreshState','getSavingsData',
    'getDebtsData','getAccountBalances']);
  const performanceSamples = [];
  window.budgetPerformance = () => performanceSamples.map(sample => ({...sample}));
  function invalidateReadFlights() { readFlights.clear(); }
  window.addEventListener('budget-assignment-saved', invalidateReadFlights);
  function shareRead(key, task) {
    if (readFlights.has(key)) return readFlights.get(key);
    const started = performance.now();
    const promise = Promise.resolve().then(task);
    readFlights.set(key, promise);
    const finish = ok => {
      if (readFlights.get(key) === promise) readFlights.delete(key);
      performanceSamples.push({operation:key.split('|')[0], milliseconds:Math.round(performance.now()-started), ok});
      if (performanceSamples.length > 100) performanceSamples.shift();
    };
    promise.then(() => finish(true), () => finish(false));
    return promise;
  }
  function rpc(method,args) {
    if (!readMethods.has(method)) { invalidateReadFlights(); return rpcRequest(method,args); }
    return shareRead(method+'|'+token+'|'+JSON.stringify(args), () => rpcRequest(method,args));
  }
  function rpcRequest(method,args) { return diagnosticMeasure(method,()=>rpcRequestRaw(method,args)); }
  async function rpcRequestRaw(method,args) {
    if (!token || Date.now() >= expires) {
      lock('Zaloguj się, aby odświeżyć prywatny budżet.');
      throw Error('Sesja wygasła.');
    }
    const res = await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({function:method,parameters:args})});
    if(res.status===401){token='';clearSession();lock('Sesja wygasła. Zaloguj się ponownie.');}
    const data=await res.json();
    if(!res.ok || data.error) throw Error(data.error?.details?.[0]?.errorMessage || data.error?.message || 'Błąd połączenia z budżetem.');
    if(!data.done || !data.response) throw Error('Google nie potwierdził wykonania operacji.');
    return data.response.result;
  }
  const scheduleRange = encodeURIComponent("'Harmonogramy nadpłat TEST'!A2:E");
  let scheduleVersion = 0;
  let loadedSchedules = [];
  const recentSchedules = new Map();

  function scheduleCents(value) {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
    const cents = Number(value);
    return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
  }

  function applySchedules(snapshot, rows) {
    const schedules = new Map();
    for (const row of rows) {
      if (scheduleCents(row[2]) !== null) schedules.set(row[0], row);
    }
    // Reconcile successive months against interest actually paid. A newer
    // independent bank balance takes precedence when the roll-forward differs.
    const history = new Map();
    const result = new Map();
    for (const period of [...snapshot.periods].sort((a,b) => a.key.localeCompare(b.key))) {
      const mortgage = period.items.find(item => item.id === 'hipoteka');
      if (!mortgage) continue;
      const original = mortgage.scheduleBaseCents ?? Math.round(mortgage.interest * 100);
      const payments = (snapshot.installments || []).filter(p =>
        p.key === period.key && p.split?.[2] === 'hipoteka');
      const charged = payments.map(p => scheduleCents(p.split[4]));
      const comparisons = payments.filter(p => p.bank.startsWith('mBank · nadpłata '))
        .map(p => schedules.get(p.key + '|' + p.bank))
        .filter(row => row && [row[1],row[2],row[3]].every(v => scheduleCents(v) !== null));
      const savings = comparisons.reduce((sum,row) =>
        sum + scheduleSaving(Number(row[1]),Number(row[2]),Number(row[3])), 0);
      const [year,month] = period.key.split('-').map(Number);
      const previous = history.get(new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7));
      const paid = charged.reduce((sum,cents) => sum + cents,0);
      let after = original;
      if (previous && charged.every(cents => cents !== null) &&
          (original === previous.original - paid || original === previous.after - paid)) {
        after = previous.after - paid - savings;
      } else if (comparisons.length === 1 && original === Number(comparisons[0][1]) - Number(comparisons[0][3])) {
        after = Number(comparisons[0][2]);
      }
      if (!Number.isSafeInteger(after) || after < 0) after = original;
      history.set(period.key,{original,after});
      if (after === Math.round(mortgage.interest * 100)) continue;
      const delta = after - Math.round(mortgage.interest * 100);
      const adjust = amount => (Math.round(amount * 100) + delta) / 100;
      const items = period.items.map(i => i === mortgage ? {...i, scheduleBaseCents:original,
        interest:after / 100, total:adjust(i.total)} : i);
      result.set(period.key,{...period, items, interest:adjust(period.interest), total:adjust(period.total)});
    }
    return {...snapshot, periods:snapshot.periods.map(p => result.get(p.key) || p)};
  }

  const familyLoanRange=encodeURIComponent("'Zobowiązania dodatkowe'!A2:J");
  window.familyLoanApi={
    async read(){
      if(!['owner','viewer'].includes(window.budgetViewerRole) || !token || Date.now()>=expires)
        throw Error('Zaloguj się ponownie do budżetu.');
      const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+testFileId+'/values/'+familyLoanRange+'?valueRenderOption=UNFORMATTED_VALUE',
        {headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error'});
      if(!response.ok)throw Error('Nie udało się pobrać zobowiązań.');
      return (await response.json()).values||[];
    },
    async append(row){
      const result=await queueSheets(familyLoanRange+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
        {method:'POST',body:JSON.stringify({values:[row]})});
      if(result.updates?.updatedRows!==1)throw Error('Brak potwierdzenia zapisu.');
    }
  };
  window.budgetRpc = async (method, args) => {
    if (!['getDebtsData','saveInstallmentSplit'].includes(method) || window.budgetViewerRole !== 'owner')
      return rpc(method,args);
    const version = scheduleVersion;
    if (method === 'saveInstallmentSplit') return applySchedules(await rpc(method,args), loadedSchedules);
    const [snapshot, scheduleData] = await Promise.all([rpc(method,args),
      queueSheets(scheduleRange+'?valueRenderOption=UNFORMATTED_VALUE')]);
    const rows = scheduleData.values || [];
    const concurrent = [...recentSchedules.values()].filter(entry => entry.version > version);
    loadedSchedules = rows.concat(concurrent.map(entry => entry.row));
    return applySchedules(snapshot, loadedSchedules);
  };
  const portfolioTab = 'Lokaty - środki własne';
  const portfolioMonths = 'styczeń luty marzec kwiecień maj czerwiec lipiec sierpień wrzesień październik listopad grudzień'.split(' ');
  async function portfolioRequest(path, options = {}) {
    if (window.budgetViewerRole !== 'owner' || !token || Date.now() >= expires)
      throw Error('Zaloguj się ponownie jako właściciel budżetu.');
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+testFileId+path, {
      ...options,cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}
    });
    if (!response.ok) throw Error('Nie udało się połączyć z arkuszem ('+response.status+').');
    return response.json();
  }

  const travelSheet = 'T13 Urlop, hobby i rozrywka';
  const tripSheetId = 1660121585;
  async function travelBlocks() {
    const range = encodeURIComponent("'" + travelSheet + "'!A20:N86");
    const result = await portfolioRequest('/values/' + range + '?valueRenderOption=UNFORMATTED_VALUE');
    const blocks = [];
    for (const [index, cells] of result.values.entries()) {
      const match = /^(\d+)\)\s+(.+)$/.exec(String(cells[0] || '').trim());
      if (match) blocks.push({row:20+index, number:match[1], name:match[2], cells:[]});
      else if (blocks.length && /^-/.test(String(cells[0]))) blocks[blocks.length-1].cells.push(cells);
    }
    return blocks;
  }
  function tripCreator() {
    const btn=document.createElement('button');
    btn.type='button';btn.textContent='+ Dodaj wyjazd';
    btn.onclick=async()=>{
      const name=window.prompt('Nazwa nowego wyjazdu')?.trim().replace(/\s+/g,' ');
      if(!name)return;
      if(name.length>70 || /^xxx$/i.test(name)){window.alert('Wpisz nazwę wyjazdu (do 70 znaków).');return;}
      btn.disabled=true;
      try {
        const blocks=await travelBlocks();
        if(blocks.some(b=>b.name.localeCompare(name,'pl',{sensitivity:'base'})===0))throw Error('Ten wyjazd już istnieje.');
        const slot=blocks.find(b=>b.name==='XXX' && b.cells.length && b.cells.every(c=>c[0].trim()==='-' && c.slice(1,13).every(v=>v==null||v==='')));
        if(!slot)throw Error('W arkuszu nie ma już wolnej sekcji wyjazdu.');
        const start={sheetId:tripSheetId,rowIndex:slot.row-1,columnIndex:0};
        const rows=[slot.number+') '+name,'- '+name].map(stringValue=>({values:[{userEnteredValue:{stringValue}}]}));
        await portfolioRequest(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[
          {addNamedRange:{namedRange:{name:'BudzetWyjazdSekcja_'+slot.row,range:{sheetId:tripSheetId,startRowIndex:slot.row-1,endRowIndex:slot.row,startColumnIndex:0,endColumnIndex:1}}}},
          {updateCells:{start,rows,fields:'userEnteredValue'}}
        ]})});
        window.alert('Dodano wyjazd „'+name+'”. W Przypisz odśwież listę po najbliższej synchronizacji.');
      } catch(e){window.alert(e.message);}
      finally{btn.disabled=false;}
    };
    return btn;
  }
  document.addEventListener('toggle',event=>{
    const panel=event.target;
    if(panel.matches?.('details.annual-trips') && panel.open && window.budgetViewerRole==='owner' && !panel.querySelector('[data-add-trip]')){
      const btn=tripCreator();btn.dataset.addTrip='1';panel.append(btn);
    }
  },true);

  function portfolioQuote(sheet, period) {
    const rows = sheet.data[0].rowData.map(r => r.values || []);
    const labels = rows[0].map(c => String(c.formattedValue || '').trim().toLocaleLowerCase('pl-PL'));
    const [year,month] = period.split('-');
    const label = portfolioMonths[Number(month)-1]+' '+year;
    const columns = labels.map((s,i) => s.split(/[\n(]/)[0].trim() === label ? i : -1).filter(i => i >= 0);
    const names = rows[1].findIndex(c => c.formattedValue === 'Cena zakupu akcji i ETF');
    if (columns.length !== 1 || names < 0 || rows[2][names]?.formattedValue !== 'Wycena')
      throw Error('Brak pozycji wyceny dla tego miesiąca.');
    const col = columns[0];
    let letters = '', number = col+1;
    while (number) { number--; letters = String.fromCharCode(65+number%26)+letters; number=Math.floor(number/26); }
    const formula = rows[2][col]?.userEnteredValue?.formulaValue || '';
    const match = /^=\(\s*(.+?)\s*(-\s*([A-Z]+)66\s*\)\s*\*\s*(\d+(?:[.,]\d+)?)%)$/.exec(formula);
    const split = match && /^\((\d+)\s*\+\s*(\d+(?:\s*\+\s*\d+)*)\)\s*\/\s*100$/.exec(match[1]);
    const legacy = match && /^(\d+(?:[.,]\d+)?)(\/100)?$/.exec(match[1]);
    if (!match || match[3] !== letters || (!legacy && !split))
      throw Error('Ta pozycja ma inny sposób obliczania wyceny.');
    const etfValues = split ? split[2].split('+').map(Number) : [];
    const stocks = split ? Number(split[1]) : null, etfs = split ? etfValues.reduce((a,b)=>a+b,0) : null;
    const price = split ? stocks + etfs : Math.round(Number(legacy[1].replace(',','.'))*(legacy[2] ? 1 : 100));
    return {formula,col,sheetId:sheet.properties.sheetId,stocks,etfs,etfValues,price,suffix:match[2],rate:Number(match[4].replace(',','.'))/100};
  }
  async function readPortfolio(period) {
    const params = new URLSearchParams({ranges:"'"+portfolioTab+"'!65:67",fields:'sheets(properties(sheetId),data(rowData(values(formattedValue,userEnteredValue))))'});
    return portfolioQuote((await portfolioRequest('?'+params)).sheets[0],period);
  }
  function portfolioCents(input) {
    const value = input.trim().replace(/[ \u00a0\u202f]/g,'');
    return /^\d{1,10}([,.]\d{1,2})?$/.test(value) ? Math.round(Number(value.replace(',','.'))*100) : null;
  }
  function openPortfolioEditor(period) {
    if (document.getElementById('portfolio-dialog') || document.body.classList.contains('amounts-hidden')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'portfolio-dialog'; dialog.setAttribute('aria-labelledby','portfolio-heading');
    dialog.style.cssText='box-sizing:border-box;width:min(92vw,420px);max-height:85dvh;border:1px solid #d9e3dc;border-radius:22px;padding:24px;color:#173d31;background:#fffcf6;font:inherit';
    dialog.innerHTML='<form><small></small><h2 id="portfolio-heading">Wycena akcji i ETF</h2><p class="old-price"></p><label>Akcje (zł)<input name="stocks" required inputmode="decimal" autocomplete="off" placeholder="0,00" style="display:block;box-sizing:border-box;width:100%;margin:8px 0;padding:12px;border:1px solid #9aafa5;border-radius:12px;font:inherit;font-size:20px"></label><fieldset style="border:0;padding:0;margin:18px 0"><legend>ETF — wartości poszczególnych funduszy (zł)</legend><div class="etf-rows"></div><button type="button" class="back-button" data-add-etf disabled>+ Dodaj ETF</button><p class="etf-total"></p></fieldset><p role="status" aria-live="polite"></p><button type="submit" class="back-button" disabled>Zapisz wycenę</button> <button type="button" class="back-button" data-close>Zamknij</button></form>';
    document.body.append(dialog);
    const form=dialog.querySelector('form'), stocks=form.querySelector('[name=stocks]'), rows=form.querySelector('.etf-rows'), add=form.querySelector('[data-add-etf]'), save=form.querySelector('[type=submit]'), close=form.querySelector('[data-close]'), status=form.querySelector('[role=status]');
    form.querySelector('small').textContent=savingsLabel_(period);
    dialog.onclose=()=>dialog.remove(); close.onclick=()=>dialog.close(); dialog.showModal();
    const money=c=>scheduleMoney(c);
    let quote, busy=false;
    let etfInputs=[];
    function addRow(value='') {
      const row=document.createElement('div');
      row.style.cssText='display:flex;gap:8px;align-items:center;margin:8px 0';
      const input=document.createElement('input');
      input.required=true; input.inputMode='decimal'; input.autocomplete='off'; input.placeholder='0,00'; input.value=value;
      input.setAttribute('aria-label','Wartość ETF');
      input.style.cssText='box-sizing:border-box;min-width:0;width:100%;padding:12px;border:1px solid #9aafa5;border-radius:12px;font:inherit;font-size:20px';
      const remove=document.createElement('button'); remove.type='button'; remove.textContent='Usuń'; remove.className='back-button';
      remove.onclick=()=>{if(busy)return; row.remove();etfInputs=etfInputs.filter(x=>x!==input); if(!etfInputs.length)addRow('0');preview();};
      input.oninput=preview; etfInputs.push(input);row.append(input,remove);rows.append(row);
    }
    function values(){return etfInputs.map(x=>portfolioCents(x.value));}
    function total(){const v=values();return !v.length || v.includes(null)?null:v.reduce((a,b)=>a+b,0);}
    add.onclick=()=>{if(!busy){addRow();preview();etfInputs.at(-1).focus();}};
    dialog.oncancel=e=>{if(busy)e.preventDefault();};
    function preview() {
      const a=portfolioCents(stocks.value), b=total();
      save.disabled=busy || !quote || a===null || b===null || (a===quote.stocks && JSON.stringify(values())===JSON.stringify(quote.etfValues));
      if (!quote) return;
      form.querySelector('.etf-total').textContent=b===null?'Uzupełnij kwoty ETF.':'Suma ETF: '+money(b);
      status.textContent=a===null || b===null ? 'Podaj obie wartości. Jeśli jedna wynosi zero, wpisz 0.' :
        'Razem: '+money(a+b)+' · Zmiana wyceny: '+money(a+b-quote.price)+' · Wpływ na oszczędności: '+money(Math.round((a+b-quote.price)*quote.rate));
    }
    stocks.disabled=true; status.textContent='Pobieram zapisaną wycenę…';
    readPortfolio(period).then(q=>{
      if (!dialog.open) return;
      quote=q;
      if (q.stocks!==null) {
        stocks.value=(q.stocks/100).toFixed(2).replace('.',',');
        q.etfValues.forEach(v=>addRow((v/100).toFixed(2).replace('.',',')));
      }
      if (!etfInputs.length) addRow();
      stocks.disabled=add.disabled=false;
      form.querySelector('.old-price').textContent='Obecna wycena: '+money(q.price);
      preview();
    }).catch(e=>{status.textContent=e.message;});
    stocks.oninput=preview;
    form.onsubmit=async event=>{
      event.preventDefault();
      const a=portfolioCents(stocks.value), b=total();
      if (!quote || busy || save.disabled || a===null || b===null) return;
      const savedValues=values();
      busy=true; stocks.disabled=add.disabled=save.disabled=close.disabled=true;
      rows.querySelectorAll('input,button').forEach(el=>el.disabled=true);
      status.textContent='Zapisuję wycenę…';
      try {
        // Whole grosze divided by 100 works in either spreadsheet locale.
        const replacement='=(('+a+'+'+savedValues.join('+')+')/100'+quote.suffix;
        const request={findReplace:{find:quote.formula,replacement,matchEntireCell:true,matchCase:true,includeFormulas:true,
          range:{sheetId:quote.sheetId,startRowIndex:66,endRowIndex:67,startColumnIndex:quote.col,endColumnIndex:quote.col+1}}};
        await portfolioRequest(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[request]})});
        const verified=await readPortfolio(period);
        if (verified.stocks!==a || JSON.stringify(verified.etfValues)!==JSON.stringify(savedValues)) throw Error('Wycena w arkuszu uległa zmianie. Otwórz formularz ponownie.');
        status.textContent='Zapisano wycenę: '+money(a+b)+'.';
        form.querySelector('.old-price').textContent=savingsLabel_(period);
        if (activeView_==='savings') { savingsSerial_++; savingsBusy_=false; savingsRefresh_(); }
      } catch(e) { status.textContent=e.message+' Przed ponowieniem sprawdź zapisaną wartość.'; }
      finally {busy=false;close.disabled=false;}
    };
  }
  function mountPortfolioEditor() {
    if (window.budgetViewerRole!=='owner' || typeof savingsGroup_==='undefined' ||
        activeView_!=='savings' || savingsGroup_!=='investments') return;
    const hero=document.querySelector('#app .savings-hero');
    if (!hero || hero.querySelector('[data-portfolio-edit]')) return;
    const button=document.createElement('button');
    button.type='button';button.dataset.portfolioEdit=''; button.className='back-button';
    button.style.cssText='display:block;margin-top:16px;background:#fff;color:#25473b;padding:9px 16px;border-radius:20px';
    button.textContent='Zaktualizuj wycenę'; button.onclick=()=>openPortfolioEditor(savingsPeriod_);
    hero.append(button);
  }
  const portfolioStyle=document.createElement('style');
  portfolioStyle.textContent='body.amounts-hidden [data-portfolio-edit]{display:none!important}#portfolio-dialog::backdrop{background:rgb(17 36 29 / 35%)}';
  document.head.append(portfolioStyle);
  new MutationObserver(mountPortfolioEditor).observe(document.getElementById('app'),{childList:true});

  // Valuations are snapshots of investment gain; later deposits remain additive.
  const savingsAssetsV1 = {
    julka: {group:'children',name:'Julka — ETF',tab:portfolioTab,header:65,capital:73,gain:74,rate:.81,label:'Plany Inwestycyjne - Julka',labelRow:72},
    olek: {group:'children',name:'Olek — ETF',tab:portfolioTab,header:65,capital:76,gain:77,rate:.81,label:'Plany Inwestycyjne - Olek',labelRow:75},
    communion: {group:'children',name:'Julka — środki z komunii',tab:'Lokaty - środki dzieci',header:1,capital:3,gain:4,rate:.81,label:'Plany Inwestycyjne (ETF) - Julka (komunia)',labelRow:2},
    ikzeS: {group:'retirement',name:'IKZE — Sebastian',tab:portfolioTab,header:37,capital:47,gain:88,rate:1,label:'IKZE - wpłata',labelRow:47},
    ikzeE: {group:'retirement',name:'IKZE — Ewa',tab:portfolioTab,header:37,capital:50,gain:89,rate:1,label:'IKZE - wpłata',labelRow:50},
    ppk: {group:'retirement',name:'PPK — Sebastian',tab:portfolioTab,header:37,gain:85,employee:39,employer:40,employeeRate:1,label:'PPK - SEBA',labelRow:38},
    ppe: {group:'retirement',name:'PPE — Ewa',tab:portfolioTab,header:37,gain:99,employee:43,employer:44,employeeRate:.7,label:'PPE - EWA',labelRow:42}
  };
  function savingsColumnV1(index) {
    let s='';for(let n=index+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;
  }
  async function savingsAssetReadV1(id,period) {
    const a=savingsAssetsV1[id];if(!a || !/^\d{4}-\d{2}$/.test(period))throw Error('Nieprawidłowy wybór.');
    const params=new URLSearchParams({ranges:"'"+a.tab+"'!A1:"+(a.tab===portfolioTab?'BP100':'AL8'),fields:'sheets(properties(sheetId),data(rowData(values(formattedValue,userEnteredValue,effectiveValue,dataValidation))))'});
    const sheet=(await portfolioRequest('?'+params)).sheets?.[0];
    const rows=sheet?.data?.[0]?.rowData||[];
    const cell=(r,c)=>rows[r-1]?.values?.[c]||{};
    const [year,month]=period.split('-');const heading=portfolioMonths[Number(month)-1]+' '+year;
    const cols=(rows[a.header-1]?.values||[]).map((c,i)=>String(c.formattedValue||'').split(/[\n(]/)[0].trim().toLocaleLowerCase('pl-PL')===heading?i:-1).filter(i=>i>=0);
    if(cols.length!==1)throw Error('Brak jednoznacznej kolumny miesiąca w arkuszu.');
    const col=cols[0], letter=savingsColumnV1(col);
    if(!(rows[a.labelRow-1]?.values||[]).some(c=>c.formattedValue===a.label))throw Error('Układ arkusza zmienił się. Zapis wstrzymany.');
    const value=r=>{const n=cell(r,col).effectiveValue?.numberValue;if(!Number.isFinite(n))throw Error('Brak wartości liczbowej w arkuszu.');return n;};
    const previous=r=>{const n=cell(r,col-1).effectiveValue?.numberValue;if(!Number.isFinite(n))throw Error('Brak poprzedniego miesiąca.');return n;};
    const capital=a.capital?value(a.capital):id==='ppk'?value(84):value(43)/.7+value(44)/.7;
    const price=a.capital?capital+value(a.gain)/a.rate:id==='ppk'?value(85)+value(83):value(99);
    return {a,id,period,col,letter,sheetId:sheet.properties.sheetId,cell,value,previous,capital,price};
  }
  function savingsReplacementV1(q,mode,cents) {
    const {a,id,letter:c}=q;
    if(!Number.isSafeInteger(cents)||cents<0)throw Error('Podaj poprawną nieujemną kwotę.');
    if(mode==='valuation') {
      // The literal baseline is intentional: a new deposit must not reduce gain.
      const base=Math.round(q.capital*100);
      if(a.capital)return {row:a.gain,formula:'=('+cents+'-'+base+')/100*'+Math.round(a.rate*100)+'%'};
      if(id==='ppk')return {row:85,formula:'='+c+'84+('+cents+'-'+Math.round((q.capital+q.value(83))*100)+')/100'};
      return {row:99,formula:'='+cents+'/100+('+c+'43-'+Math.round(q.value(43)*1000000)+'/1000000)/70%+('+c+'44-'+Math.round(q.value(44)*1000000)+'/1000000)/70%'};
    }
    const row=mode==='employee'?a.employee:mode==='employer'?a.employer:0;
    if(!row)throw Error('Ten produkt nie obsługuje takiej składki.');
    const rate=mode==='employee'?a.employeeRate:.7;
    return {row,formula:'='+savingsColumnV1(q.col-1)+row+'+'+cents+'/100*'+Math.round(rate*100)+'%'};
  }
  function openSavingsAssetV1(group,period) {
    if(window.budgetViewerRole!=='owner'||document.body.classList.contains('amounts-hidden')||document.getElementById('savings-asset-dialog'))return;
    const dialog=document.createElement('dialog');dialog.id='savings-asset-dialog';
    dialog.style.cssText='box-sizing:border-box;width:min(92vw,440px);max-height:85dvh;border:1px solid #d9e3dc;border-radius:22px;padding:24px;background:#fffcf6;color:#173d31;font:inherit';
    dialog.innerHTML='<form><h2>Wycena i wpłaty</h2><p class="period"></p><label>Oszczędności<select name="asset"></select></label><label>Co aktualizujesz?<select name="mode"></select></label><p class="summary"></p><label class="amount-label">Wartość rachunku przed pomniejszeniami (zł)<input name="amount" inputmode="decimal" required autocomplete="off"></label><p class="explanation"></p><p role="status" aria-live="polite"></p><button type="submit" class="back-button" disabled>Zapisz</button> <button type="button" class="back-button" data-close>Zamknij</button></form>';
    const form=dialog.querySelector('form'),asset=form.elements.asset,mode=form.elements.mode,amount=form.elements.amount,save=form.querySelector('[type=submit]'),close=form.querySelector('[data-close]'),status=form.querySelector('[role=status]');
    form.querySelector('.period').textContent=savingsLabel_(period);
    form.querySelectorAll('input,select').forEach(x=>x.style.cssText='display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 18px;border:1px solid #9aafa5;border-radius:12px;font:inherit;font-size:16px');
    Object.entries(savingsAssetsV1).filter(([,a])=>a.group===group).forEach(([id,a])=>asset.add(new Option(a.name,id)));
    let q,busy=false,seq=0;
    const valid=()=>save.disabled=busy||!q||portfolioCents(amount.value)===null;
    function display(){
      if(!q)return;
      const a=q.a,contribution=mode.value!=='valuation';
      amount.value='';
      form.querySelector('.amount-label').firstChild.textContent=contribution?'Łączna składka za wybrany miesiąc, przed pomniejszeniami (zł)':'Wartość rachunku przed pomniejszeniami (zł)';
      form.querySelector('.summary').textContent='Wartość rachunku: '+scheduleMoney(Math.round(q.price*100))+(a.employee?' · Składki narastająco: pracownik '+scheduleMoney(Math.round(q.value(a.employee)/a.employeeRate*100))+' · pracodawca '+scheduleMoney(Math.round(q.value(a.employer)/.7*100)):' · Wpłaty narastająco: '+scheduleMoney(Math.round(q.capital*100)));
      form.querySelector('.explanation').textContent=contribution?'Wpisz sumę składek za ten miesiąc, nie pojedynczą dopłatę. Zapis zastępuje miesięczną składkę. Zachowujemy obecne współczynniki arkusza.':'Wpisz aktualną pełną wartość, obejmującą pokazane wpłaty. Późniejsze zaksięgowane wpłaty zwiększą wartość osobno. W podsumowaniu pozostają obecne pomniejszenia z arkusza.';
      if(contribution){const row=mode.value==='employee'?a.employee:a.employer;const rate=mode.value==='employee'?a.employeeRate:.7;amount.value=((q.value(row)-q.previous(row))/rate).toFixed(2).replace('.',',');}
      valid();
    }
    async function load(){const generation=++seq;q=null;valid();status.textContent='Pobieram dane…';mode.replaceChildren(new Option('Wycena rachunku','valuation'));if(savingsAssetsV1[asset.value].employee){mode.add(new Option('Składka pracownika','employee'));mode.add(new Option('Składka pracodawcy','employer'));}try{const next=await savingsAssetReadV1(asset.value,period);if(generation!==seq||!dialog.open)return;q=next;display();status.textContent='';}catch(e){if(generation===seq)status.textContent=e.message;}}
    asset.onchange=load;mode.onchange=()=>{try{display();}catch(e){status.textContent=e.message;save.disabled=true;}};amount.oninput=valid;
    close.onclick=()=>dialog.close();dialog.onclose=()=>{seq++;dialog.remove();};dialog.oncancel=e=>{if(busy)e.preventDefault();};
    form.onsubmit=async e=>{
      e.preventDefault();if(busy||!q||save.disabled)return;
      busy=true;form.querySelectorAll('input,select,button').forEach(x=>x.disabled=true);status.textContent='Zapisuję…';
      try{
        const change=savingsReplacementV1(q,mode.value,portfolioCents(amount.value));
        const old=q.cell(change.row,q.col),find=old.userEnteredValue?.formulaValue||(typeof old.userEnteredValue?.numberValue==='number'?String(old.userEnteredValue.numberValue).replace('.',','):'');
        if(!find||old.dataValidation)throw Error('Nieobsługiwany format komórki. Zapis wstrzymany.');
        if(old.userEnteredValue?.formulaValue!==change.formula){
          const result=await portfolioRequest(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{findReplace:{find,replacement:change.formula,matchEntireCell:true,matchCase:true,includeFormulas:true,range:{sheetId:q.sheetId,startRowIndex:change.row-1,endRowIndex:change.row,startColumnIndex:q.col,endColumnIndex:q.col+1}}}]})});
          if(result.replies?.[0]?.findReplace?.occurrencesChanged!==1)throw Error('Dane zostały zmienione. Otwórz formularz ponownie.');
        }
        const check=await savingsAssetReadV1(q.id,period);
        if(check.cell(change.row,check.col).userEnteredValue?.formulaValue!==change.formula)throw Error('Nie potwierdzono zapisu. Otwórz formularz ponownie.');
        status.textContent='Zapisano i potwierdzono w arkuszu.';
        invalidateReadFlights();if(activeView_==='savings'){savingsSerial_++;savingsBusy_=false;savingsRefresh_();}
      }catch(e){status.textContent=e.message+' Przed ponowieniem sprawdź zapis.';}
      finally{busy=false;close.disabled=false;}
    };
    document.body.append(dialog);dialog.showModal();load();
  }
  function mountSavingsAssetsV1(){
    if(window.budgetViewerRole!=='owner'||typeof savingsGroup_==='undefined'||activeView_!=='savings'||!['children','retirement'].includes(savingsGroup_))return;
    const hero=document.querySelector('#app .savings-hero');if(!hero||hero.querySelector('[data-savings-edit]'))return;
    const button=document.createElement('button');button.type='button';button.className='back-button';button.dataset.savingsEdit='';button.textContent=savingsGroup_==='children'?'Zaktualizuj wycenę dzieci':'Wycena i składki emerytalne';button.style.cssText='display:block;margin-top:16px;background:white;color:#25473b';button.onclick=()=>openSavingsAssetV1(savingsGroup_,savingsPeriod_);hero.append(button);
  }
  new MutationObserver(mountSavingsAssetsV1).observe(document.getElementById('app'),{childList:true});
  portfolioStyle.textContent+='body.amounts-hidden [data-savings-edit]{display:none!important}#savings-asset-dialog::backdrop{background:rgb(17 36 29 / 35%)}';

  function prepareTestNavigation() {
    const bar = document.querySelector('nav.budget-tabs');
    const balances = bar?.querySelector('[data-tab="balances"]');
    const assignments = bar?.querySelector('[data-tab="assignments"]');
    if (!balances || !assignments || document.getElementById('pending-count')) return;
    balances.querySelector('span').textContent = 'Salda';
    balances.setAttribute('aria-label','Salda kont');
    balances.insertAdjacentHTML('afterbegin','<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7V5.5L17 3v4"/><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M21 12h-6v4h6"/></svg>');
    const badge = document.createElement('b');
    badge.id = 'pending-count';
    badge.hidden = true;
    assignments.append(badge);
    const style = document.createElement('style');
    style.textContent = `@media(max-width:760px){
  #app .unified-header.dashboard-month-sticky{position:relative;top:auto;margin-bottom:12px}
}
.budget-tabs button{position:relative;flex:1 1 0;min-width:0}
.budget-tabs button[data-tab="balances"].selected{background:#287c54;color:white}
#pending-count{position:absolute;top:2px;left:calc(50% + 5px);border-radius:14px;padding:1px 4px;min-width:16px;font:700 10px/14px system-ui;background:#943c25;color:white;box-shadow:0 0 0 2px #f4f6f8}
@media(max-width:480px){.budget-tabs{gap:2px;padding-inline:4px}.budget-tabs button{font-size:clamp(9px,2.7vw,12px);padding-inline:0;gap:4px;letter-spacing:-.15px}}
`;
    style.textContent += '.phone-expense{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 12px;margin:10px 0;padding:16px;background:white;border:1px solid #dfdfd4;border-radius:16px}.phone-expense small,.phone-expense select,.phone-expense button,.phone-expense p{grid-column:1/-1}.phone-expense select{max-width:100%;font-size:16px;padding:8px}.phone-expense b{white-space:nowrap}.assignment-wrap button{min-height:42px}.assignment-wrap button[aria-pressed=true]{background:#175a48;color:white}';
    document.head.append(style);
  }
  function queueSheets(path, options = {}) {
    if (options.method && options.method !== 'GET') {
      invalidateReadFlights();
      return queueSheetsRequest(path, options);
    }
    return shareRead('sheets|'+token+'|'+path, () => queueSheetsRequest(path, options));
  }
  function queueSheetsRequest(path, options = {}) { return diagnosticMeasure(options.method&&options.method!=='GET'?'sheets-write':'sheets-read',()=>queueSheetsRequestRaw(path,options)); }
  async function queueSheetsRequestRaw(path, options = {}) {
    const viewerPlanRead = window.budgetViewerRole==='viewer' && (!options.method || options.method==='GET') &&
      path===encodeURIComponent("'Decyzje budżetowe'!A2:B");
    if ((!viewerPlanRead && window.budgetViewerRole !== 'owner') || !token || Date.now() >= expires)
      throw Error('Zaloguj się ponownie jako właściciel budżetu.');
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + testFileId + '/values/' + path, {
      ...options, cache:'no-store', redirect:'error', headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'}
    });
    if (!response.ok) throw Error('Nie udało się połączyć z kolejką (HTTP ' + response.status + ').');
    return response.json();
  }
  // Compare schedules from the same cutoff. Paid interest belongs to the old cash flow.
  function scheduleSaving(before, after, charged) {
    return before - after - charged;
  }
  function scheduleMoney(cents) {
    return (cents / 100).toLocaleString('pl-PL', {style:'currency', currency:'PLN'});
  }
  function interestBeforePayment(payment, rows, snapshot) {
    const key = payment.key + '|' + payment.bank;
    const saved = rows.filter(r => r[0] === key).pop();
    if (saved && scheduleCents(saved[1]) !== null) return Number(saved[1]);
    // The monthly mortgage figure can already include this payment's split.
    // Compare it with opening interest and all booked splits before reusing it.
    const period = snapshot.periods.find(p => p.key === payment.key);
    const [year, month] = payment.key.split('-').map(Number);
    const previousKey = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0,7);
    const previous = snapshot.periods.find(p => p.key === previousKey);
    const opening = previous?.items.find(x => x.id === 'hipoteka')?.interest;
    const current = period?.items.find(x => x.id === 'hipoteka')?.interest;
    const group = snapshot.installments.filter(x => x.key === payment.key && x.split?.[2] === 'hipoteka');
    const extra = group.filter(x => x.bank.includes('nadpłata'));
    if (![current,opening].every(Number.isFinite)) return null;
    if (extra.length > 1) {
      const ordered = extra.slice().sort((a,b) => a.bank.localeCompare(b.bank));
      const last = ordered.at(-1);
      const day = payment.bank.match(/nadpłata (\d{4}-\d{2}-\d{2})/)?.[1];
      if (!day || last.bank !== payment.bank || extra.filter(x => x.bank.includes(day)).length !== 1) return null;
      const prior = ordered.slice(0,-1);
      if (!prior.every(p => rows.some(r => r[0] === p.key + '|' + p.bank && scheduleCents(r[2]) !== null))) return null;
      const paid = scheduleCents(payment.split[4]);
      return paid === null ? null : Math.round(current * 100) + paid;
    }
    const cents = Math.round(opening * 100);
    const regular = group.filter(x => !x.bank.includes('nadpłata'));
    const base = cents - regular.reduce((sum,x) => sum + Number(x.split[4]),0);
    if (!Number.isSafeInteger(base) || base < 0) return null;
    const shown = Math.round(current * 100);
    return shown === base || shown === base - Number(payment.split[4]) ? base : null;
  }
  function scheduleEditor(payment, key) {
    const panel = document.createElement('details');
    panel.dataset.scheduleComparison = key;
    const summary = document.createElement('summary');
    summary.textContent = 'Porównaj harmonogramy';
    panel.append(summary);
    panel.addEventListener('toggle', async () => {
      if (!panel.open || panel.dataset.loaded) return;
      panel.dataset.loaded = '1';
      const form = document.createElement('form');
      form.innerHTML = '<p>Porównaj harmonogramy na dzień nadpłaty, przy tych samych założeniach oprocentowania.</p><label>Odsetki pozostałe przed nadpłatą (zł)<input name="before" inputmode="decimal" required></label><label>Odsetki pozostałe po nadpłacie (zł)<input name="after" inputmode="decimal" required></label><p></p><output></output><button type="submit" class="back-button">Zapisz porównanie</button><small role="status"></small>';
      panel.append(form);
      const fields = form.elements, button = form.querySelector('button'), status = form.querySelector('small');
      const charged = Number(payment.split[4]);
      form.querySelectorAll('p')[1].textContent = 'Odsetki pobrane przy nadpłacie: ' + scheduleMoney(charged) + '. Są uwzględnione w porównaniu.';
      const range = scheduleRange;
      let saved;
      function values() {
        return [fields.before.value,fields.after.value].map(v => /^\d{1,10}([,.]\d{1,2})?$/.test(v.trim()) ? Math.round(Number(v.trim().replace(',', '.'))*100) : NaN);
      }
      function preview() {
        const [a,b] = values(), valid = Number.isSafeInteger(a) && Number.isSafeInteger(b);
        button.disabled = !valid || (saved && a === saved[0] && b === saved[1]);
        const delta = scheduleSaving(a,b,charged);
        form.querySelector('output').textContent = valid ? (delta < 0 ? 'Wzrost prognozowanych odsetek: ' : 'Oszczędność na odsetkach: ') + scheduleMoney(Math.abs(delta)) : '';
      }
      form.hidden = true;
      try {
        const rows = (await queueSheets(range+'?valueRenderOption=UNFORMATTED_VALUE')).values || [];
        const last = rows.filter(row => row[0] === key).pop();
        if (last) {
          fields.before.value = (last[1]/100).toFixed(2);
          if (scheduleCents(last[2]) !== null) {
            fields.after.value = (Number(last[2])/100).toFixed(2);
            saved = [Number(last[1]), Number(last[2])];
          }
        }
        const baseline = interestBeforePayment(payment, rows, debtData_);
        if (baseline !== null) {
          fields.before.value = (baseline/100).toFixed(2);
          fields.before.readOnly = Boolean(last);
          form.querySelector('p').textContent = last ? 'Odsetki przed nadpłatą pobrano z zapisanego porównania. Wpisz pozostałe odsetki z nowego harmonogramu.' : 'Podstawiono odsetki z budżetu. Jeśli miesięczna rata została zapłacona później niż nadpłata, sprawdź kwotę na dzień nadpłaty.';
        } else {
          form.querySelector('p').textContent = 'Brak jednoznacznego salda sprzed tej nadpłaty. Sprawdź kwotę w poprzednim harmonogramie.';
        }
      } catch (_) {
        summary.textContent = 'Błąd odczytu porównania · zamknij i otwórz ponownie';
        form.remove(); delete panel.dataset.loaded; return;
      }
      form.hidden = false; preview(); form.oninput = preview;
      form.onsubmit = async event => {
        event.preventDefault();
        if (button.disabled) return;
        const [a,b] = values();
        if (![a,b].every(Number.isSafeInteger)) return;
        button.disabled = fields.before.disabled = fields.after.disabled = true;
        try {
          const row = [key,a,b,charged,new Date().toISOString()];
          await queueSheets(range+':append?valueInputOption=RAW', {method:'POST',body:JSON.stringify({values:[row]})});
          saved = [a,b];
          recentSchedules.set(key,{row, version:++scheduleVersion});
          loadedSchedules = loadedSchedules.filter(existing => existing[0] !== key).concat([row]);
          const updated = applySchedules(debtBase_, loadedSchedules);
          if (debtAdopt_(updated)) {
            try { localStorage.setItem(debtKey_, JSON.stringify(updated)); } catch (_) {}
            if (activeView_ === 'debts') { renderDebts_(); applyAmountPrivacy_(); }
          }
          status.textContent = 'Zapisano porównanie.';
        } catch (_) { status.textContent = 'Brak potwierdzenia zapisu. Otwórz ponownie zakładkę Kredyty i sprawdź wynik.'; }
        finally { fields.before.disabled = fields.after.disabled = false; preview(); }
      };
    });
    return panel;
  }
  function mountScheduleEditors() {
    if (window.budgetViewerRole !== 'owner' || typeof debtData_ === 'undefined' || !debtData_) return;
    const rows = document.querySelectorAll('.installment-panel .split-row');
    if (!rows.length) return;
    const payments = (debtData_.installments || []).filter(x => x.key === debtPeriod_);
    rows.forEach((row,i) => {
      const payment = payments[i];
      if (!payment?.split || !/^mBank · nadpłata /.test(payment.bank) || row.querySelector('[data-schedule-comparison]')) return;
      row.append(scheduleEditor(payment, payment.key+'|'+payment.bank));
    });
  }
  new MutationObserver(mountScheduleEditors).observe(document.getElementById('app'), {childList:true});
  mountScheduleEditors();
  const queueRange = range => encodeURIComponent("'Kolejka iPhone TEST'!" + range);
  function phoneQueue() {
    return shareRead('phoneQueue|'+token, readPhoneQueue);
  }
  function childTransferName(label){
    return String(label||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/gi,'l')
      .replace(/^Wydatek z maila:\s*/i,'').trim().match(/^XTB\s+SPOLKA\s+AKCYJNA\s*[-–]\s*(Julka|Olek)$/i)?.[1].toLowerCase();
  }
  async function postedR2Payments(rows){
    const read=name=>queueSheets(encodeURIComponent("'"+name+"'!A2:G")+'?valueRenderOption=UNFORMATTED_VALUE').then(response=>response.values||[]);
    const bankRows=rows.filter(r=>r.key?.startsWith('bank-n26|'));
    const [ledger,links,external]=await Promise.all([read('Automat konta R2 DEV'),read('Przelewy hipoteczne TEST'),
      bankRows.length?read('Ruchy zewnętrzne R2 TEST'):[]]);
    const posted=new Map();
    for(const [key,,,status,amount,target] of ledger){
      if(status==='POSTED_TEST_R2' && target && typeof amount==='number')
        posted.set(key,{status,target,amountCents:Math.round(amount*100)});
    }
    for(const [alert,,,cents,,status,bankKey] of links){
      const entry=posted.get('mortgage-mail|'+alert);
      if(status==='ZAKSIĘGOWANA' && bankKey && entry?.amountCents===cents && !posted.has(bankKey))posted.set(bankKey,entry);
    }
    for(const [alert,,direction,cents,bankId] of external){
      if(direction!=='DBIT' || !bankId)continue;
      const bankKey=bankId.startsWith('bank-n26|')?bankId:'bank-n26|'+bankId;
      const entry=posted.get('external-mail|'+alert);
      if(entry?.amountCents===cents && !posted.has(bankKey))posted.set(bankKey,entry);
    }
    // A weekend transfer can appear at the bank on Monday before the importer
    // publishes its ID mapping. Flag a possible repeat instead of sending a second write.
    const blikReference=label=>String(label||'').match(/\bref[.:\s]+(\d{6,})\b/i)?.[1];
    const xtbPurchase=label=>/\bXTB\s+S\.?\s*A\b/i.test(label);
    const unresolved=new Set(external.filter(r=>r[2]==='DBIT' && !r[4]).map(r=>'external-mail|'+r[0]));
    const possibleRepeats=new Set();
    for(const row of bankRows){
      const child=childTransferName(row.description);
      if(row.currency!=='PLN' || posted.has(row.key))continue;
      const bankRef=blikReference(row.description);
      const bankPurchase=xtbPurchase(row.description);
      if(!bankPurchase && !(child && row.amountCents===50000))continue;
      const candidate=ledger.some(([id,date,label,,amount])=>{
        if(!unresolved.has(id)||!posted.has(id)||Math.round(amount*100)!==row.amountCents)return false;
        const mailRef=blikReference(label);
        const samePurchase=bankPurchase && /\bBLIK\b/i.test(label) && xtbPurchase(label) && mailRef && (!bankRef || bankRef===mailRef);
        if(!samePurchase && !(child && row.amountCents===50000 && childTransferName(label)===child))return false;
        const next=new Date(date+'T12:00:00Z');
        if(!Number.isFinite(next.getTime()))return false;
        do{next.setUTCDate(next.getUTCDate()+1);}while([0,6].includes(next.getUTCDay()));
        return row.date>=date && row.date<=next.toISOString().slice(0,10);
      });
      if(candidate)possibleRepeats.add(row.key);
    }
    const result=new Map();
    result.possibleRepeats=possibleRepeats;
    for(const row of rows){
      const entry=posted.get(row.key);
      if(row.currency==='PLN' && entry && entry.amountCents===row.amountCents)result.set(row.key,entry);
    }
    return result;
  }
  async function markSettledRedemptions(rows) {
    const candidates = rows.filter(row => !row.decision && row.account === 'R2' &&
      (row.currency || 'PLN') === 'PLN' && row.amountCents > 0 &&
      /BIURO MAKLERSKIE PKO/i.test(row.merchant || '') && /^\d{4}-\d{2}-\d{2}$/.test(row.date));
    if (!candidates.length) return;
    const years = [...new Set(candidates.map(row => row.date.slice(0,4)))];
    const query = new URLSearchParams({fields:'sheets(properties(title),data(rowData(values(effectiveValue,note))))'});
    for (const year of years) query.append('ranges', "'Wykonanie " + year + "'!A37:N37");
    const ledger = await portfolioRequest('?' + query);
    for (const sheet of ledger.sheets || []) {
      const cells = sheet.data?.[0]?.rowData?.[0]?.values || [];
      if (cells[0]?.effectiveValue?.stringValue !== 'Wykup obligacji') continue;
      for (const row of candidates) {
        if (sheet.properties.title !== 'Wykonanie ' + row.date.slice(0,4)) continue;
        const cell = cells[Number(row.date.slice(5,7)) + 1];
        if (!(cell?.effectiveValue?.numberValue < 0) || !cell.note) continue;
        const mail = /^external-mail\|([a-f0-9]{16})$/.exec(row.key);
        const bank = /\|(\d{4}-\d{2}-\d{2}\/\d+\/\d+)$/.exec(row.key);
        const ids = cell.note.match(/[a-f0-9]{16}|\d{4}-\d{2}-\d{2}\/\d+\/\d+/gi) || [];
        if ((mail && ids.includes(mail[1])) || (bank && ids.includes(bank[1]))) row.settledRedemption = true;
      }
    }
  }
  async function reconcileExpenseRows(rows){
    const unchecked=rows.filter(row=>row.accountLabel==='R2' && !row.decision && !row.postedEvidence && !row.targetNeedsReview);
    if(unchecked.length){
      const evidence=await postedR2Payments(unchecked);
      for(const row of unchecked){
        if(evidence.has(row.key))row.postedEvidence=evidence.get(row.key);
        else if(evidence.possibleRepeats.has(row.key))row.bridgeBlocked='XTB_PENDING_MATCH';
      }
    }
  }
  function assignmentCommands(rows) {
    const byKey=new Map(), incomeCommands=new Map();
    for(const [kind,,body,result] of rows){
      if(kind!=='ASSIGN_V1' && kind!=='INCOME_V1')continue;
      const request=JSON.parse(body);
      const commands=kind==='INCOME_V1'?incomeCommands:byKey;
      const receipt={request,result};
      const confirmed=result==='OK'?receipt:commands.get(request.key)?.confirmed;
      // A rejected retry must not reopen an earlier confirmed assignment.
      const effective=confirmed && /^Błąd/i.test(result || '')?confirmed:receipt;
      commands.set(request.key,{...effective,confirmed});
    }
    return {byKey,incomeCommands};
  }
  async function readPhoneQueue() {
    const [snapshot, commands] = await Promise.all([queueSheets(queueRange('1:1')),queueSheets(queueRange('A2:D'))]);
    const [tag, stamp, parts, ...chunks] = snapshot.values[0];
    if (tag !== 'QUEUE_V1' || !Number.isInteger(+parts) || +parts < 1 || chunks.length < +parts)
      throw Error('Niepełny odczyt kolejki.');
    const bytes = Uint8Array.from(atob(chunks.slice(0,+parts).join('')), c => c.charCodeAt(0));
    const data = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
    const {byKey,incomeCommands}=assignmentCommands(commands.values || []);
    if (data.income?.rows) {
      await markSettledRedemptions(data.income.rows);
      data.income.rows = reconcileIncomeRows(data.income.rows, incomeCommands);
    }
    const rows = data.rows.filter(r => !r.bridgeArchived);
    await reconcileExpenseRows(rows);
    const pending = rows.filter(r => !r.decision && !r.postedEvidence && !r.bridgeBlocked &&
      (!byKey.has(r.key) || byKey.get(r.key).result?.startsWith('Błąd')));
    for(const row of rows){
      const job=storedAssignment(row.key);
      const obsoleteError = job?.phase==='error' && row.postedEvidence && job.request?.key===row.key;
      if(obsoleteError || (job?.phase==='confirmed' && (row.decision || row.postedEvidence || (job.method==='ASSIGN_V1' && byKey.has(row.key)))))
        localStorage.removeItem(assignmentPrefix+row.key);
    }
    return {data,rows,pending,byKey,incomeCommands,stamp};
  }
  function applyPublishedTargets(manual, published) {
    if (!Array.isArray(published.existingRows) || !Array.isArray(published.expenseSheets))
      throw Error('Lista pozycji budżetu jest chwilowo niedostępna.');
    const months = new Set(published.existingRows.map(row => row.month));
    const sheets = new Set(published.expenseSheets);
    return {...manual, existingRows: [
      ...manual.existingRows.filter(row => !months.has(row.month) || !sheets.has(row.sheet)),
      ...published.existingRows
    ]};
  }
  function pendingIncome(state) {
    return (state.data.income?.rows || []).filter(row => {
      const command = state.incomeCommands.get(row.key);
      return !row.settledRedemption && !row.decision && !incomeReceiptActive(command);
    });
  }
  const formMethods = {
    'expense-editor.html': ['ebListSectionsDev','ebQueueListDev','ebQueueReviseDev','pkDecideDevV1','kzGetDevV1','kzPreviewDevV1','kzPostDevV1'],
    'manual-entry.html': ['krGetDEV','krRefreshDEV','krSaveDEV','kkListaTest','kkPrzeniesTest']
  };
  const formWrites = new Set(['ebQueueReviseDev','pkDecideDevV1','kzPostDevV1','krSaveDEV','kkPrzeniesTest']);
  const formSheet = range => encodeURIComponent("'Formularze iPhone TEST'!" + range);
  const receiptKey = 'budget-test-form-receipt-v1';
  let activeForm, formNotice, lastEditorData, refreshEditor = false;
  async function waitForForm(receipt) {
    let row = receipt.row;
    if (!row) {
      const ids = await queueSheets(formSheet('A:A'));
      row = (ids.values || []).findIndex(values => values[0] === receipt.id) + 1;
      if (row < 2) {
        if (Date.now() - receipt.startedAt > 60000 && localStorage.getItem(receiptKey) === JSON.stringify(receipt))
          localStorage.removeItem(receiptKey);
        throw Error('Brak potwierdzenia wysyłki. Sprawdź historię przed ponowieniem.');
      }
    }
    const until = Date.now() + 240000;
    while (Date.now() < until) {
      const result = await queueSheets(formSheet(row + ':' + row));
      const [id,,,status,,...chunks] = result.values?.[0] || [];
      if (id !== receipt.id) throw Error('Nie można potwierdzić operacji. Sprawdź historię.');
      if (status === 'ERROR' || status === 'OK') {
        if (localStorage.getItem(receiptKey) === JSON.stringify(receipt)) localStorage.removeItem(receiptKey);
        if (status === 'ERROR') throw Object.assign(Error(chunks[0] || 'Zapis wymaga sprawdzenia.'),{confirmedRejection:true});
        const bytes = Uint8Array.from(atob(chunks.join('')), c=>c.charCodeAt(0));
        return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      }
      await new Promise(resolve=>setTimeout(resolve,4500));
    }
    throw Error('Brak potwierdzenia. Wróć do formularza, aby sprawdzić wynik.');
  }
  // Each expense has its own durable receipt. A lost HTTP reply is reconciled by ID.
  const assignmentPrefix='budget-assignment-outbox-v1:'+testFileId+':';
  const assignmentWork=new Map();
  const assignmentEvent='budget-assignment-progress';
  function storedAssignment(key){return JSON.parse(localStorage.getItem(assignmentPrefix+key)||'null');}
  function assignments(){
    return Object.keys(localStorage).filter(key=>key.startsWith(assignmentPrefix)).map(key=>JSON.parse(localStorage.getItem(key))).filter(Boolean);
  }
  function jobKey(job){return job.method==='krSaveDEV'?'manual:'+job.request.id:job.request.key;}
  // Freeze the pre-click balance while these receipts are in flight. A later
  // dashboard snapshot may already contain some of them.
  const expensePreviews=new Map();
  let previewRevision=0;
  const previewMonth=data=>data.year+'-'+String(data.monthNumber).padStart(2,'0');
  function trackPreview(job){
    const key=jobKey(job), req=job.request;
    const month=(job.previewDate||req.date)?.slice(0,7);
    let group=expensePreviews.get(month);
    if(job.phase==='ready' && job.previewEligible && !group?.items.has(key)){
      const data=typeof dashboardData==='undefined'?null:dashboardData;
      if(!data || data.isClosedMonth || previewMonth(data)!==month)return;
      const cents=job.previewCents;
      if(!Number.isSafeInteger(cents)||cents<=0||(data.wolneSrodki==null||!Number.isFinite(Number(data.wolneSrodki))))return;
      if(!group){group={base:Math.round(data.wolneSrodki*100),items:new Map()};expensePreviews.set(previewMonth(data),group);}
      group.items.set(key,{cents,confirmed:false});previewRevision++;
    }
    const item=group?.items.get(key);if(!item)return;
    if(job.phase==='error'){group.items.delete(key);previewRevision++;if(!group.items.size)expensePreviews.delete(month);}
    if(job.phase==='confirmed' && !item.confirmed){item.confirmed=true;previewRevision++;}
    document.dispatchEvent(new Event('budget-plan-balance'));
  }
  window.expensePreview={
    revision:()=>previewRevision,
    base(data){
      const g=expensePreviews.get(previewMonth(data));
      return g?g.base-Array.from(g.items.values()).reduce((sum,i)=>sum+i.cents,0):null;
    },
    settle(data,revision){
      const month=previewMonth(data),g=expensePreviews.get(month);
      if(g && revision===previewRevision && Array.from(g.items.values()).every(i=>i.confirmed)){
        expensePreviews.delete(month);previewRevision++;
      }
    }
  };
  function recordAssignment(job){
    localStorage.setItem(assignmentPrefix+jobKey(job),JSON.stringify(job));
    trackPreview(job);
    window.dispatchEvent(new Event(assignmentEvent));
  }
  function assignmentGuard(data,req){
    const row=data.rows.find(r=>r.key===req.key);
    const targets=(req.parts||[req]).filter(p=>p.targetManualKey).map(p=>{
      const t=data.existingRows.find(x=>x.key===p.targetManualKey);
      return t && [t.key,t.sheet,t.month,t.label,t.sectionName];
    });
    return JSON.stringify([row && [row.key,row.amountCents,row.date,row.currency,row.accountLabel,row.assignmentEpoch||0,
      row.decision||null,!!row.bridgeArchived,!!row.postedEvidence,!!row.bridgeBlocked,!!row.targetNeedsReview],targets]);
  }
  function submitAssignment(method,req,row,data,editorDraft){
    const prev=storedAssignment(req.key);
    if(prev && prev.phase!=='error')throw Error('Ten wydatek już czeka na potwierdzenie.');
    const job={id:crypto.randomUUID(),method,request:req,label:row.description,phase:'ready',
      previewEligible:!row.decision&&!row.postedEvidence&&!row.bridgeBlocked&&!row.bridgeArchived&&!row.targetNeedsReview && row.currency==='PLN' &&
        (method==='ASSIGN_V1'||['EXISTING_ROW','NEW_ROW','MULTI_SPLIT'].includes(req.action)),
      previewCents:row.amountCents,previewDate:row.date,guard:assignmentGuard(data,req),editorDraft,startedAt:Date.now()};
    recordAssignment(job);
    runAssignment(req.key);
  }
  async function deliverAssignment(key){
    const job=storedAssignment(key);
    if(!job || ['error','confirmed'].includes(job.phase) || window.budgetViewerRole!=='owner' || !navigator.onLine)return;
    const quick=job.method==='ASSIGN_V1';
    const range=quick?queueRange:formSheet;
    try{
      if(job.phase==='ready'){
        if(job.method==='krSaveDEV' && (!token || Date.now()>=expires))return;
        const guardedRow=JSON.parse(job.guard||'null')?.[0];
        if(guardedRow?.[4]==='R2' && (quick || ['pkDecideDevV1','ebQueueReviseDev'].includes(job.method)) && !guardedRow[6] && !guardedRow[8]){
          const evidence=await postedR2Payments([{...job.request,description:job.label,amountCents:guardedRow[1],date:guardedRow[2],currency:guardedRow[3]}]);
          if(evidence.possibleRepeats.has(key)){job.phase='error';job.message='Oczekuje na uzgodnienie z wpłatą XTB z maila.';recordAssignment(job);return;}
          if(evidence.has(key)){
            job.phase='confirmed';recordAssignment(job);window.dispatchEvent(new Event('budget-assignment-saved'));return;
          }
        }
        job.phase='sending';recordAssignment(job);
        const values=quick?[job.method,job.id,JSON.stringify(job.request)]:[job.id,job.method,JSON.stringify([job.request])];
        const res=await queueSheets(range(quick?'A2:D':'A:C')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
          {method:'POST',body:JSON.stringify({values:[values]})});
        job.row=Number(res.updates?.updatedRange?.match(/!A(\d+):/)?.[1]);
        job.phase='waiting';recordAssignment(job);
      }
      if(!job.row){
        const ids=(await queueSheets(range(quick?'B:B':'A:A'))).values||[];
        job.row=ids.findIndex(r=>r[0]===job.id)+1;
        if(job.row<2){
          if(Date.now()-job.startedAt>120000){
            job.phase='error';job.message='Brak potwierdzenia wysyłki. Sprawdź historię przed ponowieniem.';recordAssignment(job);
          }
          return;
        }
        job.phase='waiting';recordAssignment(job);
      }
      const cells=(await queueSheets(range('A'+job.row+':'+(quick?'D':'F')+job.row))).values?.[0]||[];
      if(cells[quick?1:0]!==job.id)return;
      const result=cells[3];
      if(!result)return;
      if(quick?/^Błąd/i.test(result):result==='ERROR'){
        job.message=quick?result:String(cells[5]||'Sprawdź wybrane pozycje.');
        if(job.method!=='krSaveDEV' && !quick && !job.rebased && /STALE_REVISION|Lista zmieniła się/i.test(job.message)){
          const fresh=(await phoneQueue()).data;
          if(fresh.revision!==job.request.revision && assignmentGuard(fresh,job.request)===job.guard){
            job.id=crypto.randomUUID();job.request.revision=fresh.revision;job.row=0;
            job.phase='ready';job.rebased=true;job.startedAt=Date.now();recordAssignment(job);return;
          }
        }
        if(job.method==='krSaveDEV' && /^Trwa inna operacja\.?$/i.test(job.message) && (job.lockRetries||0)<3){
          job.lockRetries=(job.lockRetries||0)+1;
          job.id=crypto.randomUUID();job.row=0;job.phase='ready';job.startedAt=Date.now();
          recordAssignment(job);return;
        }
        job.phase='error';
      }else{
        if(result!=='OK')return;
        job.phase='confirmed';
        lastEditorData=null;
        window.dispatchEvent(new Event('budget-assignment-saved'));
      }
      recordAssignment(job);
      if(job.method==='krSaveDEV' && job.phase==='confirmed')window.dispatchEvent(new Event('budget-manual-confirmed'));
    }catch(error){
      // Keep the same receipt across network errors and app restarts.
      if(job.phase==='sending' && /HTTP (400|403|401)\b/.test(error.message)){
        job.phase='error';job.message=error.message;recordAssignment(job);
      }
    }
  }
  function runAssignment(key){
    if(assignmentWork.has(key))return;
    const work=()=>deliverAssignment(key);
    const task=navigator.locks?navigator.locks.request(assignmentPrefix+key,{ifAvailable:true},lock=>lock&&work()):work();
    assignmentWork.set(key,task);
    task.finally(()=>assignmentWork.delete(key));
  }
  function resumeAssignments(){
    if(document.hidden || window.budgetViewerRole!=='owner')return;
    assignments().filter(j=>!['confirmed','error'].includes(j.phase)).forEach(j=>runAssignment(jobKey(j)));
  }
  window.addEventListener('online',resumeAssignments);
  document.addEventListener('visibilitychange',resumeAssignments);
  setInterval(resumeAssignments,5000);
  function assignmentHost(caller){
    return window.budgetViewerRole==='owner' && activeForm?.isConnected &&
      activeForm.dataset.form==='expense-editor.html' && activeForm.contentWindow===caller;
  }
  window.expenseBackground={
    list(caller){return assignmentHost(caller)?assignments().filter(j=>j.method!=='krSaveDEV'):[];},
    submit(caller,method,req,row,data,editorDraft){
      if(!assignmentHost(caller)||!['pkDecideDevV1','ebQueueReviseDev'].includes(method))throw Error('Brak dostępu do zapisu.');
      submitAssignment(method,req,row,data,editorDraft);
    }
  };
  function manualHost(caller){
    return window.budgetViewerRole==='owner' && activeForm?.isConnected &&
      activeForm.dataset.form==='manual-entry.html' && activeForm.contentWindow===caller;
  }
  const manualChoicesKey='budget-manual-choices-v1:'+testFileId;
  let manualPublished,manualChoices;
  function choicesFrom(data){
    return {accounts:data.accounts.map(a=>({name:a.name})),expenseSheets:data.expenseSheets,
      existingRows:data.existingRows.map(({key,label,sheet,month})=>({key,label,sheet,month}))};
  }
  function rememberChoices(data){
    manualChoices={time:Date.now(),choices:choicesFrom(data)};
    try{localStorage.setItem(manualChoicesKey,JSON.stringify(manualChoices));}catch{}
    return manualChoices.choices;
  }
  window.manualExpenses={
    async choices(caller){
      if(!manualHost(caller))throw Error('Brak dostępu do formularza.');
      let saved=manualChoices;
      try{saved=saved||JSON.parse(localStorage.getItem(manualChoicesKey));}catch{}
      if(saved?.choices && Date.now()-saved.time<86400000){
        return manualPublished?applyPublishedTargets(saved.choices,manualPublished):saved.choices;
      }
      // The worker retains completed reads. Reuse a verified response while the new read runs.
      const [methods,statuses]=await Promise.all(['B2:B','D2:D'].map(range=>queueSheets(formSheet(range))));
      const index=(methods.values||[]).findLastIndex((r,i)=>r[0]==='krGetDEV' && statuses.values?.[i]?.[0]==='OK');
      if(index<0 || !manualHost(caller))return null;
      const row=(await queueSheets(formSheet((index+2)+':'+(index+2)))).values?.[0];
      if(!row || row[1]!=='krGetDEV' || row[3]!=='OK' || !manualHost(caller))return null;
      const bytes=Uint8Array.from(atob(row.slice(5).join('')),c=>c.charCodeAt(0));
      const data=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      if(!manualHost(caller))return null;
      const choices=choicesFrom(data);
      return manualPublished?applyPublishedTargets(choices,manualPublished):choices;
    },
    submit(caller,request,label){
      if(!manualHost(caller) || request.kind!=='WYDATEK')throw Error('Brak dostępu do zapisu.');
      const job={id:request.id,method:'krSaveDEV',request,label,previewEligible:true,previewCents:request.cents,phase:'ready',startedAt:Date.now()};
      const key=jobKey(job);
      if(!storedAssignment(key))recordAssignment(job);
      runAssignment(key);
    },
    list(caller){
      return manualHost(caller)?assignments().filter(j=>j.method==='krSaveDEV'):[];
    },
    reconcile(caller,rows){
      const ids=new Set(rows.map(r=>r.id));
      for(const job of this.list(caller)){
        if(ids.has(job.request.id))localStorage.removeItem(assignmentPrefix+jobKey(job));
      }
    }
  };
  const planReceiptKey='budget-plan-pending-v1';
  const planDeliveryKey='budget-plan-delivery-v1';
  let activePlanSave;
  window.budgetPlanApi = {
    pending(){return JSON.parse(localStorage.getItem(planReceiptKey)||'null');},
    async read() {
      const rows=(await queueSheets(encodeURIComponent("'Decyzje budżetowe'!A2:B"))).values||[];
      const entries=new Map();
      const pending=this.pending();
      for(const [id,json] of rows){
        const entry=JSON.parse(json);entries.set(entry.id,entry);
        if(pending?.requestId===id && this.pending()?.requestId===id)localStorage.removeItem(planReceiptKey);
      }
      return {revision:rows.length,entries:[...entries.values()].filter(entry=>!entry.cancelled)};
    },
    async transfers() {
      const rows=(await queueSheets(encodeURIComponent("'Oszczednosci transfery DEV'!A2:F")+'?valueRenderOption=UNFORMATTED_VALUE')).values||[];
      return rows.filter(r=>/R2/.test(r[2])&&/R4/.test(r[3])).map(r=>{if(typeof r[1]==='number')r[1]=new Date((r[1]-25569)*86400000).toISOString().slice(0,10);return r;});
    },
    resume(request){
      const receipt=JSON.parse(localStorage.getItem(planDeliveryKey)||'null');
      return receipt?.requestId===request.requestId?this.save(request):null;
    },
    save(request,onQueued) {
      if(activePlanSave?.id===request.requestId)return activePlanSave.promise;
      const promise=this.deliver(request,onQueued).finally(()=>{
        if(activePlanSave?.id===request.requestId)activePlanSave=null;
      });
      activePlanSave={id:request.requestId,promise};return promise;
    },
    async deliver(request,onQueued) {
      const prior=this.pending();
      if(prior && prior.requestId!==request.requestId)throw Error('Najpierw sprawdź poprzedni zapis.');
      localStorage.setItem(planReceiptKey,JSON.stringify(request));
      let receipt=JSON.parse(localStorage.getItem(planDeliveryKey)||'null');
      if(receipt?.requestId!==request.requestId){
        const id=crypto.randomUUID();
        const res=await queueSheets(formSheet('A:C')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
          method:'POST',body:JSON.stringify({values:[[id,'budgetPlanV1',JSON.stringify([request])]]})});
        const row=Number(res.updates?.updatedRange?.match(/!A(\d+):C\d+$/)?.[1]);
        receipt={id,row,startedAt:Date.now(),requestId:request.requestId};
        localStorage.setItem(planDeliveryKey,JSON.stringify(receipt));
      }
      onQueued?.();
      try {
        const state=await waitForForm(receipt);
        if(this.pending()?.requestId===request.requestId)localStorage.removeItem(planReceiptKey);
        return state;
      }catch(error){
        if(error.confirmedRejection && this.pending()?.requestId===request.requestId)localStorage.removeItem(planReceiptKey);
        throw error;
      }
    }
  };
  const callBudgetFormQueued = async (caller, method, args) => {
    const frame=activeForm;
    if (!frame?.isConnected || caller!==frame.contentWindow || window.budgetViewerRole!=='owner' ||
        !formMethods[frame.dataset.form]?.includes(method)) throw Error('Brak dostępu do formularza.');
    if (method === 'krRefreshDEV') method = 'krGetDEV';
    if ((method==='ebListSectionsDev' || method==='ebQueueListDev') && !refreshEditor) {
      const snapshot=await phoneQueue();
      if (lastEditorData && Date.parse(snapshot.stamp)<lastEditorData.time) {
        await reconcileExpenseRows(lastEditorData.data.rows);
        return lastEditorData.data;
      }
      return snapshot.data;
    }
    const write=formWrites.has(method);
    if (write && localStorage.getItem(receiptKey)) throw Error('Poprzedni zapis czeka na potwierdzenie. Wróć do formularza i sprawdź jego wynik.');
    const id=crypto.randomUUID();
    formNotice.textContent='';
    if (write) localStorage.setItem(receiptKey,JSON.stringify({id,startedAt:Date.now()}));
    const res=await queueSheets(formSheet('A:C')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
      method:'POST',body:JSON.stringify({values:[[id,method,JSON.stringify(args)]]})
    });
    const row=Number(res.updates?.updatedRange?.match(/!A(\d+):C\d+$/)?.[1]);
    if (!row || row<2 || res.updates.updatedRows!==1) throw Error('Brak potwierdzenia. Sprawdź historię przed ponowieniem.');
    const receipt={id,row};
    if(write)localStorage.setItem(receiptKey,JSON.stringify(receipt));
    try {
      let data;
      if (method === 'krGetDEV') {
        const [manual, snapshot] = await Promise.all([waitForForm(receipt), phoneQueue()]);
        data = applyPublishedTargets(manual, snapshot.data);
        rememberChoices(data);
      } else {
        data = await waitForForm(receipt);
      }
      if(data?.revision && Array.isArray(data.rows) && Array.isArray(data.expenseSheets)){
        await reconcileExpenseRows(data.rows);
        lastEditorData={data,time:Date.now()};
      }
      if(method==='ebListSectionsDev')refreshEditor=false;
      if(method==='kzPostDevV1'){lastEditorData=null;refreshEditor=true;}
      if(write) { window.budgetDiagnosticMark('write-confirmed'); window.dispatchEvent(new Event('budget-assignment-saved')); }
      if(frame===activeForm)formNotice.textContent='';
      return data;
    }catch(error){if(frame===activeForm)formNotice.textContent=error.message;throw error;}
  };


  // Reuse a completed read, never a write. Saving still runs kzPreview/kzPost.
  const correctionReads = new Map();
  async function completedCorrectionRead(key) {
    const rows = (await queueSheets(formSheet('A2:E'))).values || [];
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'});
    for (let i=rows.length-1;i>=0;i--) {
      const [id,method,raw,status,stamp] = rows[i];
      // Any intervening mutation may invalidate the old allocation.
      if (formWrites.has(method)) return null;
      if (method!=='kzGetDevV1') continue;
      let args; try { args=JSON.parse(raw); } catch { continue; }
      if(args?.[0]?.key!==key) continue;
      if(status!=='OK' || !Number.isFinite(Date.parse(stamp)) ||
         today.format(new Date(stamp))!==today.format(new Date())) return null;
      const row=(await queueSheets(formSheet((i+2)+':'+(i+2)))).values?.[0] || [];
      if(row[0]!==id || row[3]!=='OK' || row[2]!==raw) return null;
      const bytes=Uint8Array.from(atob(row.slice(5).join('')),c=>c.charCodeAt(0));
      const data=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      if(!data || !Array.isArray(data.current) || !Number.isSafeInteger(data.amountCents) || data.version === null || data.version === undefined) return null;
      return {...data,cachedReadAt:stamp};
    }
    return null;
  }
  window.callBudgetForm = async (caller,method,args) => {
    const frame=activeForm;
    if(!frame?.isConnected || caller!==frame.contentWindow || window.budgetViewerRole!=='owner' ||
       !formMethods[frame.dataset.form]?.includes(method)) throw Error('Brak dostępu do formularza.');
    if(method!=='kzGetDevV1') return callBudgetFormQueued(caller,method,args);
    const key=args?.[0]?.key;
    if(typeof key!=='string' || !key) throw Error('Brak identyfikatora zakupu.');
    if(correctionReads.has(key)) return correctionReads.get(key);
    const task=(async()=>{
      if(!args[0].fresh) {
        try {
          const prior=await completedCorrectionRead(key);
          if(prior) {if(frame===activeForm)formNotice.textContent='';return prior;}
        } catch (_) { /* A failed cache read falls back to the verified queue. */ }
      }
      return callBudgetFormQueued(caller,method,[{key}]);
    })();
    correctionReads.set(key,task);
    try {return await task;} finally {if(correctionReads.get(key)===task)correctionReads.delete(key);}
  };

  function mountSettlementControl(root) {
    // showBudget checks getViewerRole on the server before installing this view.
    if (window.budgetViewerRole !== 'owner') return;
    const panel = document.createElement('section');
    panel.className = 'u47-control';
    panel.setAttribute('aria-label', 'Kontrola rozliczenia');
    panel.innerHTML = `<div class="u47-heading"><span>Kontrola rozliczenia</span></div>
      <div class="u47-result" role="status"><strong>—</strong><span>Sprawdzanie…</span></div>
      <div class="u47-footer"><time></time><button type="button" aria-label="Odśwież kontrolę rozliczenia">Odśwież</button></div>`;
    root.append(panel);
    const amount = panel.querySelector('strong');
    const status = panel.querySelector('.u47-result span');
    const time = panel.querySelector('time');
    const button = panel.querySelector('button');
    let dirty=false;
    async function read() {
      if (button.disabled){dirty=true;return;}
      dirty=false;
      button.disabled = true;
      panel.dataset.state = 'loading';
      status.textContent = 'Aktualizowanie…';
      try {
        const range = encodeURIComponent("'Wykonanie 2026'!U47");
        const result = await queueSheets(range + '?valueRenderOption=UNFORMATTED_VALUE');
        const value = result.values?.[0]?.[0];
        if (!Number.isFinite(value)) throw Error('Brak kwoty');
        if (!panel.isConnected) return;
        const cents = Math.sign(value) * Math.round(Math.abs(value) * 100);
        amount.textContent = new Intl.NumberFormat('pl-PL', {style:'currency',currency:'PLN'}).format((cents || 0) / 100);
        panel.dataset.state = cents === 0 ? 'ok' : 'difference';
        status.textContent = cents === 0 ? 'Rozliczenie zgodne' : 'Różnica do wyjaśnienia';
        const now = new Date();
        time.dateTime = now.toISOString();
        time.textContent = 'Odczyt ' + now.toLocaleString('pl-PL', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      } catch {
        panel.dataset.state = 'unknown';
        status.textContent = 'Brak aktualnych danych';
      } finally {
        button.disabled = false;
        if(dirty && panel.isConnected)read();
      }
    }
    button.onclick = read;
    panel.addEventListener('refresh-settlement',read);
    read();
  }

  function installAssignmentView() {
    const original = window.openAssignments_;
    window.openAssignments_ = function() {
      if (window.budgetViewerRole !== 'owner') return;
      original();
      const root = document.querySelector('#app .assignment-wrap');
      if (!root) return;
      root.replaceChildren();
      function make(tag,text) {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        return el;
      }
      const head = make('h1','Przypisz wydatki'), status = make('p'), list = make('section');
      status.setAttribute('role','status');
      const tabs = make('div'), pendingTab = make('button','Do przypisania'), historyTab = make('button','Historia'), refresh = make('button','Odśwież');
      tabs.className='assignment-filters';tabs.append(pendingTab,historyTab,refresh);
      const advanced = make('div');
      const links = make('div'); links.className='assignment-links';
      async function openForm(file,title,selection) {
        const panel=make('section'), back=make('button','← Przypisz'), notice=make('p');
        back.onclick=()=>window.openAssignments_();notice.setAttribute('role','status');notice.className='form-return-status';
        root.replaceChildren(panel);panel.append(back,notice);formNotice=notice;
        const prior=localStorage.getItem(receiptKey);
        if(prior){
          notice.textContent='Sprawdzam poprzedni zapis…';
          try{await waitForForm(JSON.parse(prior));notice.textContent='Poprzedni zapis potwierdzony.';}
          catch(err){notice.textContent=err.message;}
        }
        if(!panel.isConnected)return;
        const frame=make('iframe');frame.title=title;frame.dataset.form=file;
        const formURL=new URL('./'+file,location.href);
        if(selection){formURL.hash=new URLSearchParams(selection.mode?{entryKey:selection.key,entryMode:selection.mode,entryLabel:selection.label||''}:{newClothingKey:selection.key}).toString();}
        frame.src=formURL.href;
        frame.style.cssText='display:block;width:100%;height:calc(100dvh - 175px);min-height:320px;border:0';
        if(file==='manual-entry.html')manualPublished=state?.data;
        activeForm=frame;panel.append(frame);
      }
      for (const [file,title] of [['expense-editor.html','Podział, nowa pozycja lub korekta'],['manual-entry.html','Dodaj wydatek ręcznie']]) {
        const btn=make('button',title);btn.type='button';btn.onclick=()=>openForm(file,title);links.append(btn);
      }
      const modes=make('div'), expenses=make('button','Wydatki'), incomes=make('button','Wpływy');
      modes.className='assignment-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Rodzaj operacji');
      modes.append(expenses,incomes); advanced.append(links);root.append(head);
      mountSettlementControl(root);
      root.append(modes,tabs,status,list,advanced);
      const progressNote=make('p');
      progressNote.setAttribute('role','status');status.after(progressNote);
      function progress(){
        if(!root.contains(progressNote)){window.removeEventListener(assignmentEvent,progress);return;}
        const jobs=assignments();
        const waiting=jobs.filter(j=>!['error','confirmed'].includes(j.phase));
        progressNote.replaceChildren();
        if(waiting.length)progressNote.append(make('span','Zapisywanie w tle · '+waiting.length));
        const data=typeof dashboardData==='undefined'?null:dashboardData;
        if(data && window.expensePreview.base(data)!==null){
          const preview=BudgetPlan.available(data);
          if(preview!==null)progressNote.append(make('p','Wolne środki po przypisaniu · '+formatPLN(preview)+' (podgląd)'));
        }
        for(const j of jobs.filter(j=>j.phase==='error')){
          const line=make('p','Do sprawdzenia · '+j.label+' · '+j.message+' ');
          const review=make('button','Sprawdź');
          review.onclick=()=>j.method==='krSaveDEV'?openForm('manual-entry.html','Sprawdź wydatek ręczny'):openForm('expense-editor.html','Sprawdź przypisanie',{key:j.request.key,mode:'restore'});
          line.append(review);progressNote.append(line);
        }
        if(state && !income)pendingTab.textContent='Do przypisania · '+state.pending.filter(r=>!hiddenExpense(r.key)).length;
      }
      function hiddenExpense(key){const j=storedAssignment(key);return j && j.phase!=='error';}
      window.addEventListener(assignmentEvent,progress);
      function onConfirmed(event){
        if(!root.contains(progressNote)){window.removeEventListener('budget-assignment-saved',onConfirmed);return;}
        root.querySelector('.u47-control')?.dispatchEvent(new Event('refresh-settlement'));
        const seq=++generation;
        const read=event.detail?.snapshot?Promise.resolve(event.detail.snapshot):phoneQueue();
        read.then(next=>{
          if(seq!==generation || !root.contains(progressNote))return;
          state=next;render(true);followPosting(next);lastCountRead=0;refreshExpenseCount(next);
        }).catch(()=>{});
      }
      window.addEventListener('budget-assignment-saved',onConfirmed);
      let income=false;
      function switchMode(next) {
        if(saving || next===income)return;
        income=next;history=false;head.textContent=income?'Przypisz wpływy':'Przypisz wydatki';
        incomes.setAttribute('aria-pressed',String(income));expenses.setAttribute('aria-pressed',String(!income));
        advanced.hidden=income;
        if(state)render();
        if(!state || Date.now()-Date.parse(state.stamp)>120000)reload();
      }
      incomes.onclick=()=>switchMode(true);expenses.onclick=()=>switchMode(false);
      expenses.setAttribute('aria-pressed','true');incomes.setAttribute('aria-pressed','false');
      let state, history=false, saving=false, generation=0;
      function renderNotices() {
        const old = root.querySelector('.account-notice-list');
        if (old) old.remove();
        if (history) return;
        const notices = (state.data.bridge?.accountNoticesTEST || [])
          .filter(row => row.direction === (income ? 'CRDT' : 'DBIT'))
          .sort((a,b) => b.received.localeCompare(a.received));
        if (!notices.length) return;
        const section = make('details');
        section.className = 'account-notice-list';
        section.append(make('summary', 'Powiadomienia oczekujące na uzgodnienie · ' + notices.length));
        for (const row of notices) {
          const card = make('article');
          card.className = 'phone-expense';
          const amount = row.currency === 'PLN' && Number.isSafeInteger(row.amountCents) && row.amountCents > 0
            ? new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(row.amountCents/100) : '';
          card.append(make('strong',row.label),make('b',amount),make('small',row.date),
            make('p',row.status === 'OCZEKUJE NA POTWIERDZENIE API' ? 'Alert odebrany · oczekuje na uzgodnienie z bankiem' : 'Wymaga sprawdzenia'));
          if (row.account === 'R2' && row.currency === 'PLN' && row.date >= '2026-11-15' &&
              row.status === 'OCZEKUJE NA POTWIERDZENIE API' && /^[a-f0-9]{16}$/.test(row.id) &&
              Number.isSafeInteger(row.amountCents) && row.amountCents > 0) {
            const choose = make('button', income ? 'Przenieś do przypisania wpływów' : 'Przenieś do przypisania wydatków');
            choose.type = 'button';
            choose.onclick = async () => {
              if (choose.disabled || !window.confirm('Potwierdzasz operację zewnętrzną na ' + amount +
                '? Przelewy między własnymi kontami, wypłaty z bankomatu i spłaty karty rozlicza się osobno.')) return;
              choose.disabled = true;
              try {
                const path = encodeURIComponent("'Klasyfikacja alertów R2 TEST'!A:G");
                const values = [[row.id,row.date,row.direction,row.amountCents,row.account,row.currency,'EXTERNAL']];
                const ack = await queueSheets(path + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
                  {method:'POST',body:JSON.stringify({values})});
                if (ack.updates?.updatedRows !== 1) throw Error();
                choose.textContent = 'Przyjęto · oczekuje na synchronizację';
              } catch {
                choose.disabled = false;
                choose.textContent = 'Brak potwierdzenia · ponów';
              }
            };
            card.append(choose);
          }
          section.append(card);
        }
        list.after(section);
      }
      function render(keepEditors=false) {
        if (!state || !root.isConnected) return;
        const editors=keepEditors && !income && !history
          ? new Map(Array.from(list.querySelectorAll('[data-expense-key]'),card=>[card.dataset.expenseKey,card])) : new Map();
        list.replaceChildren();
        renderNotices();
        if(income){progress();renderIncome();return;}
        const pending = new Set(state.pending);
        const saved = state.rows.filter(r=>!pending.has(r));
        pendingTab.textContent='Do przypisania · '+pending.size;
        historyTab.textContent='Historia · '+saved.length;
        pendingTab.setAttribute('aria-pressed',String(!history));historyTab.setAttribute('aria-pressed',String(history));
        const visible = history?saved:state.pending.filter(r=>!hiddenExpense(r.key));
        progress();
        if (!visible.length) list.append(make('p',history?'Historia jest pusta.':'Brak kolejnych wydatków do przypisania.'));
        const pickerMonths=new Map();
        for (const row of visible.slice().sort((a,b)=>b.date.localeCompare(a.date))) {
          if(editors.has(row.key)){list.append(editors.get(row.key));continue;}
          const card=make('article'), command=state.byKey.get(row.key);
          if(!history)card.dataset.expenseKey=row.key;
          card.className='phone-expense';
          card.append(make('strong',row.description), make('b',new Intl.NumberFormat('pl-PL',{style:'currency',currency:row.currency||'PLN',useGrouping:true}).format(row.amountCents/100)), make('small',[row.date,row.accountLabel||row.account||row.sourceLabel].filter(Boolean).join(' · ')));
          if(history) {
            card.append(make('p',row.postedEvidence?'Zaksięgowano':row.bridgeBlocked==='XTB_PENDING_MATCH'?'Oczekuje na uzgodnienie z wpłatą XTB z maila':row.bridgeBlocked?'Do sprawdzenia':row.decision?.action==='DEFER'?'Odłożone':'Oczekuje na zaksięgowanie'));
            const category=row.decision?.sheetName || command?.request.sheetName;
            if(category)card.append(make('small',category));
          } else {
            if(command?.result)card.append(make('p',command.result));
            const category=make('select'),target=make('select'),save=make('button','Zapisz przypisanie');
            category.setAttribute('aria-label','Kategoria');target.setAttribute('aria-label','Pozycja budżetu');
            category.add(new Option('Wybierz kategorię',''));
            for(const sheet of state.data.expenseSheets)category.add(new Option(sheet.replace(/^T\d+\s+/,''),sheet));
            const trip=make('select'),addTrip=tripCreator();
            trip.setAttribute('aria-label','Wyjazd');trip.hidden=true;addTrip.hidden=true;
            category.onchange=()=>{
              trip.hidden=true;addTrip.hidden=true;
              if(/^T12\b/.test(category.value)){
                target.disabled=true;save.disabled=true;
                openForm('expense-editor.html','Nowe ubranie lub prezent',{key:row.key});
                return;
              }
              target.replaceChildren(new Option('Wybierz pozycję',''));
              for(const t of state.data.existingRows.filter(t=>t.sheet===category.value&&t.month===row.date.slice(0,7)))
                target.add(new Option([t.sectionName,t.label].filter(Boolean).join(' · '),t.key));
              if(category.value===travelSheet){
                const options=state.data.existingRows.filter(t=>t.sheet===travelSheet&&t.month===row.date.slice(0,7));
                const groups=[...new Set(options.filter(t=>{
                  const num=Number(t.key.split('|')[2]);
                  return num>20 && num<86 && /^\d+\)/.test(t.sectionName) && !/\)\s*XXX$/i.test(t.sectionName);
                }).map(t=>t.sectionName))];
                trip.replaceChildren(new Option('Wszystkie pozycje',''));
                groups.forEach(g=>trip.add(new Option(g.replace(/^\d+\)\s*/,''),g)));
                trip.value='';trip.hidden=false;addTrip.hidden=false;
                trip.onchange=()=>{
                  const filtered=options.filter(t=>!trip.value||t.sectionName===trip.value);
                  target.replaceChildren(new Option('Wybierz pozycję',''));
                  filtered.forEach(t=>target.add(new Option(t.label,t.key)));
                  if(trip.value && filtered.length===1)target.value=filtered[0].key;
                  target.disabled=!filtered.length;save.disabled=!target.value;
                };
              }
              target.disabled=target.length<=1; save.disabled=true;
            };
            category.onchange();target.onchange=()=>save.disabled=!target.value;
            save.onclick=()=>{
              if(!target.value)return;
              const req={key:row.key,date:row.date,amountCents:row.amountCents,sheetName:category.value,targetManualKey:target.value};
              try{submitAssignment('ASSIGN_V1',req,row,state.data,null);card.remove();progress();}
              catch(error){status.textContent=error.message;}
            };
            const previous=storedAssignment(row.key);
            if(previous?.phase==='error' && previous.method==='ASSIGN_V1'){
              category.value=previous.request.sheetName;category.onchange();
              target.value=previous.request.targetManualKey;target.onchange();
            }
            const tools=make('details');tools.className='pick-tools';tools.append(make('summary','Wybór według kategorii'),category,trip,addTrip,target);
            const split=make('div');split.className='split-toggle';const no=make('button','Nie'),yes=make('button','Tak');
            no.setAttribute('aria-pressed','true');yes.setAttribute('aria-pressed','false');
            split.append(make('span','Podzielić wydatek?'),no,yes);
            yes.onclick=()=>openForm('expense-editor.html','Podział wydatku',{key:row.key,mode:'split'});
            const pick=make('button','Wybierz pozycję');pick.className='pick-open';
            const freshItem=label=>openForm('expense-editor.html','Nowa pozycja',{key:row.key,mode:'new',label});
            const month=row.date.slice(0,7);
            if(!pickerMonths.has(month))pickerMonths.set(month,BudgetPicker.index(state.data.existingRows,month));
            const items=pickerMonths.get(month),hints=BudgetPicker.recommendations(items,state.rows,row.description);
            const shortcut=hints.suggested[0];
            let quick;
            function selectItem(item){
              category.value=item.sheet;trip.hidden=true;addTrip.hidden=true;
              target.replaceChildren(new Option(item.label,item.key));target.value=item.key;
              target.disabled=false;save.disabled=false;pick.textContent=item.label.replace(/^[-\s]+/,'');
              if(quick)quick.hidden=true;
            }
            pick.onclick=()=>BudgetPicker.open(items,hints,selectItem,freshItem);
            category.addEventListener('change',()=>{pick.textContent='Wybierz pozycję';if(quick)quick.hidden=true;});
            card.append(split);
            if(shortcut && !previous){
              quick=make('button','Przypisz do: '+shortcut.label.replace(/^[-\s]+/,''));quick.className='pick-quick';
              quick.onclick=()=>{selectItem(shortcut);save.click();};card.append(quick);pick.textContent='Wybierz inną';
            }
            card.append(pick,tools);
            if(row.currency==='PLN' && /\bXTB\b/i.test(row.description)){
              const group=make('div');group.className='split-toggle';
              for(const [label,caption] of [['ETF Julka','Julka'],['ETF Olek','Olek'],['XTB ETF po połowie','Po połowie']]){
                const position=state.data.existingRows.find(t=>t.month===row.date.slice(0,7) &&
                  t.sheet==='T4 Finansowe' && t.label==='Kapitał na start dzieci – '+label);
                if(!position)continue;
                const choice=make('button','Oszczędności · '+caption);
                choice.onclick=()=>{category.value=position.sheet;category.onchange();
                  target.value=position.key;target.onchange();pick.textContent=position.label;};
                group.append(choice);
              }
              if(group.childElementCount)card.append(group);
            }
            card.append(save);
          }
          list.append(card);
        }
      }
      function renderIncome() {
        const data=state.data.income;
        if(!data){pendingTab.textContent='Do przypisania';historyTab.textContent='Zapisane';list.append(make('p','Oczekiwanie na odczyt wpływów. Odśwież po następnym cyklu.'));return;}
        const unreflected=row=>!row.decision && incomeReceiptActive(state.incomeCommands.get(row.key));
        const pending=pendingIncome(state);
        const saved=data.rows.filter(row=>row.settledRedemption||row.decision||unreflected(row));
        pendingTab.textContent='Do przypisania · '+pending.length;historyTab.textContent='Zapisane · '+saved.length;
        pendingTab.setAttribute('aria-pressed',String(!history));historyTab.setAttribute('aria-pressed',String(history));
        const visible=history?saved:pending;
        if(!visible.length)list.append(make('p',history?'Brak zapisanych wpływów.':'Brak wpływów do przypisania.'));
        for(const row of visible) {
          const card=make('article'), command=state.incomeCommands.get(row.key);
          card.className='phone-expense';list.append(card);
          card.append(make('strong',row.merchant),make('b',new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(row.amountCents/100)),make('small',row.date+' · '+row.account));
          if(row.settledRedemption){card.append(make('p','Wykup obligacji · rozliczono'));continue;}
          if(unreflected(row) || (command && !command.result)){
            card.append(make('p',command.result==='OK'?'Przypisanie potwierdzone':'Oczekuje na potwierdzenie'),make('small',command.request.sheetName+' · '+command.request.description));continue;
          }
          if(command?.result?.startsWith('Błąd'))card.append(make('p',command.result));
          if(row.decision)card.append(make('p',row.decision.sheetName+' · '+row.decision.description));
          const form=make('details');form.style.gridColumn='1 / -1';card.append(form);
          form.append(make('summary',row.decision?'Zmień przypisanie':'Przypisz wpływ'));
          const category=make('select'),desc=make('input'),save=make('button','Zapisz przypisanie');
          category.setAttribute('aria-label','Rodzaj wpływu');desc.setAttribute('aria-label','Opis wpływu');desc.placeholder='Czego dotyczy wpływ?';desc.maxLength=200;
          category.add(new Option('Wybierz kategorię',''));
          for(const name of data.categories)category.add(new Option(name.replace(/^T\d+\s+/,''),name));
          category.value=row.decision?.sheetName||'';desc.value=row.decision?.description||'';
          const validate=()=>save.disabled=saving||!category.value||!desc.value.trim();
          category.onchange=validate;desc.oninput=validate;validate();form.append(category,desc,save);
          save.onclick=async()=>{
            if(saving||!category.value||!desc.value.trim())return;
            saving=true;save.disabled=true;
            const req={key:row.key,account:row.account,date:row.date,amountCents:row.amountCents,previous:row.decision||null,sheetName:category.value,description:desc.value.trim()};
            try {
              const receipt=await queueSheets(queueRange('A2:D')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',body:JSON.stringify({values:[['INCOME_V1',crypto.randomUUID(),JSON.stringify(req)]]})});
              if(receipt.updates?.updatedRows!==1)throw Error();
                window.dispatchEvent(new Event('budget-assignment-saved'));
              saving=false;history=true;await reload('Przyjęto decyzję do sprawdzenia w następnym cyklu.');
            } catch {saving=false;await reload('Sprawdź historię przed ponowieniem zapisu.');}
          };
        }
      }
      let postingTimer;
      function followPosting(snapshot) {
        clearTimeout(postingTimer);
        const waiting=snapshot.rows.some(row=>{
          const command=snapshot.byKey.get(row.key);
          return command && !command.result?.startsWith('Błąd') && !row.postedEvidence &&
            !row.bridgeBlocked && row.decision?.action!=='DEFER';
        });
        if(!waiting || !root.isConnected)return;
        const seq=generation;
        postingTimer=setTimeout(async()=>{
          if(seq!==generation || !root.isConnected)return;
          if(document.hidden || saving){followPosting(snapshot);return;}
          try{
            const fresh=await phoneQueue();
            if(seq!==generation || !root.isConnected)return;
            const posted=fresh.rows.some(row=>row.postedEvidence &&
              snapshot.byKey.has(row.key) && !snapshot.rows.find(old=>old.key===row.key)?.postedEvidence);
            if(posted){
              window.dispatchEvent(new CustomEvent('budget-assignment-saved',{detail:{snapshot:fresh}}));
              status.textContent='Koszt zaksięgowany.';
              return;
            }
            state=fresh;render(true);followPosting(fresh);
          } catch {if(seq===generation)followPosting(snapshot);}
        },5000);
      }
      async function reload(message) {
        const seq=++generation;status.textContent='Pobieranie kolejki…';
        try {
          const next=await phoneQueue();if(seq!==generation||!root.isConnected)return;
          state=next;render();followPosting(next);root.querySelector('.u47-control')?.dispatchEvent(new Event('refresh-settlement'));window.budgetDiagnosticMark('queue-current');status.textContent=message||'Stan kolejki z '+new Date(state.stamp).toLocaleString('pl-PL');
          lastCountRead=0;refreshExpenseCount(next);
        }catch(e){
          if(seq!==generation || !root.isConnected)return;
          console.warn('Assignment queue refresh failed',e);
          status.textContent=state?'Nie udało się odświeżyć. Ostatni odczyt: '+new Date(state.stamp).toLocaleString('pl-PL')+'.':'Nie udało się wczytać listy. Wybierz „Odśwież”, aby spróbować ponownie.';
        }
      }
      refresh.onclick=()=>{if(!saving)reload();};pendingTab.onclick=()=>{history=false;render();};historyTab.onclick=()=>{history=true;render();};
      reload();
    };
  }
  let countBusy = false;
  let lastCountRead = 0;
  async function refreshExpenseCount(publishedSnapshot) {
    const badge = document.getElementById('pending-count');
    if (!badge || window.budgetViewerRole !== 'owner' || !gate.hidden ||
        document.hidden || countBusy || Date.now() - lastCountRead < 4000) return;
    countBusy = true;
    lastCountRead = Date.now();
    const tab = badge.closest('button');
    try {
      const snapshot = publishedSnapshot?.pending ? publishedSnapshot : await phoneQueue();
      const {stamp} = snapshot;
      if(Date.now()-Date.parse(stamp)>20*60000)throw Error();
      const count=snapshot.pending.filter(r=>{const j=storedAssignment(r.key);return !j||j.phase==='error';}).length + pendingIncome(snapshot).length;
      badge.textContent = String(count);
      badge.hidden = count === 0;
      tab.setAttribute('aria-label','Przypisz. Operacje do przypisania: ' + count);
      tab.title = 'Operacje do przypisania: ' + count + ' · stan z ' + new Date(stamp).toLocaleTimeString('pl-PL');
    } catch (_) {
      badge.hidden = false;
      badge.textContent = '…';
      tab.title = 'Aktualna liczba operacji niedostępna';
      tab.setAttribute('aria-label','Przypisz. ' + tab.title);
    } finally { countBusy = false; }
  }
  function startBudgetApp() {
    mountDiagnostics();
    gate.hidden=true;
    document.documentElement.classList.remove('budget-locked');
    if(!started) {
      started=true;
      const artwork = document.createElement('link');
      artwork.rel = 'stylesheet';
      artwork.href = './category-art-test.css';
      document.head.append(artwork);
      const app=document.createElement('script');
      app.textContent=document.getElementById('budget-app-source').textContent;
      document.body.append(app);
      installAssignmentView();
      prepareTestNavigation();
      document.addEventListener('visibilitychange',refreshExpenseCount);
      window.addEventListener('focus',refreshExpenseCount);
      window.addEventListener('pageshow',refreshExpenseCount);
      setInterval(refreshExpenseCount,60000);
    }
  }
  async function showBudget() {
    // The backend checks the signed-in owner before any private snapshot is shown.
    const role=await rpc('getViewerRole',[]);
    if(role!=='owner' && role!=='viewer') throw Error('To konto nie ma dostępu do tego wdrożenia.');
    window.budgetViewerRole = role;
    const now=new Date();
    let cached=null;
    try {
      if(localStorage.getItem(cacheKey)===testFileId &&
         localStorage.getItem(verifiedKey)===testFileId) {
        const snapshot=JSON.parse(localStorage.getItem('budzet-last-dashboard-v1')||'null');
        if(snapshot && snapshot.data &&
           Number(snapshot.data.year)===now.getFullYear() &&
           Number(snapshot.data.monthNumber)===now.getMonth()+1 &&
           Array.isArray(snapshot.data.categories)) cached=snapshot.data;
      }
    }catch(_){}
    // The app renders this verified snapshot immediately and its existing startup
    // routine checks for a newer bank cycle in the background.
    if(cached) { startBudgetApp(); refreshExpenseCount(); return; }
    status.textContent='Pobieranie danych budżetu…';
    const fresh=await rpc('getBudgetDataFresh',[now.getFullYear(),now.getMonth()+1]);
    if(!fresh || !Array.isArray(fresh.categories) || Number(fresh.year)!==now.getFullYear() || Number(fresh.monthNumber)!==now.getMonth()+1)
      throw Error('Serwer nie zwrócił danych za bieżący miesiąc.');
    const stamp=Date.now();
    try {
      if(localStorage.getItem(cacheKey)!==testFileId) {
        for(const key of ['budzet-last-dashboard-v1','budzet-month-dashboard-cache-v1','budzet-category-details-v1','budzet-last-refresh-state-v1','budzet-pwa-dashboard-cache-v1','budzet-pwa-month-cache-v1','budzet-pwa-category-cache-v1','budzet-pwa-refresh-state-v1']) localStorage.removeItem(key);
        const runtime=await caches.open('budzet-rodzinny-runtime-v8');
        for(const path of ['./__budget_runtime_v10__.json','./__budget_runtime_v8__.json']) await runtime.delete(new URL(path,location.href).href);
      }
      localStorage.setItem('budzet-last-dashboard-v1',JSON.stringify({timestamp:stamp,data:fresh}));
      localStorage.setItem(verifiedKey,testFileId);
      localStorage.setItem(cacheKey,testFileId);
    } catch (_) { /* Private mode can deny local storage. Current result still renders. */ }
    window.budgetStartupSnapshot = fresh.sync;
    startBudgetApp();
    refreshExpenseCount();
  }
  function report(error){lock(error.message);button.disabled=false;}
  async function chooseFile(){
    if(!window.gapi)await script('https://apis.google.com/js/api.js');
    await new Promise((ok,fail)=>window.gapi.load('picker',{callback:ok,onerror:fail,timeout:15000,ontimeout:fail}));
    const p=window.google.picker;
    new p.PickerBuilder().setAppId('346154367588').setDeveloperKey('AIzaSyBCaybFVVbdmHD7k15icRep3CrYouw7I58').setOAuthToken(token)
      .setOrigin(location.origin).addView(new p.DocsView(p.ViewId.SPREADSHEETS).setFileIds(testFileId))
      .setCallback(async e=>{
        if(e.action===p.Action.CANCEL){status.textContent='Nie wybrano arkusza.';return;}
        if(e.action!==p.Action.PICKED)return;
        const selected=e.docs?.[0];
        if(!selected?.id){report(Error('Google nie zwrócił identyfikatora wybranego arkusza.'));return;}
        if(selected.id!==testFileId){
          report(Error('Wybrano inny plik. Wybierz arkusz budżetu rodzinnego.'));
          return;
        }
        try{
          status.textContent='Sprawdzanie dostępu do wybranego arkusza…';
          const check=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(selected.id)+'?fields=id,name,mimeType',
            {headers:{Authorization:'Bearer '+token},cache:'no-store'});
          if(!check.ok)throw Error('Google Drive nie przyznał aplikacji dostępu do wybranego arkusza (HTTP '+check.status+').');
          const file=await check.json();
          if(file.id!==testFileId)throw Error('Odpowiedź Google Drive dotyczy innego arkusza.');
          // The exact file was checked with Drive; remember this grant even if the budget API is temporarily unavailable.
          try { localStorage.setItem(verifiedKey,testFileId); } catch (_) {}
          status.textContent='Otwieranie budżetu…';
          await showBudget();
        }catch(err){report(err);}
      }).build().setVisible(true);
  }
  gate.querySelector('[data-file]').onclick=()=>{
    status.textContent='Otwieranie wyboru arkusza…';
    chooseFile().catch(err=>report(Error(err?.message||'Nie udało się otworzyć wyboru arkusza.')));
  };
  lock('Łączenie z Google…');
  // A valid session can verify access without waiting for the login UI library.
  const startupSessionRestored = restoreSession() && remembered();
  if (startupSessionRestored) {
    gate.querySelector('[data-file]').hidden=true;
    status.textContent='Otwieranie budżetu…';
    showBudget().catch(err=>{clearSession();token='';report(err);});
  }
  script('https://accounts.google.com/gsi/client').then(()=>{
    client=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',include_granted_scopes:false,
      error_callback:()=>lock('Logowanie zostało przerwane. Możesz spróbować ponownie.'),
      callback:async result=>{
        if(result.error || !result.access_token){lock('Google nie udzielił dostępu.');return;}
        token=result.access_token;expires=Date.now()+(Number(result.expires_in)-30)*1000;rememberSession();
        status.textContent='Sprawdzanie dostępu…';
        try {
          // The exact file grant was verified on first selection. A returning
          // owner can open the cached dashboard without a redundant Drive call.
          if(remembered()) {
            gate.querySelector('[data-file]').hidden=true;
            await showBudget();
            return;
          }
          const check=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(testFileId)+'?fields=id,name',
            {headers:{Authorization:'Bearer '+token},cache:'no-store'});
          if(check.ok && (await check.json()).id===testFileId) {
            try { localStorage.setItem(verifiedKey,testFileId); } catch (_) {}
            gate.querySelector('[data-file]').hidden=true;
            await showBudget();
          } else {
            gate.querySelector('[data-file]').hidden=false;
            status.textContent='Wybierz arkusz budżetu.';
          }
        } catch(err) { report(err); }
      }});
    // Google requires a user gesture for browser token authorization on iOS.
    button.onclick=()=>{
      button.disabled=true;
      client.requestAccessToken({prompt: remembered() ? '' : 'select_account'});
    };
    if (!startupSessionRestored) {
      lock('Dotknij „Zaloguj przez Google”, aby otworzyć prywatny budżet.');
    } else {
      button.disabled=false;
    }
  }).catch(error=>{
    // Failure of the login UI must not hide an already authorized session.
    if (!token || Date.now() >= expires) report(error);
  });
})();




