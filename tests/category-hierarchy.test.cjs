const test=require('node:test'), assert=require('node:assert/strict');
const hierarchy=require('../dev/apps-script/category-hierarchy.js');
const row=(row,label,formula)=>({row,label,formula});
function sheet(rows,title='T11 Zdrowie i uroda') {return {sheetId:1,title,rows:[...rows,row(50,'RAZEM:')]};}
test('sections and all entries are extracted independently of amounts; total is excluded',()=>{
 const c=hierarchy.build([sheet([row(4,'I. Zdrowie','=SUM(B5:B9)'),row(5,'Apteka','=10+20'),row(10,'II. Uroda','=SUM(B11:B15)'),row(11,'Fryzjer')])]);
 assert.equal(c.nodes.length,5); assert.equal(c.nodes.find(n=>n.label==='Apteka').kind,'ENTRY');
 assert.equal(c.nodes.find(n=>n.label==='Zdrowie').canCreatePurchase,true);
 assert.equal(c.nodes.some(n=>n.label==='RAZEM'),false);
});
test('person and gift trees derive from formulas rather than one fixed clothing person list',()=>{
 const c=hierarchy.build([sheet([row(4,'Ubrania','=B5+B10'),row(5,'a) Osoba A:','=SUM(B6:B9)'),row(6,'- Buty'),row(10,'b) Osoba B:','=SUM(B11:B14)'),row(11,'- Kurtka'),row(15,'Prezenty','=SUM(B16:B20)'),row(16,'- Rocznica')],'T12 Ubrania i prezenty')]);
 const top=c.nodes.find(n=>n.label==='Ubrania'),person=c.nodes.find(n=>n.label==='Osoba A');
 assert.equal(top.canCreatePurchase,false);assert.equal(person.parentId,top.id);assert.equal(person.canCreatePurchase,true);
 assert.equal(c.nodes.find(n=>n.label==='Prezenty').canCreatePurchase,true);
});
test('inflow catalogue is distinct from purchases and deeper paths are preserved',()=>{
 const c=hierarchy.build([sheet([row(4,'I. Inne wpływy','=SUM(B5;B10)'),row(5,'A. Grupa A','=SUM(B6:B9)'),row(6,'- Wpływ'),row(10,'B. Inne','=SUM(B11:B15)'),row(11,'- Zwrot')],'T2 Bonusy i inne wpływy')]);
 assert.equal(c.nodes[0].flow,'INFLOW');assert.equal(c.nodes.find(n=>n.label==='Wpływ').parentId,'sheet:1:row:5');
});
test('same labels in different branches retain separate identities',()=>{
 const c=hierarchy.build([sheet([row(4,'A','=SUM(B5:B6)'),row(5,'Inne'),row(7,'B','=SUM(B8:B9)'),row(8,'Inne')])]);
 const entries=c.nodes.filter(n=>n.label==='Inne');assert.equal(entries.length,2);assert.notEqual(entries[0].parentId,entries[1].parentId);
});
test('ambiguous references and incomplete source stop extraction',()=>{
 assert.throws(()=>hierarchy.build([sheet([row(4,'A','=SUM(B6:B8)'),row(5,'B','=SUM(B6:B8)'),row(6,'Detail')])]),/Ambiguous/);
 assert.throws(()=>hierarchy.build([{sheetId:1,title:'T5 Dom',rows:[row(4,'A','=SUM(B5:B10)')]}]),/boundary/);
});
test('unsupported cross-sheet references are not mistaken for purchase targets',()=>{
 const c=hierarchy.build([sheet([row(4,'A',"='Other'!B4")])]);
 assert.equal(c.nodes[1].kind,'COMPUTED');assert.equal(c.nodes[1].disabled,true);
});
