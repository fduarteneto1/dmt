// Preços de agregado por pedreira (Pó de pedra, Pedrisco e Brita 1) no Gestão 360º BKP.
// Carregado por index.html depois do app. Não guarda nada secreto.
// - Na lista "Pedreiras e distribuidoras", cada pedreira ganha o botão "R$" para lançar ou atualizar
//   o preço (R$/t) de cada agregado. Cada preço guarda a data em que foi lançado e quem lançou.
// - Embaixo do nome aparece o resumo dos preços e a data.
// - Passando o mouse na pedreira (ponto azul) do mapa, aparecem só os agregados com preço preenchido.
// - Botão "R$ Agregados" no mapa liga/desliga etiquetas fixas com o nome e os preços embaixo de cada pedreira.
// - No Simulador de aquisição, ao escolher agregado e fornecedor, o campo Aquisição (R$/t) vem
//   preenchido com o preço cadastrado (troca sempre que o agregado ou o fornecedor mudar; dá para
//   digitar outro valor). Embaixo do campo aparece a data do preço ou o atalho "usar".
// - Os preços vão para a planilha Google (mesma ligação da aba Emulsão, txApi) e valem para toda a
//   equipe. Sem a planilha, ficam neste navegador e são enviados quando ela aceitar.
(function(){
  try{ if(typeof st === 'undefined' || typeof L === 'undefined' || typeof map === 'undefined' || typeof camadaPts === 'undefined' || typeof window.desenharPontos !== 'function') return; }catch(e){ return; }

  const ITENS = [['po', 'Pó de pedra'], ['pedrisco', 'Pedrisco'], ['brita1', 'Brita 1']];
  const NOME = Object.fromEntries(ITENS);
  const KEY = 'dmtbkp_precosAg', KPEND = 'dmtbkp_precosAgPend';
  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const rs = v => 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const dataBR = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const dataCurta = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : '';
  const agora = () => { const d = new Date(), z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
  const quem = () => { try{ return (window.DMT_SESSAO && window.DMT_SESSAO.u) || ''; }catch(e){ return ''; } };
  const num = s => { s = String(s == null ? '' : s).trim().replace(/^R\$\s*/i, ''); if(!s) return null;
    if(s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : NaN; };

  // P[idPedreira][item] = {v: R$/t ou null (apagado), d: 'aaaa-mm-ddThh:mm:ss', u: usuário, h: [{v, d, u}] anteriores}
  let P = {};
  try{ P = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){ P = {}; }
  const guardar = () => { try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} };
  const pedreira = id => st.pontos.find(p => p.id === id && p.tipo === 'pedreira');
  const precos = id => ITENS.map(([k, n]) => ({k, n, x: (P[id] || {})[k]})).filter(o => o.x && o.x.v != null);
  const ultimaData = id => precos(id).reduce((m, o) => o.x.d > m ? o.x.d : m, '');

  // junta duas versões: em cada pedreira × agregado vale o lançamento mais recente
  function juntar(a, b){
    const r = JSON.parse(JSON.stringify(a || {}));
    Object.keys(b || {}).forEach(id => {
      Object.keys(b[id] || {}).forEach(k => {
        const x = b[id][k]; if(!x || !x.d) return;
        r[id] = r[id] || {};
        if(!r[id][k] || String(x.d) > String(r[id][k].d || '')) r[id][k] = x;
      });
    });
    return r;
  }

  // ---------- planilha (igual para todos) ----------
  const temApi = () => typeof txApi === 'function';
  let tEnvio = null, lido = 0, info = '', infoErro = false;
  function aviso(t, erro){ info = t; infoErro = !!erro; const el = $('pa-sync'); if(el){ el.textContent = t; el.style.color = erro ? '#b42318' : ''; } }
  const msgApi = e => /desconhecida/i.test(e && e.message || '') ? 'A planilha ainda não aceita os preços: atualize o Apps Script (ver README). Por enquanto ficam só neste navegador.' : '';
  async function enviar(){
    clearTimeout(tEnvio);
    if(!temApi()) return aviso('Sem ligação com a planilha: os preços ficam só neste navegador.', true);
    try{
      const j = await txApi({acao: 'gravarPrecosAg', precos: P, usuario: quem()});
      try{ localStorage.removeItem(KPEND); }catch(e){}
      if(j && j.precos && typeof j.precos === 'object'){ P = juntar(P, j.precos); guardar(); redesenhar(); }
      aviso('Preços salvos para toda a equipe às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '.');
    }catch(e){
      const m = msgApi(e);
      aviso(m || 'Sem ligação com a planilha agora. Nova tentativa em 1 minuto.', true);
      if(!m) tEnvio = setTimeout(enviar, 60000);
    }
  }
  async function receber(forcar){
    if(!temApi()) return;
    let pend = false; try{ pend = !!localStorage.getItem(KPEND); }catch(e){}
    if(pend) return enviar();
    if(!forcar && Date.now() - lido < 30000) return;
    lido = Date.now();
    try{
      const j = await txApi({acao: 'lerPrecosAg'});
      if(j && j.precos && typeof j.precos === 'object'){
        const novo = juntar(P, j.precos);
        if(JSON.stringify(novo) !== JSON.stringify(P)){ P = novo; guardar(); redesenhar(); }
      }
      aviso('Os preços lançados aqui valem para toda a equipe.');
    }catch(e){ aviso(msgApi(e) || 'Sem ligação com a planilha agora; mostrando os últimos preços deste navegador.', true); }
  }
  function mudou(){
    guardar();
    try{ localStorage.setItem(KPEND, '1'); }catch(e){}
    aviso('Salvando para toda a equipe…');
    clearTimeout(tEnvio); tEnvio = setTimeout(enviar, 800);
  }

  // ---------- estilo ----------
  const css = document.createElement('style');
  css.textContent =
    '#lista-pts .pa-res{display:block;font-size:11px;color:var(--ink3,#6b7078);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}' +
    '#lista-pts .pa-res b{color:var(--ink,#232323);font-weight:600}' +
    '#lista-pts .pa-res.vazio{font-style:italic}' +
    '#lista-pts button.pa-bt{font-weight:700}' +
    '#lista-pts li.pa-ed{display:block;background:var(--head,#f6f6f7);border:1px solid var(--line,#e5e5e5);border-radius:8px;padding:8px 10px;margin:2px 0 6px}' +
    '.pa-ed .pa-tit{font-weight:700;font-size:12.5px;margin-bottom:6px}' +
    '.pa-ed .pa-lin{display:grid;grid-template-columns:96px 104px 1fr;gap:6px;align-items:center;margin:4px 0}' +
    '.pa-ed .pa-lin label{font-size:12px;margin:0;font-weight:600;text-transform:none;letter-spacing:0}' +
    '.pa-ed .pa-lin input{width:100%;padding:4px 6px;font-size:12.5px;text-align:right}' +
    '.pa-ed .pa-dt{font-size:11px;color:var(--ink3,#6b7078);line-height:1.25}' +
    '.pa-ed .pa-bts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}' +
    '.pa-ed .pa-erro{color:#b42318;font-size:11.5px;margin-top:4px}' +
    '.pa-tip b{display:block;margin-bottom:2px}.pa-tip table{border-collapse:collapse}.pa-tip td{padding:1px 0;border:0;font-size:12px}' +
    '.pa-tip td+td{padding-left:10px;text-align:right;font-weight:600}.pa-tip td+td+td{font-weight:400;color:#6b7078;font-size:11px}' +
    '.pa-et-wrap{background:none;border:0}' +
    '.pa-et{position:absolute;left:0;top:0;transform:translateX(-50%);background:rgba(255,255,255,.95);color:#232323;border:1px solid #2563eb;border-radius:6px;padding:2px 6px;font:500 11px/1.3 sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25);pointer-events:none}' +
    '.pa-et span{display:block}.pa-et b{font-weight:700}.pa-et strong{display:block;font-weight:700;color:#1e40af;border-bottom:1px solid #dbeafe;margin-bottom:1px;padding-bottom:1px}.pa-et em{display:block;font-style:normal;font-size:10px;color:#6b7078}' +
    '@media print{#lista-pts .pa-res,#lista-pts .pa-bt,#lista-pts li.pa-ed{display:none}}';
  document.head.appendChild(css);

  // ---------- dica no mapa (só agregados com preço) ----------
  function dica(p){
    const l = precos(p.id); if(!l.length) return '';
    return '<div class="pa-tip"><b>' + h(p.nome) + '</b><table>'
      + l.map(o => '<tr><td>' + h(o.n) + '</td><td>' + rs(o.x.v) + '/t</td><td>' + dataBR(o.x.d) + '</td></tr>').join('')
      + '</table></div>';
  }
  function dicasMapa(){
    const mks = camadaPts.getLayers();
    st.pontos.forEach((p, i) => {
      if(p.tipo !== 'pedreira') return;
      const mk = mks.find(m => { const ll = m.getLatLng && m.getLatLng(); return ll && Math.abs(ll.lat - p.lat) < 1e-7 && Math.abs(ll.lng - p.lng) < 1e-7; }) || mks[i];
      if(!mk || !mk.bindTooltip) return;
      mk.unbindTooltip();
      const t = dica(p);
      if(t) mk.bindTooltip(t, {direction: 'top', offset: [0, -6], opacity: 0.97});
    });
  }

  // ---------- lista "Pedreiras e distribuidoras" ----------
  let editando = null; // id da pedreira com o quadro de preços aberto
  function resumo(p){
    const l = precos(p.id);
    if(!l.length) return '<small class="pa-res vazio">sem preço lançado</small>';
    const ab = {po: 'Pó', pedrisco: 'Pedrisco', brita1: 'Brita 1'};
    return '<small class="pa-res" title="' + h(l.map(o => o.n + ': ' + rs(o.x.v) + '/t em ' + dataBR(o.x.d) + (o.x.u ? ' (' + o.x.u + ')' : '')).join('\n')) + '">'
      + l.map(o => ab[o.k] + ' <b>' + rs(o.x.v).replace('R$ ', '') + '</b>').join(' · ') + ' · ' + dataCurta(ultimaData(p.id)) + '</small>';
  }
  function decorarLista(){
    const ul = $('lista-pts'); if(!ul) return;
    const lis = [...ul.children].filter(li => !li.classList.contains('pa-ed'));
    st.pontos.forEach((p, i) => {
      const li = lis[i]; if(!li || p.tipo !== 'pedreira') return;
      const nm = li.querySelector('.nm'); if(!nm) return;
      nm.querySelectorAll('.pa-res').forEach(x => x.remove());
      nm.insertAdjacentHTML('beforeend', resumo(p));
      if(!li.querySelector('.pa-bt')){
        const b = document.createElement('button');
        b.className = 'sec mini pa-bt'; b.type = 'button'; b.textContent = 'R$'; b.title = 'Lançar ou atualizar os preços desta pedreira';
        b.onclick = ev => { ev.stopPropagation(); editando = editando === p.id ? null : p.id; quadro(); };
        const ir = li.querySelector('[data-a=ir]');
        ir ? li.insertBefore(b, ir) : li.appendChild(b);
      }
    });
    quadro();
  }
  function quadro(){
    const ul = $('lista-pts'); if(!ul) return;
    ul.querySelectorAll('li.pa-ed').forEach(x => x.remove());
    const p = editando && pedreira(editando);
    if(!p){ editando = null; return; }
    const i = st.pontos.indexOf(p), li = [...ul.children][i]; if(!li) return;
    const ed = document.createElement('li'); ed.className = 'pa-ed';
    const lin = ([k, n]) => {
      const x = (P[p.id] || {})[k], tem = x && x.v != null;
      const ant = x && (x.h || []).find(a => a.v != null);
      return '<div class="pa-lin"><label for="pa-' + k + '">' + h(n) + '</label>'
        + '<input id="pa-' + k + '" inputmode="decimal" placeholder="R$/t" value="' + (tem ? h(x.v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})) : '') + '">'
        + '<div class="pa-dt">' + (tem ? 'lançado em ' + dataBR(x.d) + (x.u ? ' · ' + h(x.u) : '') : (x && x.d ? 'apagado em ' + dataBR(x.d) : '—'))
        + (ant ? '<br>anterior: ' + rs(ant.v) + ' (' + dataBR(ant.d) + ')' : '') + '</div></div>';
    };
    ed.innerHTML = '<div class="pa-tit">Preços de ' + h(p.nome) + ' <small style="font-weight:400;color:var(--ink3,#6b7078)">(R$ por tonelada)</small></div>'
      + ITENS.map(lin).join('')
      + '<div class="pa-erro" id="pa-erro"></div>'
      + '<div class="pa-bts"><button type="button" class="mini" id="pa-ok">Salvar preços</button><button type="button" class="sec mini" id="pa-x">Cancelar</button></div>'
      + '<div class="pa-dt" style="margin-top:6px">Só muda a data do preço que você alterar. Deixe em branco para apagar. Brita 1 é opcional.</div>'
      + '<div class="pa-dt" id="pa-sync" style="margin-top:2px"></div>';
    li.after(ed);
    aviso(info, infoErro);
    const salvar = () => {
      const novos = {}; let erro = '';
      ITENS.forEach(([k, n]) => { const v = num($('pa-' + k).value); if(Number.isNaN(v)) erro = 'Valor inválido em ' + n + '.'; novos[k] = v; });
      if(erro){ $('pa-erro').textContent = erro; return; }
      const d = agora(), u = quem(); let alterou = false;
      P[p.id] = P[p.id] || {};
      ITENS.forEach(([k]) => {
        const x = P[p.id][k], atual = x && x.v != null ? x.v : null;
        if(novos[k] === atual) return;
        const hist = x ? [{v: x.v, d: x.d, u: x.u || ''}].concat(x.h || []).filter(a => a.d).slice(0, 10) : [];
        P[p.id][k] = {v: novos[k], d, u, h: hist};
        alterou = true;
      });
      editando = null;
      if(alterou){ mudou(); redesenhar(); } else quadro();
    };
    $('pa-ok').onclick = salvar;
    $('pa-x').onclick = () => { editando = null; quadro(); };
    ed.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', ev => {
      if(ev.key === 'Enter'){ ev.preventDefault(); salvar(); }
      else if(ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); editando = null; quadro(); }
    }));
    const f = $('pa-po'); if(f && document.activeElement !== f){ f.focus(); f.select(); }
    ed.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }

  // ---------- etiquetas de preço fixas no mapa (botão liga/desliga, igual Pedágios e Fornecedores) ----------
  const KMAPA = 'dmtbkp_precosAgMapa';
  let ligado = false; try{ ligado = localStorage.getItem(KMAPA) === '1'; }catch(e){}
  const camadaEt = L.layerGroup();
  const AB = {po: 'Pó', pedrisco: 'Pedrisco', brita1: 'Brita 1'};
  function etiquetas(){
    camadaEt.clearLayers();
    st.pontos.forEach(p => {
      if(p.tipo !== 'pedreira' || p.lat == null || p.lng == null) return;
      const l = precos(p.id); if(!l.length) return;
      const html = '<div class="pa-et"><strong>' + h(p.nome) + '</strong>' + l.map(o => '<span>' + AB[o.k] + ' <b>' + rs(o.x.v).replace('R$ ', '') + '</b></span>').join('')
        + '<em>' + dataCurta(ultimaData(p.id)) + '</em></div>';
      camadaEt.addLayer(L.marker([p.lat, p.lng], {interactive: false, keyboard: false, zIndexOffset: 500,
        icon: L.divIcon({className: 'pa-et-wrap', iconSize: [0, 0], iconAnchor: [0, -10], html})}));
    });
  }
  let botao = null;
  const pintar = () => { if(!botao) return; botao.style.background = ligado ? '#bfdbfe' : '';
    botao.title = (ligado ? 'Ocultar' : 'Mostrar') + ' os preços dos agregados (R$/t) nas pedreiras'; };
  const Botao = L.Control.extend({options: {position: 'topleft'}, onAdd(){
    const d = L.DomUtil.create('div', 'leaflet-bar');
    d.innerHTML = '<a href="#" style="width:auto;padding:0 7px;font:600 12px/30px sans-serif;white-space:nowrap">R$ Agregados</a>';
    L.DomEvent.disableClickPropagation(d);
    botao = d.firstChild; pintar();
    L.DomEvent.on(botao, 'click', ev => { L.DomEvent.preventDefault(ev); ligado = !ligado;
      try{ localStorage.setItem(KMAPA, ligado ? '1' : '0'); }catch(e){}
      if(ligado){ etiquetas(); camadaEt.addTo(map); } else camadaEt.remove();
      pintar(); });
    return d;
  }});
  new Botao().addTo(map);
  if(ligado) camadaEt.addTo(map);

  function redesenhar(){ try{ dicasMapa(); decorarLista(); etiquetas(); }catch(e){} preencherSim(); }

  // o app redesenha a lista e os marcadores em desenharPontos(): completa depois de cada vez
  const orig = window.desenharPontos;
  window.desenharPontos = function(){
    const r = orig.apply(this, arguments);
    try{ dicasMapa(); decorarLista(); etiquetas(); }catch(e){}
    return r;
  };

  // ---------- Simulador de aquisição: preenche Aquisição (R$/t) com o preço cadastrado ----------
  // aviso embaixo do campo Aquisição: de onde veio o preço
  function avisoSim(aq, x){
    let n = aq.nextElementSibling;
    if(!n || !n.classList || !n.classList.contains('pa-sim')){
      n = document.createElement('small'); n.className = 'pa-sim';
      n.style.cssText = 'display:block;font-size:11px;line-height:1.3;margin-top:2px';
      aq.insertAdjacentElement('afterend', n);
    }
    if(!x){ n.textContent = ''; n.style.display = 'none'; return; }
    n.style.display = 'block';
    if(aq.value !== '' && aq.dataset.paAuto === aq.value){
      n.style.color = '#15803d'; n.textContent = '✓ Preço cadastrado em ' + dataBR(x.d);
    } else {
      n.style.color = '#92400e';
      n.innerHTML = 'Cadastrado: ' + h(rs(x.v)) + ' (' + h(dataCurta(x.d)) + ') · <a href="#" data-pa-usar="1" style="color:inherit">usar</a>';
    }
  }

  // forcar: linha em que o agregado ou o fornecedor acabou de mudar (o preço digitado era do fornecedor anterior)
  function preencherSim(forcar){
    const box = $('sim-linhas'); if(!box) return;
    box.querySelectorAll('[data-k=forn]').forEach(sf => {
      const lin = sf.closest('#sim-linhas > *') || sf.parentElement;
      const sa = lin.querySelector('select[data-k=ag]'), aq = lin.querySelector('input[data-k=aq]');
      if(!sa || !aq) return;
      const p = st.pontos.find(x => x.tipo === 'pedreira' && x.nome === sf.value);
      const x = p && (P[p.id] || {})[sa.value];
      const mudou = forcar === lin;
      if(x && x.v != null){
        aq.placeholder = x.v.toLocaleString('pt-BR', {minimumFractionDigits: 2});
        aq.title = 'Preço cadastrado em ' + dataBR(x.d) + ': ' + rs(x.v) + '/t';
        // valor restaurado pelo simulador (ex.: depois de recarregar) igual ao cadastrado: conta como automático
        if(!aq.dataset.paAuto && aq.value !== '' && Math.abs(+aq.value - x.v) < 0.005) aq.dataset.paAuto = aq.value;
        if(mudou || aq.value.trim() === '' || aq.dataset.paAuto === aq.value){
          // o campo do simulador é numérico: valor com ponto decimal (o navegador mostra no formato local)
          const v = aq.type === 'number' ? String(x.v) : x.v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false});
          if(aq.value !== v){
            aq.value = v; aq.dataset.paAuto = v;
            aq.dispatchEvent(new Event('input', {bubbles: true})); aq.dispatchEvent(new Event('change', {bubbles: true}));
          }
          aq.dataset.paAuto = v;
        }
        avisoSim(aq, x);
      } else {
        aq.placeholder = ''; aq.title = '';
        if((aq.dataset.paAuto && aq.dataset.paAuto === aq.value) || (mudou && aq.dataset.paAuto)){
          aq.value = '';
          aq.dispatchEvent(new Event('input', {bubbles: true})); aq.dispatchEvent(new Event('change', {bubbles: true}));
        }
        delete aq.dataset.paAuto;
        avisoSim(aq, null);
      }
    });
  }
  document.addEventListener('change', ev => {
    const t = ev.target;
    if(t && t.matches && t.matches('#sim-linhas select[data-k=ag], #sim-linhas select[data-k=forn]')){
      const lin = t.closest('#sim-linhas > *') || t.parentElement;
      setTimeout(() => preencherSim(lin), 0);
    }
  });
  // digitou outro preço na mão: o aviso passa a mostrar o cadastrado com o atalho "usar"
  document.addEventListener('input', ev => {
    const t = ev.target;
    if(t && t.matches && t.matches('#sim-linhas input[data-k=aq]') && ev.isTrusted) setTimeout(() => preencherSim(), 0);
  });
  document.addEventListener('click', ev => {
    const a = ev.target && ev.target.closest && ev.target.closest('#sim-linhas [data-pa-usar]');
    if(!a) return;
    ev.preventDefault();
    const lin = a.closest('#sim-linhas > *');
    const aq = lin && lin.querySelector('input[data-k=aq]');
    if(aq){ aq.value = ''; delete aq.dataset.paAuto; preencherSim(lin); }
  });
  const caixaSim = $('sim-linhas');
  if(caixaSim){ let tm = null; new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(preencherSim, 50); }).observe(caixaSim, {childList: true}); }

  // ---------- início ----------
  redesenhar();
  receber(true);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) receber(); });

  window.G360PrecosAg = {dados: () => P, precos, enviar, receber};
})();
