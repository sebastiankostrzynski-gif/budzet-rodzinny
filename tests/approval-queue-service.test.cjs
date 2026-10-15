const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const queue = require('../dev/apps-script/approval-queue.js');
function setup() {
  let stored, reads = 0, writes = 0, released = 0;
  const state = queue.prepare([{item:{key:'a',amountCents:1695,currency:'PLN'},status:'NO_MATCH'}],
    [{manualKey:'m',amountCents:1695,sheetName:'T5',label:'Jedzenie'}], ['Jedzenie'],'r1','today',()=>true,[]);
  const context = {
    ebDevAssertIsolation_:()=>{}, EbApprovalQueueDevV1:queue,
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>{reads++;return stored;},setProperty:(k,v)=>{writes++;stored=v;}})},
    Utilities:{newBlob:v=>({getBytes:()=>v,getDataAsString:()=>v}),gzip:v=>v,ungzip:v=>v,
      base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>Buffer.from(v,'base64').toString(),getUuid:()=> 'r2'},
    // Any accidental import or sheet scan on page read/decision fails this test.
    eb78ManualBudgetRowsV1_:()=>{throw Error('UNEXPECTED_SHEET_SCAN');},
    ebInboxReadV1_:()=>{throw Error('UNEXPECTED_INBOX_SCAN');}
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync('dev/apps-script/approval-queue-service.gs','utf8'),context);
  context.ebQueueWrite_(state);
  return {context,counts:()=>({reads,writes,released}),state};
}
 test('page read only reads saved property and converts cents correctly',()=>{
  const s=setup(), before=s.counts().writes, view=s.context.ebQueueListDev();
  assert.equal(view.rows[0].amount,16.95); assert.equal(view.rows[0].candidates[0].sheet,'T5');
  assert.equal(s.counts().writes,before); assert.equal(s.counts().released,1);
 });
 test('decision persists and subsequent reopen returns decision without sheet scans',()=>{
  const s=setup(); s.context.ebQueueDecideDev({revision:'r1',key:'a',action:'CATEGORY',category:'Jedzenie'});
  assert.equal(s.context.ebQueueListDev().rows[0].decision.category,'Jedzenie');
  assert.equal(s.counts().writes,2);
 });
 test('invalid decision releases lock and leaves saved state intact',()=>{
  const s=setup(); assert.throws(()=>s.context.ebQueueDecideDev({revision:'old'}),/STALE/);
  assert.equal(s.context.ebQueueListDev().revision,'r1'); assert.equal(s.counts().writes,1);
 });
 test('oversize write rejects before replacing previous saved queue',()=>{
  const s=setup(); assert.throws(()=>s.context.ebQueueWrite_({data:'x'.repeat(9000)}),/limit/);
  assert.equal(s.context.ebQueueListDev().revision,'r1');
 });
