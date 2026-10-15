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
  var value = PropertiesService.getScriptProperties().getProperty('EB_APPROVAL_QUEUE_DEV_V1');
  if (!value) throw new Error('Kolejka nie została jeszcze przygotowana w DEV.');
  return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value))).getDataAsString('UTF-8'));
}
function ebQueueWrite_(state) {
  var value = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(state), 'application/json')).getBytes());
  // One atomic property write; do not leave a partially saved queue.
  if (value.length > 8500) throw new Error('Kolejka przekracza limit zapisu DEV. Poprzedni zapis pozostaje bez zmian.');
  PropertiesService.getScriptProperties().setProperty('EB_APPROVAL_QUEUE_DEV_V1', value);
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
function ebQueueView_(state, started) {
  return {revision: state.revision, createdAt: state.createdAt, categories: state.categories,
    rows: state.rows.map(function (row) {
      var item = row.transaction;
      return {key: row.key, description: item.description || item.merchant || item.key,
        amount: Number(item.amountCents) / 100, currency: item.currency || 'PLN', date: item.effectiveDate || item.bookingDate || '',
        reason: row.reason, decision: row.decision,
        candidates: state.manualRows.filter(function (m) { return row.allowedManualKeys.indexOf(m.manualKey) >= 0; })
          .map(function (m) { return {key: m.manualKey, label: m.label, amount: Number(m.amountCents) / 100, sheet: m.sheetName}; })};
    }), elapsedMs: Date.now() - started};
}
function ebQueueListDev() {
  return ebQueueLock_(function () { var started = Date.now(); return ebQueueView_(ebQueueRead_(), started); });
}
function ebQueueDecideDev(request) {
  return ebQueueLock_(function () {
    var started = Date.now();
    var next = EbApprovalQueueDevV1.decide(ebQueueRead_(), request, Utilities.getUuid(), new Date().toISOString());
    ebQueueWrite_(next);
    return ebQueueView_(next, started);
  });
}
function doGet() {
  ebDevAssertIsolation_();
  return HtmlService.createHtmlOutputFromFile('ApprovalQueue').setTitle('Budżet DEV — Do akceptacji');
}
