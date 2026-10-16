/* ISOLATED DEV ONLY. Replace KolejkaDEV, never Kod.gs. Existing saved decisions remain unchanged. */
/* Pure DEV queue. Persist its returned state ONLY in the isolated DEV project.
 * No services, imports, budget writes, or automatic category learning.
 */
var EbApprovalQueueDevV1 = (function () {
  'use strict';
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function prepare(plan, manualRows, categories, revision, createdAt, eligible, reservedKeys) {
    if (!revision || !createdAt) throw new Error('Missing snapshot identity.');
    if (typeof eligible !== 'function' || !Array.isArray(reservedKeys)) throw new Error('Missing eligibility/reservations.');
    var keys = new Set(), targets = new Map();
    manualRows.forEach(function (target) {
      if (!target.manualKey || targets.has(target.manualKey)) throw new Error('Invalid manual key.');
      targets.set(target.manualKey, target);
    });
    var rows = plan.map(function (entry) {
      var item = entry.item;
      if (!item.key || keys.has(item.key)) throw new Error('Invalid transaction key.');
      keys.add(item.key);
      return { key: item.key, transaction: copy(item), status: entry.status,
        reason: entry.reason || '', suggestedManualKey: entry.target ? entry.target.manualKey : null,
        allowedManualKeys: manualRows.filter(function (target) {
          return reservedKeys.indexOf(target.manualKey) < 0 && eligible(item, target);
        }).map(function (target) { return target.manualKey; }),
        decision: null };
    });
    return { version: 1, revision: revision, createdAt: createdAt,
      categories: Array.from(new Set(categories.filter(function (x) { return typeof x === 'string' && x.trim(); }))),
      manualRows: copy(manualRows), rows: rows };
  }
  // Caller must hold ScriptLock across read -> decide -> persistent write.
  // A new revision from the server makes retries/stale browser tabs fail safely.
  function decide(state, request, nextRevision, decidedAt) {
    if (!request || request.revision !== state.revision) throw new Error('STALE_REVISION');
    if (!nextRevision || nextRevision === state.revision || !decidedAt) throw new Error('Invalid next revision.');
    var next = copy(state), row = next.rows.find(function (r) { return r.key === request.key; });
    if (!row) throw new Error('UNKNOWN_TRANSACTION');
    if (row.decision) throw new Error('ALREADY_DECIDED');
    var decision = { action: request.action, at: decidedAt };
    if (request.action === 'NEW_ROW' || request.action === 'EXISTING_ROW') {
      var description = typeof request.description === 'string' ? request.description.trim() : '';
      if (description.length > 200 || /[\x00-\x1f]/.test(description)) throw new Error('INVALID_DESCRIPTION');
      decision.description = description;
      if (request.action === 'NEW_ROW') {
        if (!description) throw new Error('DESCRIPTION_REQUIRED');
        var sheet = next.manualRows.find(function (r) { return r.sheetName === request.sheetName; });
        if (!sheet || !/^T(?:[5-9]|[1-9][0-9]+)\b/i.test(sheet.sheetName)) throw new Error('INVALID_EXPENSE_SHEET');
        decision.sheetName = sheet.sheetName;
      } else {
        var existing = next.manualRows.find(function (r) { return r.manualKey === request.targetManualKey; });
        if (!existing) throw new Error('UNKNOWN_MANUAL_ENTRY');
        // Addition to a running total is distinct from claiming an already booked purchase.
        // Several purchases may target the same existing row.
        decision.targetManualKey = existing.manualKey;
        decision.category = existing.label;
        decision.sheetName = existing.sheetName;
      }
    } else if (request.action === 'CATEGORY') {
      if (next.categories.indexOf(request.category) < 0) throw new Error('INVALID_CATEGORY');
      decision.category = request.category;
    } else if (request.action === 'ALREADY_IN_BUDGET') {
      var target = next.manualRows.find(function (r) { return r.manualKey === request.manualKey; });
      if (!target) throw new Error('UNKNOWN_MANUAL_ENTRY');
      if (row.allowedManualKeys.indexOf(target.manualKey) < 0) throw new Error('INELIGIBLE_MANUAL_ENTRY');
      if (next.rows.some(function (r) { return r.decision && r.decision.manualKey === target.manualKey; })) {
        throw new Error('MANUAL_ENTRY_ALREADY_CLAIMED');
      }
      decision.manualKey = target.manualKey;
    } else if (request.action !== 'DEFER') {
      throw new Error('INVALID_ACTION');
    }
    row.decision = decision;
    next.revision = nextRevision;
    return next;
  }
  return { prepare: prepare, decide: decide };
})();

