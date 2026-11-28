const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('private-budget.js','utf8');
const notices = Array.from({length:44},(_,i)=>({
  id:String(i), direction:'CRDT', account:'R2', label:'Przelew '+i,
  date:'2026-11-14', received:new Date(1000*i).toISOString(),
  currency:'PLN', amountCents:1000+i, status:'OCZEKUJE NA POTWIERDZENIE API'
}));
notices.push({...notices[0],direction:'DBIT',label:'Obciążenie'});
let archive;
function make(tag,text) {
  return {tag,text,children:[],dataset:{},open:false,
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=items;},remove(){archive=undefined;}};
}
const ctx=vm.createContext({
  state:{data:{bridge:{accountNoticesTEST:notices}}},history:false,income:true,
  root:{querySelector:()=>archive},list:{after:node=>{archive=node;}},make,formatPLN:String
});
vm.runInContext(source.slice(source.indexOf('      function renderBankAlertArchive()'), source.indexOf('      function tradeFundingPanel()')),ctx);
ctx.renderBankAlertArchive();assert.equal(archive,undefined);
ctx.history=true;ctx.renderBankAlertArchive();
assert.equal(archive.children[0].text,'Archiwum alertów bankowych');
const body=archive.children[1];assert.equal(body.children.length,0);
archive.open=true;archive.ontoggle();
assert.equal(body.children.length,11);assert.equal(body.children[0].children[0].text,'Przelew 43');
assert.equal(body.children.at(-1).text,'Pokaż starsze alerty');body.children.at(-1).onclick();
assert.equal(body.children.length,21);
ctx.renderBankAlertArchive();assert.equal(archive.open,true);archive.ontoggle();
assert.equal(archive.children[1].children.length,21);
ctx.history=false;ctx.renderBankAlertArchive();assert.equal(archive,undefined);
ctx.income=false;ctx.history=true;ctx.renderBankAlertArchive();
archive.open=true;archive.ontoggle();assert.equal(archive.children[1].children.length,1);
assert.equal(archive.children[1].children[0].children[0].text,'Obciążenie');
assert(archive.children[1].children[0].children.every(el=>el.tag!=='button'));
console.log('PASS: bank alerts only in history, lazy loading, sorting, pagination, refresh and direction.');
