// Layout do painel lateral da Gestão 360º BKP.
// - Menu de módulos (Transporte, Obras, Colaboradores...) em coluna vertical, à esquerda do painel,
//   para caber mais módulos sem apertar os botões.
// - Cada bloco (card com título) pode ser minimizado clicando no título; o estado fica salvo
//   neste navegador. Na impressão, tudo aparece aberto.
// Carregado por index.html por último, depois dos outros módulos. Não guarda nada secreto.
(function(){
  const aside = document.querySelector('aside'), abas = document.getElementById('abas');
  if(!aside || !abas) return;
  const KEY = 'dmtbkp_recolhidos';
  let rec = {};
  try{ rec = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){}
  const salvar = () => { try{ localStorage.setItem(KEY, JSON.stringify(rec)); }catch(e){} };

  const css = document.createElement('style');
  css.textContent = `
  @media (min-width:801px){
    aside{width:min(650px,54vw);display:grid;grid-template-columns:128px minmax(0,1fr);column-gap:12px;align-items:start}
    aside>#abas{grid-column:1;grid-row:1;flex-direction:column;align-items:stretch;position:sticky;top:0;margin:0}
    aside>#abas button{text-align:left;padding:9px 10px;white-space:normal}
    aside>:not(#abas){grid-column:2;grid-row:1;min-width:0}
  }
  @media (max-width:800px){ aside>#abas{flex-wrap:wrap} aside>#abas button{flex:1 1 30%} }
  .card>h2.g360-rec{cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px}
  .card>h2.g360-rec:hover{color:var(--ink2)}
  .card>h2.g360-rec>.g360-sv{margin-left:auto;flex:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;color:var(--ink3);transition:transform .15s}
  .card>h2.g360-rec:hover>.g360-sv{background:var(--head,#F6F6F7)}
  .card.g360-fechado>h2.g360-rec>.g360-sv{transform:rotate(-90deg)}
  @media screen{
    .card.g360-fechado{padding-bottom:12px}
    .card.g360-fechado>h2.g360-rec{margin-bottom:0}
    .card.g360-fechado>:not(h2){display:none!important}
  }`;
  document.head.appendChild(css);

  const titulo = h2 => Array.from(h2.childNodes).filter(n => !(n.classList && n.classList.contains('g360-sv')))
    .map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const chave = (card, h2) => { const a = card.closest('[id^="aba-"]'); return (a ? a.id : '?') + '|' + titulo(h2); };

  function preparar(card){
    const h2 = card.querySelector(':scope>h2');
    if(!h2 || !titulo(h2)) return;
    if(!h2.classList.contains('g360-rec')){
      h2.classList.add('g360-rec');
      h2.setAttribute('role', 'button'); h2.tabIndex = 0;
      h2.title = 'Clique para minimizar ou abrir este bloco';
    }
    if(!h2.querySelector(':scope>.g360-sv')){
      const s = document.createElement('span');
      s.className = 'g360-sv'; s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      h2.appendChild(s);
    }
    const fechado = !!rec[chave(card, h2)];
    if(card.classList.contains('g360-fechado') !== fechado) card.classList.toggle('g360-fechado', fechado);
    h2.setAttribute('aria-expanded', String(!fechado));
  }
  function alternar(h2){
    const card = h2.parentElement, k = chave(card, h2);
    const fechar = !card.classList.contains('g360-fechado');
    if(fechar) rec[k] = 1; else delete rec[k];
    salvar(); preparar(card);
    if(!fechar) window.dispatchEvent(new Event('resize')); // mapas/gráficos dentro do bloco se ajustam
  }
  aside.addEventListener('click', ev => {
    const h2 = ev.target.closest('.card>h2.g360-rec');
    if(!h2 || !aside.contains(h2)) return;
    const ctl = ev.target.closest('button,a,input,select,textarea,label');
    if(ctl && h2.contains(ctl)) return; // controles dentro do título continuam funcionando
    alternar(h2);
  });
  aside.addEventListener('keydown', ev => {
    if(ev.key !== 'Enter' && ev.key !== ' ') return;
    const h2 = ev.target.closest && ev.target.closest('.card>h2.g360-rec');
    if(h2 && ev.target === h2){ ev.preventDefault(); alternar(h2); }
  });

  // ---- Botão para recolher a coluna inteira (mapa em tela cheia) ----
  // Fica na borda entre a coluna e o mapa. O estado fica salvo neste navegador.
  // Atalho: tecla "[" (fora de campos de texto). Na impressão, a coluna aparece sempre.
  const KEY_COL = 'dmtbkp_coluna_recolhida';
  const area = aside.nextElementSibling; // bloco do mapa (position:relative)
  if(area){
    const css2 = document.createElement('style');
    css2.textContent = `
    @media screen{ body.g360-col-off aside{display:none!important} }
    .g360-col{position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:1000;
      display:flex;align-items:center;gap:6px;height:44px;padding:0 9px 0 6px;
      background:#fff;color:var(--ink2);border:1px solid var(--line);border-left:0;border-radius:0 10px 10px 0;
      box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:11.5px;font-weight:700;cursor:pointer}
    .g360-col:hover:not(:disabled){background:var(--head);color:var(--ink);filter:none}
    .g360-col svg{flex:none;transition:transform .15s}
    body.g360-col-off .g360-col svg{transform:rotate(180deg)}
    .g360-col .g360-col-t{display:none}
    body.g360-col-off .g360-col .g360-col-t{display:inline}
    .g360-col .g360-col-m{display:none}
    @media print{.g360-col{display:none!important}}`;
    document.head.appendChild(css2);

    const bt = document.createElement('button');
    bt.type = 'button'; bt.className = 'g360-col';
    bt.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M8.5 3 4.5 7l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="g360-col-t">Ferramentas</span><span class="g360-col-m">Ampliar mapa</span>';
    area.appendChild(bt);

    const aplicar = off => {
      document.body.classList.toggle('g360-col-off', off);
      bt.title = off ? 'Mostrar a coluna de ferramentas (tecla [)' : 'Recolher a coluna e deixar o mapa em tela cheia (tecla [)';
      bt.setAttribute('aria-label', bt.title);
      bt.setAttribute('aria-expanded', String(!off));
      window.dispatchEvent(new Event('resize')); // o mapa ocupa o espaço liberado
    };
    const alternarCol = () => {
      const off = !document.body.classList.contains('g360-col-off');
      try{ off ? localStorage.setItem(KEY_COL, '1') : localStorage.removeItem(KEY_COL); }catch(e){}
      aplicar(off);
    };
    bt.addEventListener('click', ev => { ev.stopPropagation(); alternarCol(); });
    ['mousedown','dblclick','wheel','touchstart'].forEach(t => bt.addEventListener(t, ev => ev.stopPropagation())); // não mexe no mapa
    document.addEventListener('keydown', ev => {
      if(ev.key !== '[' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const el = ev.target;
      if(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      ev.preventDefault(); alternarCol();
    });
    let ini = false; try{ ini = localStorage.getItem(KEY_COL) === '1'; }catch(e){}
    aplicar(ini);
  }

  // ---- Celular (tela até 800px) ----
  // Mapa em cima (42% da tela), ferramentas embaixo com a página rolando normalmente.
  // Cabeçalho compacto, menu de módulos numa linha só (arrasta para o lado) e fixo no topo,
  // campos com fonte 16px (o iPhone não dá zoom ao tocar), legenda do mapa recolhível,
  // e o botão "Ampliar mapa" deixa o mapa em tela cheia.
  const css3 = document.createElement('style');
  css3.textContent = `
  @media screen and (max-width:800px){
    html,body{height:auto!important;min-height:100%}
    body{display:block!important;overflow-x:hidden}
    header{position:sticky;top:0;z-index:1200;padding:8px 12px!important;gap:10px!important;flex-wrap:nowrap!important}
    header .logo-bkp{height:24px!important}
    header .tit{min-width:0;flex:1 1 auto}
    header h1{font-size:16px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    header .tit>span,header #ses-user{display:none!important}
    header .sessao{gap:6px!important;flex:none}
    header .sessao-b{padding:5px 9px!important;font-size:12px!important}
    main{display:flex!important;flex-direction:column-reverse!important;min-height:0!important}
    main>aside{width:100%!important;max-width:100%!important;overflow:visible!important;border:0!important;padding:10px!important;display:block!important}
    main>aside+div{flex:none!important;height:42vh;height:42dvh;min-height:240px}
    body.g360-col-off main>aside+div{height:calc(100vh - var(--g360-hh,44px));height:calc(100dvh - var(--g360-hh,44px))}
    #map{flex:1 1 auto!important;width:100%!important;height:auto!important;min-height:0!important}
    aside>#abas{position:sticky;top:var(--g360-hh,44px);z-index:1100;display:flex;flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 0 12px!important;box-shadow:0 2px 6px rgba(0,0,0,.06)}
    aside>#abas::-webkit-scrollbar{display:none}
    aside>#abas button{flex:0 0 auto!important;white-space:nowrap;padding:8px 13px!important}
    input,select,textarea{font-size:16px!important}
    .card{padding:14px!important}
    aside table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
    .rr{top:auto!important;bottom:58px!important;left:10px!important;right:10px!important;width:auto!important;max-height:calc(100% - 120px);overflow:auto}
    .g360-col{top:auto!important;bottom:10px!important;left:10px!important;transform:none!important;border:1px solid var(--line)!important;border-radius:10px!important;height:38px!important;padding:0 12px!important}
    .g360-col svg,.g360-col .g360-col-t{display:none!important}
    .g360-col .g360-col-m{display:inline}
    body.g360-col-off .g360-col .g360-col-m{display:none}
    body.g360-col-off .g360-col .g360-col-t{display:inline!important}
    .g360-leg{cursor:pointer;max-width:60vw}
    .g360-leg::before{content:"Legenda ▾";display:block;font-weight:700;color:var(--ink)}
    .g360-leg.g360-leg-min{max-height:32px;overflow:hidden}
    .g360-leg.g360-leg-min::before{content:"Legenda ▸"}
  }`;
  document.head.appendChild(css3);
  const cab = document.querySelector('header');
  const medirCab = () => { if(cab) document.documentElement.style.setProperty('--g360-hh', cab.offsetHeight + 'px'); };
  medirCab(); window.addEventListener('resize', medirCab);
  const leg = Array.from(document.querySelectorAll('.leaflet-control')).find(c => !c.classList.contains('leaflet-bar') && !c.classList.contains('leaflet-control-attribution'));
  if(leg){
    leg.classList.add('g360-leg', 'g360-leg-min');
    leg.addEventListener('click', ev => { if(window.matchMedia('(max-width:800px)').matches && !ev.target.closest('input,select,button,a')) leg.classList.toggle('g360-leg-min'); });
  }

  const varrer = () => aside.querySelectorAll('.card').forEach(preparar);
  let pend = false;
  new MutationObserver(() => { if(pend) return; pend = true; requestAnimationFrame(() => { pend = false; varrer(); }); })
    .observe(aside, {childList: true, subtree: true, characterData: true});
  varrer();
  window.dispatchEvent(new Event('resize')); // o painel mudou de largura: o mapa se reajusta
})();
