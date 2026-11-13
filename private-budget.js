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
    if(res.status===401){token='';lock('Sesja wygasła. Zaloguj się ponownie.');}
    const data=await res.json();
    if(!res.ok || data.error) throw Error(data.error?.details?.[0]?.errorMessage || data.error?.message || 'Błąd połączenia z budżetem.');
    if(!data.done || !data.response) throw Error('Google nie potwierdził wykonania operacji.');
    return data.response.result;
  }
  window.budgetRpc=rpc;
  async function showBudget() {
    // Never display a snapshot from a different workbook or an unverified old session.
    const role=await rpc('getViewerRole',[]);
    if(role!=='owner') throw Error('To konto nie ma dostępu do tego wdrożenia.');
    status.textContent='Pobieranie aktualnych danych z TEST…';
    const now=new Date();
    const fresh=await rpc('getBudgetDataFresh',[now.getFullYear(),now.getMonth()+1]);
    if(!fresh || !Array.isArray(fresh.categories) || Number(fresh.year)!==now.getFullYear() || Number(fresh.monthNumber)!==now.getMonth()+1)
      throw Error('Serwer nie zwrócił bieżącego miesiąca z arkusza TEST.');
    const stamp=Date.now();
    try {
      if(!remembered()) {
        for(const key of ['budzet-last-dashboard-v1','budzet-month-dashboard-cache-v1','budzet-category-details-v1','budzet-last-refresh-state-v1','budzet-pwa-dashboard-cache-v1','budzet-pwa-month-cache-v1','budzet-pwa-category-cache-v1','budzet-pwa-refresh-state-v1']) localStorage.removeItem(key);
        const runtime=await caches.open('budzet-rodzinny-runtime-v8');
        for(const path of ['./__budget_runtime_v10__.json','./__budget_runtime_v8__.json']) await runtime.delete(new URL(path,location.href).href);
      }
      localStorage.setItem('budzet-last-dashboard-v1',JSON.stringify({timestamp:stamp,data:fresh}));
      localStorage.setItem(verifiedKey,testFileId);
    } catch (_) { /* Private mode can deny local storage. Current result still renders. */ }
    gate.hidden=true;
    document.documentElement.classList.remove('budget-locked');
    if(!started) {
      started=true;
      const app=document.createElement('script');
      app.textContent=document.getElementById('budget-app-source').textContent;
      document.body.append(app);
    }
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
        token=result.access_token;expires=Date.now()+(Number(result.expires_in)-30)*1000;
        gate.querySelector('[data-file]').hidden=remembered();
        if(remembered()) {
          try { await showBudget(); } catch(err) { report(err); }
        } else status.textContent='Wybierz prywatny arkusz budżetu TEST.';
      }});
    button.onclick=()=>{button.disabled=true;client.requestAccessToken({prompt:''});};
    if(remembered()) {
      try { client.requestAccessToken({prompt:''}); } catch (_) { /* iOS may require a tap. */ }
    }
    lock('Zaloguj się kontem właściciela budżetu.');
  }).catch(report);
})();