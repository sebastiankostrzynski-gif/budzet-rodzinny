// Read formatted VALUES only, never full grid cell objects/formatting.
// All reads target the supplied DEV spreadsheet. No writes or imports.
function ebDevManualBudgetRowsPagedV1_(spreadsheetId, items) {
  var started = Date.now(), calls = 0, output = [];
  var months = new Set((items || []).filter(function (item) {
    return item.direction === 'DBIT';
  }).map(function (item) { return eb78MonthKeyFromDateV1_(ebV5DateForBudget_(item)); }).filter(Boolean));
  if (!months.size) return output;
  function read(ranges) {
    calls++;
    return Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
      ranges: ranges, valueRenderOption: 'FORMATTED_VALUE', fields: 'valueRanges(values)'
    }).valueRanges || [];
  }
  var sheets = (Sheets.Spreadsheets.get(spreadsheetId, {
    fields: 'sheets(properties(title,gridProperties(rowCount,columnCount)))'
  }).sheets || []).filter(function (sheet) {
    return eb78IsManualExpenseSheetV1_(sheet.properties.title);
  });
  calls++;
  sheets.forEach(function (sheet) {
    var name = sheet.properties.title;
    var quoted = "'" + name.replace(/'/g, "''") + "'!";
    var rows = sheet.properties.gridProperties.rowCount;
    var cols = sheet.properties.gridProperties.columnCount;
    if (rows > 20000 || cols > 2048) throw new Error('DEV: zakres arkusza przekracza limit diagnostyki.');
    var initial = read([quoted + 'A1:A' + rows, quoted + 'A1:' + ebDevColumnNameV1_(cols) + Math.min(40, rows)]);
    var labels = initial[0] && initial[0].values || [];
    var marker = eb78FindLabelRowV1_(labels, 'BUDŻET');
    var endRow = marker === -1 ? labels.length : marker;
    if (!endRow) return;
    var headerValues = initial[1] && initial[1].values || [];
    var headerRow = eb78FindMonthHeaderRowV1_(headerValues, Math.min(endRow, headerValues.length));
    // Unusual layouts: bounded header pages, no silent truncation.
    for (var base = 40; headerRow === -1 && base < endRow; base += 40) {
      var page = read([quoted + 'A' + (base + 1) + ':' + ebDevColumnNameV1_(cols) + Math.min(base + 40, endRow)]);
      var pageValues = page[0] && page[0].values || [];
      var found = eb78FindMonthHeaderRowV1_(pageValues, pageValues.length);
      if (found !== -1) { headerValues = pageValues; headerRow = base + found; var header = pageValues[found]; }
    }
    if (headerRow === -1) return; // same behavior as existing eb78: no monthly table
    if (!header) header = headerValues[headerRow];
    var monthCols = eb78MonthColumnsV1_(header).filter(function (mc) { return months.has(mc.monthKey); });
    for (var first = headerRow + 1; first < endRow; first += 500) {
      if (!monthCols.length) break;
      var last = Math.min(first + 500, endRow);
      for (var colBase = 0; colBase < monthCols.length; colBase += 8) {
        var columns = monthCols.slice(colBase, colBase + 8);
        var ranges = columns.map(function (mc) {
          var col = ebDevColumnNameV1_(mc.col + 1);
          return quoted + col + (first + 1) + ':' + col + last;
        });
        var values = read(ranges);
        columns.forEach(function (mc, columnIndex) {
          var columnValues = values[columnIndex] && values[columnIndex].values || [];
          for (var row = first; row < last; row++) {
            var label = String(labels[row] && labels[row][0] || '').trim();
            if (!label || eb78SkipManualBudgetLabelV1_(label)) continue;
            var cell = columnValues[row - first];
            var amount = eb78CellAmountCentsV1_(cell && cell[0]);
            if (!amount) continue;
            output.push({manualKey: eb78ManualKeyV1_(name, row + 1, mc.col + 1, mc.monthKey, label, amount),
              source: 'MANUAL_BUDGET', sheetName: name, rowNumber: row + 1, columnNumber: mc.col + 1,
              monthKey: mc.monthKey, amountCents: amount, label: label, normLabel: eb70NormTextV1_(label)});
          }
        });
      }
    }
    console.log(JSON.stringify({stage:'MANUAL_SHEET',sheet:name,rows:endRow,months:monthCols.length,elapsedMs:Date.now()-started}));
  });
  console.log(JSON.stringify({stage:'MANUAL_INDEX',sheets:sheets.length,items:output.length,calls:calls,elapsedMs:Date.now()-started}));
  return output;
}
function ebDevColumnNameV1_(number) {
  var result = '';
  while (number > 0) { number--; result = String.fromCharCode(65 + number % 26) + result; number = Math.floor(number / 26); }
  return result;
}
