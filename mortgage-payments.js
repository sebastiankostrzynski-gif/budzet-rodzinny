(() => {
  'use strict';
  const app = document.getElementById('app');
  if (!app) return;
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function mount() {
    const view = app.querySelector('.debt-wrap');
    if (!view || app.dataset.debtView !== 'all') return;
    const panel = view.querySelector('.installment-panel');
    if (panel) {
      panel.querySelector('h2').textContent = 'Raty i nadpłaty';
      for (const row of panel.querySelectorAll('.split-row')) {
        const title = row.querySelector('strong');
        const day = title?.textContent.match(/^mBank · nadpłata (\d{4})-(\d{2})-(\d{2})/);
        if (!day) continue;
        title.textContent = 'Nadpłata mBank · ' + [day[3], day[2], day[1]].join('.');
        row.querySelectorAll('select[name="loan"] option').forEach(option => {
          if (option.value !== 'hipoteka') option.remove();
        });
      }
    }
    if (typeof debtData_ === 'undefined' || typeof debtPeriod_ === 'undefined' ||
        window.budgetViewerRole !== 'owner' || view.querySelector('[data-mortgage-review]')) return;
    const entries = (debtData_?.mortgageReview || []).filter(row => row.date.slice(0,7) === debtPeriod_);
    if (!entries.length) return;
    const section = document.createElement('section');
    section.className = 'sav-panel';
    section.dataset.mortgageReview = '';
    section.append(element('h2','Przelewy hipoteczne do oznaczenia'));
    for (const entry of entries) {
      const group = document.createElement('div');
      group.className = 'split-row';
      const amount = (entry.paid / 100).toLocaleString('pl-PL',{style:'currency', currency:'PLN'});
      group.append(element('strong',amount + ' · ' + entry.date.split('-').reverse().join('.')), element('p',entry.title));
      const status = element('small','');
      status.setAttribute('role','status');
      for (const [kind,label] of [['NADPŁATA','Nadpłata kredytu'],['RATA','Zwykła rata']]) {
        const button = element('button',label);
        button.className = 'back-button';
        button.onclick = async () => {
          const buttons = group.querySelectorAll('button');
          buttons.forEach(b => b.disabled = true);
          try {
            await window.budgetRpc('classifyMortgageTransfer',[entry.id,kind]);
            status.textContent = 'Zapisano. Automat uwzględni wybór przy kolejnym odczycie.';
            document.getElementById('debt-refresh')?.click();
          } catch (_) {
            status.textContent = 'Nie udało się potwierdzić zapisu. Odśwież kredyty i sprawdź przelew.';
            buttons.forEach(b => b.disabled = false);
          }
        };
        group.append(button);
      }
      group.append(status);
      section.append(group);
    }
    (panel || view.querySelector('.sav-status'))?.after(section);
  }
  new MutationObserver(mount).observe(app,{childList:true});
  mount();
})();
