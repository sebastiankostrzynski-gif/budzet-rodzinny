const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const guards=require('../dev/apps-script/reconciliation-guards.js');
const source=fs.readFileSync(__dirname+'/../dev/apps-script/reconciliation-integration.gs','utf8');
function setup(items,manual=[]){
 const inbox={items};let writes=0,applied=0;
 const context=vm.createContext({EbReconciliationGuardsV1:guards,PropertiesService:{getScriptProperties:()=>({})},console:{log(){}},ebLock_:fn=>fn(),ebInboxReadV1_:()=>inbox,ebInboxWriteV1_:()=>writes++,eb78ManualBudgetRowsV1_:()=>manual,
  eb70IsApiCandidateV1_:(e,a)=>e.amountCents===a.amountCents&&e.merchant===a.merchant,
  eb70MatchScoreV1_:()=>12,eb78IsManualCandidateV1_:(i,m)=>i.amountCents===m.amountCents,
  eb78ManualMatchScoreV1_:()=>9,ebV5ClassifyWealthRule_:i=>i.technical?'technical':'purchase',ebV5IsTechnicalClass_:c=>c==='technical',
  eb70ApplyMatchV1_:(e,a)=>{applied++;e.apiMatchedKey=a.key;a.alerty24MatchedKey=e.key;a.v5Decision='POMIN';},
  eb78ApplyManualMatchV1_:(i,m)=>{applied++;i.manualBudgetMatchedKey=m.manualKey;i.v5Decision='UJETE_RECZNIE_W_BUDZECIE';}
 });
 vm.runInContext(source,context);return {context,inbox,writes:()=>writes,applied:()=>applied};
}
const mail=key=>({key,source:'ALERTY24_EMAIL',direction:'DBIT',amountCents:1695,merchant:'TEST'});
const api=key=>({key,accountLabel:'R1',direction:'DBIT',amountCents:1695,merchant:'TEST'});
test('read-only entrypoint leaves inbox unchanged and performs zero writes',()=>{
 const s=setup([mail('e'),api('a')],[{manualKey:'m',amountCents:1695}]);const before=JSON.stringify(s.inbox);
 const report=s.context.eb84PodgladBezpiecznegoUzgodnieniaDevV1();
 assert.equal(report.emailApi.counts.MATCH,1);assert.equal(s.applied(),0);assert.equal(s.writes(),0);assert.equal(JSON.stringify(s.inbox),before);
});
test('existing apply helper receives only unique matches and repeat run adds none',()=>{
 const s=setup([mail('e'),api('a')]);s.context.eb73UzgodnijAlerty24ZApiV1_(true);
 assert.equal(s.applied(),1);assert.equal(s.inbox.items[0].apiMatchedKey,'a');
 const report=s.context.eb73UzgodnijAlerty24ZApiV1_(true);assert.equal(report.counts.MATCH,0);assert.equal(s.applied(),1);
});
test('collision writes review status but never calls apply-match helper',()=>{
 const s=setup([mail('e1'),mail('e2'),api('a')]);const report=s.context.eb73UzgodnijAlerty24ZApiV1_(true);
 assert.equal(report.counts.REVIEW,2);assert.equal(s.applied(),0);assert.equal(s.inbox.items[0].reconciliationStatus,'DO_WERYFIKACJI_UZGODNIENIA');
});
test('old manual claim survives later reconciliation runs',()=>{
 const old=api('old');old.manualBudgetMatchedKey='m';old.v5Decision='UJETE_RECZNIE_W_BUDZECIE';
 const s=setup([old,api('new')],[{manualKey:'m',amountCents:1695}]);const report=s.context.eb79UzgodnijReczneZGmailApiV1_(true);
 assert.equal(report.counts.REVIEW,1);assert.equal(s.applied(),0);assert.equal(s.inbox.items[1].manualBudgetReviewNote,'ALREADY_CLAIMED');
});
test('email -> API -> manual budget consumes exactly one manual entry',()=>{
 const s=setup([mail('e'),api('a')],[{manualKey:'m',amountCents:1695}]);
 s.context.eb73UzgodnijAlerty24ZApiV1_(true);const report=s.context.eb79UzgodnijReczneZGmailApiV1_(true);
 assert.equal(report.counts.MATCH,1);assert.equal(s.inbox.items[0].manualBudgetMatchedKey,'m');assert.equal(s.inbox.items[1].manualBudgetMatchedKey,undefined);
 assert.equal(s.context.eb79UzgodnijReczneZGmailApiV1_(true).counts.MATCH,0);
});
test('manual match -> late API confirmation does not create a second manual claim',()=>{
 const e=mail('e');e.manualBudgetMatchedKey='m';e.v5Decision='UJETE_RECZNIE_W_BUDZECIE';
 const s=setup([e,api('a')],[{manualKey:'m',amountCents:1695}]);
 assert.equal(s.context.eb73UzgodnijAlerty24ZApiV1_(true).counts.MATCH,1);
 assert.equal(s.context.eb79UzgodnijReczneZGmailApiV1_(true).counts.MATCH,0);
});
test('recognized technical transfers never reach manual apply helper',()=>{
 const a=api('repayment');a.technical=true;const b=api('savings');b.technical=true;
 const s=setup([a,b],[{manualKey:'m',amountCents:1695}]);assert.equal(s.context.eb79UzgodnijReczneZGmailApiV1_(true).counts.MATCH,0);assert.equal(s.applied(),0);
});
test('read-only snapshot reports remain repeatable',()=>{
 const s=setup([mail('e'),api('a')]);const first=s.context.eb84PodgladBezpiecznegoUzgodnieniaDevV1();
 assert.equal(JSON.stringify(s.context.eb84PodgladBezpiecznegoUzgodnieniaDevV1()),JSON.stringify(first));assert.equal(s.writes(),0);
});
