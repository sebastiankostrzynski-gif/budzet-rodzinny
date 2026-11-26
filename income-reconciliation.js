// A receipt can reach the R2 income queue before its bank confirmation.
function reconcileIncomeRows(rows, commands = new Map()) {
  const sender = row => String(row.merchant || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/Ł/g, 'L')
    .replace(/^WPLYW Z MAILA:\s*/, '').replace(/[^A-Z0-9]+/g, ' ').trim();
  const mails = rows.filter(r => /^external-mail\|[0-9a-f]{16}$/.test(r.key));
  const bankRows = rows.filter(r => /\|\d{4}-\d{2}-\d{2}\/[^/]+\/[^/]+$/.test(r.key));
  const pairs = new Map(), counts = new Map();
  for (const bank of bankRows) {
    const name = sender(bank);
    if (bank.account !== 'R2' || !Number.isSafeInteger(bank.amountCents) || bank.amountCents <= 0 || !bank.date || !name) continue;
    const candidates = mails.filter(mail => {
      if (mail.account !== bank.account || mail.date !== bank.date || mail.amountCents !== bank.amountCents ||
          (mail.currency || 'PLN') !== (bank.currency || 'PLN')) return false;
      const full = sender(mail);
      return full === name || (name.length >= 16 && name.split(' ').length >= 3 && full.startsWith(name + ' '));
    });
    pairs.set(bank, candidates);
    for (const mail of candidates) counts.set(mail, (counts.get(mail) || 0) + 1);
  }
  const hidden = new Set();
  for (const [bank, candidates] of pairs) {
    if (candidates.length !== 1 || counts.get(candidates[0]) !== 1) continue;
    const mail = candidates[0];
    const hasState = row => row.decision || commands.has(row.key);
    if (hasState(bank) && hasState(mail)) continue;
    if (hasState(bank) || hasState(mail)) hidden.add(hasState(bank) ? mail : bank);
    else hidden.add(bank.settledRedemption && !mail.settledRedemption ? mail : bank);
  }
  return rows.filter(row => !hidden.has(row));
}
