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
  function index(rows,month){
    return rows.filter(r=>r.month===month&&clean(r.label)).map(r=>{
      const path=[clean(r.sheet),clean(r.sectionName),clean(r.label)].filter(Boolean).join(' → ');
      const words=fold(path).split(/[^a-z0-9]+/);
      if(words.some(w=>w==='obuwie'||w==='buty'))words.push('obuwie','buty');
      return {...r,path,words,plain:fold(path)};
    });
  }
  function search(items,q){
    const terms=fold(q).split(/\s+/).filter(Boolean);
    return items.map(item=>{let score=0;for(const term of terms){if(item.plain.includes(term))score+=2;else if(item.words.some(w=>w.includes(term)||near(term,w)))score++;else return null;}return {item,score};})
      .filter(Boolean).sort((a,b)=>b.score-a.score).map(o=>o.item);
  }
  function recommendations(items,rows,merchant){
    const freq=new Map(),last=new Map(),match=new Map(),byKey=new Map(items.map(i=>[i.key,i]));
    const stable=k=>String(k||'').replace(/\|\d{4}-\d{2}$/,'');
    const byRow=new Map(items.map(i=>[stable(i.key),i]));
    for(const row of rows){const d=row.decision;
      if(row.bridgeArchived||!d||d.action!=='EXISTING_ROW')continue;
      const i=byKey.get(d.targetManualKey)||byRow.get(stable(d.targetManualKey));
      if(!i||(d.category&&fold(clean(d.category))!==fold(clean(i.label))))continue;
      freq.set(i,(freq.get(i)||0)+1);last.set(i,Math.max(last.get(i)||0,Date.parse(d.at||row.date)||0));
      if(fold(merchant)&&fold(merchant)===fold(row.description))match.set(i,(match.get(i)||0)+1);
    }
    const top=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,5).map(p=>p[0]);
    return {recent:top(last),frequent:top(freq),suggested:top(match).filter(i=>match.get(i)>=2).slice(0,1)};
  }
  function open(items,hints,onSelect,onNew){
    const dialog=document.createElement('dialog');dialog.className='pick-sheet';dialog.setAttribute('aria-label','Wybierz pozycję');
    const el=(tag,txt)=>Object.assign(document.createElement(tag),{textContent:txt||''});
    const btn=(title,fn)=>{const b=el('button',title);b.type='button';b.onclick=fn;return b;};
    const header=el('header');header.append(el('h2','Wybierz pozycję'),btn('Zamknij',()=>dialog.close()));
    const input=el('input');input.type='search';input.placeholder='Szukaj kategorii lub pozycji…';input.setAttribute('aria-label',input.placeholder);
    const results=el('div');dialog.append(header,input,results);
    const choose=i=>{dialog.close();onSelect(i);};
    function section(title,list){if(!list.length)return;const group=el('section');group.append(el('h3',title));for(const i of list)group.append(btn(i.path,()=>choose(i)));results.append(group);}
    function paint(){results.replaceChildren();if(input.value.trim()){
      const matches=search(items,input.value);section('Wyniki',matches.slice(0,12));
      if(matches.length>12)results.append(el('p','Doprecyzuj nazwę, aby zawęzić wyniki.'));
      if(!matches.length)results.append(el('p','Brak pasujących pozycji.'));
    }else{
      section('Dla tego odbiorcy',hints.suggested);section('Ostatnio używane',hints.recent);section('Najczęściej używane',hints.frequent);
      const all=el('details');all.append(el('summary','Wszystkie kategorie'));
      for(const sheet of new Set(items.map(x=>x.sheet))){const group=el('details');group.append(el('summary',clean(sheet)));
        for(const name of new Set(items.filter(x=>x.sheet===sheet).map(x=>x.sectionName))){const sub=el('details');sub.append(el('summary',name||'Pozycje'));const body=el('section');sub.append(body);
          sub.ontoggle=()=>{if(sub.open&&!body.childElementCount)items.filter(x=>x.sheet===sheet&&x.sectionName===name).forEach(i=>body.append(btn(clean(i.label),()=>choose(i))));};group.append(sub);}
        all.append(group);}results.append(all);}
      if(onNew)results.append(btn('+ Nowa pozycja',()=>{dialog.close();onNew(input.value.trim());}));
    }
    input.oninput=paint;paint();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();input.focus();
  }
  return {index,search,recommendations,open};
})();
