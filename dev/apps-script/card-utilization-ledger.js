'use strict';
var EbCardUtilizationV1 = (function () {
  var TYPES = ['PURCHASE','REFUND','PAYMENT','REVERSAL'];
  var ACTIVE = {PENDING:true, POSTED:true};
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function cents(n, name) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('INVALID_' + name);
    return n;
  }
  function id(x, name) {
    if (typeof x !== 'string' || !x.trim() || x.length > 300) throw new Error('INVALID_' + name);
    return x.trim();
  }
  function create(config) {
    if (!config || !Number.isInteger(config.limitCents) || config.limitCents <= 0) throw new Error('INVALID_LIMIT');
    var opening = cents(config.openingUtilizedCents, 'OPENING_BALANCE');
    if (typeof config.openedAt !== 'string' || !config.openedAt) throw new Error('INVALID_OPENED_AT');
    return {version:1, currency:'PLN', limitCents:config.limitCents,
      openingUtilizedCents:opening, openedAt:config.openedAt, events:[]};
  }
  function type(x) {
    if (TYPES.indexOf(x) < 0) throw new Error('INVALID_EVENT_TYPE');
    return x;
  }
  function eventImpact(e) {
    if (!ACTIVE[e.status]) return 0;
    return e.type === 'PURCHASE' ? e.amountCents : -e.amountCents;
  }
  function findEmail(s, sourceId) {
    return s.events.find(function (e) { return e.emailSourceId === sourceId; });
  }
  function findApi(s, sourceId) {
    return s.events.find(function (e) { return e.apiSourceId === sourceId; });
  }
  function addEmail(s, raw) {
    var sourceId = id(raw.sourceId, 'EMAIL_SOURCE_ID'), kind = type(raw.type);
    var amount = cents(raw.amountCents, 'AMOUNT');
    var old = findEmail(s, sourceId);
    if (old) {
      if (old.type !== kind || old.emailAmountCents !== amount) throw new Error('EMAIL_ID_CONFLICT');
      return;
    }
    s.events.push({logicalId:'EMAIL:' + sourceId, emailSourceId:sourceId, apiSourceId:null,
      type:kind, amountCents:amount, emailAmountCents:amount, status:'PENDING',
      eventAt:raw.eventAt || '', merchant:raw.merchant || '', cardLast4:raw.cardLast4 || ''});
  }
  function addApi(s, raw) {
    var sourceId = id(raw.sourceId, 'API_SOURCE_ID'), kind = type(raw.type);
    var amount = cents(raw.amountCents, 'AMOUNT');
    var existing = findApi(s, sourceId);
    if (existing) {
      existing.type = kind; existing.amountCents = amount;
      existing.status = raw.review ? 'REVIEW' : 'POSTED';
      existing.bookingDate = raw.bookingDate || existing.bookingDate || '';
      existing.merchant = raw.merchant || existing.merchant || '';
      return;
    }
    s.events.push({logicalId:'API:' + sourceId, emailSourceId:null, apiSourceId:sourceId,
      type:kind, amountCents:amount, status:raw.review ? 'REVIEW' : 'POSTED',
      bookingDate:raw.bookingDate || '', merchant:raw.merchant || '', cardLast4:raw.cardLast4 || ''});
  }
  function link(s, emailSourceId, apiSourceId) {
    var e = findEmail(s,id(emailSourceId,'EMAIL_SOURCE_ID'));
    var a = findApi(s,id(apiSourceId,'API_SOURCE_ID'));
    if (!e || !a) throw new Error('UNKNOWN_LINK');
    if (e.type !== a.type) throw new Error('EVENT_TYPE_MISMATCH');
    if (e.status === 'VOID') throw new Error('CANNOT_LINK_VOID_EVENT');
    if ((e.apiSourceId && e.apiSourceId !== a.apiSourceId) ||
        (a.emailSourceId && a.emailSourceId !== e.emailSourceId)) throw new Error('LINK_CONFLICT');
    e.apiSourceId = a.apiSourceId;
    e.amountCents = a.amountCents; // replace provisional amount with booked amount
    e.status = a.status === 'REVIEW' ? 'REVIEW' : 'POSTED';
    e.bookingDate = a.bookingDate || '';
    e.merchant = a.merchant || e.merchant || '';
    s.events.splice(s.events.indexOf(a),1); // one logical event, two source references
  }
  function sync(state, batch) {
    if (!state || state.version !== 1 || !Array.isArray(state.events)) throw new Error('INVALID_STATE');
    var next = copy(state), input = batch || {};
    (input.emails || []).forEach(function (e) { addEmail(next,e); });
    (input.api || []).forEach(function (e) { addApi(next,e); });
    (input.links || []).forEach(function (x) { link(next,x.emailSourceId,x.apiSourceId); });
    (input.voidEmailSourceIds || []).forEach(function (sourceId) {
      var e = findEmail(next,id(sourceId,'EMAIL_SOURCE_ID'));
      if (!e) throw new Error('UNKNOWN_EMAIL_VOID');
      if (e.status === 'POSTED') throw new Error('CANNOT_VOID_POSTED_EVENT');
      e.status = 'VOID';
    });
    (input.reviewSourceIds || []).forEach(function (sourceId) {
      var e = next.events.find(function (item) { return item.emailSourceId === sourceId || item.apiSourceId === sourceId; });
      if (!e) throw new Error('UNKNOWN_REVIEW_EVENT');
      if (e.status !== 'POSTED' && e.status !== 'VOID') e.status = 'REVIEW';
    });
    return next;
  }
  function totals(state) {
    var current = state.openingUtilizedCents;
    state.events.forEach(function (e) { current += eventImpact(e); });
    return {utilizedCents:current, u30Cents:-current,
      activeEvents:state.events.filter(function(e){return ACTIVE[e.status];}).length,
      reviewEvents:state.events.filter(function(e){return e.status === 'REVIEW';}).length};
  }
  function compareAvailable(state, availableCents) {
    var available = cents(availableCents,'AVAILABLE_CREDIT');
    if (available > state.limitCents) throw new Error('AVAILABLE_EXCEEDS_LIMIT');
    var calculated = totals(state).utilizedCents, bankUsed = state.limitCents - available;
    return {calculatedUtilizedCents:calculated, bankUtilizedCents:bankUsed,
      differenceCents:calculated-bankUsed};
  }
  return {create:create, sync:sync, totals:totals, compareAvailable:compareAvailable};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EbCardUtilizationV1;