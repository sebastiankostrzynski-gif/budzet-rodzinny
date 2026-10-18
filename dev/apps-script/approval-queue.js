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
        if (/^T12\b/i.test(sheet.sheetName)) {
          if (['Ewa','Julka','Olek','Seba'].indexOf(request.person) < 0) throw new Error('PERSON_REQUIRED');
          decision.person = request.person;
        }
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
  // Explicit reconciliation refresh. Previous decisions are immutable history;
  // changed totals cannot prove that a particular purchase was already entered.
  function refresh(previous, fresh, expectedRevision) {
    if (!previous || expectedRevision !== previous.revision) throw new Error('STALE_REVISION');
    if (!fresh || !fresh.revision || fresh.revision === previous.revision) throw new Error('Invalid refresh revision.');
    var next = copy(fresh), oldByKey = new Map(), freshByKey = new Map();
    previous.rows.forEach(function (row) {
      if (oldByKey.has(row.key)) throw new Error('Duplicate transaction key.');
      oldByKey.set(row.key, row);
    });
    next.rows.forEach(function (row) {
      if (freshByKey.has(row.key)) throw new Error('Duplicate transaction key.');
      freshByKey.set(row.key, row);
    });
    var carried = 0, review = 0;
    previous.rows.forEach(function (old) {
      if (!old.decision) return;
      var current = freshByKey.get(old.key);
      // Keep the complete decision and its old transaction evidence, even when
      // the transaction no longer qualifies for the new pending queue.
      var saved = copy(old);
      saved.refreshReview = null;
      if (old.decision.action !== 'DEFER') {
        saved.refreshReview = 'RECHECK_AFTER_MANUAL_UPDATE'; review++;
      }
      if (current) next.rows[next.rows.indexOf(current)] = saved;
      else next.rows.push(saved);
      carried++;
    });
    next.refresh = {at: fresh.createdAt, previousRevision: previous.revision,
      decisionsPreserved: carried, decisionsToReview: review};
    // Old target details must remain inspectable when amount-based manual keys change.
    next.decisionEvidence = previous.rows.filter(function (row) { return !!row.decision; }).map(function (row) {
      var key = row.decision.manualKey || row.decision.targetManualKey;
      var prior = (previous.decisionEvidence || []).find(function (entry) { return entry.transactionKey === row.key; });
      var target = previous.manualRows.find(function (entry) { return entry.manualKey === key; });
      return {transactionKey: row.key, manualTarget: target ? copy(target) : prior ? prior.manualTarget : null};
    });
    var claimed = new Set();
    previous.rows.filter(function (row) { return row.decision && row.decision.action === 'ALREADY_IN_BUDGET'; }).forEach(function (row) {
      var evidence = next.decisionEvidence.find(function (entry) { return entry.transactionKey === row.key; });
      var oldTarget = evidence && evidence.manualTarget;
      next.manualRows.forEach(function (target) {
        var sameCell = oldTarget && oldTarget.sheetName && Number.isInteger(oldTarget.rowNumber) &&
          Number.isInteger(oldTarget.columnNumber) && oldTarget.monthKey &&
          target.sheetName === oldTarget.sheetName && target.rowNumber === oldTarget.rowNumber &&
          target.columnNumber === oldTarget.columnNumber && target.monthKey === oldTarget.monthKey;
        if (target.manualKey === row.decision.manualKey || sameCell) claimed.add(target.manualKey);
      });
    });
    next.rows.forEach(function (row) {
      if (row.decision) return;
      row.allowedManualKeys = row.allowedManualKeys.filter(function (key) { return !claimed.has(key); });
      if (claimed.has(row.suggestedManualKey)) {
        row.suggestedManualKey = null; row.status = 'REVIEW'; row.reason = 'ALREADY_CLAIMED';
      }
    });
    return next;
  }
  return { prepare: prepare, decide: decide, refresh: refresh };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EbApprovalQueueDevV1;
