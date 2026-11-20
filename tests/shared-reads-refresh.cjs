const fs=require('fs'),vm=require('vm'),assert=require('assert');
const p=fs.readFileSync('private-budget.js','utf8'),h=fs.readFileSync('index.html','utf8');
const scripts=[...h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];for(const m of scripts)new Function(m[1]);
const chunk=p.slice(p.indexOf('  const readFlights'),p.indexOf('  function rpcRequest(method,args)'));
let calls=0;const listeners={},ctx={Map,Set,Promise,JSON,Math,performance,token:'session',window:{addEventListener:(n,f)=>listeners[n]=f},rpcRequest:async()=>{calls++;await new Promise(r=>setTimeout(r,25));return calls;}};vm.createContext(ctx);vm.runInContext(chunk,ctx);
(async()=>{
await Promise.all([ctx.rpc('getBudgetDataFresh',[2026,11]),ctx.rpc('getBudgetDataFresh',[2026,11]),ctx.rpc('getBudgetDataFresh',[2026,11])]);assert.equal(calls,1);
await ctx.rpc('getBudgetDataFresh',[2026,11]);assert.equal(calls,2);
await Promise.all([ctx.rpc('getBudgetDataFresh',[2026,11]),ctx.rpc('getBudgetDataFresh',[2026,12])]);assert.equal(calls,4);
await Promise.all([ctx.rpc('saveInstallmentSplit',[]),ctx.rpc('saveInstallmentSplit',[])]);assert.equal(calls,6);
const before=calls,a=ctx.rpc('getBudgetDataFresh',[2026,11]);listeners['budget-assignment-saved']();const b=ctx.rpc('getBudgetDataFresh',[2026,11]);await Promise.all([a,b]);assert.equal(calls-before,2);
ctx.rpcRequest=async()=>{throw Error('offline')};await assert.rejects(ctx.rpc('getBudgetDataFresh',[]));ctx.rpcRequest=async()=>42;assert.equal(await ctx.rpc('getBudgetDataFresh',[]),42);
assert(!JSON.stringify(ctx.window.budgetPerformance()).includes('session'));
// Execute actual refresh controller with a pending version check, then manual refresh.
const start=h.indexOf('    let refreshStateGeneration_'),end=h.indexOf('\n\n    // ========================================================',start);
let freshCalls=0,stateSuccess,stateFailure;const c={dashboardData:{sync:{}},isMonthLoading:false,silentRefreshInFlight:false,refreshStateRequestInFlight:false,Date,REFRESH_CHECK_MIN_INTERVAL_MS:0,lastRefreshCheckAt:0,lastRefreshSuccessAt:1,refreshState:null,updateFreshnessIndicator_:()=>{},persistRefreshState_:()=>{},invalidateExpenseDetails_:()=>{},markMonthDashboardCacheStale_:()=>{},refreshDashboardSilently_:()=>{if(!c.silentRefreshInFlight){freshCalls++;c.silentRefreshInFlight=true;}},budgetApi:{script:{run:{withSuccessHandler(f){stateSuccess=f;return this},withFailureHandler(f){stateFailure=f;return this},getRefreshState(){}}}}};vm.createContext(c);vm.runInContext(h.slice(start,end),c);
c.checkRefreshState_(true);c.checkRefreshState_(true,true);assert.equal(freshCalls,1);c.checkRefreshState_(true,true);assert.equal(freshCalls,1);c.silentRefreshInFlight=false;stateSuccess({dayKey:'old',sourceUpdatedMs:1});assert.equal(freshCalls,1);stateFailure();assert.equal(freshCalls,1);
console.log('PASS: script syntax; concurrent reads; fresh subsequent read; separate months; writes never coalesced; post-write invalidation; retry after error; no private data in metrics; manual refresh direct; repeated click; late version response ignored.');
})();
