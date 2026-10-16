const test = require('node:test');
const assert = require('node:assert/strict');
const queue = require('../dev/apps-script/approval-queue.js');
function fixture(reserved = []) {
  return queue.prepare(['a', 'b'].map(key => ({ item: { key, amount: 10 }, status: 'REVIEW' })),
    [{ manualKey: 'm', amount: 10 }, { manualKey: 'wrong', amount: 20 }],
    ['Żywność'], 'r1', '2026-10-15', (a,b) => a.amount === b.amount, reserved);
}
function req(extra) { return { revision: 'r1', key: 'a', action: 'CATEGORY', category: 'Żywność', ...extra }; }
test('decision preserves input and transaction; no posted status', () => {
  const state = fixture(), before = JSON.stringify(state);
  const next = queue.decide(state, req({amount: 99}), 'r2', 'now');
  assert.equal(JSON.stringify(state), before);
  assert.equal(next.rows[0].transaction.amount, 10);
  assert.equal(next.rows[0].transaction.budgetPostedAt, undefined);
  assert.equal(next.rows[0].decision.category, 'Żywność');
});
test('stale tab and retry cannot overwrite a decision', () => {
  const next = queue.decide(fixture(), req(), 'r2', 'now');
  assert.throws(() => queue.decide(next, req(), 'r3', 'now'), /STALE/);
  assert.throws(() => queue.decide(next, req({revision:'r2'}), 'r3', 'now'), /ALREADY_DECIDED/);
});
test('manual entry can only be claimed once', () => {
  const next = queue.decide(fixture(), req({action:'ALREADY_IN_BUDGET',manualKey:'m'}), 'r2','now');
  assert.throws(() => queue.decide(next, req({revision:'r2', key:'b', action:'ALREADY_IN_BUDGET',manualKey:'m'}),'r3','now'), /CLAIMED/);
});
test('rejects mismatched amount and earlier reserved entry', () => {
  for (const [state, key] of [[fixture(),'wrong'],[fixture(['m']),'m']]) {
    assert.throws(() => queue.decide(state, req({action:'ALREADY_IN_BUDGET',manualKey:key}),'r2','now'), /INELIGIBLE/);
  }
});
test('rejects unknown categories/actions/transactions', () => {
  for (const change of [{category:'fake'}, {action:'POST_BUDGET'}, {key:'fake'}]) {
    assert.throws(() => queue.decide(fixture(), req(change),'r2','now'));
  }
});
test('defer is recorded without budget mutation', () => {
  assert.deepEqual(queue.decide(fixture(),req({action:'DEFER'}),'r2','now').rows[0].decision,
    {action:'DEFER',at:'now'});
});
function expenseFixture() {
  const s=fixture(); s.manualRows[0].sheetName='T12 Ubrania i prezenty';
  s.manualRows[0].label='Odzież'; return s;
}
test('new row records own description and server-validated sheet, preserving original transaction',()=>{
 const s=expenseFixture(), before=JSON.stringify(s);
 const next=queue.decide(s,req({action:'NEW_ROW',person:'Julka',sheetName:'T12 Ubrania i prezenty',description:'  Buty Julki  ',amount:999}),'r2','now');
 assert.equal(next.rows[0].decision.description,'Buty Julki');
 assert.equal(next.rows[0].decision.sheetName,'T12 Ubrania i prezenty');
 assert.equal(next.rows[0].transaction.amount,10); assert.equal(JSON.stringify(s),before);
});
test('new row requires description, known expense sheet, and bounded text',()=>{
 for(const change of [{description:''},{sheetName:'T1 Dochody'},{sheetName:'unknown'},{description:'x'.repeat(201)},{description:'a\nb'}]) {
  assert.throws(()=>queue.decide(expenseFixture(),req({action:'NEW_ROW',person:'Julka',sheetName:'T12 Ubrania i prezenty',description:'Parasol',...change}),'r2','now'));
 }
});
test('several purchases can add to the same total without claiming an already booked expense',()=>{
 const s=queue.decide(expenseFixture(),req({action:'EXISTING_ROW',targetManualKey:'m',description:'Zakupy'}),'r2','now');
 const next=queue.decide(s,req({revision:'r2',key:'b',action:'EXISTING_ROW',targetManualKey:'m'}),'r3','now');
 assert.equal(next.rows[1].decision.targetManualKey,'m');
 assert.equal(next.rows[1].decision.manualKey,undefined);
 assert.equal(next.rows[0].decision.description,'Zakupy');
});
test('existing target must be server-known and earlier decisions survive new-row decision',()=>{
 assert.throws(()=>queue.decide(expenseFixture(),req({action:'EXISTING_ROW',targetManualKey:'fake'}),'r2','now'),/UNKNOWN/);
 const s=queue.decide(expenseFixture(),req(),'r2','first');
 const next=queue.decide(s,req({revision:'r2',key:'b',action:'NEW_ROW',person:'Julka',sheetName:'T12 Ubrania i prezenty',description:'Parasol'}),'r3','now');
 assert.deepEqual(next.rows[0].decision,s.rows[0].decision);
});

test('new clothing purchase requires a known person and records it separately from description',()=>{
 for(const person of [undefined,'','unknown']) {
  assert.throws(()=>queue.decide(expenseFixture(),req({action:'NEW_ROW',sheetName:'T12 Ubrania i prezenty',description:'Buty',person}),'r2','now'),/PERSON_REQUIRED/);
 }
 for(const person of ['Ewa','Julka','Olek','Seba']) {
  const next=queue.decide(expenseFixture(),req({action:'NEW_ROW',sheetName:'T12 Ubrania i prezenty',description:'Buty',person}),'r2','now');
  assert.equal(next.rows[0].decision.person,person); assert.equal(next.rows[0].decision.description,'Buty');
 }
});
