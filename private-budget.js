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
  async function rpc(method,args) {
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
  window.budgetRpc=rpc;
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
    style.textContent = `
html.budget-locked,html.budget-locked body{min-height:100%;background:#071b2b;color:#edf8f7}
html.budget-locked body>.budget-tabs,html.budget-locked body>#app{display:none!important}
#budget-login[hidden],#budget-login [hidden]{display:none!important}
#budget-login{position:relative;isolation:isolate;min-height:100dvh;max-width:none;margin:0;padding:max(env(safe-area-inset-top),24px) 24px max(env(safe-area-inset-bottom),24px);display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(ellipse 70% 38% at 50% 39%,#17475a 0%,transparent 80%),linear-gradient(150deg,#061725,#0b2634 60%,#04151f);color:#e9f8f6;font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
#budget-login:before,#budget-login:after{content:"";position:absolute;pointer-events:none;border-radius:50%;filter:blur(42px);opacity:.3;z-index:-1}
#budget-login:before{width:260px;height:260px;background:#19b7aa;top:15%;left:-180px;animation:budgetGlow 9s ease-in-out infinite alternate}
#budget-login:after{width:250px;height:250px;background:#6b9ba8;bottom:8%;right:-190px;animation:budgetGlow 11s ease-in-out infinite alternate-reverse}
#budget-login .gate-card{width:min(100%,430px);padding:36px 24px 30px;border:1px solid rgba(178,233,227,.17);border-radius:32px;background:linear-gradient(145deg,rgba(255,255,255,.085),rgba(255,255,255,.025));box-shadow:0 24px 70px #0006,inset 0 1px 0 #ffffff1a;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
#budget-login .gate-logo{display:block;width:112px;height:112px;margin:0 auto 26px;filter:drop-shadow(0 0 25px #40c9b555);animation:budgetBreathe 3.6s ease-in-out infinite alternate}
#budget-login .gate-eyebrow{margin:0 0 6px;color:#91d8d2;font-size:11px;font-weight:750;letter-spacing:.28em;text-transform:uppercase}
#budget-login h1{margin:0;color:#f5fbfa;font-size:clamp(34px,9vw,52px);font-weight:760;line-height:1.04;letter-spacing:-.055em}
#budget-login .gate-caption{margin:12px 0 34px;color:#b7cdd1;font-size:14px;letter-spacing:.025em}
#budget-login [role=status]{min-height:2.8em;max-width:36ch;margin:0 auto 18px;color:#bed4d6;font-size:14px;line-height:1.4;overflow-wrap:anywhere}
#budget-login button{display:block;width:100%;min-height:54px;padding:12px 17px;margin:10px 0 0;border:1px solid #5de2d3;border-radius:16px;background:linear-gradient(135deg,#55d8c9,#27aa9d);color:#052b34;font:inherit;font-size:16px;font-weight:700;line-height:1.2;box-shadow:0 12px 30px #20cbb43d;cursor:pointer}
#budget-login button:disabled{opacity:.55;cursor:default}
#budget-login button[data-file]{border-color:#91c7c5;background:transparent;color:#d8f3f0;box-shadow:none}
#budget-login .gate-footer{margin:27px 0 0;color:#8ca9b0;font-size:11px;letter-spacing:.08em}
@keyframes budgetBreathe{to{transform:translateY(-4px) scale(1.025);filter:drop-shadow(0 0 32px #55e8cc88)}}
@keyframes budgetGlow{to{transform:translate(80px,-30px);opacity:.5}}
@media(prefers-reduced-motion:reduce){#budget-login:before,#budget-login:after,#budget-login .gate-logo{animation:none}}
  `;
    document.head.append(style);
  }
  let countBusy = false;
  let lastCountRead = 0;
  async function refreshExpenseCount() {
    const badge = document.getElementById('pending-count');
    if (!badge || window.budgetViewerRole !== 'owner' || !gate.hidden ||
        document.hidden || countBusy || Date.now() - lastCountRead < 4000) return;
    countBusy = true;
    lastCountRead = Date.now();
    const tab = badge.closest('button');
    try {
      if (!token || expires <= Date.now()) throw Error();
      const range = encodeURIComponent("'Kolejka iPhone TEST'!1:1");
      const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' +
        testFileId + '/values/' + range, {
        headers:{Authorization:'Bearer ' + token}, cache:'no-store', redirect:'error'
      });
      if (!response.ok) throw Error();
      const [tag, stamp, parts, ...chunks] = (await response.json()).values[0];
      const age = Date.now() - Date.parse(stamp);
      if (tag !== 'QUEUE_V1' || !Number.isFinite(age) || age > 20*60000 ||
          !Number.isInteger(Number(parts)) || Number(parts)<1 || chunks.length < Number(parts)) throw Error();
      const bytes = Uint8Array.from(atob(chunks.slice(0, Number(parts)).join('')), c => c.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const {rows} = await new Response(stream).json();
      const count = rows.filter(r => !r.bridgeArchived && !r.decision && !r.postedEvidence && !r.bridgeBlocked).length;
      badge.textContent = String(count);
      badge.hidden = count === 0;
      tab.setAttribute('aria-label','Przypisz. Wydatki do przypisania: ' + count);
      tab.title = 'Wydatki do przypisania: ' + count + ' · stan z ' + new Date(stamp).toLocaleTimeString('pl-PL');
    } catch (_) {
      badge.hidden = false;
      badge.textContent = '…';
      tab.title = 'Aktualna liczba wydatków niedostępna';
      tab.setAttribute('aria-label','Przypisz. ' + tab.title);
    } finally { countBusy = false; }
  }
  function startBudgetApp() {
    gate.hidden=true;
    document.documentElement.classList.remove('budget-locked');
    if(!started) {
      started=true;
      const app=document.createElement('script');
      app.textContent=document.getElementById('budget-app-source').textContent;
      document.body.append(app);
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