const test = require('node:test');
const assert = require('node:assert/strict');
const queue = require('../dev/apps-script/approval-queue.js');
function snapshot(revision, amount=100, key='m1') {
 return queue.prepare(['a','b'].map(key=>({item:{key,amountCents:100},status:'REVIEW'})),
 [{manualKey:key,sheetName:'T7 Food',rowNumber:5,columnNumber:11,monthKey:'2026-10',amountCents:amount,label:'Food'}],
 ['Food'],revision,'now',()=>true,[]);
}
test('refresh preserves decisions and evidence across changed monthly amounts, without mutating inputs',()=>{
 const previous=queue.decide(snapshot('r1'),{revision:'r1',key:'a',action:'ALREADY_IN_BUDGET',manualKey:'m1'},'r2','then');
 const fresh=snapshot('r3',200,'m2'), before=JSON.stringify(previous), freshBefore=JSON.stringify(fresh);
 const result=queue.refresh(previous,fresh,'r2');
 assert.deepEqual(result.rows[0].decision,previous.rows[0].decision);
 assert.equal(result.rows[0].refreshReview,'RECHECK_AFTER_MANUAL_UPDATE');
 assert.deepEqual(result.rows[1].allowedManualKeys,[]);
 assert.equal(result.decisionEvidence[0].manualTarget.amountCents,100);
 assert.equal(JSON.stringify(previous),before);assert.equal(JSON.stringify(fresh),freshBefore);
 assert.throws(()=>queue.decide(result,{revision:'r3',key:'b',action:'ALREADY_IN_BUDGET',manualKey:'m2'},'r4','now'),/INELIGIBLE/);
});
test('missing transactions with earlier decisions remain in history; pending rows refresh from current plan',()=>{
 const previous=queue.decide(snapshot('r1'),{revision:'r1',key:'a',action:'CATEGORY',category:'Food'},'r2','then');
 const fresh=snapshot('r3');fresh.rows=fresh.rows.filter(r=>r.key!=='a');fresh.rows[0].reason='WEAK_MATCH';
 const result=queue.refresh(previous,fresh,'r2');
 assert.equal(result.rows.find(r=>r.key==='a').decision.at,'then');
 assert.equal(result.rows.find(r=>r.key==='b').reason,'WEAK_MATCH');
 assert.equal(result.refresh.decisionsPreserved,1);
});
test('repeated refresh keeps original evidence and protects changed keys; stale browser revision fails',()=>{
 const previous=queue.decide(snapshot('r1'),{revision:'r1',key:'a',action:'ALREADY_IN_BUDGET',manualKey:'m1'},'r2','then');
 const next=queue.refresh(previous,snapshot('r3',200,'m2'),'r2');
 const again=queue.refresh(next,snapshot('r4',300,'m3'),'r3');
 assert.equal(again.decisionEvidence[0].manualTarget.manualKey,'m1');
 assert.deepEqual(again.rows.find(r=>r.key==='b').allowedManualKeys,[]);
 assert.throws(()=>queue.decide(again,{revision:'r2',key:'b',action:'DEFER'},'r5','now'),/STALE/);
 assert.throws(()=>queue.refresh(previous,snapshot('r3'),'stale'),/STALE/);
});
test('defer stays deferred and fresh weak match is not automatically marked as booked',()=>{
 const previous=queue.decide(snapshot('r1'),{revision:'r1',key:'a',action:'DEFER'},'r2','then');
 const next=queue.refresh(previous,snapshot('r3'),'r2');
 assert.equal(next.rows[0].decision.action,'DEFER');assert.equal(next.rows[0].refreshReview,null);
 assert.equal(next.rows[1].decision,null);assert.equal(next.rows[1].transaction.budgetPostedAt,undefined);
});
