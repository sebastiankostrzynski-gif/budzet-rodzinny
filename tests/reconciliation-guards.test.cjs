const {test}=require('node:test');
const assert=require('node:assert/strict');
const guards=require('../dev/apps-script/reconciliation-guards.js');
const email=(key,extra={})=>({key,source:'ALERTY24_EMAIL',direction:'DBIT',amountCents:1695,...extra});
const api=(key,extra={})=>({key,accountLabel:'R1',direction:'DBIT',amountCents:1695,...extra});
const manual=(key)=>({manualKey:key,amountCents:1695});
const match=()=>true,score=()=>12,technical=()=>false;

test('API refresh preserves links and decisions, but takes current bank amount/date',()=>{
 const old=api('a',{amountCents:1695,bookingDate:'2026-10-14',alerty24MatchedKey:'e',alerty24MatchedAt:'old',manualBudgetMatchedKey:'m',manualBudgetRow:7,v5Decision:'POMIN',splits:[{amountCents:1695}]});
 const current=api('a',{amountCents:1795,bookingDate:'2026-10-15'});
 guards.preserveApiMetadata(current,old);
 assert.equal(current.alerty24MatchedKey,'e');assert.equal(current.manualBudgetMatchedKey,'m');assert.equal(current.v5Decision,'POMIN');
 assert.equal(current.amountCents,1795);assert.equal(current.bookingDate,'2026-10-15');
 current.splits[0].amountCents=1;assert.equal(old.splits[0].amountCents,1695);
 assert.throws(()=>guards.preserveApiMetadata(api('b'),old));
});
test('same API snapshot can repeat without losing prior decisions',()=>{
 let old=api('a',{alerty24MatchedKey:'e',manualBudgetMatchedKey:'m',budgetPostedAt:'saved'});
 for(let i=0;i<5;i++)old=guards.preserveApiMetadata(api('a'),old);
 assert.equal(old.alerty24MatchedKey,'e');assert.equal(old.manualBudgetMatchedKey,'m');assert.equal(old.budgetPostedAt,'saved');
});
test('one email and one API produce one match without mutating the inbox',()=>{
 const items=[email('e'),api('a')],before=JSON.stringify(items);
 const result=guards.planEmailApi(items,match,score);assert.equal(result[0].target.key,'a');assert.equal(result[0].status,'MATCH');assert.equal(JSON.stringify(items),before);
});
test('two emails competing for one API are both review, independent of input order',()=>{
 for(const items of [[email('e1'),email('e2'),api('a')],[api('a'),email('e2'),email('e1')]]){
  const result=guards.planEmailApi(items,match,(e)=>e.key==='e1'?12:10);
  assert.equal(result.filter(r=>r.status==='MATCH').length,0);assert.ok(result.every(r=>r.reason==='SHARED_TARGET'));
 }
});
test('one email with tied API candidates goes to review',()=>{
 assert.equal(guards.planEmailApi([email('e'),api('a1'),api('a2')],match,score)[0].reason,'TIED_TARGETS');
});
test('existing email link reserves API even if the API-side link is absent',()=>{
 const result=guards.planEmailApi([email('old',{apiMatchedKey:'a'}),email('new'),api('a')],match,score);
 assert.equal(result.length,1);assert.equal(result[0].reason,'ALREADY_CLAIMED');
});
test('existing API link reserves API even if corresponding email is absent',()=>{
 assert.equal(guards.planEmailApi([email('e'),api('a',{alerty24MatchedKey:'old'})],match,score)[0].reason,'ALREADY_CLAIMED');
});
test('manual entries used in earlier runs cannot be reused',()=>{
 const items=[api('old',{manualBudgetMatchedKey:'m',v5Decision:'UJETE_RECZNIE_W_BUDZECIE'}),api('new')];
 assert.equal(guards.planManual(items,[manual('m')],match,score,technical)[0].reason,'ALREADY_CLAIMED');
});
test('two purchases cannot consume one manual entry',()=>{
 const result=guards.planManual([api('a1'),api('a2')],[manual('m')],match,score,technical);
 assert.ok(result.every(r=>r.status==='REVIEW'));
});
test('confirmed API counterpart is excluded from manual queue; email is canonical',()=>{
 const result=guards.planManual([email('e',{apiMatchedKey:'a'}),api('a',{alerty24MatchedKey:'e',v5Decision:'POMIN'})],[manual('m')],match,score,technical);
 assert.equal(result.length,1);assert.equal(result[0].item.key,'e');assert.equal(result[0].status,'MATCH');
});
test('credit card repayment, own transfer and handled records are excluded',()=>{
 const items=[api('repayment',{technical:true}),api('savings',{technical:true}),api('ignored',{v5Decision:'POMIN'}),api('written',{v5Decision:'ZAPISANE_DO_BUDZETU'}),api('credit',{direction:'CRDT'}),api('cancelled',{status:'ANULOWANE'})];
 assert.equal(guards.planManual(items,[manual('m')],match,score,i=>!!i.technical).length,0);
});
test('weak descriptions remain review and unmatched purchases remain pending',()=>{
 assert.equal(guards.planManual([api('a')],[manual('m')],match,()=>5,technical)[0].reason,'WEAK_MATCH');
 assert.equal(guards.planManual([api('a')],[manual('m')],()=>false,score,technical)[0].status,'NO_MATCH');
});
test('invalid repeated identities stop the plan',()=>{
 assert.throws(()=>guards.planEmailApi([email('e'),email('e'),api('a')],match,score));
 assert.throws(()=>guards.planManual([api('a')],[manual('m'),manual('m')],match,score,technical));
});
test('second run after matching has no new email/API match',()=>{
 const items=[email('e'),api('a')];const first=guards.planEmailApi(items,match,score)[0];
 first.item.apiMatchedKey=first.target.key;first.target.alerty24MatchedKey=first.item.key;
 assert.equal(guards.planEmailApi(items,match,score).length,0);
});
