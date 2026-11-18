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
  async function rpcRequest(method,args) {
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
  async function queueSheetsRequest(path, options = {}) {
    if (window.budgetViewerRole !== 'owner' || !token || Date.now() >= expires)
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
          const updated = applySchedules(debtData_, loadedSchedules);
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
  async function readPhoneQueue() {
    const [snapshot, commands] = await Promise.all([queueSheets(queueRange('1:1')),queueSheets(queueRange('A2:D'))]);
    const [tag, stamp, parts, ...chunks] = snapshot.values[0];
    if (tag !== 'QUEUE_V1' || !Number.isInteger(+parts) || +parts < 1 || chunks.length < +parts)
      throw Error('Niepełny odczyt kolejki.');
    const bytes = Uint8Array.from(atob(chunks.slice(0,+parts).join('')), c => c.charCodeAt(0));
    const data = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
    const byKey = new Map(), incomeCommands = new Map();
    for (const [kind,id,body,result] of commands.values || []) {
      if (kind === 'ASSIGN_V1' || kind === 'INCOME_V1') {
        const request = JSON.parse(body);
        (kind === 'INCOME_V1' ? incomeCommands : byKey).set(request.key,{request,result});
      }
    }
    const rows = data.rows.filter(r => !r.bridgeArchived);
    const pending = rows.filter(r => !r.decision && !r.postedEvidence && !r.bridgeBlocked &&
      (!byKey.has(r.key) || byKey.get(r.key).result?.startsWith('Błąd')));
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
      return !row.decision && (!command || Boolean(command.result));
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
        if (status === 'ERROR') throw Error(chunks[0] || 'Zapis wymaga sprawdzenia.');
        const bytes = Uint8Array.from(atob(chunks.join('')), c=>c.charCodeAt(0));
        return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      }
      await new Promise(resolve=>setTimeout(resolve,4500));
    }
    throw Error('Brak potwierdzenia. Wróć do formularza, aby sprawdzić wynik.');
  }
  const callBudgetFormQueued = async (caller, method, args) => {
    const frame=activeForm;
    if (!frame?.isConnected || caller!==frame.contentWindow || window.budgetViewerRole!=='owner' ||
        !formMethods[frame.dataset.form]?.includes(method)) throw Error('Brak dostępu do formularza.');
    if (method === 'krRefreshDEV') method = 'krGetDEV';
    if ((method==='ebListSectionsDev' || method==='ebQueueListDev') && !refreshEditor) {
      const snapshot=await phoneQueue();
      if (lastEditorData && Date.parse(snapshot.stamp)<lastEditorData.time) return lastEditorData.data;
      return snapshot.data;
    }
    const write=formWrites.has(method);
    if (write && localStorage.getItem(receiptKey)) throw Error('Poprzedni zapis czeka na potwierdzenie. Wróć do formularza i sprawdź jego wynik.');
    const id=crypto.randomUUID();
    formNotice.textContent=write?'Przekazuję zapis do TEST…':'Pobieram dane formularza…';
    if (write) localStorage.setItem(receiptKey,JSON.stringify({id,startedAt:Date.now()}));
    const res=await queueSheets(formSheet('A:C')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
      method:'POST',body:JSON.stringify({values:[[id,method,JSON.stringify(args)]]})
    });
    const row=Number(res.updates?.updatedRange?.match(/!A(\d+):C\d+$/)?.[1]);
    if (!row || row<2 || res.updates.updatedRows!==1) throw Error('Brak potwierdzenia. Sprawdź historię przed ponowieniem.');
    const receipt={id,row};
    if(write)localStorage.setItem(receiptKey,JSON.stringify(receipt));
    formNotice.textContent='Oczekiwanie na wynik z TEST…';
    try {
      let data;
      if (method === 'krGetDEV') {
        const [manual, snapshot] = await Promise.all([waitForForm(receipt), phoneQueue()]);
        data = applyPublishedTargets(manual, snapshot.data);
      } else {
        data = await waitForForm(receipt);
      }
      if(data?.revision && Array.isArray(data.rows) && Array.isArray(data.expenseSheets))lastEditorData={data,time:Date.now()};
      if(method==='ebListSectionsDev')refreshEditor=false;
      if(method==='kzPostDevV1'){lastEditorData=null;refreshEditor=true;}
      if(write) window.dispatchEvent(new Event('budget-assignment-saved'));
      if(frame===activeForm)formNotice.textContent=write?'Zapis potwierdzony.':'';
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
    panel.innerHTML = `<div class="u47-heading"><span>Kontrola rozliczenia</span><small>U47</small></div>
      <div class="u47-result" role="status"><strong>—</strong><span>Sprawdzanie…</span></div>
      <div class="u47-footer"><time></time><button type="button" aria-label="Odśwież kontrolę U47">Odśwież</button></div>`;
    root.append(panel);
    const amount = panel.querySelector('strong');
    const status = panel.querySelector('.u47-result span');
    const time = panel.querySelector('time');
    const button = panel.querySelector('button');
    async function read() {
      if (button.disabled) return;
      button.disabled = true;
      panel.dataset.state = 'loading';
      amount.textContent = '—';
      status.textContent = 'Sprawdzanie…';
      time.textContent = '';
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
      }
    }
    button.onclick = read;
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
      tabs.append(pendingTab,historyTab,refresh);
      const advanced = make('div');
      const links = make('div'); links.className='assignment-links';
      async function openForm(file,title) {
        const panel=make('section'), back=make('button','← Przypisz'), notice=make('p');
        back.onclick=()=>window.openAssignments_();notice.setAttribute('role','status');
        root.replaceChildren(panel);panel.append(back,notice);formNotice=notice;
        const prior=localStorage.getItem(receiptKey);
        if(prior){
          notice.textContent='Sprawdzam poprzedni zapis…';
          try{await waitForForm(JSON.parse(prior));notice.textContent='Poprzedni zapis potwierdzony.';}
          catch(err){notice.textContent=err.message;}
        }
        if(!panel.isConnected)return;
        const frame=make('iframe');frame.title=title;frame.dataset.form=file;frame.src='./'+file;
        frame.style.cssText='display:block;width:100%;height:calc(100dvh - 175px);min-height:320px;border:0';
        activeForm=frame;panel.append(frame);
      }
      for (const [file,title] of [['expense-editor.html','Podział, nowa pozycja lub korekta'],['manual-entry.html','Dodaj wydatek ręcznie']]) {
        const btn=make('button',title);btn.type='button';btn.onclick=()=>openForm(file,title);links.append(btn);
      }
      const modes=make('div'), expenses=make('button','Wydatki'), incomes=make('button','Wpływy');
      modes.append(expenses,incomes); advanced.append(links);root.append(head);
      mountSettlementControl(root);
      root.append(modes,tabs,status,list,advanced);
      let income=false;
      function switchMode(next) {
        if(saving)return;
        income=next;history=false;head.textContent=income?'Przypisz wpływy':'Przypisz wydatki';
        incomes.setAttribute('aria-pressed',String(income));expenses.setAttribute('aria-pressed',String(!income));
        advanced.hidden=income;list.replaceChildren();reload();
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
      function render() {
        if (!state || !root.isConnected) return;
        list.replaceChildren();
        renderNotices();
        if(income){renderIncome();return;}
        const pending = new Set(state.pending);
        const saved = state.rows.filter(r=>!pending.has(r));
        pendingTab.textContent='Do przypisania · '+pending.size;
        historyTab.textContent='Historia · '+saved.length;
        pendingTab.setAttribute('aria-pressed',String(!history));historyTab.setAttribute('aria-pressed',String(history));
        const visible = history?saved:state.pending;
        if (!visible.length) list.append(make('p',history?'Historia jest pusta.':'Wszystkie wydatki są przypisane.'));
        for (const row of visible.slice().sort((a,b)=>b.date.localeCompare(a.date))) {
          const card=make('article'), command=state.byKey.get(row.key);
          card.className='phone-expense';
          card.append(make('strong',row.description), make('b',new Intl.NumberFormat('pl-PL',{style:'currency',currency:row.currency||'PLN'}).format(row.amountCents/100)), make('small',row.date));
          if(history) {
            card.append(make('p',row.postedEvidence?'Zaksięgowano':row.bridgeBlocked?'Do sprawdzenia':row.decision?.action==='DEFER'?'Odłożone':'Oczekuje na zaksięgowanie'));
            const category=row.decision?.sheetName || command?.request.sheetName;
            if(category)card.append(make('small',category));
          } else {
            if(command?.result)card.append(make('p',command.result));
            const category=make('select'),target=make('select'),save=make('button','Zapisz przypisanie');
            category.setAttribute('aria-label','Kategoria');target.setAttribute('aria-label','Pozycja budżetu');
            category.add(new Option('Wybierz kategorię',''));
            for(const sheet of state.data.expenseSheets)category.add(new Option(sheet.replace(/^T\d+\s+/,''),sheet));
            category.onchange=()=>{
              target.replaceChildren(new Option('Wybierz pozycję',''));
              for(const t of state.data.existingRows.filter(t=>t.sheet===category.value&&t.month===row.date.slice(0,7)))
                target.add(new Option([t.sectionName,t.label].filter(Boolean).join(' · '),t.key));
              target.disabled=target.length<=1; save.disabled=true;
            };
            category.onchange();target.onchange=()=>save.disabled=!target.value;
            save.onclick=async()=>{
              if(saving||!target.value)return;
              saving=true;save.disabled=true;status.textContent='Zapisywanie przypisania…';
              const req={key:row.key,date:row.date,amountCents:row.amountCents,sheetName:category.value,targetManualKey:target.value};
              try{
                const receipt=await queueSheets(queueRange('A2:D')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
                  method:'POST',body:JSON.stringify({values:[['ASSIGN_V1',crypto.randomUUID(),JSON.stringify(req)]]})
                });
                if(receipt.updates?.updatedRows!==1)throw Error();
                window.dispatchEvent(new Event('budget-assignment-saved'));
                await reload('Przypisanie zapisane. Automat sprawdzi je przy następnym odczycie.');
              } catch { await reload('Sprawdź listę i historię przed ponowieniem zapisu.'); }
              finally{saving=false;}
            };
            card.append(category,target,save);
          }
          list.append(card);
        }
      }
      function renderIncome() {
        const data=state.data.income;
        if(!data){pendingTab.textContent='Do przypisania';historyTab.textContent='Zapisane';list.append(make('p','Oczekiwanie na odczyt wpływów. Odśwież po następnym cyklu.'));return;}
        const waiting=row=>{const cmd=state.incomeCommands.get(row.key);return cmd && !cmd.result;};
        const pending=pendingIncome(state);
        const saved=data.rows.filter(row=>row.decision||waiting(row));
        pendingTab.textContent='Do przypisania · '+pending.length;historyTab.textContent='Zapisane · '+saved.length;
        pendingTab.setAttribute('aria-pressed',String(!history));historyTab.setAttribute('aria-pressed',String(history));
        const visible=history?saved:pending;
        if(!visible.length)list.append(make('p',history?'Brak zapisanych wpływów.':'Brak wpływów do przypisania.'));
        for(const row of visible) {
          const card=make('article'), command=state.incomeCommands.get(row.key);
          card.className='phone-expense';list.append(card);
          card.append(make('strong',row.merchant),make('b',new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(row.amountCents/100)),make('small',row.date+' · '+row.account));
          if(waiting(row)){card.append(make('p','Oczekuje na potwierdzenie'),make('small',command.request.sheetName+' · '+command.request.description));continue;}
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
      async function reload(message) {
        const seq=++generation;status.textContent='Pobieranie kolejki…';
        try {
          const next=await phoneQueue();if(seq!==generation||!root.isConnected)return;
          state=next;render();status.textContent=message||'Stan kolejki z '+new Date(state.stamp).toLocaleString('pl-PL');
          lastCountRead=0;refreshExpenseCount(next);
        }catch(e){if(seq===generation){list.replaceChildren();root.querySelector('.account-notice-list')?.remove();state=null;status.textContent=e.message;}}
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
      const count=snapshot.pending.length + pendingIncome(snapshot).length;
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
    status.textContent='Pobieranie aktualnych danych z TEST…';
    const fresh=await rpc('getBudgetDataFresh',[now.getFullYear(),now.getMonth()+1]);
    if(!fresh || !Array.isArray(fresh.categories) || Number(fresh.year)!==now.getFullYear() || Number(fresh.monthNumber)!==now.getMonth()+1)
      throw Error('Serwer nie zwrócił bieżącego miesiąca z arkusza TEST.');
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
          report(Error('Wybrano inny plik. Wybierz dokładnie „Budżet 2026 — TEST automat karty”.'));
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
          status.textContent='Arkusz TEST został rozpoznany; łączenie z budżetem…';
          await showBudget();
        }catch(err){report(err);}
      }).build().setVisible(true);
  }
  gate.querySelector('[data-file]').onclick=()=>{
    status.textContent='Otwieranie wyboru arkusza…';
    chooseFile().catch(err=>report(Error(err?.message||'Nie udało się otworzyć wyboru arkusza.')));
  };
  lock('Łączenie z Google…');
  script('https://accounts.google.com/gsi/client').then(()=>{
    client=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',include_granted_scopes:false,
      error_callback:()=>lock('Logowanie zostało przerwane. Możesz spróbować ponownie.'),
      callback:async result=>{
        if(result.error || !result.access_token){lock('Google nie udzielił dostępu.');return;}
        token=result.access_token;expires=Date.now()+(Number(result.expires_in)-30)*1000;rememberSession();
        status.textContent='Sprawdzanie dostępu do arkusza TEST…';
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
            status.textContent='Wybierz prywatny arkusz budżetu TEST jeden raz.';
          }
        } catch(err) { report(err); }
      }});
    // Google requires a user gesture for browser token authorization on iOS.
    button.onclick=()=>{
      button.disabled=true;
      client.requestAccessToken({prompt: remembered() ? '' : 'select_account'});
    };
    if(restoreSession() && remembered()) {
      gate.querySelector('[data-file]').hidden=true;
      status.textContent='Otwieranie budżetu…';
      showBudget().catch(err=>{clearSession();token='';report(err);});
    } else {
      lock('Dotknij „Zaloguj przez Google”, aby otworzyć prywatny budżet.');
    }
  }).catch(report);
})();


