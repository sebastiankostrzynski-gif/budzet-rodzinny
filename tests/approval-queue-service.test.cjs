const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const queue = require('../dev/apps-script/approval-queue.js');
function setup() {
  let reads = 0, writes = 0, released = 0, failAfter = Infinity;
  const stored = {};
  const state = queue.prepare([{item:{key:'a',amountCents:1695,currency:'PLN'},status:'NO_MATCH'}],
    [{manualKey:'m',amountCents:1695,sheetName:'T5',label:'Jedzenie'}], ['Jedzenie'],'r1','today',()=>true,[]);
  const context = {
    ebDevAssertIsolation_:()=>{}, EbApprovalQueueDevV1:queue, console:{log:()=>{}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>{reads++;return stored[k];},getProperties:()=>({...stored}),setProperty:(k,v)=>{if(writes >= failAfter) throw Error("SIMULATED_WRITE_FAILURE");writes++;stored[k]=v;}})},
    Utilities:{newBlob:(v,type)=>({getBytes:()=>v,getDataAsString:()=>v,contentType:type}),gzip:v=>v,ungzip:v=>{
      if(v.contentType !== 'application/x-gzip') throw Error('GZIP_CONTENT_TYPE_REQUIRED');
      return v;
    },
      base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>Buffer.from(v,'base64').toString(),getUuid:()=> 'r2'},
    // Any accidental import or sheet scan on page read/decision fails this test.
    eb78ManualBudgetRowsV1_:()=>{throw Error('UNEXPECTED_SHEET_SCAN');},
    ebInboxReadV1_:()=>{throw Error('UNEXPECTED_INBOX_SCAN');}
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync('dev/apps-script/approval-queue-service.gs','utf8'),context);
  context.ebQueueWrite_(state);
  return {context,counts:()=>({reads,writes,released}),state, stored, failAt:n=>{failAfter=n;}};
}
 test('page read only reads saved property and converts cents correctly',()=>{
  const s=setup(), before=s.counts().writes, view=s.context.ebQueueListDev();
  assert.equal(view.rows[0].amount,16.95); assert.equal(view.rows[0].candidates[0].sheet,'T5');
  assert.equal(s.counts().writes,before); assert.equal(s.counts().released,1);
 });
 test('decision persists and subsequent reopen returns decision without sheet scans',()=>{
  const s=setup(); s.context.ebQueueDecideDev({revision:'r1',key:'a',action:'CATEGORY',category:'Jedzenie'});
  assert.equal(s.context.ebQueueListDev().rows[0].decision.category,'Jedzenie');
  assert.equal(s.counts().writes,4);
 });
 test('invalid decision releases lock and leaves saved state intact',()=>{
  const s=setup(); assert.throws(()=>s.context.ebQueueDecideDev({revision:'old'}),/STALE/);
  assert.equal(s.context.ebQueueListDev().revision,'r1'); assert.equal(s.counts().writes,2);
 });
 test('oversize write rejects before replacing previous saved queue',()=>{
  const s=setup(); assert.throws(()=>s.context.ebQueueWrite_({data:'x'.repeat(150000)}),/limit/);
  assert.equal(s.context.ebQueueListDev().revision,'r1');
 });

test('large queue crosses property limit and round-trips all chunks',()=>{
 const s=setup(), state={...s.state,padding:'x'.repeat(16000)};
 s.context.ebQueueWrite_(state);
 const meta=JSON.parse(s.stored.EB_APPROVAL_QUEUE_DEV_V1);
 assert.ok(meta.parts>1);
 assert.equal(s.context.ebQueueRead_().padding,state.padding);
 assert.ok(Object.entries(s.stored).filter(([k])=>k.includes('_B_')).every(([,v])=>v.length<=7000));
});
test('interrupted inactive bank write preserves previous readable queue',()=>{
 const s=setup(); s.failAt(s.counts().writes+1);
 assert.throws(()=>s.context.ebQueueWrite_({...s.state,padding:'x'.repeat(16000)}),/SIMULATED/);
 assert.equal(s.context.ebQueueRead_().revision,'r1');
 assert.equal(s.context.ebQueueRead_().padding,undefined);
});
test('repeated decisions reuse at most two banks',()=>{
 const s=setup(); for(let i=0;i<30;i++) s.context.ebQueueWrite_({...s.state,revision:String(i)});
 assert.equal(Object.keys(s.stored).length,3);
 assert.equal(s.context.ebQueueRead_().revision,'29');
});
test('missing chunk fails explicitly without returning partial data',()=>{
 const s=setup(); delete s.stored.EB_APPROVAL_QUEUE_DEV_V1_A_0;
 assert.throws(()=>s.context.ebQueueRead_(),/Brakuje/);
});

test('real inbox field names show counterparty and remittance without exposing technical keys',()=>{
 const s=setup(); s.state.rows[0].transaction.counterpartyName='Sklep testowy';
 s.state.rows[0].transaction.remittance=['Zakup kartą','Opis testowy'];
 s.state.rows[0].transaction.source='ALERTY24_EMAIL'; s.context.ebQueueWrite_(s.state);
 const row=s.context.ebQueueListDev().rows[0];
 assert.equal(row.description,'Sklep testowy'); assert.equal(row.detail,'Zakup kartą · Opis testowy');
 assert.equal(row.sourceLabel,'Alerty24'); assert.equal(row.key,'a');
});
test('missing counterparty falls back to remittance and missing both never shows ID',()=>{
 const s=setup(); s.state.rows[0].transaction.remittance='Płatność w sklepie';
 s.context.ebQueueWrite_(s.state); assert.equal(s.context.ebQueueListDev().rows[0].description,'Płatność w sklepie');
 delete s.state.rows[0].transaction.remittance; s.context.ebQueueWrite_(s.state);
 assert.equal(s.context.ebQueueListDev().rows[0].description,'Wydatek bez opisu');
});
