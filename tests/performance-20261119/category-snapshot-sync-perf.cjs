const fs=require('fs'),vm=require('vm'),a=require('assert');
const h=fs.readFileSync('index.html','utf8');
for(const m of h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new Function(m[1]);
function fn(name,next){return h.slice(h.indexOf('    function '+name),h.indexOf('    function '+next,h.indexOf('    function '+name)));}
let requests=[];const c={Date,Math,Number,String,JSON,Object,Array,queueMicrotask:()=>{},monthCache:{},entryViewsV22_:new Map(),categoryDetailsCache:{},categoryDetailsInflight:{},categorySnapshotEpoch_:{},CATEGORY_DETAILS_CACHE_TTL_MS:21600000,persistCategoryDetailsCache_:()=>{},scheduleMonthDashboardCacheBackup_:()=>{},snapshotTimestamp_:()=>Date.now(),budgetApi:{script:{get run(){let ok,fail;return {withSuccessHandler(f){ok=f;return this},withFailureHandler(f){fail=f;return this},getCategoryDetails(){requests.push({ok,fail})}}}}}};
vm.createContext(c);
for(const [x,y] of [['monthCacheKey','getCachedMonth'],['categoryEpoch_','categoryMatchesDashboard_'],['categoryMatchesDashboard_','invalidateCategoryMonth_'],['invalidateCategoryMonth_','refreshOpenCategorySnapshot_'],['setCachedMonth','fetchMonthData'],['categoryDetailsCacheKey','categoryDetailKey'],['categoryDetailKey','getCachedCategoryDetailFromFastCache'],['getCachedCategoryDetailFromFastCache','setCachedCategoryDetail'],['setCachedCategoryDetail','fetchCategoryDetail'],['fetchCategoryDetail','getCachedCategoryBundle']])vm.runInContext(fn(x,y),c);
c.refreshOpenCategorySnapshot_=()=>{};
const snap=n=>({year:2026,monthNumber:11,categories:[{name:'Food',execution:n,budget:500}]});const detail=n=>({category:'Food',execution:n,budget:500});
c.setCachedMonth(snap(100));c.setCachedCategoryDetail('Food',2026,11,detail(100));a(c.getCachedCategoryDetailFromFastCache('Food',2026,11).isFresh);
c.setCachedMonth(snap(120));a(!c.getCachedCategoryDetailFromFastCache('Food',2026,11).isFresh);a(!c.categoryMatchesDashboard_(detail(100),'Food',2026,11));
let result=[],errors=[];c.fetchCategoryDetail('Food',2026,11,d=>result.push(d.execution),e=>errors.push(e.message));c.fetchCategoryDetail('Food',2026,11,d=>result.push(d.execution),e=>errors.push(e.message));a.equal(requests.length,1);
c.setCachedMonth(snap(140));requests[0].ok(detail(120));a.equal(result.length,0);a.equal(requests.length,2);requests[1].ok(detail(140));a.deepEqual(result,[140,140]);
c.fetchCategoryDetail('Food',2026,11,d=>result.push(d.execution),e=>errors.push(e.message));requests[2].ok(detail(100));a.equal(errors.length,1);a.equal(result.length,2);
const epoch=c.categoryEpoch_(2026,11);c.setCachedMonth(snap(140));a.equal(c.categoryEpoch_(2026,11),epoch);a.equal(c.categoryEpoch_(2026,12),0);
a(h.includes('queueMicrotask(refreshOpenCategorySnapshot_)'));a(!fn('fetchCategoryDetail','getCachedCategoryBundle').includes('fetchCategoryBundle('));
console.log('PASS: all inline JS syntax; cached matching totals; changed dashboard invalidates; concurrent reads coalesced; late response discarded and both callers retried; inconsistent backend response rejected; unchanged snapshot retains cache; month isolation; open-view refresh hook; category bypasses monthly bundle.');

