const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('private-budget.js', 'utf8');
function between(from, to) {
  assert(source.includes(from) && source.includes(to));
  return source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
}
const ledger = new Map();
const context = vm.createContext({
  queueSheets: async path => ({values: ledger.get(decodeURIComponent(path).split("'")[1]) || []})
});
vm.runInContext(fs.readFileSync('income-reconciliation.js', 'utf8'), context);
vm.runInContext(between('  function childTransferName(', '  async function markSettledRedemptions('), context);
vm.runInContext(between('  function assignmentCommands(', '  async function readPhoneQueue('), context);
vm.runInContext(between('  function pendingIncome(', '  const formMethods'), context);

const id = '1234567890abcdef';
const mail = {key: 'external-mail|' + id, merchant: 'Wpływ z maila: Sklep', account: 'R2',
  date: '2026-11-26', amountCents: 12500, currency: 'PLN'};
const bank = {...mail, key: 'bank-n26|2026-11-26/9/1', merchant: 'Sklep'};
const command = result => ['INCOME_V1', 'receipt', JSON.stringify({key: mail.key}), result];
function pending(results) {
  const {incomeCommands} = context.assignmentCommands(results.map(command));
  return context.pendingIncome({data: {income: {rows: [mail]}}, incomeCommands}).length;
}
assert.equal(pending([]), 1);
assert.equal(pending(['Błąd: odrzucono']), 1);
assert.equal(pending(['']), 0);
assert.equal(pending(['OK']), 0);
assert.equal(pending(['OK', '', 'Błąd: ponowienie', 'Błąd: ponowienie']), 0);
const {byKey} = context.assignmentCommands(['OK','Błąd: odrzucono'].map(result =>
  ['ASSIGN_V1', 'receipt', JSON.stringify({key: bank.key}), result]));
assert.equal(byKey.get(bank.key).result, 'OK');
assert.equal(context.reconcileIncomeRows([mail, bank]).length, 1);
assert.equal(context.reconcileIncomeRows([mail, {...bank, merchant: 'Inny sklep'}]).length, 2);
assert.equal(context.reconcileIncomeRows([mail, bank, {...bank, key:'bank-n26|2026-11-26/9/2'}]).length, 3);
const settled = {...bank, settledRedemption: true};
const decision = new Map([[mail.key, {result: 'Błąd: odrzucono'}]]);
assert.equal(context.reconcileIncomeRows([mail, settled], decision)[0], settled);

// A busy writer can rotate the attempt ID, while the expense ID remains stable.
const manualForm = fs.readFileSync('manual-entry.html', 'utf8');
const submitted = {id:'attempt-two', request:{id:'purchase-one'}, phase:'confirmed'};
const controls = new Map();
const receipt = {id:'purchase-one',phase:'waiting'};
const manual = vm.createContext({
  lastExpense:receipt,window:{parent:{manualExpenses:{list:()=>[submitted]}}},
  rememberReceipt:()=>{},money:()=>'', $: id => {
    if(!controls.has(id))controls.set(id,{});
    return controls.get(id);
  }
});
vm.runInContext(manualForm.slice(manualForm.indexOf('function showReceipt()'),manualForm.indexOf("$('anotherExpense').onclick")),manual);
manual.showReceipt();
assert.equal(controls.get('receiptStatus').textContent, 'Wydatek zapisany');
const removed=[];
const reconcile=between('    reconcile(caller,rows){', '  const planReceiptKey');
vm.runInContext('window.manualExpenses={'+reconcile, Object.assign(manual,{
  localStorage:{removeItem:key=>removed.push(key)},assignmentPrefix:'saved:',jobKey:j=>'manual:'+j.request.id
}));
manual.window.manualExpenses.list=()=>[submitted];
manual.window.manualExpenses.reconcile(null,[{id:'some-other-purchase'}]);
manual.window.manualExpenses.reconcile(null,[{id:'purchase-one'}]);
assert.deepEqual(removed,['saved:manual:purchase-one']);

async function replayPayment() {
  const entry = {key: 'bank-n26|2026-11-26/3/8', amountCents: 80000, date: '2026-11-26',
    description: 'XTB S.A. Prosta 67 ref. 12345678', currency: 'PLN'};
  ledger.set('Automat konta R2 DEV', [[mail.key, '2026-11-26',
    'Zakup BLIK XTB S.A. ref. 12345678', 'POSTED_TEST_R2', 800, 'Oszczędności']]);
  ledger.set('Ruchy zewnętrzne R2 TEST', [[id, '2026-11-26', 'DBIT', 80000, '2026-11-26/3/8']]);
  for (let attempt=0; attempt<2; attempt++) {
    const evidence = await context.postedR2Payments([entry]);
    assert.equal(evidence.size, 1);
    assert.equal(evidence.get(entry.key).amountCents, 80000);
  }
  ledger.get('Ruchy zewnętrzne R2 TEST')[0][4] = '';
  const other = {...entry, key: 'bank-n26|2026-11-26/3/9', description: 'XTB S.A. ref. 99999999'};
  const evidence = await context.postedR2Payments([entry, other]);
  assert.equal(evidence.size, 0);
  assert(evidence.possibleRepeats.has(entry.key));
  assert(!evidence.possibleRepeats.has(other.key));
}
replayPayment().then(() => console.log('PASS: pending, confirmed, rejected and repeated assignments; matching email and bank entries; ambiguous pairs; separate XTB references; replay.'));
