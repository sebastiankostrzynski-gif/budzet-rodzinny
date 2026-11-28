'use strict';
const BudgetPicker=(()=>{
  function fold(s){return String(s||'').toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
  function near(a,b){
    if(a.length<3||Math.abs(a.length-b.length)>1)return false;
    let i=0,j=0,edits=0;
    while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}
      if(++edits>1)return false;
      if(a.length===b.length&&a[i]===b[j+1]&&a[i+1]===b[j]){i+=2;j+=2;}
      else{if(a.length>=b.length)i++;if(a.length<=b.length)j++;}
    }
    return edits+a.length-i+b.length-j<=1;
  }
  const clean=s=>String(s||'').replace(/^T\d+\s+|^[-\s]+/g,'').trim();
  function ikzeLabel(target){
    if(target.sheet!=='T4 Finansowe')return '';
    const match=/^Emerytura\s*[-–—]\s*(IKZE (?:Seba|Ewa))$/i.exec(String(target.label||'').trim());
    return match?'Oszczędności · '+match[1]:'';
  }
  function ikzeOptions(rows,row){
    if(!row||row.currency!=='PLN'||(row.accountLabel||row.account)!=='R2')return [];
    const month=row.date.slice(0,7);
    return rows.filter(target=>target.month===month && target.key && ikzeLabel(target))
      .map(target=>({target,caption:ikzeLabel(target)}));
  }
  function index(rows,month){
    return rows.filter(r=>r.month===month&&clean(r.label)).map(r=>{
      const path=[clean(r.sheet),clean(r.sectionName),clean(r.label)].filter(Boolean).join(' → ');
      const words=fold(path).split(/[^a-z0-9]+/);
      if(ikzeLabel(r))words.push('oszczednosci');
      if(words.some(w=>w==='obuwie'||w==='buty'))words.push('obuwie','buty');
      return {...r,path,words,plain:fold(path)};
    });
  }
  function search(items,q,frequency=new Map()){
    const terms=fold(q).split(/\s+/).filter(Boolean);
    return items.map(item=>{let score=0;for(const term of terms){if(fold(clean(item.label))===term)score+=8;else if(fold(item.label).includes(term))score+=4;else if(item.plain.includes(term))score+=2;else if(item.words.some(w=>w.includes(term)||near(term,w)))score++;else return null;}return {item,score};})
      .filter(Boolean).sort((a,b)=>b.score-a.score||(frequency.get(b.item)||0)-(frequency.get(a.item)||0)).map(o=>o.item);
  }
  function recommendations(items,rows,merchant){
    const freq=new Map(),last=new Map(),match=new Map(),byKey=new Map(items.map(i=>[i.key,i]));
    const stable=k=>String(k||'').replace(/\|\d{4}-\d{2}$/,'');
    const byRow=new Map(items.map(i=>[stable(i.key),i]));
    const name=s=>fold(s).replace(/[*]/g,' ').replace(/\s+/g,' ').trim();
    const seller=name(merchant), seen=new Set();let mixed=false;
    for(const row of rows){const d=row.decision;
      if(row.key && seen.has(row.key))continue;
      if(row.key)seen.add(row.key);
      const same=!!seller && seller===name(row.description);
      if(same && !row.bridgeArchived && d && d.action!=='EXISTING_ROW')mixed=true;
      if(row.bridgeArchived||!d||d.action!=='EXISTING_ROW')continue;
      const i=byKey.get(d.targetManualKey)||byRow.get(stable(d.targetManualKey));
      if(!i||(d.category&&fold(clean(d.category))!==fold(clean(i.label)))){if(same)mixed=true;continue;}
      freq.set(i,(freq.get(i)||0)+1);last.set(i,Math.max(last.get(i)||0,Date.parse(d.at||row.date)||0));
      if(same)match.set(i,(match.get(i)||0)+1);
    }
    const top=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,5).map(p=>p[0]);
    const broad=/\b(allegro|amazon|marketplace|paypal|payu|przelewy24|xtb)\b/.test(seller);
    return {recent:top(last).slice(0,3),frequency:freq,suggested:!mixed&&!broad&&match.size===1?top(match).filter(i=>match.get(i)>=2):[]};
  }
  function refundOptions(targets, payments, credit) {
    const items = index(targets, credit.date.slice(0,7));
    const byKey = new Map(items.map(item => [item.key, item]));
    const sameSeller = new Set();
    const sellerName = text => fold(text).replace(/[^a-z0-9]+/g,' ').trim();
    for (const payment of payments) {
      const item = byKey.get(payment.decision?.targetManualKey);
      if (!item || payment.accountLabel !== credit.account || payment.currency !== 'PLN' ||
          !payment.postedEvidence || payment.date > credit.date || !payment.description) continue;
      const seller = sellerName(payment.description);
      item.plain += ' ' + seller;
      item.words.push(...seller.split(' '));
      if (seller && seller === sellerName(credit.merchant)) sameSeller.add(item);
    }
    return {items, hints:{categoriesFirst:true, suggested:sameSeller.size===1 ? [...sameSeller] : []}};
  }
  function open(items,hints,onSelect,onNew){
    const browse = hints.categoriesFirst;
    let category = null;
    const title = browse ? 'Który wydatek pomniejszyć?' : 'Wybierz pozycję';
    const dialog=document.createElement('dialog');dialog.className='pick-sheet';dialog.setAttribute('aria-label',title);
    const el=(tag,txt)=>Object.assign(document.createElement(tag),{textContent:txt||''});
    const btn=(title,fn)=>{const b=el('button',title);b.type='button';b.onclick=fn;return b;};
    const header=el('header'), heading=el('h2',title);
    const close=btn('Zamknij',()=>dialog.close());header.append(heading,close);
    const input=el('input');input.type='search';input.placeholder='Szukaj kategorii lub pozycji…';input.setAttribute('aria-label',input.placeholder);
    const results=el('div');results.className='pick-results';dialog.append(header,input,results);
    const choose=i=>{dialog.close();onSelect(i);};
    function option(i){
      const b=btn('',()=>choose(i));b.className='pick-option';
      const group=clean(i.sheet),section=clean(i.sectionName).replace(/^[IVXLCDM]+\.\s*/i,'');
      const context=[group];
      if(section && fold(section)!==fold(group))context.push(section);
      b.append(el('strong',clean(i.label)),el('small',context.join(' · ')));b.title=i.path;return b;
    }
    function section(title,list){if(!list.length)return;const group=el('section');group.append(el('h3',title));for(const i of list)group.append(option(i));results.append(group);}
    const back = btn('‹ Wszystkie kategorie',()=>navigate(null));
    if(browse)input.before(back);
    function navigate(sheet){
      category=sheet;input.value='';paint();results.scrollTop=0;
      (sheet?back:results.querySelector('button')||close).focus({preventScroll:true});
    }
    function paint(){results.replaceChildren();
      const scope=category ? items.filter(item=>item.sheet===category) : items;
      if(browse){
        back.hidden=!category;heading.textContent=category?clean(category):title;
        input.placeholder=category?'Szukaj w tej kategorii':'Szukaj pozycji lub sklepu';
        input.setAttribute('aria-label',input.placeholder);
      }
      if(input.value.trim()){
      const matches=search(scope,input.value,hints.frequency);section('Wyniki',matches.slice(0,12));
      if(matches.length>12)results.append(el('p','Doprecyzuj nazwę, aby zawęzić wyniki.'));
      if(!matches.length)results.append(el('p','Brak pasujących pozycji.'));
    }else if(browse){
      if(category){
        for(const name of new Set(scope.map(i=>i.sectionName)))
          section(clean(name)||'Pozycje',scope.filter(i=>i.sectionName===name));
      }else{
        section('Wcześniejszy zakup u tego sprzedawcy',hints.suggested);
        const group=el('section');group.append(el('h3','Kategorie'));
        for(const sheet of new Set(items.map(i=>i.sheet))){
          const button=btn(clean(sheet),()=>navigate(sheet));button.className='pick-category';group.append(button);
        }
        if(!items.length)group.append(el('p','Brak pozycji wydatków w tym miesiącu.'));
        results.append(group);
      }
    }else{
      section('Ostatnio używane',hints.recent.slice(0,3));
      const all=el('details');all.append(el('summary','Przeglądaj kategorie'));
      for(const sheet of new Set(items.map(x=>x.sheet))){const group=el('details');group.append(el('summary',clean(sheet)));
        for(const name of new Set(items.filter(x=>x.sheet===sheet).map(x=>x.sectionName))){const sub=el('details');sub.append(el('summary',name||'Pozycje'));const body=el('section');sub.append(body);
          sub.ontoggle=()=>{if(sub.open&&!body.childElementCount)items.filter(x=>x.sheet===sheet&&x.sectionName===name).forEach(i=>body.append(option(i)));};group.append(sub);}
        all.append(group);}results.append(all);}
      if(onNew)results.append(btn('+ Nowa pozycja',()=>{dialog.close();onNew(input.value.trim());}));
    }
    input.oninput=paint;paint();const viewport=window.visualViewport;
    function fit(){if(viewport){
      dialog.style.maxHeight=Math.max(120,Math.min(viewport.height-12,window.innerHeight*.82))+'px';
      dialog.style.bottom=Math.max(0,window.innerHeight-viewport.offsetTop-viewport.height)+'px';
    }}
    dialog.onclose=()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);dialog.remove();};
    document.body.append(dialog);dialog.showModal();fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);
    (browse?close:input).focus({preventScroll:true});
  }
  return {index,search,recommendations,open,ikzeOptions,refundOptions};
})();
