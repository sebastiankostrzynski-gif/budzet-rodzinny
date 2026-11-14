const DEV_BACKEND_URL = new URLSearchParams(location.search).get('devBackend') || '';
const BUDGET_SERVER_URL = DEV_BACKEND_URL || 'https://script.google.com/macros/s/AKfycbydsUYYrnmq9plUVTGREi6OgoryuV3ZXk9ABtbE3RdLbgbNaUtuWkWRHshrMUKPZxeUpg/exec?view=bridge';

const budgetTransport = (() => {
  const allowed = new Set(['ebListSectionsDev','ebQueueListDev','ebIncomeListDev','telefonStanMailiTEST','apiStatusGetDEV','ebQueueReviseDev','ebIncomeDecideDev','pkDecideDevV1','kzGetDevV1','kzPreviewDevV1','kzPostDevV1']);
  const pending = new Map();
  const channel = crypto.randomUUID();
  let frame, client, origin, connected = false, sequence = 0;
  let host = window;
  try {
    if (window.parent === window.top && window.parent.location.origin === location.origin &&
        typeof window.parent.sendAssignmentBridgeMessage === 'function') host = window.parent;
  } catch (_) {}
  function post(message) {
    if (host === window) client.postMessage(message, origin);
    else host.sendAssignmentBridgeMessage(client, message, origin);
  }
  function trusted(e) {
    if (!frame || !/^https:\/\/(?:script\.google\.com|[a-z0-9-]+\.googleusercontent\.com)$/.test(e.origin)) return false;
    try {
      let w = e.source;
      for (let n=0; w && n<8; n++) {
        if (w === frame.contentWindow) return true;
        if (w === w.parent) break;
        w = w.parent;
      }
    } catch (_) {}
    return false;
  }
  function send(item) {
    if (!connected || item.sent) return;
    item.sent = true;
    post({protocol:'budget-queue-rpc-v1',type:'call',channel,id:item.id,method:item.method,args:item.args});
  }
  function start() {
    if (frame || !navigator.onLine) return;
    frame = document.createElement('iframe');
    frame.title = 'Synchronizacja danych budżetu';
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText = 'position:absolute;width:1px;height:1px;border:0;left:-10000px;top:0';
    frame.src = BUDGET_SERVER_URL;
    document.body.appendChild(frame);
  }
  function finish(id, ok, value) {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    clearTimeout(item.timer);
    (ok ? item.success : item.failure)(ok ? value : new Error(String(value || 'Nie udało się odświeżyć danych.')));
  }
  function onBridgeMessage(e) {
    const m = e.data;
    if (!m || m.protocol !== 'budget-queue-rpc-v1' || !trusted(e)) return;
    if (m.type === 'ready') {
      if (connected && e.source === client) return;
      client = e.source; origin = e.origin;
      post({protocol:'budget-queue-rpc-v1',type:'connect',channel});
    } else if (e.source === client && e.origin === origin && m.channel === channel) {
      if (m.type === 'connected') {
        connected = true;
        pending.forEach(send);
      } else if (m.type === 'result') {
        finish(m.id,m.ok,m.ok ? m.data : m.error);
      }
    }
  }
  host.addEventListener('message', onBridgeMessage);
  addEventListener('pagehide', () => host.removeEventListener('message', onBridgeMessage));
  addEventListener('pageshow', () => host.addEventListener('message', onBridgeMessage));
  function call(method,args,success,failure) {
    if (!allowed.has(method)) { failure(new Error('Niedozwolona operacja.')); return; }
    if (!navigator.onLine) { failure(new Error('Brak internetu. Pokazuję zapisane dane.')); return; }
    const id = ++sequence;
    const item = {id,method,args,success,failure,sent:false};
    item.timer = setTimeout(() => {
      finish(id,false,'Nie udało się połączyć z Google. Zapisane dane pozostają dostępne.');
      if (pending.size === 0 && frame) {
        frame.remove(); frame = null; client = null; connected = false; origin = null;
      }
    },60000);
    pending.set(id,item);
    start(); send(item);
  }
  function runner(success = () => {}, failure = () => {}) {
    const r = {
      withSuccessHandler: fn => runner(fn,failure),
      withFailureHandler: fn => runner(success,fn)
    };
    allowed.forEach(method => { r[method] = (...args) => call(method,args,success,failure); });
    return r;
  }
  addEventListener('online',() => { start(); if (typeof handleAppResume_ === 'function') handleAppResume_(); });
  return {runner,start};
})();
const google = {script:{run:budgetTransport.runner()}};


