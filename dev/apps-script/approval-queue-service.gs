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
  return HtmlService.createHtmlOutputFromFile('ApprovalQueue').setTitle('Budżet DEV — Do akceptacji');
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
