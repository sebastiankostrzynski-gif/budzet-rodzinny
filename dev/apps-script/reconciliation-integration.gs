/* DEV replacement definitions, NOT an additional file beside the original
 * functions with the same names. See README before applying to Apps Script.
 * Requires reconciliation-guards.js plus the existing eb70/eb78 helpers.
 */
function eb73UzgodnijAlerty24ZApiV1_(write) {
  var props = PropertiesService.getScriptProperties();
  var inbox = ebInboxReadV1_(props);
  var plan = EbReconciliationGuardsV1.planEmailApi(
    inbox.items || [], eb70IsApiCandidateV1_, eb70MatchScoreV1_);
  plan.forEach(function (row) {
    if (!write) return;
    if (row.status === 'MATCH') {
      eb70ApplyMatchV1_(row.item, row.target, row.score);
    } else if (row.status === 'REVIEW') {
      row.item.reconciliationStatus = 'DO_WERYFIKACJI_UZGODNIENIA';
      row.item.reconciliationNote = row.reason;
    }
  });
  if (write) {
    inbox.updatedAt = new Date().toISOString();
    ebInboxWriteV1_(props, inbox);
  }
  return ebReconciliationReportDevV1_('EMAIL_API', plan, write);
}

function eb79UzgodnijReczneZGmailApiV1_(write) {
  var props = PropertiesService.getScriptProperties();
  var inbox = ebInboxReadV1_(props);
  var manualRows = eb78ManualBudgetRowsV1_();
  var plan = EbReconciliationGuardsV1.planManual(
    inbox.items || [], manualRows, eb78IsManualCandidateV1_,
    eb78ManualMatchScoreV1_, function (item) {
      return ebV5IsTechnicalClass_(ebV5ClassifyWealthRule_(item));
    });
  plan.forEach(function (row) {
    if (!write) return;
    if (row.status === 'MATCH') {
      eb78ApplyManualMatchV1_(row.item, row.target, row.score);
    } else if (row.status === 'REVIEW') {
      row.item.manualBudgetReviewStatus = 'DO_WERYFIKACJI_RECZNEJ';
      row.item.manualBudgetReviewNote = row.reason;
    }
  });
  if (write) {
    inbox.updatedAt = new Date().toISOString();
    inbox.manualBudgetReconciledAt = inbox.updatedAt;
    ebInboxWriteV1_(props, inbox);
  }
  return ebReconciliationReportDevV1_('MANUAL', plan, write);
}

function ebReconciliationReportDevV1_(stage, plan, write) {
  var counts = { MATCH: 0, REVIEW: 0, NO_MATCH: 0 };
  var reasons = {};
  plan.forEach(function (row) {
    counts[row.status]++;
    if (row.reason) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  });
  var result = { stage: stage, mode: write ? 'INBOX_STATUS_ONLY' : 'READ_ONLY',
    counts: counts, reasons: reasons };
  console.log(JSON.stringify(result));
  return result;
}

// Explicit read-only entrypoint. No Gmail/API imports, triggers or budget writes.
function eb84PodgladBezpiecznegoUzgodnieniaDevV1() {
  return ebLock_(function () {
    return {
      emailApi: eb73UzgodnijAlerty24ZApiV1_(false),
      manual: eb79UzgodnijReczneZGmailApiV1_(false)
    };
  });
}
