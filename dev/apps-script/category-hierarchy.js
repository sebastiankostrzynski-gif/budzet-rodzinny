/* Read-only catalogue extraction, independent of transaction amounts.
 * Input: sheetId, title, rows[{row,label,formula}] from bounded Sheets reads.
 * No service calls or financial writes. Do not infer structure from font alone.
 */
var EbCategoryHierarchyDevV1 = (function () {
  'use strict';
  function refs(formula) {
    var f = String(formula || '').replace(/\s|\$/g, '').toUpperCase();
    if (!/^=(?:SUM\(B\d+(?::B\d+)?(?:[;,]B\d+(?::B\d+)?)*\)|B\d+(?:\+B\d+)+)$/.test(f)) return null;
    var result = [];
    f.replace(/B(\d+)(?::B(\d+))?/g, function (_, first, last) {
      first = Number(first); last = last ? Number(last) : first;
      if (last < first || last - first > 2000) throw new Error('Invalid category span.');
      for (var r = first; r <= last; r++) result.push(r);
      return '';
    });
    return Array.from(new Set(result));
  }
  function clean(label) {
    return String(label || '').trim().replace(/^(?:[IVXLCDM]+\.|[A-Za-z][.)]|\d+\)|[-*])\s*/i, '').replace(/:\s*$/, '').trim();
  }
  function build(sheets) {
    var roots = [], nodes = [], seen = new Set();
    sheets.forEach(function (sheet) {
      if (!/^T\d+\s/i.test(sheet.title)) return;
      if (seen.has(String(sheet.sheetId))) throw new Error('Duplicate sheet identity.');
      seen.add(String(sheet.sheetId));
      var rootId = 'sheet:' + sheet.sheetId, byRow = new Map(), stopped = false;
      var root = {id: rootId, kind: 'SHEET', label: sheet.title.replace(/^T\d+\s+/, ''), sheetName: sheet.title,
        flow: /^T[1-3]\s/.test(sheet.title) ? 'INFLOW' : 'OUTFLOW', parentId: null, children: []};
      roots.push(rootId); nodes.push(root);
      sheet.rows.forEach(function (row) {
        var raw = String(row.label || '').trim();
        if (stopped) return;
        if (/^(?:RAZEM\s*:|BUDŻET$)/i.test(raw)) { stopped = true; return; }
        if (row.row < 4 || !raw || /^[*\-]\s*$/.test(raw)) return;
        if (byRow.has(row.row)) throw new Error('Duplicate row identity.');
        var children = refs(row.formula), label = clean(raw);
        // Cross-sheet calculations are existing computed results, never editable purchase targets.
        var calculated = !children && /(?:\$?[A-Z]+\$?\d+|!)/i.test(String(row.formula || ''));
        var node = {id: rootId + ':row:' + row.row, kind: children ? 'SECTION' : calculated ? 'COMPUTED' : 'ENTRY',
          label: label, rawLabel: raw, rowNumber: row.row, sheetName: sheet.title,
          parentId: null, children: [], disabled: calculated || !label || /^X{2,}$/i.test(label)};
        byRow.set(row.row, {node: node, refs: children}); nodes.push(node);
      });
      if (!stopped) throw new Error('Category read did not reach the budget boundary.');
      byRow.forEach(function (source, row) {
        (source.refs || []).forEach(function (childRow) {
          if (childRow <= row) throw new Error('Category reference must point forward.');
          var child = byRow.get(childRow);
          if (!child) return; // Empty reserved rows are not selectable entries.
          if (child.node.parentId) throw new Error('Ambiguous category parent.');
          child.node.parentId = source.node.id; source.node.children.push(child.node.id);
        });
      });
      byRow.forEach(function (entry) {
        if (!entry.node.parentId) {
          entry.node.parentId = rootId; root.children.push(entry.node.id);
        }
      });
    });
    var index = new Map(nodes.map(function (node) { return [node.id, node]; }));
    nodes.forEach(function (node) {
      node.canCreatePurchase = node.kind === 'SECTION' && !node.disabled &&
        !node.children.some(function (id) { return index.get(id).kind === 'SECTION'; });
      if (node.kind === 'ENTRY' && index.get(node.parentId).kind !== 'SECTION') {
        node.needsReview = true; // Never guess the parent of an ungrouped detail.
      }
    });
    return {version: 1, roots: roots, nodes: nodes};
  }
  return {build: build};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EbCategoryHierarchyDevV1;
