const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/../dev/apps-script/manual-budget-paged-reader.gs','utf8');
function setup(tables){
 const calls=[];const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
 const context=vm.createContext({console:{log(){}},Sheets:{Spreadsheets:{
  get:(id,args)=>{calls.push({kind:'meta',args});assert.equal(id,'dev-copy');assert.equal(args.fields,'sheets(properties(title,gridProperties(rowCount,columnCount)))');return {sheets:Object.entries(tables).map(([title,t])=>({properties:{title,gridProperties:{rowCount:t.rows||1000,columnCount:4}}}))};},
  Values:{batchGet:(id,args)=>{calls.push({kind:'values',args});assert.equal(id,'dev-copy');assert.equal(args.valueRenderOption,'FORMATTED_VALUE');assert.equal(args.fields,'valueRanges(values)');return {valueRanges:args.ranges.map(range=>{
   const m=range.match(/^'(.*)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);assert.ok(m,range);const table=tables[m[1].replace(/''/g,"'")].cells;
   const start=+m[3]-1,end=Math.min(+m[5],table.length),a=col(m[2]),b=col(m[4]);const values=[];
   for(let r=start;r<end;r++){const row=(table[r]||[]).slice(a,b+1);while(row.length&&(row.at(-1)==null||row.at(-1)===''))row.pop();values.push(row);}
   while(values.length&&!values.at(-1).length)values.pop();return {values};
  })};}}
 }},eb78MonthKeyFromDateV1_:s=>s.slice(0,7),ebV5DateForBudget_:i=>i.effectiveDate,
 eb78IsManualExpenseSheetV1_:s=>s.startsWith('T5'),eb78FindLabelRowV1_:(v,label)=>v.findIndex(r=>r[0]===label),
 eb78FindMonthHeaderRowV1_:v=>v.findIndex(r=>r.filter(c=>/^2026-\d\d$/.test(c)).length>=3),
 eb78MonthColumnsV1_:row=>row.map((monthKey,col)=>({monthKey,col})).filter(x=>/^2026-\d\d$/.test(x.monthKey)),
 eb78SkipManualBudgetLabelV1_:s=>s==='RAZEM',eb78CellAmountCentsV1_:v=>Math.round(Number(String(v||'').replace(',','.'))*100),
 eb78ManualKeyV1_:(...args)=>args.join('|'),eb70NormTextV1_:s=>s.toLowerCase()});vm.runInContext(code,context);return {context,calls};
}
const item={direction:'DBIT',effectiveDate:'2026-10-14'};
const headers=['Opis','2026-01','2026-10','2026-11'];
test('reads current month only, preserving original row/column keys and budget boundary',()=>{
 const s=setup({T5:{cells:[headers,['TEST','99','16,95','88'],['BUDŻET'],['LATER','','200']]},T3:{cells:[headers,['TRANSFER','','100']]}});
 const rows=s.context.ebDevManualBudgetRowsPagedV1_('dev-copy',[item]);assert.equal(rows.length,1);assert.equal(rows[0].amountCents,1695);assert.equal(rows[0].rowNumber,2);assert.equal(rows[0].columnNumber,3);assert.equal(rows[0].monthKey,'2026-10');
 assert.ok(s.calls.filter(c=>c.kind==='values').every(c=>c.args.ranges.every(r=>!r.includes('T3'))));
 assert.ok(s.calls.some(c=>c.kind==='values'&&c.args.ranges.includes("'T5'!C2:C2")));
});
test('reads over 500 rows in bounded pages and preserves gaps',()=>{
 const cells=[headers];cells[1]=['FIRST','','1'];cells[502]=['LAST','','2'];cells[503]=['BUDŻET'];const s=setup({T5:{cells}});
 const rows=s.context.ebDevManualBudgetRowsPagedV1_('dev-copy',[item]);assert.equal(rows.length,2);assert.equal(rows[1].rowNumber,503);assert.equal(rows[1].amountCents,200);
 const body=s.calls.filter(c=>c.kind==='values').flatMap(c=>c.args.ranges).filter(r=>r.includes('!C'));assert.equal(body.length,2);assert.equal(body[0],"'T5'!C2:C501");assert.equal(body[1],"'T5'!C502:C503");
});
test('finds later header without fetching all grid cell objects',()=>{
 const cells=[];cells[45]=headers;cells[46]=['TEST','','3'];cells[47]=['BUDŻET'];const s=setup({T5:{cells}});
 const rows=s.context.ebDevManualBudgetRowsPagedV1_('dev-copy',[item]);assert.equal(rows.length,1);assert.equal(rows[0].rowNumber,47);assert.equal(rows[0].amountCents,300);
});
test('escapes sheet names in read ranges',()=>{
 const s=setup({"T5 O'Brien":{cells:[headers,['TEST','','1'],['BUDŻET']]}});assert.equal(s.context.ebDevManualBudgetRowsPagedV1_('dev-copy',[item]).length,1);
 assert.ok(s.calls.some(c=>c.kind==='values'&&c.args.ranges[0].startsWith("'T5 O''Brien'!")));
});
test('no relevant transactions means zero Sheets calls',()=>{
 const s=setup({});assert.equal(s.context.ebDevManualBudgetRowsPagedV1_('dev-copy',[]).length,0);assert.equal(s.calls.length,0);
});
test('oversized metadata fails explicitly, without silently truncating data',()=>{
 const s=setup({T5:{cells:[],rows:30000}});assert.throws(()=>s.context.ebDevManualBudgetRowsPagedV1_('dev-copy',[item]),/limit diagnostyki/);assert.equal(s.calls.length,1);
});
test('column conversion handles multi-letter month columns',()=>{
 const s=setup({});assert.equal(s.context.ebDevColumnNameV1_(1),'A');assert.equal(s.context.ebDevColumnNameV1_(26),'Z');assert.equal(s.context.ebDevColumnNameV1_(27),'AA');assert.equal(s.context.ebDevColumnNameV1_(703),'AAA');
});
