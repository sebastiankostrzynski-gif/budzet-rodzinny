/* Pure safeguards for existing EB_TRANSACTION_INBOX_V1 reconciliation.
 * No service calls, persistence, triggers, imports or budget writes.
 * Works in Apps Script V8; CommonJS export is for the regression tests only.
 */
var EbReconciliationGuardsV1 = (function () {
  'use strict';
  var metadata = [
    'status', 'category', 'userNote', 'ignoreReason', 'splits', 'approvedAt',
    'budgetPostedAt', 'v5Decision', 'v5DecisionAt', 'v5DecisionSource',
    'v5DecisionClass', 'alerty24MatchedKey', 'alerty24MatchedAt',
    'manualBudgetMatchedKey', 'manualBudgetMatchedAt', 'manualBudgetMatchScore',
    'manualBudgetSheet', 'manualBudgetRow', 'manualBudgetColumn',
    'manualBudgetMonth', 'manualBudgetLabel', 'manualBudgetReviewStatus',
    'manualBudgetReviewNote'
  ];

  function preserveApiMetadata(current, previous) {
    if (!current || !previous || !current.key || current.key !== previous.key) {
      throw new Error('Metadata can only be restored for the same transaction key.');
    }
    metadata.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(previous, field) && previous[field] !== undefined) {
        current[field] = JSON.parse(JSON.stringify(previous[field]));
      }
    });
    return current;
  }

  // Reserve links from the entire inbox, including rows skipped as already handled.
  function claimedKeys(items, field) {
    var keys = new Set();
    items.forEach(function (item) {
      if (item && item[field]) keys.add(String(item[field]));
    });
    return keys;
  }

  function handled(item) {
    return ['POMIN', 'UJETE_RECZNIE_W_BUDZECIE', 'ZAPISANE_DO_BUDZETU']
      .indexOf(String(item.v5Decision || '')) >= 0;
  }

  // Build the full candidate graph before assigning anything: no order-based winner.
  function plan(left, right, eligible, score, minimum, reserved) {
    reserved = reserved || new Set();
    var leftKeys = new Set(), rightKeys = new Set();
    left.forEach(function (row) {
      if (!row.key || leftKeys.has(String(row.key))) throw new Error('Duplicate/missing source key.');
      leftKeys.add(String(row.key));
    });
    right.forEach(function (row) {
      if (!row.key || rightKeys.has(String(row.key))) throw new Error('Duplicate/missing target key.');
      rightKeys.add(String(row.key));
    });
    var incoming = new Map();
    var rows = left.map(function (item) {
      var weak = [], occupied = false;
      var candidates = right.filter(function (target) {
        if (!eligible(item, target)) return false;
        if (reserved.has(String(target.key))) { occupied = true; return false; }
        var value = Number(score(item, target));
        if (!Number.isFinite(value) || value < minimum) { weak.push(target); return false; }
        return true;
      }).map(function (target) {
        var row = { target: target, score: Number(score(item, target)) };
        incoming.set(String(target.key), (incoming.get(String(target.key)) || 0) + 1);
        return row;
      }).sort(function (a, b) { return b.score - a.score || String(a.target.key).localeCompare(String(b.target.key)); });
      return { item: item, candidates: candidates, weak: weak, occupied: occupied };
    });
    return rows.map(function (row) {
      var top = row.candidates[0], second = row.candidates[1];
      if (!top) return { status: row.occupied || row.weak.length ? 'REVIEW' : 'NO_MATCH', item: row.item, reason: row.occupied ? 'ALREADY_CLAIMED' : row.weak.length ? 'WEAK_MATCH' : 'NO_CANDIDATE' };
      if (second && second.score === top.score) return { status: 'REVIEW', item: row.item, reason: 'TIED_TARGETS' };
      if (incoming.get(String(top.target.key)) > 1) return { status: 'REVIEW', item: row.item, reason: 'SHARED_TARGET' };
      return { status: 'MATCH', item: row.item, target: top.target, score: top.score };
    });
  }

  function planEmailApi(items, eligible, score) {
    var reserved = claimedKeys(items, 'apiMatchedKey');
    items.forEach(function (item) { if (item.alerty24MatchedKey) reserved.add(String(item.key)); });
    var left = items.filter(function (item) {
      return item.source === 'ALERTY24_EMAIL' && item.direction === 'DBIT' &&
        !item.apiMatchedKey && item.status !== 'ANULOWANE' && item.v5Decision !== 'POMIN';
    });
    var right = items.filter(function (item) {
      return item.source !== 'ALERTY24_EMAIL' && item.accountLabel === 'R1' && item.direction === 'DBIT';
    });
    return plan(left, right, eligible, score, 7, reserved);
  }

  function planManual(items, manualRows, eligible, score, isTechnical) {
    var reserved = claimedKeys(items, 'manualBudgetMatchedKey');
    var left = items.filter(function (item) {
      return item.direction === 'DBIT' && !handled(item) && !item.manualBudgetMatchedKey &&
        !item.alerty24MatchedKey && item.status !== 'ANULOWANE' && !isTechnical(item);
    });
    var right = manualRows.map(function (manual) {
      var target = Object.assign({}, manual);
      target.key = manual.manualKey;
      return target;
    });
    return plan(left, right, eligible, score, 8, reserved);
  }

  return { preserveApiMetadata: preserveApiMetadata, claimedKeys: claimedKeys,
    handled: handled, plan: plan, planEmailApi: planEmailApi, planManual: planManual };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EbReconciliationGuardsV1;
