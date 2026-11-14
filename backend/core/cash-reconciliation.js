/* Candidate shared Node / Apps Script V8 core. No IO, credentials or deployment. */
var CashReconciliation = (() => {
  'use strict';
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
        new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
      throw Error('Invalid accounting date');
    }
    return value;
  }
  function text(value) {
    if (typeof value !== 'string' || !value.trim()) throw Error('Missing identifier');
    return value;
  }
  function cents(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid cents');
    return value;
  }
  function sum(a, b) {
    const result = a + b;
    if (!Number.isSafeInteger(result)) throw Error('Balance overflow');
    return result;
  }
  function unique(events, signature) {
    const seen = new Map();
    for (const event of events) {
      const id = text(event.id), key = signature(event);
      if (seen.has(id) && seen.get(id).key !== key) throw Error('Conflicting event identifier');
      if (!seen.has(id)) seen.set(id, {key, event});
    }
    return Array.from(seen.values(), item => item.event);
  }
  // Reads the observed KR_LEDGER_V1 JSON layout. Unknown financial kinds fail
  // closed until their real backend contract has been inspected.
  function manualRows(rows) {
    if (rows[0]?.[0] !== 'KR_LEDGER_V1') throw Error('Unsupported manual ledger schema');
    return rows.slice(2).filter(row => row[0] !== '' && row[0] != null).map(row => {
      const item = JSON.parse(row[0]);
      if (!['BO', 'WYDATEK'].includes(item.kind) || item.to) throw Error('Unmapped manual operation');
      return {id: 'manual:' + text(item.id), date: date(item.date), account: text(item.account),
        kind: item.kind, cents: cents(item.cents)};
    });
  }
  function sheetDate(value) {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value < 1 || value > 2958465) throw Error('Invalid sheet date');
      return date(new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10));
    }
    return date(value);
  }
  // destinationAccount is deliberately mandatory: the backend must establish
  // which wallet received the withdrawal. A debit is not an expense twice.
  function withdrawalRows(jsonRows, alertRows, destinationAccount) {
    text(destinationAccount);
    if (jsonRows[0]?.[0] !== 'KR_CASH_EMAIL_V1') throw Error('Unsupported cash ledger schema');
    const expected = ['ID alertu', 'Data operacji', 'Kwota w groszach', 'Konto obciążone'];
    if (expected.some((name, i) => alertRows[0]?.[i] !== name)) throw Error('Unsupported ATM schema');
    const events = jsonRows.slice(1).filter(row => row[0] !== '' && row[0] != null).map(row => {
      const item = JSON.parse(row[0]);
      if (item.kind !== 'CASH_WITHDRAWAL' || item.currency !== 'PLN' || item.direction !== 'DBIT' ||
          item.confirmedByUser !== true) throw Error('Unconfirmed or unmapped withdrawal');
      return {id: 'withdrawal:' + text(item.gmailMessageId), date: date(item.date),
        from: text(item.account), to: destinationAccount, cents: cents(item.amountCents)};
    });
    for (const row of alertRows.slice(1)) {
      if (row[0] === '' || row[0] == null) continue;
      events.push({id: 'withdrawal:' + text(row[0]), date: sheetDate(row[1]),
        from: text(row[3]), to: destinationAccount, cents: cents(row[2])});
    }
    return unique(events, item => JSON.stringify([item.date, item.from, item.to, item.cents]));
  }
  function reconcile(manual, withdrawals, account, asOf) {
    text(account); date(asOf);
    const ledger = unique(manual, item => {
      date(item.date); text(item.account); cents(item.cents);
      if (!['BO', 'WYDATEK'].includes(item.kind)) throw Error('Unmapped manual operation');
      return JSON.stringify([item.date, item.account, item.kind, item.cents]);
    });
    const transfers = unique(withdrawals, item => {
      date(item.date); text(item.from); text(item.to); cents(item.cents);
      if (item.from === item.to) throw Error('Invalid self transfer');
      return JSON.stringify([item.date, item.from, item.to, item.cents]);
    });
    const relevant = ledger.filter(item => item.account === account && item.date <= asOf);
    const openings = relevant.filter(item => item.kind === 'BO').sort((a, b) => b.date.localeCompare(a.date));
    if (!openings.length) throw Error('Missing opening balance');
    const opening = openings[0];
    if (openings.filter(item => item.date === opening.date).length !== 1) throw Error('Ambiguous opening balance');
    let balance = opening.cents;
    let spent = 0, transferred = 0;
    // BO is a start-of-day checkpoint, never an automatic monthly reset.
    // Older history is represented by the checkpoint; same-day events follow it.
    for (const item of relevant) {
      if (item.kind === 'WYDATEK' && item.date >= opening.date) spent = sum(spent, item.cents);
    }
    for (const item of transfers) {
      if (item.date < opening.date || item.date > asOf) continue;
      if (item.to === account) transferred = sum(transferred, item.cents);
      if (item.from === account) transferred = sum(transferred, -item.cents);
    }
    balance = sum(sum(balance, transferred), -spent);
    return {account, asOf, openingDate: opening.date, openingCents: opening.cents,
      expenseCents: spent, transferCents: transferred, balanceCents: balance};
  }
  return {manualRows, withdrawalRows, reconcile, sheetDate};
})();
if (typeof module !== 'undefined') module.exports = CashReconciliation;
