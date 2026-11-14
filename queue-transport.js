// Assignment views share the dashboard's authenticated, same-origin API client.
const budgetTransport = (() => {
  const reads = new Set(['ebListSectionsDev','ebQueueListDev','ebIncomeListDev','telefonStanMailiTEST','apiStatusGetDEV','kzGetDevV1','kzPreviewDevV1']);
  const writes = ['ebQueueReviseDev','ebIncomeDecideDev','pkDecideDevV1','kzPostDevV1'];
  function invoke(method,args) {
    const host = window.parent;
    if (host === window || host.location.origin !== location.origin ||
        typeof host.budgetRpc !== 'function' || host.budgetViewerRole !== 'owner') {
      throw Error('Otwórz zakładkę Przypisz z głównego ekranu budżetu na koncie administratora.');
    }
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error(reads.has(method)
        ? 'Upłynął czas odczytu kolejki.'
        : 'Brak potwierdzenia zapisu. Sprawdź historię przed ponowieniem.')),45000);
      Promise.resolve().then(() => host.budgetRpc(method,args)).then(resolve,reject).finally(() => clearTimeout(timer));
    });
  }
  function runner(success = () => {}, failure = () => {}) {
    const chain = {
      withSuccessHandler: fn => runner(fn,failure),
      withFailureHandler: fn => runner(success,fn)
    };
    for (const method of [...reads,...writes]) {
      chain[method] = (...args) => Promise.resolve().then(() => invoke(method,args)).then(success,failure);
    }
    return chain;
  }
  return {runner};
})();
const google = {script:{run:budgetTransport.runner()}};
