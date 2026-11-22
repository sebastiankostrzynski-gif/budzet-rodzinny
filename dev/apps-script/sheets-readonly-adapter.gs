// Converts a read-only Sheets API response into the getters used by eb78.
// Exposes no setter and makes no network or service call itself.
function ebDevSpreadsheetFromResponse_(response) {
  return {
    getSheets: function () {
      return (response.sheets || []).map(function (sheet) {
        var values = [];
        (sheet.data || []).forEach(function (grid) {
          var startRow = grid.startRow || 0, startColumn = grid.startColumn || 0;
          (grid.rowData || []).forEach(function (row, rowIndex) {
            var index = startRow + rowIndex;
            if (!values[index]) values[index] = [];
            (row.values || []).forEach(function (cell, columnIndex) {
              values[index][startColumn + columnIndex] = cell.formattedValue == null ? '' : String(cell.formattedValue);
            });
          });
        });
        for (var i = 0; i < values.length; i++) if (!values[i]) values[i] = [];
        return {
          getName: function () { return sheet.properties.title; },
          getDataRange: function () {
            return { getDisplayValues: function () { return values; } };
          }
        };
      });
    }
  };
}
