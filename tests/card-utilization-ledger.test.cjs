'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ledger=require('../dev/apps-script/card-utilization-ledger.js');

function state(opening=839644) {
  return ledger.create({limitCents:900000,openingUtilizedCents:opening,openedAt:'2026-10-18T10:00:00Z'});
}

test('opening utilization is represented with the existing negative U30 sign',()=>{
  assert.equal(ledger.totals(state()).u30Cents,-839644);
});

test('email authorization is counted once and API booking replaces its amount',()=>{
  let s=ledger.sync(state(),{emails:[{sourceId:'gmail-1',type:'PURCHASE',amountCents:12000,merchant:'Shop'}]});
  assert.equal(ledger.totals(s).u30Cents,-851644);
  s=ledger.sync(s,{api:[{sourceId:'bank-1',type:'PURCHASE',amountCents:11800,bookingDate:'2026-10-20'}],
    links:[{emailSourceId:'gmail-1',apiSourceId:'bank-1'}]});
  assert.equal(s.events.length,1);
  assert.equal(s.events[0].status,'POSTED');
  assert.equal(ledger.totals(s).u30Cents,-851444);
});

test('repeated email and bank imports are idempotent',()=>{
  let s=ledger.sync(state(),{emails:[{sourceId:'gmail-1',type:'PURCHASE',amountCents:12000}]});
  s=ledger.sync(s,{emails:[{sourceId:'gmail-1',type:'PURCHASE',amountCents:12000}],
    api:[{sourceId:'bank-1',type:'PURCHASE',amountCents:12000}],
    links:[{emailSourceId:'gmail-1',apiSourceId:'bank-1'}]});
  const once=ledger.totals(s).u30Cents;
  s=ledger.sync(s,{emails:[{sourceId:'gmail-1',type:'PURCHASE',amountCents:12000}],
    api:[{sourceId:'bank-1',type:'PURCHASE',amountCents:12000}]});
  assert.equal(ledger.totals(s).u30Cents,once);
  assert.equal(s.events.length,1);
});

test('refunds and repayments reduce utilization without becoming purchases',()=>{
  const s=ledger.sync(state(),{api:[
    {sourceId:'refund-1',type:'REFUND',amountCents:1800},
    {sourceId:'payment-1',type:'PAYMENT',amountCents:30000}
  ]});
  assert.equal(ledger.totals(s).u30Cents,-807844);
});

test('explicitly cancelled authorization stops contributing',()=>{
  let s=ledger.sync(state(),{emails:[{sourceId:'auth-1',type:'PURCHASE',amountCents:5000}]});
  s=ledger.sync(s,{voidEmailSourceIds:['auth-1']});
  assert.equal(ledger.totals(s).u30Cents,-839644);
  assert.equal(s.events[0].status,'VOID');
});

test('ambiguous events can be held for review without changing calculated debt',()=>{
  const s=ledger.sync(state(),{
    emails:[{sourceId:'gmail-ambiguous',type:'PURCHASE',amountCents:1000}],
    reviewSourceIds:['gmail-ambiguous']
  });
  assert.equal(ledger.totals(s).reviewEvents,1);
  assert.equal(ledger.totals(s).u30Cents,-839644);
});

test('manual available-credit check reports exact difference',()=>{
  const s=ledger.sync(state(),{api:[{sourceId:'purchase-1',type:'PURCHASE',amountCents:5000}]});
  assert.deepEqual(ledger.compareAvailable(s,900000-844644),{
    calculatedUtilizedCents:844644,bankUtilizedCents:844644,differenceCents:0
  });
});

test('conflicting reuse of an email identifier fails instead of overwriting',()=>{
  const s=ledger.sync(state(),{emails:[{sourceId:'gmail-1',type:'PURCHASE',amountCents:1000}]});
  assert.throws(()=>ledger.sync(s,{emails:[{sourceId:'gmail-1',type:'PURCHASE',amountCents:2000}]}),/EMAIL_ID_CONFLICT/);
});
