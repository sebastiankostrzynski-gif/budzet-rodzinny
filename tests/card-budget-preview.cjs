const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('private-budget.js', 'utf8');
const preview = source.slice(source.indexOf('  const expensePreviews='),source.indexOf('  function recordAssignment'));
const id = 'ffffffff00000001', key = 'alerty24-queue|'+id;
const store = new Map();
let posted = [], expenses = 1000;
function page(){
  const context=vm.createContext({
    window:{budgetViewerRole:'owner'},document:{hidden:false,dispatchEvent(){}},
    dashboardData:{year:2026,monthNumber:11,wolneSrodki:900,wydatki:1000},
    Event,URLSearchParams,testFileId:'test',activeView_:'dashboard',refreshDashboardSilently_(){},
    jobKey:job=>job.request.key,setInterval(){},
    sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    portfolioRequest:async()=>({valueRanges:[{values:posted},{values:[[46327]]},{values:[[expenses]]}]})
  });
  vm.runInContext(preview,context);
  return context;
}
(async()=>{
  let c=page();
  const job={phase:'ready',request:{key},previewDate:'2026-11-27',previewCents:2500,previewEligible:true,cardExpense:true};
  const balance=()=>((c.window.expensePreview.base(c.dashboardData)??Math.round(c.dashboardData.wolneSrodki*100))-10000);
  c.trackPreview(job);
  assert.equal(balance(),77500);
  c.trackPreview({...job,phase:'confirmed'});
  c.window.expensePreview.settle(c.dashboardData,c.window.expensePreview.revision());
  assert.equal(balance(),77500,'OK for the decision is insufficient');
  c=page();
  assert.equal(balance(),77500,'reload');
  posted=[['another-id',0,'Shop','POSTED_TEST_NEW_ROW',-25,'T12!L1']];
  await c.checkCardPreview(c.dashboardData);
  assert.equal(balance(),77500,'equal amount on a different purchase');
  expenses+=25; posted.push([id,0,'Shop','POSTED_TEST_NEW_ROW',-25,'T12!L2']);
  await c.checkCardPreview(c.dashboardData);
  assert.equal(balance(),77500,'ledger is newer than dashboard');
  c.dashboardData={...c.dashboardData,wydatki:expenses,wolneSrodki:875};
  await c.checkCardPreview(c.dashboardData);
  assert.equal(c.window.expensePreview.base(c.dashboardData),null);
  assert.equal(balance(),77500,'handoff without double subtraction');
  c.trackPreview(job);c.trackPreview({...job,phase:'error'});
  assert.equal(balance(),77500,'rejected assignment rolls back');
  posted=[];c=page();expenses=c.dashboardData.wydatki;
  await c.checkCardPreview(c.dashboardData,[{key,amountCents:2500},{key,amountCents:2500}]);
  assert.equal(balance(),77500,'recover once from published decision on another session');
  console.log('PASS: immediate budget balance, delayed posting, refresh, reload, errors and duplicate prevention');
})().catch(e=>{console.error(e);process.exitCode=1;});