/* Isolated DEV only. Requires ebDevAssertIsolation_ from the private project.
 * Deploy ONLY as an owner-only test web app; never add to the original backend.
 */
function ebQueueLock_(action) {
  ebDevAssertIsolation_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Kolejka jest zajęta. Spróbuj ponownie.');
  try { return action(); } finally { lock.releaseLock(); }
}
function ebQueueRead_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var root = 'EB_APPROVAL_QUEUE_DEV_V1';
  var value = props[root];
  if (!value) throw new Error('Kolejka nie została jeszcze przygotowana w DEV.');
  if (value.charAt(0) === '{') {
    var meta = JSON.parse(value);
    if (meta.format !== 2 || ['A', 'B'].indexOf(meta.bank) < 0 ||
        !Number.isInteger(meta.parts) || meta.parts < 1 || meta.parts > 20) {
      throw new Error('Nieprawidłowy nagłówek kolejki DEV.');
    }
    value = '';
    for (var i = 0; i < meta.parts; i++) {
      var part = props[root + '_' + meta.bank + '_' + i];
      if (typeof part !== 'string' || !part.length) throw new Error('Brakuje części kolejki DEV.');
      value += part;
    }
    if (value.length !== meta.length) throw new Error('Niepełny zapis kolejki DEV.');
  }
  return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value), 'application/x-gzip', 'queue.json.gz')).getDataAsString('UTF-8'));
}
function ebQueueWrite_(state) {
  var started = Date.now();
  var value = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(state), 'application/json')).getBytes());
  var root = 'EB_APPROVAL_QUEUE_DEV_V1', props = PropertiesService.getScriptProperties();
  var previous = props.getProperty(root), bank = 'A';
  if (previous && previous.charAt(0) === '{') {
    var old = JSON.parse(previous);
    if (old.format !== 2 || ['A', 'B'].indexOf(old.bank) < 0) throw new Error('Nieprawidłowy nagłówek kolejki DEV.');
    bank = old.bank === 'A' ? 'B' : 'A';
  }
  var size = 7000, parts = Math.ceil(value.length / size);
  if (parts > 20) throw new Error('Kolejka przekracza całkowity limit DEV. Poprzedni zapis pozostaje bez zmian.');
  // Write the inactive bank first. Publish its pointer only after all parts succeed.
  // Two reusable banks bound storage growth; no inbox properties are changed/deleted.
  for (var i = 0; i < parts; i++) props.setProperty(root + '_' + bank + '_' + i, value.slice(i * size, (i + 1) * size));
  props.setProperty(root, JSON.stringify({format: 2, bank: bank, parts: parts, length: value.length}));
  console.log(JSON.stringify({stage: 'QUEUE_SAVE', parts: parts, encodedBytes: value.length, elapsedMs: Date.now() - started}));
}
// Explicit editor action; never called by doGet, list, or decision endpoints.
function ebDev02PrzygotujKolejke() {
  return ebQueueLock_(function () {
    if (PropertiesService.getScriptProperties().getProperty('EB_APPROVAL_QUEUE_DEV_V1')) {
      throw new Error('Kolejka już istnieje. Nie nadpisuję zapisanych decyzji.');
    }
    var started = Date.now();
    var inbox = ebInboxReadV1_(PropertiesService.getScriptProperties());
    var manual = eb78ManualBudgetRowsV1_();
    var plan = EbReconciliationGuardsV1.planManual(inbox.items || [], manual,
      eb78IsManualCandidateV1_, eb78ManualMatchScoreV1_, function (item) {
        return ebV5IsTechnicalClass_(ebV5ClassifyWealthRule_(item));
      });
    var state = EbApprovalQueueDevV1.prepare(plan, manual,
      manual.map(function (r) { return r.label; }), Utilities.getUuid(), new Date().toISOString(),
      function (item, target) { return (item.currency || 'PLN') === 'PLN' && eb78IsManualCandidateV1_(item, target); }, Array.from(EbReconciliationGuardsV1.claimedKeys(inbox.items || [], 'manualBudgetMatchedKey')));
    ebQueueWrite_(state);
    var result = {stage: 'QUEUE_PREPARE', rows: state.rows.length, elapsedMs: Date.now() - started};
    console.log(JSON.stringify(result));
    return result;
  });
}
function ebQueueText_(value) {
  if (Array.isArray(value)) return value.map(ebQueueText_).filter(Boolean).join(' · ');
  return typeof value === 'string' ? value.trim() : '';
}
function ebQueueView_(state, started) {
  return {revision: state.revision, createdAt: state.createdAt, categories: state.categories,
    expenseSheets: Array.from(new Set(state.manualRows.map(function (m) { return m.sheetName; }).filter(function (name) {
      return typeof name === 'string' && /^T(?:[5-9]|[1-9][0-9]+)\b/i.test(name);
    }))),
    existingRows: state.manualRows.map(function (m) {
      return {key: m.manualKey, label: m.label, sheet: m.sheetName, month: m.monthKey};
    }),
    rows: state.rows.map(function (row) {
      var item = row.transaction;
      var name = ebQueueText_(item.counterpartyName);
      var detail = ebQueueText_(item.remittance);
      var title = name || detail || 'Wydatek bez opisu';
      return {key: row.key, description: title, detail: name && detail !== name ? detail : '',
        sourceLabel: item.source === 'ALERTY24_EMAIL' ? 'Alerty24' : 'Bank',
        accountLabel: ebQueueText_(item.accountLabel),
        amount: Number(item.amountCents) / 100, currency: item.currency || 'PLN', date: item.effectiveDate || item.bookingDate || '',
        reason: row.reason, decision: row.decision,
        queueGroup: row.status === 'REVIEW' || row.status === 'MATCH' || row.allowedManualKeys.length ? 'REVIEW_BUDGET' : 'NO_MATCH',
        candidates: state.manualRows.filter(function (m) { return row.allowedManualKeys.indexOf(m.manualKey) >= 0 &&
          typeof eb78ManualMatchScoreV1_ === 'function' && Number(eb78ManualMatchScoreV1_(item, m)) >= 8; })
          .map(function (m) { return {key: m.manualKey, label: m.label, amount: Number(m.amountCents) / 100, sheet: m.sheetName}; })};
    }), elapsedMs: Date.now() - started};
}
function ebQueueListDev() {
  return ebQueueLock_(function () { var started = Date.now(); return ebQueueView_(ebQueueRead_(), started); });
}
function ebQueueDecideDev(request) {
  return ebQueueLock_(function () {
    var started = Date.now();
    var saved = ebQueueRead_();
    if (request && request.action === 'ALREADY_IN_BUDGET') {
      var view = ebQueueView_(saved, started);
      var source = view.rows.find(function (r) { return r.key === request.key; });
      if (!source || !source.candidates.some(function (m) { return m.key === request.manualKey; })) {
        throw new Error('Ten wpis nie jest wiarygodnym dopasowaniem. Wybierz właściwy dział i pozycję.');
      }
    }
    var next = EbApprovalQueueDevV1.decide(saved, request, Utilities.getUuid(), new Date().toISOString());
    ebQueueWrite_(next);
    return ebQueueView_(next, started);
  });
}
function doGet() {
  ebDevAssertIsolation_();
  return HtmlService.createHtmlOutput(ebQueueHtmlDev_()).setTitle('Budżet DEV — Do akceptacji');
}

