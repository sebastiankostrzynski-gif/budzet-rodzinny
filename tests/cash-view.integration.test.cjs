// Simulated source -> candidate calculation -> existing UI, without network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../backend/core/cash-reconciliation');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const source=html.slice(html.indexOf('function openBalances_()'),html.indexOf('function openSavings_()'));
function harness(read) {
  const nodes=new Map();
  const element=()=>({children:[],style:{},textContent:'',innerHTML:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
  for (const id of ['app','balances-status','balances-list']) nodes.set(id,element());
  let success, failure;
  const runner={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(fn){failure=fn;return this;},getAccountBalances(){try{success(read());}catch(e){failure(e);}}};
  const context=vm.createContext({activeView_:'',setBudgetTab_(){},document:{getElementById:id=>nodes.get(id),createElement:element},budgetApi:{script:{run:runner}},Intl,Date});
  vm.runInContext(source+'\nopenBalances_();',context);
  return nodes;
}
test('synthetic ledger through candidate core renders lower cash in existing balances view',()=>{
  const wallet='Synthetic cash';
  const rows=[['KR_LEDGER_V1'],['test'],...[
    {id:'opening',account:wallet,kind:'BO',date:'2026-11-01',cents:10000},
    {id:'purchase',account:wallet,kind:'WYDATEK',date:'2026-11-02',cents:1500}
  ].map(x=>[JSON.stringify(x)])];
  const result=core.reconcile(core.manualRows(rows),[],wallet,'2026-11-14');
  const nodes=harness(()=>({accounts:[{name:wallet,amount:result.balanceCents/100}],readAt:'2026-11-14T12:00:00Z'}));
  assert.equal(nodes.get('balances-list').children[0].children[1].textContent,new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(85));
});
test('simulated API failure shows an error instead of invented balance',()=>{
  const nodes=harness(()=>{throw Error('Synthetic API unavailable');});
  assert.match(nodes.get('balances-status').textContent,/Synthetic API unavailable/);
  assert.equal(nodes.get('balances-list').children.length,0);
});
