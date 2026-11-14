const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const core = require('../backend/core/cash-reconciliation');
const wallet = 'Test cash';
const bo = {id:'bo', account:wallet, kind:'BO', date:'2026-11-01', cents:10000};
const expense = (overrides={}) => ({id:'expense', account:wallet, kind:'WYDATEK', date:'2026-11-02', cents:1500, ...overrides});
const transfer = (overrides={}) => ({id:'atm', from:'R2', to:wallet, date:'2026-11-02', cents:5000, ...overrides});
const balance = (manual=[bo], transfers=[], asOf='2026-11-14') => core.reconcile(manual, transfers, wallet, asOf).balanceCents;
test('cash expense reduces balance without budget posting metadata', () => assert.equal(balance([bo, expense()]), 8500));
test('budget status does not determine cash movement', () => assert.equal(balance([bo, expense({budgetStatus:'PENDING'})]), 8500));
test('same expense ID repeated after synchronization counts once', () => assert.equal(balance([bo, expense(), expense()]), 8500));
test('different expenses with identical amount and day count separately', () => assert.equal(balance([bo, expense(), expense({id:'second'})]), 7000));
test('conflicting expense ID fails visibly', () => assert.throws(() => balance([bo, expense(), expense({cents:1600})]), /Conflicting/));
test('ATM withdrawal increases cash, cash purchase reduces it', () => assert.equal(balance([bo, expense()], [transfer()]), 13500));
test('outgoing transfer decreases cash', () => assert.equal(balance([bo], [transfer({from:wallet, to:'R2'})]), 5000));
test('internal transfer conserves combined balances', () => {
  const manual=[bo, {id:'bank-bo',account:'R2',kind:'BO',date:bo.date,cents:20000}];
  const events=[transfer()];
  const cash=core.reconcile(manual,events,wallet,'2026-11-14');
  const bank=core.reconcile(manual,events,'R2','2026-11-14');
  assert.equal(cash.balanceCents+bank.balanceCents,30000);
});
test('month boundary carries cash forward', () => assert.equal(balance([bo,expense()], [], '2026-12-01'), 8500));
test('year boundary carries cash forward', () => assert.equal(balance([bo,expense()], [], '2027-01-01'), 8500));
test('future expense is excluded from historical balance', () => assert.equal(balance([bo,expense({date:'2026-12-01'})]),10000));
test('future transfer is excluded', () => assert.equal(balance([bo],[transfer({date:'2026-12-01'})]),10000));
test('new checkpoint replaces preceding history without resetting each month', () => {
  const checkpoint={...bo,id:'new-bo',date:'2026-12-01',cents:7000};
  assert.equal(balance([bo,expense(),checkpoint,expense({id:'dec',date:'2026-12-02'})],[], '2026-12-03'),5500);
});
test('ambiguous checkpoint fails', () => assert.throws(() => balance([bo,{...bo,id:'other'}]), /Ambiguous/));
test('missing opening balance fails', () => assert.throws(() => balance([expense()]), /Missing opening/));
test('same-day transactions follow start-of-day checkpoint', () => assert.equal(balance([bo,expense({date:bo.date})]),8500));
test('negative balances are preserved for reconciliation', () => assert.equal(balance([bo,expense({cents:15000})]),-5000));
test('decimal, negative and unsafe amounts fail', () => {
  for (const cents of [-1, 1.2, NaN, Number.MAX_SAFE_INTEGER+1]) assert.throws(() => balance([bo,expense({cents})]), /Invalid cents/);
});
test('overflow fails instead of rounding money', () => assert.throws(() => balance([{...bo,cents:Number.MAX_SAFE_INTEGER}],[transfer()]),/overflow/));
test('impossible dates fail', () => assert.throws(() => balance([bo,expense({date:'2026-02-30'})]), /date/));
test('unknown manual kind fails instead of silently omitting it', () => assert.throws(() => balance([bo,expense({kind:'UNKNOWN'})]), /Unmapped/));
test('self-transfer fails', () => assert.throws(() => balance([bo],[transfer({from:wallet})]),/self transfer/));
test('unrelated account expense does not affect cash', () => assert.equal(balance([bo,expense({account:'Other'})]),10000));
const manualRows = items => [['KR_LEDGER_V1'], ['Test note'], ...items.map(item=>[JSON.stringify(item)])];
const cashRows = items => [['KR_CASH_EMAIL_V1'], ...items.map(item=>[JSON.stringify(item)])];
const headers = ['ID alertu','Data operacji','Kwota w groszach','Konto obciążone'];
const source = {gmailMessageId:'gmail-test',date:'2026-11-02',account:'R2',direction:'DBIT',currency:'PLN',amountCents:5000,kind:'CASH_WITHDRAWAL',confirmedByUser:true};
test('observed JSON and ATM sheet schemas integrate and deduplicate source IDs', () => {
  const manual=core.manualRows(manualRows([bo,expense()]));
  const withdrawals=core.withdrawalRows(cashRows([source]),[headers,['gmail-test',source.date,5000,'R2']],wallet);
  assert.equal(withdrawals.length,1);
  assert.equal(balance(manual,withdrawals),13500);
});
test('conflicting amount across withdrawal sources fails', () => assert.throws(() => core.withdrawalRows(cashRows([source]),[headers,['gmail-test',source.date,5001,'R2']],wallet),/Conflicting/));
test('numeric Sheets date and ISO date identify the same withdrawal', () => {
  const serial=(Date.parse(source.date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
  assert.equal(core.withdrawalRows(cashRows([source]),[headers,['gmail-test',serial,5000,'R2']],wallet).length,1);
});
test('blank rows are ignored', () => assert.equal(core.manualRows([...manualRows([bo]),[],['']]).length,1));
test('missing schema or broken JSON fails', () => {
  assert.throws(()=>core.manualRows([['wrong']]));
  assert.throws(()=>core.manualRows([['KR_LEDGER_V1'],[],['broken']]));
});
test('unmapped transfer in manual JSON blocks integration', () => assert.throws(()=>core.manualRows(manualRows([{...expense(),to:'Other'}])),/Unmapped/));
test('unconfirmed or foreign currency withdrawal fails', () => {
  for (const item of [{...source,confirmedByUser:false},{...source,currency:'EUR'}])
    assert.throws(()=>core.withdrawalRows(cashRows([item]),[headers],wallet));
});
test('empty ATM source works with schema and explicit wallet mapping', () => assert.deepEqual(core.withdrawalRows(cashRows([]),[headers],wallet),[]));
test('adapter requires explicit destination wallet', () => assert.throws(()=>core.withdrawalRows(cashRows([source]),[headers],''),/identifier/));
test('repeat read is deterministic and does not mutate inputs', () => {
  const manual=[bo,expense()], transfers=[transfer()], before=JSON.stringify([manual,transfers]);
  assert.equal(balance(manual,transfers),balance(manual,transfers));
  assert.equal(JSON.stringify([manual,transfers]),before);
});
test('core loads without CommonJS in Apps Script V8-like context', () => {
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../backend/core/cash-reconciliation'),'utf8'),context);
  assert.equal(context.CashReconciliation.reconcile([bo,expense()],[],wallet,'2026-11-14').balanceCents,8500);
});
