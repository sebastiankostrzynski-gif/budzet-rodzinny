'use strict';
// Reuse the TEST forms' callback contract without a Google-hosted frame.
function formRunner(success, failure) {
  return new Proxy({}, {
    get(_, method) {
      if (method === 'withSuccessHandler') return next => formRunner(next, failure);
      if (method === 'withFailureHandler') return next => formRunner(success, next);
      return (...args) => Promise.resolve().then(() => {
        if (window.parent === window || !window.parent.callBudgetForm)
          throw Error('Otwórz ten formularz z zakładki Przypisz.');
        return window.parent.callBudgetForm(window, method, args);
      }).then(success, failure);
    }
  });
}
const google = {script:{run:formRunner(()=>{},()=>{})}};
