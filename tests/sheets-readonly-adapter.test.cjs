const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname+'/../dev/apps-script/sheets-readonly-adapter.gs','utf8'),context);
test('read-only adapter preserves formatted values and has no setters',()=>{
 const spreadsheet=context.ebDevSpreadsheetFromResponse_({sheets:[{properties:{title:'TEST'},data:[{rowData:[{values:[{formattedValue:'Opis'},{formattedValue:'Październik 2026'}]},{values:[{formattedValue:'TEST'},{formattedValue:'16,95 zł'}]}]}]}]});
 const sheet=spreadsheet.getSheets()[0];assert.equal(sheet.getName(),'TEST');assert.equal(sheet.getDataRange().getDisplayValues()[1][1],'16,95 zł');
 assert.equal(sheet.getDataRange().setValue,undefined);assert.equal(sheet.setName,undefined);
});
test('sparse blocks retain offsets and blank rows',()=>{
 const sheet=context.ebDevSpreadsheetFromResponse_({sheets:[{properties:{title:'TEST'},data:[{startRow:2,startColumn:1,rowData:[{values:[{formattedValue:'0'},{}]},{}]},{startRow:0,startColumn:0,rowData:[{values:[{formattedValue:'Header'}]}]}]}]}).getSheets()[0];
 const rows=sheet.getDataRange().getDisplayValues();assert.equal(rows[0][0],'Header');assert.equal(rows[1].length,0);assert.equal(rows[2][1],'0');assert.equal(rows[2][2],'');assert.equal(rows[3].length,0);
});
