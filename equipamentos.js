// Aba "Equipamentos" do Gestão 360º BKP: alocação de máquinas e veículos nas obras.
// Carregado por index.html depois do app (como obras-sync.js). Não guarda nada secreto:
// o cadastro e as alocações ficam na aba oculta "Gestao360" da planilha Google (linha 2),
// lidos e gravados pela mesma ligação da aba Emulsão (txApi), que é criptografada no app.enc.
(function(){
  if(typeof txApi !== 'function' || typeof st === 'undefined' || typeof trocarAba !== 'function') return;

  const KEY = 'dmtbkp_equip', PEND = 'dmtbkp_equipPend';
  const SITS = ['Operando', 'Parado', 'Manutenção', 'Disponível'];
  const COR_SIT = {'Operando':'#1f7a3d', 'Parado':'#b26a00', 'Manutenção':'#b42318', 'Disponível':'#475467'};
  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const cod = v => typeof codObra === 'function' ? codObra(v) : String(v || '').trim().toUpperCase();
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dataBR = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : '';

  let E = {equip: [], hist: []};
  try{ const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if(v && Array.isArray(v.equip)) E = v; }catch(e){}
  const F = {local: null, cat: '', busca: '', sit: ''}; // local null = todos
  const sel = new Set();
  let timer = null, ultimaLeitura = 0, estado = '';

  // ---------- locais ----------
  function locais(){
    const l = [{cod: 'ADM', nome: 'Sede (ADM)'}];
    (st.obras || []).forEach(o => {
      const c = cod(o.codigo); if(!c || l.some(x => x.cod === c)) return;
      if(o.status === 'concluida' && !E.equip.some(e => e.loc === c)) return;
      l.push({cod: c, nome: c + ' – ' + (o.local || o.nome)});
    });
    [...new Set(E.equip.map(e => e.loc))].filter(c => c && !l.some(x => x.cod === c))
      .forEach(c => l.push({cod: c, nome: c + ' (sem obra no mapa)'}));
    return l;
  }
  const nomeLocal = c => !c ? 'Sem alocação' : ((locais().find(x => x.cod === c) || {}).nome || c);
  const opcoesLocal = (atual, comVazio) => (comVazio ? '<option value="">Sem alocação</option>' : '')
    + locais().map(l => '<option value="' + h(l.cod) + '"' + (l.cod === atual ? ' selected' : '') + '>' + h(l.nome) + '</option>').join('');

  // ---------- montar a aba ----------
  const css = document.createElement('style');
  css.textContent = `
  #aba-equip .eqp-li{display:flex;align-items:center;gap:6px;padding:7px 0;border-bottom:1px solid var(--line,#e4e7ec)}
  #aba-equip .eqp-li input[type=checkbox]{width:auto;flex:0 0 auto;margin:0}
  #aba-equip .eqp-li .nm{flex:1 1 auto;min-width:0;display:block}
  #aba-equip .eqp-li .nm b{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #aba-equip .eqp-li .nm small{display:block;color:var(--ink3,#66706a);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #aba-equip .eqp-li select{width:auto;flex:0 0 auto;max-width:112px;font-size:11.5px;padding:3px 4px;margin:0}
  #aba-equip .eqp-li .sit{max-width:96px;font-weight:600}
  #aba-equip .eqp-li .mais{background:none;border:0;color:var(--ink2,#475467);padding:2px 4px;cursor:pointer;font-size:15px}
  #aba-equip ul{list-style:none;margin:6px 0 0;padding:0;max-height:62vh;overflow:auto}
  #aba-equip .eqp-hist li{font-size:11.5px;padding:4px 0;border-bottom:1px dashed var(--line,#e4e7ec)}
  #aba-equip .eqp-massa{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0;padding:8px;background:#f6f7f9;border-radius:8px;font-size:12px}
  #aba-equip .eqp-massa select{width:auto;flex:1;margin:0}
  #eqp-modal{position:fixed;inset:0;background:rgba(16,24,40,.45);display:flex;align-items:center;justify-content:center;z-index:5000}
  #eqp-modal form{background:#fff;border-radius:12px;padding:18px;width:440px;max-width:94vw;max-height:90vh;overflow:auto}
  #eqp-modal .g{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
  #eqp-modal .g .full{grid-column:1/3}
  #eqp-modal h2{margin:0 0 8px}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.dataset.aba = 'equip'; btn.textContent = 'Equipamentos';
  $('abas').appendChild(btn);
  btn.addEventListener('click', () => trocarAba('equip'));

  const aba = document.createElement('div');
  aba.id = 'aba-equip'; aba.style.display = 'none';
  aba.innerHTML = `
    <div class="card">
      <h2>Equipamentos por local</h2>
      <div class="eq-res" id="eqp-res"></div>
      <div class="hint">Clique num local para filtrar a lista. <span id="eqp-estado"></span></div>
    </div>
    <div class="card">
      <h2>Alocação nas obras</h2>
      <label for="eqp-f-local">Obra / local</label>
      <select id="eqp-f-local"></select>
      <div class="row">
        <div><label for="eqp-f-cat">Categoria</label><select id="eqp-f-cat"></select></div>
        <div style="flex:0 0 120px"><label for="eqp-f-sit">Situação</label><select id="eqp-f-sit"></select></div>
      </div>
      <label for="eqp-f-busca">Buscar código, modelo ou placa</label>
      <input id="eqp-f-busca" placeholder="Ex.: CBS01, pipa, QBL9D76" autocomplete="off">
      <div class="eqp-massa" id="eqp-massa" style="display:none"><span id="eqp-massa-n"></span>
        <select id="eqp-massa-dest"></select><button class="mini" id="eqp-massa-ok">Mover</button></div>
      <div class="hint" id="eqp-info"></div>
      <ul id="eqp-lista"></ul>
      <div class="btns"><button id="eqp-add">Adicionar equipamento</button>
        <button class="sec mini" id="eqp-csv">Baixar planilha (CSV)</button></div>
    </div>
    <div class="card">
      <h2>Últimas movimentações</h2>
      <ul class="eqp-hist" id="eqp-hist"></ul>
    </div>`;
  $('aba-taxa').parentElement.insertBefore(aba, $('aba-taxa').nextSibling);

  $('eqp-f-sit').innerHTML = '<option value="">Todas</option>' + SITS.map(s => '<option>' + s + '</option>').join('');
  $('eqp-f-local').onchange = e => { F.local = e.target.value === '*' ? null : e.target.value; render(); };
  $('eqp-f-cat').onchange = e => { F.cat = e.target.value; render(); };
  $('eqp-f-sit').onchange = e => { F.sit = e.target.value; render(); };
  $('eqp-f-busca').oninput = e => { F.busca = e.target.value; render(); };
  $('eqp-add').onclick = () => editar(null);
  $('eqp-csv').onclick = csv;
  $('eqp-massa-ok').onclick = () => {
    const dest = $('eqp-massa-dest').value;
    E.equip.filter(e => sel.has(e.c)).forEach(e => mover(e, dest, e.sit));
    sel.clear(); salvar();
  };

  // ---------- regras ----------
  function mover(e, loc, sit){
    loc = loc || ''; sit = sit || e.sit || 'Disponível';
    if(loc === (e.loc || '') && sit === e.sit) return;
    E.hist.unshift({q: new Date().toISOString().slice(0, 16), c: e.c, de: e.loc || '', para: loc, sit,
      u: (window.DMT_SESSAO && window.DMT_SESSAO.u) || ''});
    if(E.hist.length > 300) E.hist.length = 300;
    if(loc !== (e.loc || '')) e.desde = hoje();
    e.loc = loc; e.sit = sit;
  }

  function filtrados(){
    const b = F.busca.trim().toLowerCase();
    return E.equip.filter(e => (F.local === null || (e.loc || '') === F.local)
      && (!F.cat || e.cat === F.cat) && (!F.sit || e.sit === F.sit)
      && (!b || [e.c, e.d, e.m, e.p, e.t].some(v => String(v || '').toLowerCase().includes(b))));
  }

  function render(){
    const ls = locais();
    // resumo por local
    const n = c => E.equip.filter(e => (e.loc || '') === c).length;
    const cards = [{c: null, nome: 'Todos', n: E.equip.length}, {c: '', nome: 'Sem alocação', n: n('')}]
      .concat(ls.map(l => ({c: l.cod, nome: l.nome, n: n(l.cod)})));
    $('eqp-res').innerHTML = cards.map(k => '<button data-f="' + (k.c === null ? '*' : h(k.c)) + '" class="' + (F.local === k.c ? 'on' : '') + '" title="' + h(k.nome) + '"><b>' + k.n + '</b><small>' + h(k.nome) + '</small></button>').join('');
    $('eqp-res').querySelectorAll('button').forEach(b => b.onclick = () => { F.local = b.dataset.f === '*' ? null : b.dataset.f; render(); });
    // filtros
    $('eqp-f-local').innerHTML = '<option value="*">Todos os locais (' + E.equip.length + ')</option>'
      + '<option value="">Sem alocação (' + n('') + ')</option>'
      + ls.map(l => '<option value="' + h(l.cod) + '">' + h(l.nome) + ' (' + n(l.cod) + ')</option>').join('');
    $('eqp-f-local').value = F.local === null ? '*' : F.local;
    const cats = [...new Set(E.equip.map(e => e.cat).filter(Boolean))];
    $('eqp-f-cat').innerHTML = '<option value="">Todas</option>' + cats.map(c => '<option' + (c === F.cat ? ' selected' : '') + '>' + h(c) + '</option>').join('');
    $('eqp-f-sit').value = F.sit;
    // lista
    const lista = filtrados();
    $('eqp-info').textContent = lista.length + ' equipamento(s) na lista' + (estado ? '' : '');
    $('eqp-lista').innerHTML = lista.map(e => '<li class="eqp-li" data-c="' + h(e.c) + '">'
      + '<input type="checkbox" title="Selecionar para mover em grupo"' + (sel.has(e.c) ? ' checked' : '') + '>'
      + '<span class="nm"><b title="' + h(e.c + ' – ' + e.d) + '">' + h(e.c) + ' – ' + h(e.d) + '</b>'
      + '<small>' + h([e.p, e.e, e.desde ? 'desde ' + dataBR(e.desde) : '', e.obs].filter(Boolean).join(' · ')) + '</small></span>'
      + '<select class="loc" title="Local">' + opcoesLocal(e.loc || '', true) + '</select>'
      + '<select class="sit" title="Situação" style="color:' + (COR_SIT[e.sit] || '') + '">' + SITS.map(s => '<option' + (s === e.sit ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>'
      + '<button class="mais" title="Detalhes">⋯</button></li>').join('')
      || '<li class="hint" style="padding:10px 0">Nenhum equipamento com esses filtros.</li>';
    $('eqp-lista').querySelectorAll('li[data-c]').forEach(li => {
      const e = E.equip.find(x => x.c === li.dataset.c);
      li.querySelector('.loc').onchange = ev => { mover(e, ev.target.value, e.sit); salvar(); };
      li.querySelector('.sit').onchange = ev => { mover(e, e.loc, ev.target.value); salvar(); };
      li.querySelector('.mais').onclick = () => editar(e);
      li.querySelector('input').onchange = ev => { ev.target.checked ? sel.add(e.c) : sel.delete(e.c); massa(); };
    });
    massa();
    // histórico
    $('eqp-hist').innerHTML = E.hist.slice(0, 25).map(x => '<li><b>' + h(x.c) + '</b> ' + h(nomeLocal(x.de)) + ' → ' + h(nomeLocal(x.para))
      + ' <span style="color:' + (COR_SIT[x.sit] || '') + '">(' + h(x.sit) + ')</span><br><small style="color:#66706a">'
      + h(x.q.replace('T', ' ').split(' ').map((p, i) => i ? p : dataBR(p)).join(' ')) + (x.u ? ' · ' + h(x.u) : '') + '</small></li>').join('')
      || '<li class="hint">Nenhuma movimentação ainda.</li>';
  }

  function massa(){
    [...sel].forEach(c => { if(!E.equip.some(e => e.c === c)) sel.delete(c); });
    $('eqp-massa').style.display = sel.size ? '' : 'none';
    $('eqp-massa-n').textContent = sel.size + ' selecionado(s) →';
    if(sel.size && !$('eqp-massa-dest').options.length) $('eqp-massa-dest').innerHTML = opcoesLocal('', true);
    if(!sel.size) $('eqp-massa-dest').innerHTML = '';
  }

  // ---------- cadastro / detalhes ----------
  function editar(e){
    const novo = !e; e = e || {c: '', cat: '', d: '', m: '', t: '', p: '', a: '', r: '', pn: '', e: 'BKP CONSTRUTORA', loc: '', sit: 'Disponível', desde: hoje(), obs: '', nota: ''};
    const cats = [...new Set(E.equip.map(x => x.cat).filter(Boolean))];
    const campo = (k, rot, cls, extra) => '<div class="' + (cls || '') + '"><label>' + rot + '</label><input name="' + k + '" value="' + h(e[k]) + '"' + (extra || '') + '></div>';
    const m = document.createElement('div'); m.id = 'eqp-modal';
    m.innerHTML = '<form><h2>' + (novo ? 'Novo equipamento' : h(e.c) + ' – ' + h(e.d)) + '</h2><div class="g">'
      + campo('c', 'Código', '', novo ? ' required placeholder="Ex.: CBS04"' : ' readonly')
      + '<div><label>Categoria</label><input name="cat" list="eqp-cats" value="' + h(e.cat) + '" required><datalist id="eqp-cats">' + cats.map(c => '<option value="' + h(c) + '">').join('') + '</datalist></div>'
      + campo('d', 'Descrição / modelo', 'full', ' required') + campo('m', 'Marca') + campo('t', 'Tipo')
      + campo('p', 'Placa') + campo('a', 'Ano') + campo('r', 'RENAVAM') + campo('pn', 'Pneu')
      + campo('e', 'Empresa', 'full')
      + '<div><label>Local</label><select name="loc">' + opcoesLocal(e.loc || '', true) + '</select></div>'
      + '<div><label>Situação</label><select name="sit">' + SITS.map(s => '<option' + (s === e.sit ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>'
      + campo('desde', 'No local desde', '', ' type="date"')
      + campo('obs', 'Observação da alocação', 'full', ' placeholder="Ex.: operador João, frente km 12"')
      + (e.nota ? '<div class="full hint" style="margin-top:6px">Nota do cadastro: ' + h(e.nota) + '</div>' : '')
      + '</div><div class="btns"><button type="submit">Salvar</button><button type="button" class="sec" data-x>Cancelar</button>'
      + (novo ? '' : '<button type="button" class="sec mini" data-del style="margin-left:auto;color:#b42318">Excluir</button>') + '</div></form>';
    document.body.appendChild(m);
    const f = m.querySelector('form'), fechar = () => m.remove();
    m.querySelector('[data-x]').onclick = fechar;
    m.onclick = ev => { if(ev.target === m) fechar(); };
    if(!novo) m.querySelector('[data-del]').onclick = () => {
      if(!confirm('Excluir ' + e.c + ' do cadastro de equipamentos?')) return;
      E.equip = E.equip.filter(x => x !== e); fechar(); salvar();
    };
    f.onsubmit = ev => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f).entries());
      v.c = String(v.c || '').trim().toUpperCase();
      if(novo && E.equip.some(x => x.c === v.c)) { alert('Já existe um equipamento com o código ' + v.c + '.'); return; }
      if(novo){ const n = Object.assign(e, v, {loc: '', sit: v.sit}); E.equip.push(n); mover(n, v.loc, v.sit); n.desde = v.desde || hoje(); }
      else {
        ['cat', 'd', 'm', 't', 'p', 'a', 'r', 'pn', 'e', 'obs'].forEach(k => e[k] = String(v[k] || '').trim());
        mover(e, v.loc, v.sit); if(v.desde) e.desde = v.desde;
      }
      E.equip.sort((a, b) => a.c.localeCompare(b.c, 'pt-BR'));
      fechar(); salvar();
    };
  }

  function csv(){
    const cols = [['c', 'Código'], ['cat', 'Categoria'], ['d', 'Descrição/Modelo'], ['m', 'Marca'], ['p', 'Placa'], ['e', 'Empresa'], ['loc', 'Local'], ['sit', 'Situação'], ['desde', 'Desde'], ['obs', 'Observação']];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const linhas = [cols.map(c => q(c[1])).join(';')].concat(filtrados().map(e => cols.map(([k]) => q(k === 'loc' ? nomeLocal(e.loc) : k === 'desde' ? dataBR(e.desde) : e[k])).join(';')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], {type: 'text/csv;charset=utf-8'}));
    a.download = 'equipamentos-alocacao-' + hoje() + '.csv'; a.click();
  }

  // ---------- mapa: quantidade de equipamentos na dica da obra e da sede ----------
  function linhaEquip(c){
    c = cod(c); if(!c) return '';
    const l = E.equip.filter(e => e.loc === c); if(!l.length) return '';
    const op = l.filter(e => e.sit === 'Operando').length;
    return '<br><span style="font-weight:600">🚜 ' + l.length + ' equipamento' + (l.length === 1 ? '' : 's') + '</span> <small style="color:#66706a">(' + op + ' operando)</small>';
  }
  if(typeof linhaEquipe === 'function'){
    const orig = linhaEquipe;
    window.linhaEquipe = function(c){ return orig.apply(this, arguments) + linhaEquip(c); };
  }
  function atualizarMapa(){
    try{ if(typeof desenharObras === 'function') desenharObras(); }catch(e){}
    try{ if(typeof mkSede !== 'undefined' && typeof tipSede === 'function') mkSede.setTooltipContent(tipSede()); }catch(e){}
  }

  // ---------- troca de aba ----------
  const trocarOrig = trocarAba;
  window.trocarAba = function(a){
    trocarOrig.apply(this, arguments);
    aba.style.display = a === 'equip' ? '' : 'none';
    if(a === 'equip'){
      try{ if(!obrasVistas){ obrasVistas = true; verTodasObras(); } }catch(e){}
      render(); receber();
    }
  };

  // ---------- planilha ----------
  function aviso(t, erro){ estado = t; const el = $('eqp-estado'); if(el){ el.textContent = t; el.style.color = erro ? '#b42318' : ''; } }

  function salvar(){
    localStorage.setItem(KEY, JSON.stringify(E));
    localStorage.setItem(PEND, '1');
    render(); atualizarMapa();
    clearTimeout(timer); timer = setTimeout(enviar, 1000);
  }

  async function enviar(){
    clearTimeout(timer);
    try{
      await txApi({acao: 'gravarEquipamentos', dados: E});
      localStorage.removeItem(PEND);
      aviso('Salvo na planilha às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '.');
    }catch(e){
      aviso(/desconhecida/i.test(e.message) ? 'A planilha ainda não aceita equipamentos: atualize o Apps Script (ver README).' : 'Sem ligação com a planilha agora. Nova tentativa em 1 minuto.', true);
      timer = setTimeout(enviar, 60000);
    }
  }

  async function receber(){
    if(localStorage.getItem(PEND)) return enviar();
    if(Date.now() - ultimaLeitura < 15000) return;
    ultimaLeitura = Date.now();
    try{
      const j = await txApi({acao: 'lerEquipamentos'});
      if(!j.dados) { aviso(E.equip.length ? '' : 'Nenhum equipamento cadastrado na planilha ainda.'); return; }
      if(!Array.isArray(j.dados.hist)) j.dados.hist = [];
      if(JSON.stringify(j.dados) !== JSON.stringify(E)){
        E = j.dados; localStorage.setItem(KEY, JSON.stringify(E));
        render(); atualizarMapa();
      }
      aviso('Sincronizado com a planilha.');
    }catch(e){
      aviso(/desconhecida/i.test(e.message) ? 'A planilha ainda não aceita equipamentos: atualize o Apps Script (ver README).' : 'Sem ligação com a planilha agora; mostrando a última cópia deste computador.', true);
    }
  }

  document.addEventListener('visibilitychange', () => { if(!document.hidden && aba.style.display !== 'none') receber(); });

  render(); atualizarMapa(); receber();
  try{ if(ls.get('aba') === 'equip') trocarAba('equip'); }catch(e){}
  window.G360Equip = {render, receber, enviar};
})();