// Fast editor diagnostic: no transaction descriptions or financial values in logs.
function ebDev03SprawdzSzybkiOdczytKolejki() {
  var started = Date.now(), view = ebQueueListDev();
  var result = {stage: 'QUEUE_READ', rows: view.rows.length,
    pending: view.rows.filter(function (r) { return !r.decision; }).length,
    elapsedMs: Date.now() - started};
  console.log(JSON.stringify(result));
  return result;
}

function ebQueueHtmlDev_() { return "<!doctype html>\n<html lang=\"pl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>body{font:16px system-ui;background:#f4f6f8;color:#172636;margin:0}main{max-width:800px;margin:auto;padding:24px}article{background:white;border-radius:14px;padding:20px;margin:16px 0;overflow-wrap:anywhere}button,select,input{font:inherit;padding:10px;margin:5px 5px 5px 0;max-width:100%}label{display:block;margin-top:12px}label>select,label>input{display:block;width:100%;box-sizing:border-box}button{cursor:pointer}small{display:block;color:#526577}#message{white-space:pre-wrap}button:disabled{cursor:wait}</style></head>\n<body><main><h1>Do akceptacji <small>Środowisko DEV</small></h1><p>Decyzje zapisujesz wyłącznie testowo. Budżet pozostaje bez zmian.</p><button id=\"reload\">Odśwież zapisane wyniki</button><p id=\"message\" role=\"status\"></p><section id=\"rows\"></section></main>\n<script>\n'use strict';\nlet state, active = 0, busy = false;\nconst message = document.getElementById('message'), rows = document.getElementById('rows');\nfunction node(tag, text) { const e = document.createElement(tag); if(text !== undefined) e.textContent = String(text); return e; }\nfunction controls(disabled) { document.querySelectorAll('button,select,input').forEach(e => e.disabled = disabled); }\nfunction rpc(method, request) {\n  if (busy) return;\n  busy = true; controls(true); message.textContent = 'Odczyt zapisanej kolejki…';\n  const token = ++active, start = Date.now();\n  const timer = setTimeout(() => {\n    if (token !== active) return;\n    // A write may still finish server-side. Read state before allowing another decision.\n    active++; busy = false; rows.replaceChildren(); document.getElementById('reload').disabled = false;\n    message.textContent = 'Przekroczono 15 sekund. Kliknij „Odśwież zapisane wyniki”, aby sprawdzić stan zapisu.';\n  }, 15000);\n  function done(error, result) {\n    if (token !== active) return;\n    clearTimeout(timer); busy = false;\n    if(error) { rows.replaceChildren(); message.textContent = 'Nie udało się odczytać lub zapisać: ' + error.message; }\n    else { state = result; render(); message.textContent = 'Odczyt: ' + ((Date.now()-start)/1000).toFixed(2) + ' s; backend: ' + result.elapsedMs + ' ms. Migawka: ' + result.createdAt; }\n    controls(false);\n  }\n  const runner = google.script.run.withSuccessHandler(r => done(null,r)).withFailureHandler(e => done(e));\n  if(method === 'list') runner.ebQueueListDev(); else runner.ebQueueDecideDev(request);\n}\nfunction decide(row, action, extra) { rpc('decide', Object.assign({revision:state.revision,key:row.key,action},extra)); }\nfunction render() {\n  rows.replaceChildren();\n  const pending = state.rows.filter(r => !r.decision);\n  if(!pending.length) rows.append(node('p','Brak wydatków oczekujących na decyzję w tej migawce.'));\n  pending.sort((a,b) => Number(b.queueGroup === 'REVIEW_BUDGET') - Number(a.queueGroup === 'REVIEW_BUDGET'));\n  let group;\n  pending.forEach(row => {\n    if(group !== row.queueGroup) {\n      group=row.queueGroup;\n      rows.append(node('h2',group === 'REVIEW_BUDGET' ? 'Sprawdź powiązanie z budżetem' : 'Nie znaleziono dopasowania'));\n      rows.append(node('p',group === 'REVIEW_BUDGET' ?\n        'Te wydatki mogą już być wpisane. Potwierdź istniejący wpis, zamiast dodawać zakup ponownie.' :\n        'Brak dopasowania nie oznacza pewności, że zakupu nie ma w budżecie. Sprawdź przed dodaniem.'));\n    }\n    const card = node('article'); card.append(node('h2', row.description),node('p', String(row.amount) + ' ' + row.currency),node('small', [row.date,row.sourceLabel,row.accountLabel].filter(Boolean).join(' · ')));\n    if(row.detail) card.append(node('p',row.detail));\n    const mode = node('select'); mode.setAttribute('aria-label','Sposób zapisania ' + row.description);\n    mode.append(new Option('Dodaj do istniejącej pozycji','EXISTING_ROW'),new Option('Utwórz nowy wiersz','NEW_ROW'));\n    const department = node('select'); department.setAttribute('aria-label','Dział budżetu dla ' + row.description);\n    department.append(new Option('Wybierz dział budżetu',''));\n    state.expenseSheets.forEach(s => department.append(new Option(s,s)));\n    const target = node('select'); target.setAttribute('aria-label','Pozycja w wybranym dziale dla ' + row.description);\n    const search = node('input'); search.type='search'; search.placeholder='Szukaj pozycji w wybranym dziale';\n    search.setAttribute('aria-label','Szukaj pozycji dla ' + row.description);\n    function field(text, control) { const label=node('label',text); label.append(control); return label; }\n    const targetField=field('2. Pozycja w tym dziale',target), searchField=field('Szukaj pozycji',search);\n    const description = node('input'); description.type='text'; description.maxLength=200;\n    description.placeholder='Własny opis, np. Parasolka'; description.setAttribute('aria-label','Własny opis dla ' + row.description);\n    const preview = node('p');\n    function updatePreview() {\n      const isNew=mode.value === 'NEW_ROW', option=target.options[target.selectedIndex];\n      const ready=department.value && (isNew || target.value);\n      preview.textContent = ready ? 'Plan w DEV: ' + department.value + ' · ' +\n        (isNew ? 'nowy wiersz' : 'dodanie do pozycji „' + option.textContent + '”') +\n        (description.value.trim() ? ' · opis: ' + description.value.trim() : '') +\n        ' · ' + row.amount + ' ' + row.currency + '. Arkusz nie zostanie zmieniony.' : 'Wybierz dział budżetu, a następnie pozycję.';\n    }\n    function updateTargets() {\n      const isNew=mode.value === 'NEW_ROW', previous=target.value;\n      targetField.hidden=isNew || !department.value; searchField.hidden=isNew || !department.value;\n      const norm = value => String(value || '').toLocaleLowerCase('pl').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/ł/g,'l');\n      const matches=state.existingRows.filter(r => r.sheet === department.value && norm(r.label).includes(norm(search.value.trim())));\n      target.replaceChildren(new Option(matches.length ? 'Wybierz pozycję' : 'Brak pozycji — zmień wyszukiwanie lub utwórz nowy wiersz',''));\n      matches.forEach(r => target.append(new Option([r.label,r.month].filter(Boolean).join(' · '),r.key)));\n      if(matches.some(r=>r.key === previous)) target.value=previous;\n      updatePreview();\n    }\n    department.onchange=()=>{ target.value=''; search.value=''; updateTargets(); };\n    mode.onchange=()=>{ target.value=''; search.value=''; updateTargets(); };\n    search.oninput=updateTargets; target.onchange=updatePreview; description.oninput=updatePreview; updateTargets();\n    const approve = node('button','Zapisz decyzję w DEV'); approve.onclick = () => {\n      if(!department.value || (mode.value === 'EXISTING_ROW' && !target.value)) { preview.textContent='Wybierz dział i pozycję w tym dziale.'; return; }\n      if(mode.value === 'NEW_ROW' && !description.value.trim()) { preview.textContent='Wpisz opis nowego wiersza.'; description.focus(); return; }\n      decide(row,mode.value,{description:description.value, sheetName: mode.value === 'NEW_ROW' ? department.value : undefined,\n        targetManualKey:mode.value === 'EXISTING_ROW' ? target.value : undefined});\n    };\n    const edit = node('details');\n    edit.append(node('summary',row.queueGroup === 'REVIEW_BUDGET' ? 'Wybierz właściwy dział i pozycję' : 'Opisz wydatek i wybierz miejsce zapisu'));\n    edit.append(field('Sposób zapisu',mode),field('1. Dział budżetu',department),searchField,targetField,field('Własny opis zakupu',description),preview,approve);\n    edit.open=true;\n    card.append(edit);\n    if(row.candidates.length) {\n      row.candidates.forEach(c => card.append(node('p','Możliwy wpis: ' + c.sheet + ' · ' + c.label + ' · ' + c.amount + ' PLN')));\n      const manual = node('select'); manual.setAttribute('aria-label','Istniejący wpis dla ' + row.description); manual.append(new Option('Wybierz istniejący wpis',''));\n      row.candidates.forEach(c => manual.append(new Option([c.label,c.amount,c.sheet].filter(v=>v!==undefined).join(' · '),c.key)));\n      const link = node('button','Już w budżecie — nie dodawaj ponownie'); link.onclick = () => { if(manual.value) decide(row,'ALREADY_IN_BUDGET',{manualKey:manual.value}); };\n      card.append(node('p','Możliwe powiązania — wymagają Twojego potwierdzenia:'),manual,link);\n    }\n    if(row.queueGroup === 'REVIEW_BUDGET' && !row.candidates.length) card.append(node('p','Nie znaleziono wiarygodnego powiązania z istniejącym wpisem. Podobna kwota nie wystarcza do uznania zakupu za duplikat.'));\n    const defer = node('button','Odłóż w DEV'); defer.onclick = () => decide(row,'DEFER'); card.append(defer); rows.append(card);\n  });\n}\ndocument.getElementById('reload').onclick = () => rpc('list');\nrpc('list');\n</script></body></html>\n"; }
