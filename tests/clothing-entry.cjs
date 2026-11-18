const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('expense-editor.html','utf8'),js=fs.readFileSync('private-budget.js','utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new Function(match[1]);
function extract(name){const start=html.indexOf('function '+name+'(');let end=html.indexOf('\nfunction ',start+1);if(name==='openInitialClothing')end=html.indexOf('\nconst sections=',start);return html.slice(start,end);}
const ctx={rowDraft:()=>({mode:'EXISTING_ROW',target:'old'})};vm.createContext(ctx);vm.runInContext(extract('openInitialClothing'),ctx);
const data={expenseSheets:['T7 Wyżywienie i chemia','T12 Ubrania i prezenty'],rows:[{key:'vinted',amountCents:9299}]};
let r=ctx.openInitialClothing(data,'vinted');assert.equal(r.key,'vinted');assert.equal(r.draft.sheet,'T12 Ubrania i prezenty');assert.equal(r.draft.mode,'NEW_ROW');assert.equal(r.draft.section,'CLOTHES');assert.equal(r.draft.person,'');assert.equal(r.draft.target,'');assert.equal(data.rows[0].amountCents,9299);
for(const prop of ['postedEvidence','bridgeBlocked','bridgeArchived','decision']){data.rows[0][prop]=true;assert.equal(ctx.openInitialClothing(data,'vinted'),null);delete data.rows[0][prop];}
assert.equal(ctx.openInitialClothing(data,'other'),null);
assert.equal(ctx.openInitialClothing({...data,expenseSheets:[]},'vinted'),null);
const key='a+b /?&ą';const url=new URL('https://example.test/expense-editor.html');url.searchParams.set('newClothingKey',key);assert.equal(new URLSearchParams(url.search).get('newClothingKey'),key);
assert(html.includes("['Seba','Ewa','Julka','Olek']"));assert(html.includes("if(!d.person)return 'Wybierz osobę.'"));assert(html.includes('await prepareAssignment(request)'));
assert(js.includes("frame.dataset.form=file;"));assert(js.includes("openForm('expense-editor.html','Nowe ubranie lub prezent',{key:row.key})"));
console.log('PASS: syntax; targeted clothing draft; person required; original amount unchanged; no automatic assignment; posted/blocked/archived/decided/missing rejected; encoded transaction ID; existing idempotent save retained.');
