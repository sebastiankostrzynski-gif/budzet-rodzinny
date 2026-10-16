const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup() {
 class Element {
  constructor(tag,text='') { this.tag=tag;this.textContent=text;this.children=[];this.attrs={};this._value='';this.hidden=false; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children=items;this._value=''; }
  setAttribute(k,v) { this.attrs[k]=v; }
  get options() { return this.children; }
  get value() { return this.tag==='select' ? (this._value || this.children[0]?.value || '') : this._value; }
  set value(v) { this._value=v; }
  get selectedIndex() { return this.children.findIndex(x=>x.value===this.value); }
  focus() {}
 }
 const ids={message:new Element('p'),rows:new Element('section'),reload:new Element('button')};
 let success,request;
 const runner={withSuccessHandler:f=>(success=f,runner),withFailureHandler:()=>runner,ebQueueListDev:()=>{},ebQueueDecideDev:r=>{request=r;}};
 const context={document:{getElementById:id=>ids[id],createElement:t=>new Element(t),querySelectorAll:()=>[]},
   Option:class extends Element{constructor(text,value){super('option',text);this.value=value;}},
   google:{script:{run:runner}},setTimeout:()=>1,clearTimeout:()=>{}};
 vm.createContext(context); const html=fs.readFileSync('dev/apps-script/ApprovalQueue.html','utf8');
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 success({revision:'r1',createdAt:'today',elapsedMs:1,expenseSheets:['T7 Wyżywienie','T9 Dzieci'],
 existingRows:[{key:'food',sheet:'T7 Wyżywienie',label:'Żywność'},{key:'clean',sheet:'T7 Wyżywienie',label:'Chemia'},{key:'school',sheet:'T9 Dzieci',label:'Szkoła'}],
 rows:[{key:'a',description:'Sklep',amount:10,currency:'PLN',queueGroup:'NO_MATCH',candidates:[]}]});
 function all(e=ids.rows) { return [e,...e.children.flatMap(all)]; }
 return {find:label=>all().find(e=>e.attrs['aria-label']===label),button:text=>all().find(e=>e.tag==='button'&&e.textContent===text),request:()=>request};
}
test('department limits choices and changing it clears previous target',()=>{
 const s=setup(),dep=s.find('Dział budżetu dla Sklep'),target=s.find('Pozycja w wybranym dziale dla Sklep');
 assert.equal(target.options.length,1);
 dep.value='T7 Wyżywienie';dep.onchange();assert.deepEqual(target.options.slice(1).map(x=>x.value),['food','clean']);
 target.value='food';dep.value='T9 Dzieci';dep.onchange();assert.equal(target.value,'');assert.deepEqual(target.options.slice(1).map(x=>x.value),['school']);
 s.button('Zapisz decyzję w DEV').onclick();assert.equal(s.request(),undefined);
});
test('search handles Polish letters and cannot retain an invisible target',()=>{
 const s=setup(),dep=s.find('Dział budżetu dla Sklep'),target=s.find('Pozycja w wybranym dziale dla Sklep'),search=s.find('Szukaj pozycji dla Sklep');
 dep.value='T7 Wyżywienie';dep.onchange();target.value='clean';search.value='zywnosc';search.oninput();
 assert.deepEqual(target.options.slice(1).map(x=>x.value),['food']);assert.equal(target.value,'');
});
test('new row needs only department and custom description and sends no existing target',()=>{
 const s=setup(),dep=s.find('Dział budżetu dla Sklep'),mode=s.find('Sposób zapisania Sklep'),desc=s.find('Własny opis dla Sklep');
 dep.value='T9 Dzieci';dep.onchange();mode.value='NEW_ROW';mode.onchange();desc.value='Parasolka';
 s.button('Zapisz decyzję w DEV').onclick();
 assert.equal(s.request().action,'NEW_ROW');assert.equal(s.request().sheetName,'T9 Dzieci');assert.equal(s.request().description,'Parasolka');assert.equal(s.request().targetManualKey,undefined);
});
