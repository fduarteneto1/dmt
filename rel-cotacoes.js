// Relatório "Cotações" do Gestão 360º BKP (dentro da aba Relatórios, relatorios.js).
// Carregado por index.html depois de cotacao.js e relatorios.js. Não guarda nada secreto:
// usa as mesmas cotações da aba Cotações (window.G360Cotacoes), já sincronizadas com a planilha.
//
// Em um período escolhido, conta:
//  - Criadas    = cotações com data de abertura no período (qualquer situação atual)
//  - Aprovadas  = cotações hoje Aprovadas ou com Pedido emitido, cuja aprovação caiu no período
//  - Canceladas = cotações hoje Canceladas, cujo cancelamento caiu no período
// Uma cotação reaberta depois de aprovada deixa de contar como aprovada (volta a ser "em andamento").
(function(){
  if(!window.G360Relatorios || !window.G360Cotacoes) return;
  const C = window.G360Cotacoes;

  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const KSEL = 'dmtbkp_relcot_sel';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dt = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const hoje = () => iso(new Date());
  const somaDias = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const dataBR = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const dm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const f2 = v => (+v || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const R$ = v => 'R$ ' + f2(v);
  const R0 = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', {maximumFractionDigits: 0});
  const dia = q => String(q || '').slice(0, 10);

  const COR = {cri: '#257de0', apr: '#1f7a3d', can: '#8e8e8e'};
  const TIPOS = [['cri', 'Criadas'], ['apr', 'Aprovadas'], ['can', 'Canceladas']];

  // ---------- seleção ----------
  const SEL = {per: 'mes', ini: '', fim: '', obra: '', ver: 'cri'};
  try{ const s = JSON.parse(localStorage.getItem(KSEL) || '{}'); ['per', 'ini', 'fim', 'obra', 'ver'].forEach(k => { if(s[k] != null) SEL[k] = s[k]; }); }catch(e){}
  const guardar = () => { try{ localStorage.setItem(KSEL, JSON.stringify(SEL)); }catch(e){} };

  function periodo(){
    const t = hoje();
    if(SEL.per === 'hoje') return [t, t];
    if(SEL.per === '7d') return [somaDias(t, -6), t];
    if(SEL.per === '30d') return [somaDias(t, -29), t];
    if(SEL.per === 'mes') return [t.slice(0, 8) + '01', t];
    if(SEL.per === 'mesant'){ const d = dt(t.slice(0, 8) + '01'); d.setDate(0); const f = iso(d); return [f.slice(0, 8) + '01', f]; }
    if(SEL.per === 'ano') return [t.slice(0, 4) + '-01-01', t];
    let a = SEL.ini || t, b = SEL.fim || t;
    if(a > b) [a, b] = [b, a];
    return [a, b];
  }
  const perTxt = (a, b) => a === b ? dataBR(a) : dataBR(a) + ' a ' + dataBR(b);

  // ---------- datas de cada evento ----------
  const ultimoEvento = (c, re) => { const l = (c.hist || []).filter(x => re.test(String(x.a || ''))); return l.length ? dia(l[l.length - 1].q) : ''; };
  const dCriada = c => dia(c.d) || dia(((c.hist || [])[0] || {}).q);
  const dAprovada = c => (c.st === 'aprovada' || c.st === 'pedido') ? (dia(c.aprd) || ultimoEvento(c, /^Aprovada/)) : '';
  const dCancelada = c => c.st === 'cancelada' ? (ultimoEvento(c, /^Cancelada/) || (c.upd ? iso(new Date(c.upd)) : '')) : '';

  function montar(){
    const [a, b] = periodo(), D = C.dados();
    const dentro = s => s && s >= a && s <= b;
    const todas = (D.cot || []).filter(c => !c.del && (!SEL.obra || c.o === SEL.obra));
    const linha = (c, quando) => { let R = null; try{ R = C.calc(c); }catch(e){}
      const tot = R && R.final ? R.final.tot : 0;
      return {c, quando, tot, eco: R ? Math.max(0, R.ecoMed || 0) : 0,
        forn: R && R.final ? R.final.usados.map(id => (c.fs.find(f => f.id === id) || {}).nome).filter(Boolean) : []}; };
    const ord = (x, y) => x.quando < y.quando ? 1 : x.quando > y.quando ? -1 : (y.c.n || 0) - (x.c.n || 0);
    const L = {
      cri: todas.filter(c => dentro(dCriada(c))).map(c => linha(c, dCriada(c))).sort(ord),
      apr: todas.filter(c => dentro(dAprovada(c))).map(c => linha(c, dAprovada(c))).sort(ord),
      can: todas.filter(c => dentro(dCancelada(c))).map(c => linha(c, dCancelada(c))).sort(ord)
    };
    return {a, b, L};
  }

  // ---------- estilos ----------
  const css = document.createElement('style');
  css.textContent = `
  #rel-cot .rc-per{display:flex;flex-wrap:wrap;gap:4px}
  #rel-cot .rc-per button{flex:1 1 auto}
  #rel-cot .row2{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
  #rel-cot .row2 input,#rel-cot #rc-obra{width:100%}
  #rel-cot .rc-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  #rel-cot .rc-kpi button{all:unset;box-sizing:border-box;cursor:pointer;border:1px solid var(--line,#E8E8EA);border-radius:10px;padding:9px 10px;background:#fff;min-width:0;border-top-width:3px}
  #rel-cot .rc-kpi button.on{box-shadow:0 0 0 2px var(--accent,#C05621) inset}
  #rel-cot .rc-kpi div{border:1px solid var(--line,#E8E8EA);border-radius:10px;padding:9px 10px;background:#fff;min-width:0;border-top-width:3px}
  #rel-cot .rc-kpi span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8E8E8E)}
  #rel-cot .rc-kpi b{display:block;font-size:22px;line-height:1.2;margin-top:3px;font-variant-numeric:tabular-nums}
  #rel-cot .rc-kpi small{display:block;color:var(--ink3,#8E8E8E);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  @media (max-width:520px){ #rel-cot .rc-kpi{grid-template-columns:1fr 1fr} }
  #rel-cot .rc-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ink2,#5C5C5C);margin:0 0 6px}
  #rel-cot .rc-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  #rel-cot svg{display:block;width:100%;height:auto;overflow:visible}
  #rel-cot svg rect[data-tip]{cursor:default}
  #rel-cot .rc-vazio{padding:20px 8px;text-align:center;color:var(--ink3,#8E8E8E)}
  #rel-cot table{width:100%;border-collapse:collapse}
  #rel-cot th,#rel-cot td{padding:6px 5px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  #rel-cot th:first-child,#rel-cot td:first-child{text-align:left;white-space:normal}
  #rel-cot td.tx{text-align:left;white-space:normal}
  #rel-cot td small{display:block;color:var(--ink3,#8E8E8E);font-size:11px}
  #rel-cot tr.cl{cursor:pointer} #rel-cot tr.cl:hover td{background:var(--head,#F6F6F7)}
  #rel-cot tr.tot td{font-weight:700;border-top:1px solid var(--line,#E8E8EA)}
  #rel-cot .tag{font-size:11px;font-weight:700}
  #rel-cot .rc-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
  #rel-cot .rc-tabs button{flex:1 1 auto}
  #rel-cot .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  #rel-cot .rc-txt{box-sizing:border-box;width:100%;min-height:140px;font-family:inherit;font-size:12px;border:1px solid var(--line,#E8E8EA);border-radius:8px;padding:8px 10px;resize:vertical;margin-top:8px}
  #rc-tip{position:fixed;z-index:6000;pointer-events:none;background:#fff;border:1px solid #E8E8EA;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.14);padding:7px 10px;font-size:12px;line-height:1.45;color:#232323;display:none}
  #rc-tip i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}`;
  document.head.appendChild(css);

  const aba = document.createElement('div');
  aba.id = 'rel-cot';
  aba.innerHTML = `
    <div class="card">
      <h2>Relatório de cotações</h2>
      <div class="seg rc-per" id="rc-per">
        <button data-p="hoje">Hoje</button><button data-p="7d">7 dias</button><button data-p="30d">30 dias</button>
        <button data-p="mes">Este mês</button><button data-p="mesant">Mês passado</button><button data-p="ano">Este ano</button><button data-p="per">Período</button>
      </div>
      <div class="row2" id="rc-datas" style="display:none">
        <div><label for="rc-ini">De</label><input type="date" id="rc-ini"></div>
        <div><label for="rc-fim">Até</label><input type="date" id="rc-fim"></div>
      </div>
      <label for="rc-obra">Obra / centro de custo</label><select id="rc-obra"></select>
      <div class="hint" style="margin-top:8px"><span id="rc-estado"></span>
        <button class="sec mini" id="rc-atual" style="margin-left:6px">Atualizar</button></div>
    </div>
    <div class="card">
      <h2 id="rc-tit">Resumo</h2>
      <div class="rc-kpi" id="rc-kpi"></div>
      <div class="hint" style="margin-top:6px">Criadas = abertas no período. Aprovadas = aprovadas no período (inclui as que já viraram pedido). Canceladas = canceladas no período. Clique num quadro para ver a lista.</div>
    </div>
    <div class="card">
      <h2 id="rc-g-tit">Evolução</h2>
      <div class="rc-leg">${TIPOS.map(t => `<span><i style="background:${COR[t[0]]}"></i>${t[1]}</span>`).join('')}</div>
      <div id="rc-g"></div>
    </div>
    <div class="card">
      <h2>Cotações</h2>
      <div class="seg rc-tabs" id="rc-ver">${TIPOS.map(t => `<button data-v="${t[0]}">${t[1]}</button>`).join('')}</div>
      <div id="rc-lista"></div>
      <div class="hint" style="margin-top:6px">Clique numa cotação para abrir o mapa.</div>
    </div>
    <div class="card">
      <h2>Por obra</h2>
      <div id="rc-obras"></div>
    </div>
    <div class="card">
      <h2>Enviar / exportar</h2>
      <div class="btns">
        <button id="rc-pdf">Imprimir / PDF</button>
        <button class="sec" id="rc-wpp">Enviar no WhatsApp</button>
        <button class="sec" id="rc-copiar">Copiar texto</button>
        <button class="sec" id="rc-csv">Baixar planilha (CSV)</button>
      </div>
      <textarea class="rc-txt" id="rc-txt" readonly></textarea>
      <div class="hint" id="rc-env" style="margin-top:4px"></div>
    </div>`;
  aba.style.display = 'none'; $('rel-corpo').appendChild(aba);
  const tip = document.createElement('div'); tip.id = 'rc-tip'; document.body.appendChild(tip);

  // ---------- eventos ----------
  $('rc-per').onclick = e => {
    const b = e.target.closest('button'); if(!b) return;
    SEL.per = b.dataset.p;
    if(SEL.per === 'per' && !SEL.ini){ SEL.ini = hoje().slice(0, 8) + '01'; SEL.fim = hoje(); }
    guardar(); render();
  };
  $('rc-ini').onchange = () => { SEL.ini = $('rc-ini').value; guardar(); render(); };
  $('rc-fim').onchange = () => { SEL.fim = $('rc-fim').value; guardar(); render(); };
  $('rc-obra').onchange = () => { SEL.obra = $('rc-obra').value; guardar(); render(); };
  $('rc-ver').onclick = e => { const b = e.target.closest('button'); if(!b) return; SEL.ver = b.dataset.v; guardar(); render(); };
  $('rc-kpi').onclick = e => { const b = e.target.closest('button[data-v]'); if(!b) return; SEL.ver = b.dataset.v; guardar(); render();
    $('rc-lista').scrollIntoView({behavior: 'smooth', block: 'nearest'}); };
  $('rc-lista').onclick = e => { const tr = e.target.closest('tr[data-id]'); if(tr) C.abrir(tr.dataset.id); };
  $('rc-atual').onclick = async () => { $('rc-estado').textContent = 'Lendo a planilha…'; try{ await C.receber(); }catch(e){} render(true); };

  const esconderTip = () => { tip.style.display = 'none'; };
  aba.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if(!el){ if(e.pointerType === 'mouse') esconderTip(); return; }
    tip.innerHTML = el.getAttribute('data-tip'); tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    let l = e.clientX + 14, t = e.clientY + 14;
    if(l + r.width > innerWidth - 8) l = e.clientX - r.width - 14;
    if(t + r.height > innerHeight - 8) t = e.clientY - r.height - 14;
    tip.style.left = Math.max(8, l) + 'px'; tip.style.top = Math.max(8, t) + 'px';
  });
  aba.addEventListener('pointerleave', esconderTip);
  document.addEventListener('scroll', esconderTip, true);
  document.addEventListener('g360-cotacoes', () => render());

  // ---------- desenho ----------
  const nomeObra = o => o ? (C.nomeLocal ? C.nomeLocal(o) : o) : 'Sem obra';
  const sit = c => (C.SIT && C.SIT[c.st]) || {n: c.st, c: '#5c5c5c'};

  function render(lido){
    if(!G360Relatorios.visivel('cot')) return;
    esconderTip();
    const D = C.dados();
    aba.querySelectorAll('#rc-per button').forEach(b => b.classList.toggle('on', b.dataset.p === SEL.per));
    aba.querySelectorAll('#rc-ver button').forEach(b => b.classList.toggle('on', b.dataset.v === SEL.ver));
    const {a, b, L} = montar();
    $('rc-datas').style.display = SEL.per === 'per' ? '' : 'none';
    $('rc-ini').value = a; $('rc-fim').value = b;
    const obras = [...new Set((D.cot || []).filter(c => !c.del && c.o).map(c => c.o))].sort();
    $('rc-obra').innerHTML = '<option value="">Todas as obras</option>' + obras.map(o => `<option value="${h(o)}"${o === SEL.obra ? ' selected' : ''}>${h(nomeObra(o))}</option>`).join('');
    $('rc-estado').textContent = lido ? 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '.' : 'Mesmas cotações da aba Cotações, sincronizadas com a planilha.';

    $('rc-tit').textContent = 'Resumo · ' + perTxt(a, b) + (SEL.obra ? ' · ' + nomeObra(SEL.obra) : '');
    const vApr = L.apr.reduce((s, x) => s + x.tot, 0), eco = L.apr.reduce((s, x) => s + x.eco, 0);
    const ped = L.apr.filter(x => x.c.st === 'pedido').length;
    const and = L.cri.filter(x => x.c.st === 'aberta' || x.c.st === 'aprovacao' || x.c.st === 'reprovada').length;
    const taxa = L.cri.length ? Math.round(L.cri.filter(x => x.c.st === 'aprovada' || x.c.st === 'pedido').length / L.cri.length * 100) : null;
    $('rc-kpi').innerHTML =
      `<button data-v="cri" class="${SEL.ver === 'cri' ? 'on' : ''}" style="border-top-color:${COR.cri}"><span>Criadas</span><b>${L.cri.length}</b><small>${and} em andamento</small></button>` +
      `<button data-v="apr" class="${SEL.ver === 'apr' ? 'on' : ''}" style="border-top-color:${COR.apr}"><span>Aprovadas</span><b>${L.apr.length}</b><small>${ped} com pedido emitido</small></button>` +
      `<button data-v="can" class="${SEL.ver === 'can' ? 'on' : ''}" style="border-top-color:${COR.can}"><span>Canceladas</span><b>${L.can.length}</b><small>${L.cri.length ? Math.round(L.cri.filter(x => x.c.st === 'cancelada').length / L.cri.length * 100) + '% das criadas' : '&nbsp;'}</small></button>` +
      `<div style="border-top-color:${COR.apr}"><span>Valor aprovado</span><b style="font-size:18px">${R0(vApr)}</b><small>${eco > 0.5 ? 'economia ' + R0(eco) : '&nbsp;'}${taxa != null ? ' · ' + taxa + '% aprovadas' : ''}</small></div>`;

    renderGrafico(a, b, L);
    renderLista(L[SEL.ver] || [], SEL.ver);
    renderObras(L);
    $('rc-txt').value = texto(a, b, L);
    const vazio = !L.cri.length && !L.apr.length && !L.can.length;
    ['rc-pdf', 'rc-wpp', 'rc-copiar', 'rc-csv'].forEach(id => $(id).disabled = vazio);
  }

  // agrupa por dia (até 31 dias), semana (até 120) ou mês
  function baldes(a, b){
    const n = Math.round((dt(b) - dt(a)) / 864e5) + 1;
    const l = [];
    if(n <= 31){ for(let d = a; d <= b; d = somaDias(d, 1)) l.push({ini: d, fim: d, rot: dm(d)}); return {l, un: 'dia'}; }
    if(n <= 120){
      let d = a; const w = dt(a).getDay(); d = somaDias(a, -((w + 6) % 7)); // segunda-feira
      for(; d <= b; d = somaDias(d, 7)){ const ini = d < a ? a : d, f = somaDias(d, 6); l.push({ini, fim: f > b ? b : f, rot: dm(ini)}); }
      return {l, un: 'semana'};
    }
    let y = +a.slice(0, 4), m = +a.slice(5, 7) - 1;
    while(true){
      const ini = iso(new Date(y, m, 1)); if(ini > b) break;
      const fim = iso(new Date(y, m + 1, 0));
      l.push({ini: ini < a ? a : ini, fim: fim > b ? b : fim, rot: MES[m] + (a.slice(0, 4) !== b.slice(0, 4) ? '/' + String(y).slice(2) : '')});
      m++; if(m > 11){ m = 0; y++; }
    }
    return {l, un: 'mês'};
  }
  function escala(max){
    if(!(max > 0)) return {max: 1, passo: 1};
    const bruto = max / 4, p = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / p;
    const passo = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p);
    return {max: Math.ceil(max / passo) * passo, passo};
  }
  function grafico(a, b, L){
    const {l, un} = baldes(a, b);
    const cont = l.map(k => { const r = {}; TIPOS.forEach(t => r[t[0]] = L[t[0]].filter(x => x.quando >= k.ini && x.quando <= k.fim).length); return r; });
    const mx = Math.max(0, ...cont.map(r => Math.max(r.cri, r.apr, r.can)));
    const W = 640, H = 200, pl = 28, pr = 6, pt = 8, pb = 24, gw = (W - pl - pr) / l.length;
    const e = escala(mx), y = v => pt + (H - pt - pb) * (1 - v / e.max);
    const bw = Math.max(2, Math.min(16, gw * 0.8 / 3));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cotações por ${un}">`;
    for(let v = 0; v <= e.max + 1e-9; v += e.passo) s += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#EDEDEF"/><text x="${pl - 5}" y="${y(v) + 3.5}" font-size="10" fill="#8E8E8E" text-anchor="end">${v}</text>`;
    const cada = Math.ceil(l.length / 16);
    l.forEach((k, i) => {
      const cx = pl + gw * i + gw / 2, r = cont[i];
      const per = k.ini === k.fim ? dataBR(k.ini) : dataBR(k.ini) + ' a ' + dataBR(k.fim);
      const tipTxt = `<b>${per}</b><br>` + TIPOS.map(t => `<i style="background:${COR[t[0]]}"></i>${t[1]}: <b>${r[t[0]]}</b>`).join('<br>');
      s += `<rect x="${pl + gw * i}" y="${pt}" width="${gw}" height="${H - pt - pb}" fill="transparent" data-tip="${h(tipTxt)}"/>`;
      TIPOS.forEach((t, j) => { const v = r[t[0]]; if(!v) return;
        s += `<rect x="${cx - bw * 1.5 + bw * j + 0.5}" y="${y(v)}" width="${bw - 1}" height="${y(0) - y(v)}" rx="2" fill="${COR[t[0]]}" data-tip="${h(tipTxt)}"/>`; });
      if(i % cada === 0) s += `<text x="${cx}" y="${H - 8}" font-size="10" fill="#5C5C5C" text-anchor="middle">${h(k.rot)}</text>`;
    });
    return {svg: s + `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" stroke="#BDBDC2"/></svg>`, un};
  }
  function renderGrafico(a, b, L){
    if(!L.cri.length && !L.apr.length && !L.can.length){ $('rc-g-tit').textContent = 'Evolução'; $('rc-g').innerHTML = '<div class="rc-vazio">Nenhuma cotação criada, aprovada ou cancelada neste período.</div>'; return; }
    const g = grafico(a, b, L);
    $('rc-g-tit').textContent = 'Cotações por ' + g.un; $('rc-g').innerHTML = g.svg;
  }

  function renderLista(l, tipo){
    const rot = {cri: 'Criada em', apr: 'Aprovada em', can: 'Cancelada em'}[tipo];
    if(!l.length){ $('rc-lista').innerHTML = '<div class="rc-vazio">Nenhuma cotação ' + {cri: 'criada', apr: 'aprovada', can: 'cancelada'}[tipo] + ' neste período.</div>'; return; }
    let s = `<table><tr><th>Cotação</th><th>${rot}</th><th>Obra</th><th>Fornecedor(es)</th><th>Valor</th>${tipo === 'cri' ? '<th>Situação hoje</th>' : ''}</tr>`;
    l.forEach(x => { const c = x.c, si = sit(c);
      s += `<tr class="cl" data-id="${h(c.id)}"><td><b>${h(C.numCot(c))}</b><small>${h(c.tit || 'Sem título')}${c.sol ? ' · ' + h(c.sol) : ''}</small></td>
        <td>${dataBR(x.quando)}</td><td class="tx">${h(nomeObra(c.o))}</td><td class="tx">${h(x.forn.join(', ') || '—')}</td>
        <td>${x.tot > 0 ? R$(x.tot) : '—'}${tipo === 'apr' && x.eco > 0.5 ? '<small>economia ' + R$(x.eco) + '</small>' : ''}${tipo === 'apr' && c.apr ? '<small>por ' + h(c.apr) + '</small>' : ''}</td>
        ${tipo === 'cri' ? `<td><span class="tag" style="color:${si.c}">${h(si.n)}</span></td>` : ''}</tr>`; });
    const t = l.reduce((s2, x) => s2 + x.tot, 0);
    s += `<tr class="tot"><td>${l.length} cotaç${l.length === 1 ? 'ão' : 'ões'}</td><td></td><td></td><td></td><td>${R$(t)}</td>${tipo === 'cri' ? '<td></td>' : ''}</tr>`;
    $('rc-lista').innerHTML = s + '</table>';
  }

  function porObra(L){
    const m = new Map();
    const g = o => { if(!m.has(o)) m.set(o, {o, cri: 0, apr: 0, can: 0, vApr: 0}); return m.get(o); };
    L.cri.forEach(x => g(x.c.o || '').cri++);
    L.apr.forEach(x => { const r = g(x.c.o || ''); r.apr++; r.vApr += x.tot; });
    L.can.forEach(x => g(x.c.o || '').can++);
    return [...m.values()].sort((x, y) => y.vApr - x.vApr || y.cri - x.cri);
  }
  function renderObras(L){
    const l = porObra(L);
    if(!l.length){ $('rc-obras').innerHTML = '<div class="rc-vazio">Sem cotações no período.</div>'; return; }
    let s = '<table><tr><th>Obra</th><th>Criadas</th><th>Aprovadas</th><th>Canceladas</th><th>Valor aprovado</th></tr>';
    l.forEach(r => s += `<tr><td>${h(nomeObra(r.o))}</td><td>${r.cri}</td><td>${r.apr}</td><td>${r.can}</td><td>${R$(r.vApr)}</td></tr>`);
    if(l.length > 1) s += `<tr class="tot"><td>Total</td><td>${L.cri.length}</td><td>${L.apr.length}</td><td>${L.can.length}</td><td>${R$(L.apr.reduce((x, y) => x + y.tot, 0))}</td></tr>`;
    $('rc-obras').innerHTML = s + '</table>';
  }

  // ---------- texto (WhatsApp) ----------
  function texto(a, b, L){
    if(!L.cri.length && !L.apr.length && !L.can.length) return '';
    const vApr = L.apr.reduce((s, x) => s + x.tot, 0), eco = L.apr.reduce((s, x) => s + x.eco, 0);
    const lin = ['*Relatório de cotações – BKP Construtora*', '📅 ' + perTxt(a, b) + (SEL.obra ? ' · ' + nomeObra(SEL.obra) : ''), '',
      '📝 Criadas: *' + L.cri.length + '*', '✅ Aprovadas: *' + L.apr.length + '* · ' + R$(vApr) + (eco > 0.5 ? ' (economia ' + R$(eco) + ')' : ''), '❌ Canceladas: *' + L.can.length + '*', ''];
    const bloco = (tit, l, extra) => { if(!l.length) return; lin.push('*' + tit + '*');
      l.forEach(x => lin.push('• ' + C.numCot(x.c) + ' · ' + (x.c.tit || 'Sem título') + (x.c.o ? ' (' + x.c.o + ')' : '') + extra(x))); lin.push(''); };
    bloco('Aprovadas', L.apr, x => ' · ' + R$(x.tot) + (x.forn.length ? ' · ' + x.forn.join(', ') : ''));
    bloco('Canceladas', L.can, () => '');
    const and = L.cri.filter(x => x.c.st === 'aberta' || x.c.st === 'aprovacao' || x.c.st === 'reprovada');
    bloco('Criadas ainda em andamento', and, x => ' · ' + sit(x.c).n);
    lin.push('_Gestão 360º BKP_');
    return lin.join('\n');
  }
  const avisoEnv = (t, e) => { $('rc-env').textContent = t; $('rc-env').style.color = e ? '#b42318' : ''; };
  async function copiar(t){
    try{ await navigator.clipboard.writeText(t); return true; }
    catch(e){ const ta = $('rc-txt'); ta.removeAttribute('readonly'); ta.select(); let ok = false; try{ ok = document.execCommand('copy'); }catch(x){} ta.setAttribute('readonly', ''); return ok; }
  }
  $('rc-copiar').onclick = async () => avisoEnv(await copiar($('rc-txt').value) ? 'Texto copiado.' : 'Não deu para copiar: selecione o texto acima e copie.');
  $('rc-wpp').onclick = async () => {
    const t = $('rc-txt').value;
    if(navigator.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)){ try{ await navigator.share({text: t}); return; }catch(e){ if(e && e.name === 'AbortError') return; } }
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
  };

  // ---------- CSV ----------
  $('rc-csv').onclick = () => {
    const {a, b, L} = montar();
    const lin = [['Evento', 'Data do evento', 'Nº', 'Título', 'Obra', 'Solicitante', 'Comprador', 'Aberta em', 'Situação hoje', 'Fornecedor(es)', 'Valor', 'Economia', 'Aprovado por']];
    TIPOS.forEach(t => L[t[0]].forEach(x => { const c = x.c;
      lin.push([t[1].replace(/s$/, ''), dataBR(x.quando), C.numCot(c), c.tit, c.o, c.sol, c.u, dataBR(c.d), sit(c).n, x.forn.join(', '), f2(x.tot), f2(x.eco), c.apr || '']); }));
    const csv = '﻿' + lin.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    el.download = 'relatorio-cotacoes-' + a + '_a_' + b + '.csv'; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 5000);
  };

  // ---------- impressão / PDF ----------
  $('rc-pdf').onclick = () => {
    const {a, b, L} = montar(), base = location.href.replace(/[^/]*$/, '');
    const vApr = L.apr.reduce((s, x) => s + x.tot, 0), eco = L.apr.reduce((s, x) => s + x.eco, 0);
    const g = grafico(a, b, L), ob = porObra(L);
    const limpa = s => s.replace(/ data-tip="[^"]*"/g, '');
    const tab = (tit, tipo, l) => !l.length ? '' : `<h2>${tit} (${l.length})</h2><table><tr><th>Cotação</th><th>Título</th><th>Data</th><th>Obra</th><th>Fornecedor(es)</th>${tipo === 'cri' ? '<th>Situação hoje</th>' : ''}<th>Valor</th></tr>` +
      l.map(x => `<tr><td><b>${h(C.numCot(x.c))}</b></td><td class="tx">${h(x.c.tit || '—')}</td><td>${dataBR(x.quando)}</td><td class="tx">${h(nomeObra(x.c.o))}</td><td class="tx">${h(x.forn.join(', ') || '—')}</td>${tipo === 'cri' ? '<td>' + h(sit(x.c).n) + '</td>' : ''}<td>${x.tot > 0 ? R$(x.tot) : '—'}</td></tr>`).join('') +
      `<tr class="tot"><td colspan="${tipo === 'cri' ? 6 : 5}">Total</td><td>${R$(l.reduce((s, x) => s + x.tot, 0))}</td></tr></table>`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de cotações ${perTxt(a, b)}</title>
<style>
 @page{size:A4;margin:12mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#232323;margin:0}
 .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #C05621;padding-bottom:7px;margin-bottom:8px}
 .cab img{height:34px} .cab h1{font-size:16px;margin:0} .cab span{font-size:10px;color:#8e8e8e;letter-spacing:.1em;text-transform:uppercase}
 .kpi{display:flex;gap:8px;margin:8px 0 10px} .kpi div{flex:1;border:1px solid #e8e8ea;border-top-width:3px;border-radius:8px;padding:7px 9px}
 .kpi span{display:block;font-size:9px;font-weight:700;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em} .kpi b{font-size:18px} .kpi small{display:block;color:#8e8e8e;font-size:9px}
 h2{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px;color:#5c5c5c}
 .leg{font-size:10px;color:#5c5c5c;display:flex;gap:12px} .leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
 svg{width:100%;height:auto;max-height:190px}
 table{width:100%;border-collapse:collapse} tr{page-break-inside:avoid}
 th{background:#f6f6f7;font-size:9px;text-transform:uppercase;text-align:right;padding:5px;border-bottom:1px solid #ddd} th:first-child,th:nth-child(2),td.tx,td:first-child{text-align:left}
 td{padding:4px 5px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap} td.tx{white-space:normal}
 .tot td{font-weight:700;border-top:1.5px solid #999}
 .rod{margin-top:14px;font-size:9px;color:#8e8e8e}
 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>
<div class="cab"><img src="${base}logo-bkp.png" alt=""><div><h1>Relatório de cotações · ${h(perTxt(a, b))}</h1><span>BKP Construtora${SEL.obra ? ' · ' + h(nomeObra(SEL.obra)) : ''}</span></div></div>
<div class="kpi">
 <div style="border-top-color:${COR.cri}"><span>Criadas</span><b>${L.cri.length}</b><small>${L.cri.filter(x => x.c.st === 'aberta' || x.c.st === 'aprovacao' || x.c.st === 'reprovada').length} em andamento</small></div>
 <div style="border-top-color:${COR.apr}"><span>Aprovadas</span><b>${L.apr.length}</b><small>${L.apr.filter(x => x.c.st === 'pedido').length} com pedido emitido</small></div>
 <div style="border-top-color:${COR.can}"><span>Canceladas</span><b>${L.can.length}</b><small>&nbsp;</small></div>
 <div style="border-top-color:${COR.apr}"><span>Valor aprovado</span><b>${R$(vApr)}</b><small>${eco > 0.5 ? 'economia ' + R$(eco) : '&nbsp;'}</small></div>
</div>
<h2>Cotações por ${g.un}</h2><div class="leg">${TIPOS.map(t => `<span><i style="background:${COR[t[0]]}"></i>${t[1]}</span>`).join('')}</div>${limpa(g.svg)}
${ob.length > 1 ? `<h2>Por obra</h2><table><tr><th colspan="2">Obra</th><th>Criadas</th><th>Aprovadas</th><th>Canceladas</th><th>Valor aprovado</th></tr>${ob.map(r => `<tr><td colspan="2" class="tx">${h(nomeObra(r.o))}</td><td>${r.cri}</td><td>${r.apr}</td><td>${r.can}</td><td>${R$(r.vApr)}</td></tr>`).join('')}</table>` : ''}
${tab('Aprovadas', 'apr', L.apr)}
${tab('Canceladas', 'can', L.can)}
${tab('Criadas', 'cri', L.cri)}
<div class="rod">Criadas = abertas no período · Aprovadas = aprovadas no período (inclui pedido emitido) · Canceladas = canceladas no período. Valor = compra escolhida no mapa (com desconto e frete). Gerado pelo Gestão 360º BKP em ${new Date().toLocaleString('pt-BR')}${window.DMT_SESSAO && window.DMT_SESSAO.u ? ' por ' + h(window.DMT_SESSAO.u) : ''}.</div>
</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const ir = () => { try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){} setTimeout(() => fr.remove(), 60000); };
    const img = doc.querySelector('img');
    if(img && !img.complete){ img.onload = img.onerror = ir; setTimeout(ir, 3000); } else setTimeout(ir, 200);
  };

  // ---------- registro na aba Relatórios ----------
  G360Relatorios.registrar({id: 'cot', nome: 'Cotações', el: aba, mostrar(){ render(); Promise.resolve(C.receber()).then(() => render()).catch(() => {}); }, esconder: esconderTip});
  window.G360RelCotacoes = {render};
})();
