// Aba "Usinadas" do Gestão 360º BKP: relatório das usinadas de microrrevestimento (MRAF) por obra.
// Carregado por index.html depois do app, como clima.js e diarias.js. Não guarda nada secreto.
// Os dados vêm da aba "Registros" da planilha "Taxa de Emulsão – Microrrevestimento (MRAF)", pela
// mesma ligação da aba Emulsão (txApi, ação "dados", que já existia): nada muda no Apps Script.
// Mostra consumo de emulsão (L), área aplicada (m²) e taxa (L/m²) por obra, no dia ou num período,
// com gráficos interativos, e gera texto, imagem e PDF para mandar no grupo das obras.
(function(){
  if(typeof txApi !== 'function' || typeof st === 'undefined' || typeof trocarAba !== 'function') return;

  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const KCACHE = 'dmtbkp_usin_cache', KSEL = 'dmtbkp_usin_sel';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dt = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const hoje = () => iso(new Date());
  const somaDias = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const dataBR = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const dm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const fmt = (v, c) => (isFinite(v) ? v : 0).toLocaleString('pt-BR', {minimumFractionDigits: c, maximumFractionDigits: c});
  const L = v => fmt(v, 0), M2 = v => fmt(v, 0), TX = v => fmt(v, 2);

  // cores das obras: paleta categórica em ordem fixa; a cor segue a obra (ordem alfabética de todas as obras
  // já lançadas), não a posição no gráfico, então filtrar não repinta ninguém
  const PAL = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647'];
  const OUTRA = '#8E8E8E';
  const INK = '#232323', INK2 = '#5C5C5C', INK3 = '#8E8E8E', GRADE = '#EDEDEF';

  const MET = {
    area: {rot: 'Área aplicada', un: 'm²', f: M2, v: g => g.area},
    lit:  {rot: 'Consumo de emulsão', un: 'L', f: L, v: g => g.lit},
    taxa: {rot: 'Taxa', un: 'L/m²', f: TX, v: g => g.area > 0 ? g.lit / g.area : 0}
  };

  // ---------- estado ----------
  let REG = [], quando = 0, carregando = false, erro = '', planilha = '';
  try{ const c = JSON.parse(localStorage.getItem(KCACHE) || 'null'); if(c && Array.isArray(c.r)){ REG = c.r; quando = c.t || 0; } }catch(e){}
  const SEL = {per: 'hoje', ini: '', fim: '', obra: '', met: 'area', abertas: {}};
  try{ const s = JSON.parse(localStorage.getItem(KSEL) || '{}'); ['per', 'ini', 'fim', 'obra', 'met'].forEach(k => { if(s[k] != null) SEL[k] = s[k]; }); }catch(e){}
  const guardarSel = () => { try{ localStorage.setItem(KSEL, JSON.stringify({per: SEL.per, ini: SEL.ini, fim: SEL.fim, obra: SEL.obra, met: SEL.met})); }catch(e){} };

  async function buscar(forcar){
    if(carregando) return;
    if(!forcar && Date.now() - quando < 2 * 60000 && REG.length) return render();
    carregando = true; erro = ''; estado();
    try{
      const j = await txApi({acao: 'dados'});
      if(!j || !Array.isArray(j.registros)) throw new Error('resposta sem registros');
      REG = j.registros.map(r => ({d: String(r.data || '').slice(0, 10), o: String(r.obra || '').trim(), u: String(r.usina || ''),
        ref: String(r.ref || ''), lit: +r.lit || 0, area: +r.area || 0, ln: r.linha || 0}))
        .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.d) && r.o && r.area > 0);
      planilha = j.planilha || '';
      quando = Date.now();
      try{ localStorage.setItem(KCACHE, JSON.stringify({t: quando, r: REG})); }catch(e){}
    }catch(e){
      erro = 'Não foi possível ler a planilha agora' + (REG.length ? '; mostrando a última leitura.' : '. Verifique a internet.');
    }
    carregando = false; render();
  }

  // ---------- período e filtros ----------
  function periodo(){
    const t = hoje();
    if(SEL.per === 'hoje') return [t, t];
    if(SEL.per === 'ontem'){ const o = somaDias(t, -1); return [o, o]; }
    if(SEL.per === '7d') return [somaDias(t, -6), t];
    if(SEL.per === 'mes') return [t.slice(0, 8) + '01', t];
    let a = SEL.ini || t, b = SEL.fim || t;
    if(a > b) [a, b] = [b, a];
    return [a, b];
  }
  const perTxt = (a, b) => a === b ? SEM[dt(a).getDay()] + ', ' + dataBR(a) : dataBR(a) + ' a ' + dataBR(b);

  // nome bonito da obra: se bater com uma obra do mapa, mostra o código (RBR01 – Rio Branco)
  const semAc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const cacheNome = {};
  function nomeObra(o){
    if(cacheNome[o]) return cacheNome[o];
    const a = semAc(o);
    const ob = (st.obras || []).find(x => {
      const c = semAc(x.codigo), n = semAc(x.nome), l = semAc(x.local);
      return (c && (a === c || a.startsWith(c + ' '))) || (n && (a === n || a.includes(n) || n.includes(a))) || (l && (a === l || a.includes(l)));
    });
    return cacheNome[o] = ob && ob.codigo && !semAc(o).includes(semAc(ob.codigo)) ? ob.codigo + ' – ' + o : o;
  }
  function corObra(o){
    const todas = [...new Set(REG.map(r => r.o))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const i = todas.indexOf(o);
    return i >= 0 && i < PAL.length ? PAL[i] : OUTRA;
  }

  function filtrar(){
    const [a, b] = periodo();
    return REG.filter(r => r.d >= a && r.d <= b && (!SEL.obra || r.o === SEL.obra))
      .sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : x.ln - y.ln);
  }
  function agrupar(lista){
    const m = new Map();
    lista.forEach(r => {
      if(!m.has(r.o)) m.set(r.o, {o: r.o, n: 0, lit: 0, area: 0, min: Infinity, max: 0, us: [], dias: new Set()});
      const g = m.get(r.o), t = r.lit / r.area;
      g.n++; g.lit += r.lit; g.area += r.area; g.min = Math.min(g.min, t); g.max = Math.max(g.max, t); g.us.push(r); g.dias.add(r.d);
    });
    return [...m.values()].sort((x, y) => y.area - x.area);
  }
  const total = gs => gs.reduce((t, g) => ({n: t.n + g.n, lit: t.lit + g.lit, area: t.area + g.area}), {n: 0, lit: 0, area: 0});
  const taxa = g => g.area > 0 ? g.lit / g.area : 0;

  // ---------- estilos ----------
  const css = document.createElement('style');
  css.textContent = `
  #aba-usin .us-per{display:flex;flex-wrap:wrap;gap:4px}
  #aba-usin .us-per button{flex:1 1 auto}
  #aba-usin .row2{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
  #aba-usin .row2 input,#aba-usin .row2 select,#aba-usin #us-obra{width:100%}
  #aba-usin .us-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  #aba-usin .us-kpi div{border:1px solid var(--line,#E8E8EA);border-radius:10px;padding:9px 10px;background:#fff;min-width:0}
  #aba-usin .us-kpi span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8E8E8E)}
  #aba-usin .us-kpi b{display:block;font-size:20px;line-height:1.2;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #aba-usin .us-kpi small{color:var(--ink3,#8E8E8E);font-size:11px}
  @media (max-width:520px){ #aba-usin .us-kpi{grid-template-columns:1fr 1fr} }
  #aba-usin .us-cab{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
  #aba-usin .us-cab .seg{flex:0 1 auto}
  #aba-usin .us-cab .seg button{padding:5px 10px;font-size:12px}
  #aba-usin .us-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ink2,#5C5C5C);margin:2px 0 6px}
  #aba-usin .us-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  #aba-usin svg{display:block;width:100%;height:auto;overflow:visible}
  #aba-usin svg [data-tip]{cursor:pointer}
  #aba-usin .us-vazio{padding:22px 8px;text-align:center;color:var(--ink3,#8E8E8E)}
  #aba-usin table.us-tab{width:100%;border-collapse:collapse}
  #aba-usin .us-tab th,#aba-usin .us-tab td{padding:6px 5px;text-align:right;white-space:nowrap}
  #aba-usin .us-tab th:first-child,#aba-usin .us-tab td:first-child{text-align:left;white-space:normal}
  #aba-usin .us-tab tr.ob{cursor:pointer}
  #aba-usin .us-tab tr.ob:hover td{background:var(--head,#F6F6F7)}
  #aba-usin .us-tab tr.ob td:first-child i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
  #aba-usin .us-tab tr.ob td:first-child em{font-style:normal;color:var(--ink3,#8E8E8E);margin-right:4px;display:inline-block;width:10px}
  #aba-usin .us-tab tr.det td{font-size:11.5px;color:var(--ink2,#5C5C5C);background:#FCFCFD}
  #aba-usin .us-tab tr.det td:first-child{padding-left:30px}
  #aba-usin .us-tab tr.tot td{font-weight:700;border-top:1px solid var(--line,#E8E8EA)}
  #aba-usin .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  #aba-usin .us-txt{box-sizing:border-box;width:100%;min-height:150px;font-family:inherit;font-size:12px;border:1px solid var(--line,#E8E8EA);border-radius:8px;padding:8px 10px;resize:vertical;margin-top:8px}
  #us-tip{position:fixed;z-index:6000;pointer-events:none;background:#fff;border:1px solid #E8E8EA;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.14);padding:8px 10px;font-size:12px;line-height:1.45;color:#232323;max-width:280px;display:none}
  #us-tip b{font-weight:700} #us-tip .t{font-weight:700;margin-bottom:2px} #us-tip .l{display:flex;justify-content:space-between;gap:14px} #us-tip .l span{color:#5C5C5C}
  #us-tip i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}`;
  document.head.appendChild(css);

  // ---------- aba ----------
  const btn = document.createElement('button');
  btn.dataset.aba = 'usin'; btn.textContent = 'Usinadas';
  const bEmul = document.querySelector('#abas button[data-aba="taxa"]');
  if(bEmul && bEmul.nextSibling) $('abas').insertBefore(btn, bEmul.nextSibling); else $('abas').appendChild(btn);
  btn.addEventListener('click', () => trocarAba('usin'));

  const aba = document.createElement('div');
  aba.id = 'aba-usin'; aba.style.display = 'none';
  aba.innerHTML = `
    <div class="card">
      <h2>Relatório de usinadas</h2>
      <div class="seg us-per" id="us-per">
        <button data-p="hoje">Hoje</button><button data-p="ontem">Ontem</button><button data-p="7d">7 dias</button>
        <button data-p="mes">Este mês</button><button data-p="per">Período</button>
      </div>
      <div class="row2" id="us-datas" style="display:none">
        <div><label for="us-ini">De</label><input type="date" id="us-ini"></div>
        <div><label for="us-fim">Até</label><input type="date" id="us-fim"></div>
      </div>
      <label for="us-obra">Obra</label><select id="us-obra"></select>
      <div class="hint" style="margin-top:8px"><span id="us-estado"></span>
        <button class="sec mini" id="us-atual" style="margin-left:6px">Atualizar</button></div>
    </div>
    <div class="card">
      <h2 id="us-tit-res">Resumo</h2>
      <div class="us-kpi" id="us-kpi"></div>
    </div>
    <div class="card">
      <h2>Gráficos</h2>
      <div class="us-cab">
        <div class="hint" id="us-g1-tit"></div>
        <div class="seg" id="us-met"><button data-m="area">Área</button><button data-m="lit">Consumo</button><button data-m="taxa">L/m²</button></div>
      </div>
      <div id="us-g1"></div>
      <div class="hint" id="us-g2-tit" style="margin-top:14px;font-weight:700;color:var(--ink2,#5C5C5C)"></div>
      <div class="us-leg" id="us-leg"></div>
      <div id="us-g2"></div>
      <div class="hint" style="margin-top:6px">Passe o mouse ou toque nas barras para ver os números. Clique numa obra para filtrar só ela.</div>
    </div>
    <div class="card">
      <h2>Por obra</h2>
      <div id="us-tab"></div>
    </div>
    <div class="card">
      <h2>Enviar no grupo</h2>
      <div class="btns">
        <button id="us-wpp">Enviar no WhatsApp</button>
        <button class="sec" id="us-img">Imagem do relatório</button>
        <button class="sec" id="us-pdf">Imprimir / PDF</button>
        <button class="sec" id="us-copiar">Copiar texto</button>
      </div>
      <textarea class="us-txt" id="us-txt" readonly></textarea>
      <div class="hint" id="us-env" style="margin-top:4px">No celular, "Enviar no WhatsApp" e "Imagem do relatório" abrem o compartilhamento: é só escolher o grupo.</div>
    </div>`;
  const ref = $('aba-clima') || $('aba-diar') || $('aba-equip') || $('aba-taxa');
  ref.parentElement.insertBefore(aba, ref.nextSibling);

  const tip = document.createElement('div'); tip.id = 'us-tip'; document.body.appendChild(tip);

  // ---------- eventos ----------
  $('us-per').onclick = e => {
    const b = e.target.closest('button'); if(!b) return;
    SEL.per = b.dataset.p;
    if(SEL.per === 'per' && !SEL.ini){ const [a, z] = [somaDias(hoje(), -6), hoje()]; SEL.ini = a; SEL.fim = z; }
    SEL.abertas = {}; guardarSel(); render();
  };
  $('us-ini').onchange = () => { SEL.ini = $('us-ini').value; guardarSel(); render(); };
  $('us-fim').onchange = () => { SEL.fim = $('us-fim').value; guardarSel(); render(); };
  $('us-obra').onchange = () => { SEL.obra = $('us-obra').value; guardarSel(); render(); };
  $('us-met').onclick = e => { const b = e.target.closest('button'); if(!b) return; SEL.met = b.dataset.m; guardarSel(); render(); };
  $('us-atual').onclick = () => buscar(true);
  $('us-tab').onclick = e => {
    const tr = e.target.closest('tr.ob'); if(!tr) return;
    SEL.abertas[tr.dataset.o] = !SEL.abertas[tr.dataset.o]; renderTabela(agrupar(filtrar()));
  };

  // tooltip: mouse mostra ao passar; toque mostra ao tocar
  let ultimoPonteiro = 'mouse';
  function mostrarTip(el, x, y){
    tip.innerHTML = el.getAttribute('data-tip'); tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    let l = x + 14, t = y + 14;
    if(l + r.width > innerWidth - 8) l = x - r.width - 14;
    if(t + r.height > innerHeight - 8) t = y - r.height - 14;
    tip.style.left = Math.max(8, l) + 'px'; tip.style.top = Math.max(8, t) + 'px';
  }
  const esconder = () => { tip.style.display = 'none'; };
  aba.addEventListener('pointermove', e => {
    ultimoPonteiro = e.pointerType;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if(el) mostrarTip(el, e.clientX, e.clientY); else if(e.pointerType === 'mouse') esconder();
  });
  aba.addEventListener('pointerdown', e => {
    ultimoPonteiro = e.pointerType;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if(el) mostrarTip(el, e.clientX, e.clientY); else esconder();
  });
  aba.addEventListener('pointerleave', e => { if(e.pointerType === 'mouse') esconder(); });
  document.addEventListener('scroll', esconder, true);
  aba.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-obra]');
    if(!el || ultimoPonteiro === 'touch') return;
    SEL.obra = SEL.obra === el.dataset.obra ? '' : el.dataset.obra; guardarSel(); esconder(); render();
  });

  // ---------- desenho ----------
  function estado(){
    const el = $('us-estado'); if(!el) return;
    el.style.color = erro ? '#b42318' : '';
    el.textContent = carregando ? 'Lendo a planilha…' : erro ||
      (quando ? 'Planilha lida às ' + new Date(quando).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '. Usinadas guardadas no aparelho sem internet só aparecem depois de enviadas.' : '');
  }

  function render(){
    if(aba.style.display === 'none') return;
    esconder();
    aba.querySelectorAll('#us-per button').forEach(b => b.classList.toggle('on', b.dataset.p === SEL.per));
    aba.querySelectorAll('#us-met button').forEach(b => b.classList.toggle('on', b.dataset.m === SEL.met));
    const [a, b] = periodo();
    $('us-datas').style.display = SEL.per === 'per' ? '' : 'none';
    $('us-ini').value = a; $('us-fim').value = b;
    const obras = [...new Set(REG.map(r => r.o))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
    if(SEL.obra && !obras.includes(SEL.obra)) obras.push(SEL.obra);
    $('us-obra').innerHTML = '<option value="">Todas as obras</option>' + obras.map(o => `<option value="${h(o)}"${o === SEL.obra ? ' selected' : ''}>${h(nomeObra(o))}</option>`).join('');
    estado();

    const lista = filtrar(), gs = agrupar(lista), t = total(gs);
    $('us-tit-res').textContent = 'Resumo · ' + perTxt(a, b) + (SEL.obra ? ' · ' + nomeObra(SEL.obra) : '');
    $('us-kpi').innerHTML = [
      ['Usinadas', fmt(t.n, 0), gs.length ? gs.length + (gs.length > 1 ? ' obras' : ' obra') : ''],
      ['Consumo', L(t.lit), 'litros de emulsão'],
      ['Área aplicada', M2(t.area), 'm²'],
      ['Taxa média', t.area ? TX(t.lit / t.area) : '—', 'L/m²' + (lista.length > 1 ? ' · ' + TX(Math.min(...lista.map(r => r.lit / r.area))) + ' a ' + TX(Math.max(...lista.map(r => r.lit / r.area))) : '')]
    ].map(k => `<div><span>${k[0]}</span><b>${k[1]}</b><small>${h(k[2])}</small></div>`).join('');

    const m = MET[SEL.met];
    if(!lista.length){
      const vazio = `<div class="us-vazio">${carregando ? 'Carregando…' : 'Nenhuma usinada lançada ' + (a === b ? 'em ' + dataBR(a) : 'neste período') + (SEL.obra ? ' nesta obra' : '') + '.'}</div>`;
      $('us-g1-tit').textContent = ''; $('us-g1').innerHTML = vazio; $('us-g2-tit').textContent = ''; $('us-g2').innerHTML = ''; $('us-leg').innerHTML = '';
    } else {
      $('us-g1-tit').textContent = m.rot + ' por obra (' + m.un + ')' + (SEL.met === 'taxa' ? ' · linha = média geral' : '');
      $('us-g1').innerHTML = graficoObras(gs, t);
      const umDia = a === b;
      $('us-g2-tit').textContent = umDia ? m.rot + ' por usinada (' + m.un + ')' : m.rot + ' por dia (' + m.un + ')';
      const os = [...new Set(lista.map(r => r.o))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
      $('us-leg').innerHTML = os.length > 1 ? os.map(o => `<span><i style="background:${corObra(o)}"></i>${h(nomeObra(o))}</span>`).join('') : '';
      $('us-g2').innerHTML = umDia ? graficoUsinadas(lista, t) : graficoDias(lista, a, b, os);
    }
    renderTabela(gs);
    $('us-txt').value = textoWpp(gs, t, a, b);
    ['us-wpp', 'us-img', 'us-pdf', 'us-copiar'].forEach(id => $(id).disabled = !lista.length);
  }

  // escala "bonita" para o eixo
  function escala(max, n){
    if(!(max > 0)) return {max: 1, passo: 1};
    const bruto = max / (n || 4), p = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / p;
    const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    return {max: Math.ceil(max / passo) * passo, passo};
  }
  const barraH = (x0, x1, y, a, r) => { r = Math.min(r, (x1 - x0), a / 2); return x1 - x0 < 0.5 ? '' : `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + a - r}Q${x1},${y + a} ${x1 - r},${y + a}H${x0}Z`; };
  const barraV = (x, yb, yt, w, r) => { r = Math.min(r, (yb - yt), w / 2); return yb - yt < 0.5 ? '' : `M${x},${yb}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + w - r}Q${x + w},${yt} ${x + w},${yt + r}V${yb}Z`; };
  const linhaTip = (cor, rot, val) => `<div class="l"><span>${cor ? `<i style="background:${cor}"></i>` : ''}${h(rot)}</span><b>${val}</b></div>`;
  const tipObra = g => h(`<div class="t">${h(nomeObra(g.o))}</div>` +
    linhaTip('', 'Usinadas', g.n) + linhaTip('', 'Consumo', L(g.lit) + ' L') + linhaTip('', 'Área', M2(g.area) + ' m²') +
    linhaTip('', 'Taxa', TX(taxa(g)) + ' L/m²') + (g.n > 1 ? linhaTip('', 'Faixa', TX(g.min) + ' a ' + TX(g.max)) : ''));

  // gráfico 1: barras horizontais por obra
  function graficoObras(gs, t){
    const m = MET[SEL.met], W = 600, rot = 170, dir = 70, linha = 34, barra = 16, topo = 6;
    const H = topo + gs.length * linha + 22;
    const vals = gs.map(m.v), esc = escala(Math.max(...vals) * 1.02, 4);
    const x = v => rot + (W - rot - dir) * v / esc.max;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(m.rot)} por obra">`;
    for(let v = 0; v <= esc.max + 1e-9; v += esc.passo){
      s += `<line x1="${x(v)}" x2="${x(v)}" y1="${topo - 2}" y2="${H - 20}" stroke="${GRADE}" stroke-width="1"/>`;
      s += `<text x="${x(v)}" y="${H - 6}" font-size="10" fill="${INK3}" text-anchor="middle">${m.f(v)}</text>`;
    }
    if(SEL.met === 'taxa' && t.area){
      const xm = x(t.lit / t.area);
      s += `<line x1="${xm}" x2="${xm}" y1="${topo - 4}" y2="${H - 20}" stroke="${INK2}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }
    gs.forEach((g, i) => {
      const y = topo + i * linha, v = m.v(g), nome = nomeObra(g.o);
      const curto = nome.length > 24 ? nome.slice(0, 23) + '…' : nome;
      s += `<g data-tip="${tipObra(g)}" data-obra="${h(g.o)}">`;
      s += `<rect x="0" y="${y}" width="${W}" height="${linha}" fill="transparent"/>`;
      s += `<text x="${rot - 10}" y="${y + linha / 2 + 4}" font-size="12" fill="${INK}" text-anchor="end">${h(curto)}</text>`;
      s += `<path d="${barraH(rot, x(v), y + (linha - barra) / 2, barra, 4)}" fill="${corObra(g.o)}"/>`;
      s += `<text x="${x(v) + 6}" y="${y + linha / 2 + 4}" font-size="12" font-weight="700" fill="${INK}">${m.f(v)}</text>`;
      s += `</g>`;
    });
    s += `<line x1="${rot}" x2="${rot}" y1="${topo - 2}" y2="${H - 20}" stroke="#C9C9CD" stroke-width="1"/>`;
    return s + '</svg>';
  }

  // gráfico 2 (um dia): uma barra por usinada, na ordem de lançamento
  function graficoUsinadas(lista, t){
    const m = MET[SEL.met], W = 600, esq = 46, dirM = 8, topo = 10, base = 30, H = 210;
    const vals = lista.map(r => m.v(r)), esc = escala(Math.max(...vals) * 1.05, 4);
    const pw = W - esq - dirM, bw = pw / lista.length, w = Math.max(3, Math.min(30, bw * 0.62));
    const y = v => topo + (H - topo - base) * (1 - v / esc.max);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(m.rot)} por usinada">`;
    for(let v = 0; v <= esc.max + 1e-9; v += esc.passo){
      s += `<line x1="${esq}" x2="${W - dirM}" y1="${y(v)}" y2="${y(v)}" stroke="${GRADE}"/>`;
      s += `<text x="${esq - 6}" y="${y(v) + 3.5}" font-size="10" fill="${INK3}" text-anchor="end">${m.f(v)}</text>`;
    }
    const cont = {};
    lista.forEach((r, i) => {
      cont[r.o] = (cont[r.o] || 0) + 1;
      const cx = esq + bw * i + bw / 2, v = m.v(r);
      const dica = h(`<div class="t"><i style="background:${corObra(r.o)}"></i>${h(nomeObra(r.o))} · ${cont[r.o]}ª usinada</div>` +
        (r.u ? linhaTip('', 'Usina', h(r.u)) : '') + (r.ref ? linhaTip('', 'Referência', h(r.ref)) : '') +
        linhaTip('', 'Consumo', L(r.lit) + ' L') + linhaTip('', 'Área', M2(r.area) + ' m²') + linhaTip('', 'Taxa', TX(r.lit / r.area) + ' L/m²'));
      s += `<g data-tip="${dica}" data-obra="${h(r.o)}"><rect x="${esq + bw * i}" y="${topo}" width="${bw}" height="${H - topo - base}" fill="transparent"/>`;
      s += `<path d="${barraV(cx - w / 2, y(0), y(v), w, 4)}" fill="${corObra(r.o)}"/></g>`;
      if(lista.length <= 24) s += `<text x="${cx}" y="${H - base + 14}" font-size="10" fill="${INK3}" text-anchor="middle">${i + 1}</text>`;
    });
    if(SEL.met === 'taxa' && t.area){
      const ym = y(t.lit / t.area);
      s += `<line x1="${esq}" x2="${W - dirM}" y1="${ym}" y2="${ym}" stroke="${INK2}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      s += `<text x="${W - dirM}" y="${ym - 5}" font-size="10" fill="${INK2}" text-anchor="end">média ${TX(t.lit / t.area)}</text>`;
    }
    s += `<line x1="${esq}" x2="${W - dirM}" y1="${y(0)}" y2="${y(0)}" stroke="#C9C9CD"/>`;
    s += `<text x="${esq + pw / 2}" y="${H - 2}" font-size="10" fill="${INK3}" text-anchor="middle">usinadas do dia, na ordem de lançamento</text>`;
    return s + '</svg>';
  }

  // gráfico 2 (período): por dia; área e consumo empilhados por obra; taxa em linhas por obra
  function graficoDias(lista, a, b, os){
    const m = MET[SEL.met], W = 600, esq = 50, dirM = 10, topo = 12, base = 30, H = 230;
    let dias = [];
    const nTot = Math.round((dt(b) - dt(a)) / 864e5) + 1;
    if(nTot <= 62) for(let d = a; d <= b; d = somaDias(d, 1)) dias.push(d);
    else dias = [...new Set(lista.map(r => r.d))].sort();
    const por = {}; // por[dia][obra] = {lit, area, n}
    lista.forEach(r => {
      const g = ((por[r.d] = por[r.d] || {})[r.o] = por[r.d][r.o] || {lit: 0, area: 0, n: 0});
      g.lit += r.lit; g.area += r.area; g.n++;
    });
    const somaDia = d => Object.values(por[d] || {}).reduce((t, g) => ({lit: t.lit + g.lit, area: t.area + g.area, n: t.n + g.n}), {lit: 0, area: 0, n: 0});
    let maxV = 0;
    if(SEL.met === 'taxa') dias.forEach(d => os.forEach(o => { const g = por[d] && por[d][o]; if(g) maxV = Math.max(maxV, taxa(g)); }));
    else dias.forEach(d => { maxV = Math.max(maxV, m.v(somaDia(d))); });
    const esc = escala(maxV * 1.05, 4), pw = W - esq - dirM, bw = pw / dias.length, w = Math.max(3, Math.min(28, bw * 0.62));
    const y = v => topo + (H - topo - base) * (1 - v / esc.max);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(m.rot)} por dia">`;
    for(let v = 0; v <= esc.max + 1e-9; v += esc.passo){
      s += `<line x1="${esq}" x2="${W - dirM}" y1="${y(v)}" y2="${y(v)}" stroke="${GRADE}"/>`;
      s += `<text x="${esq - 6}" y="${y(v) + 3.5}" font-size="10" fill="${INK3}" text-anchor="end">${m.f(v)}</text>`;
    }
    const cada = Math.max(1, Math.ceil(dias.length / 10));
    dias.forEach((d, i) => {
      const x0 = esq + bw * i, cx = x0 + bw / 2, tot = somaDia(d);
      let dica = `<div class="t">${SEM[dt(d).getDay()]}, ${dataBR(d)}</div>`;
      if(!tot.n) dica += '<div>Sem usinadas</div>';
      else {
        os.forEach(o => { const g = por[d] && por[d][o]; if(g) dica += linhaTip(corObra(o), nomeObra(o), SEL.met === 'taxa' ? TX(taxa(g)) + ' L/m²' : m.f(m.v(g)) + ' ' + m.un + (g.n ? ' · ' + g.n + ' us.' : '')); });
        if(os.length > 1) dica += `<div class="l" style="border-top:1px solid #eee;margin-top:3px;padding-top:3px"><span>Total do dia</span><b>${SEL.met === 'taxa' ? TX(taxa(tot)) + ' L/m²' : m.f(m.v(tot)) + ' ' + m.un}</b></div>`;
      }
      s += `<g data-tip="${h(dica)}"><rect x="${x0}" y="${topo}" width="${bw}" height="${H - topo - base}" fill="transparent"/>`;
      if(SEL.met !== 'taxa' && tot.n){
        let acum = 0;
        const segs = os.filter(o => por[d] && por[d][o]);
        segs.forEach((o, k) => {
          const v = m.v(por[d][o]), yb = y(acum), yt = y(acum + v);
          const gap = k > 0 ? 1 : 0, topoSeg = k === segs.length - 1;
          s += topoSeg ? `<path d="${barraV(cx - w / 2, yb - gap, yt, w, 4)}" fill="${corObra(o)}"/>`
            : `<rect x="${cx - w / 2}" y="${yt + 1}" width="${w}" height="${Math.max(0, yb - yt - 1 - gap)}" fill="${corObra(o)}"/>`;
          acum += v;
        });
      }
      s += '</g>';
      if(i % cada === 0) s += `<text x="${cx}" y="${H - base + 14}" font-size="10" fill="${INK3}" text-anchor="middle">${dm(d)}</text>`;
    });
    if(SEL.met === 'taxa'){
      os.forEach(o => {
        const pts = dias.map((d, i) => { const g = por[d] && por[d][o]; return g ? [esq + bw * i + bw / 2, y(taxa(g))] : null; }).filter(Boolean);
        if(pts.length > 1) s += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${corObra(o)}" stroke-width="2" stroke-linejoin="round" pointer-events="none"/>`;
        pts.forEach(p => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${corObra(o)}" stroke="#fff" stroke-width="2" pointer-events="none"/>`; });
      });
    }
    s += `<line x1="${esq}" x2="${W - dirM}" y1="${y(0)}" y2="${y(0)}" stroke="#C9C9CD"/>`;
    return s + '</svg>';
  }

  function renderTabela(gs){
    if(!gs.length){ $('us-tab').innerHTML = '<div class="us-vazio">Sem usinadas para mostrar.</div>'; return; }
    const t = total(gs);
    let s = '<table class="us-tab"><tr><th>Obra</th><th>Usinadas</th><th>Consumo (L)</th><th>Área (m²)</th><th>L/m²</th></tr>';
    gs.forEach(g => {
      const ab = !!SEL.abertas[g.o];
      s += `<tr class="ob" data-o="${h(g.o)}" title="Clique para ver cada usinada"><td><em>${ab ? '▾' : '▸'}</em><i style="background:${corObra(g.o)}"></i>${h(nomeObra(g.o))}</td>
        <td>${g.n}</td><td>${L(g.lit)}</td><td>${M2(g.area)}</td><td><b>${TX(taxa(g))}</b></td></tr>`;
      if(ab){
        const dias = g.dias.size > 1;
        g.us.forEach((r, i) => {
          s += `<tr class="det"><td>${i + 1}ª${dias ? ' · ' + dm(r.d) : ''}${r.u ? ' · ' + h(r.u) : ''}${r.ref ? ' · ' + h(r.ref) : ''}</td><td></td><td>${L(r.lit)}</td><td>${M2(r.area)}</td><td>${TX(r.lit / r.area)}</td></tr>`;
        });
      }
    });
    if(gs.length > 1) s += `<tr class="tot"><td>Total</td><td>${t.n}</td><td>${L(t.lit)}</td><td>${M2(t.area)}</td><td>${TX(t.lit / t.area)}</td></tr>`;
    $('us-tab').innerHTML = s + '</table>';
  }

  // ---------- texto para o WhatsApp ----------
  function textoWpp(gs, t, a, b){
    if(!gs.length) return '';
    const linhas = ['*Relatório de usinadas – BKP Construtora*', '📅 ' + perTxt(a, b), ''];
    gs.forEach(g => {
      linhas.push('*' + nomeObra(g.o) + '*');
      linhas.push('• Usinadas: ' + g.n + (a !== b ? ' (' + g.dias.size + (g.dias.size > 1 ? ' dias)' : ' dia)') : ''));
      linhas.push('• Consumo: ' + L(g.lit) + ' L');
      linhas.push('• Área aplicada: ' + M2(g.area) + ' m²');
      linhas.push('• Taxa: ' + TX(taxa(g)) + ' L/m²' + (g.n > 1 ? ' (' + TX(g.min) + ' a ' + TX(g.max) + ')' : ''));
      linhas.push('');
    });
    if(gs.length > 1){
      linhas.push('*Total*: ' + t.n + ' usinadas · ' + L(t.lit) + ' L · ' + M2(t.area) + ' m² · ' + TX(t.lit / t.area) + ' L/m²');
      linhas.push('');
    }
    linhas.push('_Gestão 360º BKP_');
    return linhas.join('\n');
  }
  const avisoEnv = (txt, erroE) => { $('us-env').textContent = txt; $('us-env').style.color = erroE ? '#b42318' : ''; };

  async function copiar(txt){
    try{ await navigator.clipboard.writeText(txt); return true; }
    catch(e){ const ta = $('us-txt'); ta.removeAttribute('readonly'); ta.select(); let ok = false; try{ ok = document.execCommand('copy'); }catch(x){} ta.setAttribute('readonly', ''); return ok; }
  }
  $('us-copiar').onclick = async () => avisoEnv(await copiar($('us-txt').value) ? 'Texto copiado. É só colar no grupo.' : 'Não deu para copiar: selecione o texto acima e copie.', false);
  $('us-wpp').onclick = async () => {
    const txt = $('us-txt').value;
    if(navigator.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)){
      try{ await navigator.share({text: txt}); return; }catch(e){ if(e && e.name === 'AbortError') return; }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  };

  // ---------- imagem (PNG) para o grupo ----------
  function carregarLogo(){
    return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = location.href.replace(/[^/]*$/, '') + 'logo-bkp.png'; });
  }
  function retArred(c, x, y, w, hh, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  async function gerarImagem(semLogo){
    const [a, b] = periodo(), lista = filtrar(), gs = agrupar(lista), t = total(gs);
    const W = 1080, P = 56, bloco = 150, Hh = P + 110 + 40 + 150 + 50 + gs.length * bloco + 80;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
    const c = cv.getContext('2d'), F = 'Arial, Helvetica, sans-serif';
    c.fillStyle = '#FBFBFC'; c.fillRect(0, 0, W, Hh);
    let y = P;
    const logo = semLogo ? null : await carregarLogo();
    let xt = P;
    if(logo){ const lh = 64, lw = logo.width * lh / logo.height; c.drawImage(logo, P, y, lw, lh); xt = P + lw + 24; }
    c.fillStyle = INK; c.font = 'bold 42px ' + F; c.textBaseline = 'top'; c.fillText('Relatório de usinadas', xt, y);
    c.fillStyle = INK2; c.font = '26px ' + F; c.fillText(perTxt(a, b) + (SEL.obra ? ' · ' + nomeObra(SEL.obra) : ''), xt, y + 52);
    y += 110; c.fillStyle = '#C05621'; c.fillRect(P, y, W - 2 * P, 4); y += 40;
    const kp = [['USINADAS', fmt(t.n, 0), ''], ['CONSUMO', L(t.lit), 'L'], ['ÁREA', M2(t.area), 'm²'], ['TAXA MÉDIA', TX(t.lit / t.area), 'L/m²']];
    const kw = (W - 2 * P - 3 * 16) / 4;
    kp.forEach((k, i) => {
      const x = P + i * (kw + 16);
      c.fillStyle = '#fff'; retArred(c, x, y, kw, 130, 16); c.fill(); c.strokeStyle = '#E8E8EA'; c.lineWidth = 2; c.stroke();
      c.fillStyle = INK3; c.font = 'bold 20px ' + F; c.fillText(k[0], x + 20, y + 20);
      c.fillStyle = INK; c.font = 'bold 40px ' + F; c.fillText(k[1], x + 20, y + 52);
      c.fillStyle = INK3; c.font = '20px ' + F; c.fillText(k[2], x + 20, y + 98);
    });
    y += 150 + 20;
    c.fillStyle = INK3; c.font = 'bold 22px ' + F; c.fillText('POR OBRA', P, y); y += 40;
    const maxA = Math.max(...gs.map(g => g.area));
    gs.forEach(g => {
      c.fillStyle = '#fff'; retArred(c, P, y, W - 2 * P, bloco - 16, 16); c.fill(); c.strokeStyle = '#E8E8EA'; c.lineWidth = 2; c.stroke();
      c.fillStyle = corObra(g.o); retArred(c, P + 24, y + 26, 22, 22, 5); c.fill();
      c.fillStyle = INK; c.font = 'bold 30px ' + F;
      let nome = nomeObra(g.o); while(c.measureText(nome).width > W - 2 * P - 330 && nome.length > 4) nome = nome.slice(0, -2);
      if(nome !== nomeObra(g.o)) nome += '…';
      c.fillText(nome, P + 60, y + 22);
      c.textAlign = 'right'; c.font = 'bold 38px ' + F; c.fillText(TX(taxa(g)), W - P - 86, y + 18);
      c.font = '22px ' + F; c.fillStyle = INK3; c.fillText('L/m²', W - P - 24, y + 30); c.textAlign = 'left';
      c.fillStyle = INK2; c.font = '24px ' + F;
      c.fillText(g.n + (g.n > 1 ? ' usinadas' : ' usinada') + '  ·  ' + L(g.lit) + ' L  ·  ' + M2(g.area) + ' m²', P + 60, y + 64);
      const bx = P + 60, bwid = W - 2 * P - 84;
      c.fillStyle = '#F2F2F3'; retArred(c, bx, y + 104, bwid, 12, 6); c.fill();
      c.fillStyle = corObra(g.o); retArred(c, bx, y + 104, Math.max(12, bwid * g.area / maxA), 12, 6); c.fill();
      y += bloco;
    });
    c.fillStyle = INK3; c.font = '20px ' + F;
    c.fillText('Barra = área aplicada em relação à maior obra. Gerado pelo Gestão 360º BKP em ' + new Date().toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) + '.', P, y + 20);
    return new Promise(res => { try{ cv.toBlob(res, 'image/png'); }catch(e){ res(semLogo ? null : gerarImagem(true)); } });
  }
  $('us-img').onclick = async () => {
    avisoEnv('Gerando a imagem…');
    let blob = null; try{ blob = await gerarImagem(); }catch(e){}
    if(!blob) return avisoEnv('Não foi possível gerar a imagem neste aparelho.', true);
    const [a, b] = periodo(), nome = 'usinadas_' + a + (a !== b ? '_a_' + b : '') + '.png';
    const arq = new File([blob], nome, {type: 'image/png'});
    if(navigator.canShare && navigator.canShare({files: [arq]})){
      try{ await navigator.share({files: [arq], text: 'Relatório de usinadas – ' + perTxt(a, b)}); avisoEnv('Imagem pronta.'); return; }
      catch(e){ if(e && e.name === 'AbortError') return avisoEnv(''); }
    }
    const url = URL.createObjectURL(blob), lk = document.createElement('a');
    lk.href = url; lk.download = nome; document.body.appendChild(lk); lk.click(); lk.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    avisoEnv('Imagem baixada (' + nome + '). Anexe no grupo do WhatsApp.');
  };

  // ---------- impressão / PDF ----------
  $('us-pdf').onclick = () => {
    const [a, b] = periodo(), lista = filtrar(), gs = agrupar(lista), t = total(gs), base = location.href.replace(/[^/]*$/, '');
    const metAnt = SEL.met, graf = {};
    ['area', 'lit', 'taxa'].forEach(k => { SEL.met = k; graf[k] = graficoObras(gs, t); });
    SEL.met = 'area'; const evol = a === b ? graficoUsinadas(lista, t) : graficoDias(lista, a, b, [...new Set(lista.map(r => r.o))].sort((x, y) => x.localeCompare(y, 'pt-BR')));
    SEL.met = metAnt;
    const limpa = s => s.replace(/ data-tip="[^"]*"/g, '').replace(/ data-obra="[^"]*"/g, '');
    const os = [...new Set(lista.map(r => r.o))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Usinadas – ${h(perTxt(a, b))}</title>
<style>
 @page{size:A4;margin:12mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#232323;margin:0}
 .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #C05621;padding-bottom:8px;margin-bottom:10px}
 .cab img{height:34px} .cab h1{font-size:16px;margin:0} .cab span{font-size:10px;color:#8e8e8e;letter-spacing:.1em;text-transform:uppercase}
 .kpi{display:flex;gap:8px;margin:8px 0 12px} .kpi div{flex:1;border:1px solid #e8e8ea;border-radius:8px;padding:7px 9px}
 .kpi span{display:block;font-size:9px;font-weight:700;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em} .kpi b{font-size:17px}
 h2{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px;color:#5c5c5c}
 .gs{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px} .gs h2{margin-top:4px} svg{width:100%;height:auto}
 .leg{font-size:10px;color:#5c5c5c;display:flex;flex-wrap:wrap;gap:3px 12px} .leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
 table{width:100%;border-collapse:collapse} tr{page-break-inside:avoid}
 th{background:#f6f6f7;font-size:9px;text-transform:uppercase;text-align:right;padding:5px;border-bottom:1px solid #ddd} th:first-child,td:first-child{text-align:left}
 td{padding:4px 5px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap} td:first-child{white-space:normal}
 .ob td{font-weight:700;background:#fafafa} .det td{color:#5c5c5c;font-size:10px} .det td:first-child{padding-left:16px}
 .tot td{font-weight:700;border-top:1.5px solid #999}
 .rod{margin-top:14px;font-size:9px;color:#8e8e8e}
 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>
<div class="cab"><img src="${base}logo-bkp.png" alt=""><div><h1>Relatório de usinadas · ${h(perTxt(a, b))}</h1><span>BKP Construtora${SEL.obra ? ' · ' + h(nomeObra(SEL.obra)) : ''}</span></div></div>
<div class="kpi"><div><span>Usinadas</span><b>${t.n}</b></div><div><span>Consumo</span><b>${L(t.lit)} L</b></div><div><span>Área aplicada</span><b>${M2(t.area)} m²</b></div><div><span>Taxa média</span><b>${TX(t.lit / t.area)} L/m²</b></div></div>
<div class="gs">
 <div><h2>Área aplicada por obra (m²)</h2>${limpa(graf.area)}</div>
 <div><h2>Consumo por obra (L)</h2>${limpa(graf.lit)}</div>
 <div><h2>Taxa por obra (L/m²) · tracejado = média</h2>${limpa(graf.taxa)}</div>
 <div><h2>${a === b ? 'Área por usinada (m²)' : 'Área por dia (m²)'}</h2>${os.length > 1 ? '<div class="leg">' + os.map(o => `<span><i style="background:${corObra(o)}"></i>${h(nomeObra(o))}</span>`).join('') + '</div>' : ''}${limpa(evol)}</div>
</div>
<h2>Usinadas por obra</h2>
<table><tr><th>Obra / usinada</th><th>Data</th><th>Usina</th><th>Consumo (L)</th><th>Área (m²)</th><th>L/m²</th></tr>
${gs.map(g => `<tr class="ob"><td>${h(nomeObra(g.o))} · ${g.n} usinada(s)</td><td></td><td></td><td>${L(g.lit)}</td><td>${M2(g.area)}</td><td>${TX(taxa(g))}</td></tr>` +
  g.us.map((r, i) => `<tr class="det"><td>${i + 1}ª${r.ref ? ' · ' + h(r.ref) : ''}</td><td>${dataBR(r.d)}</td><td>${h(r.u)}</td><td>${L(r.lit)}</td><td>${M2(r.area)}</td><td>${TX(r.lit / r.area)}</td></tr>`).join('')).join('')}
${gs.length > 1 ? `<tr class="tot"><td>Total</td><td></td><td></td><td>${L(t.lit)}</td><td>${M2(t.area)}</td><td>${TX(t.lit / t.area)}</td></tr>` : ''}
</table>
<div class="rod">Taxa = litros de emulsão ÷ área aplicada. Dados da planilha "Taxa de Emulsão – Microrrevestimento (MRAF)". Gerado pelo Gestão 360º BKP em ${new Date().toLocaleString('pt-BR')}${window.DMT_SESSAO && window.DMT_SESSAO.u ? ' por ' + h(window.DMT_SESSAO.u) : ''}.</div>
</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const ir = () => { try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){} setTimeout(() => fr.remove(), 60000); };
    const img = doc.querySelector('img');
    if(img && !img.complete){ img.onload = img.onerror = ir; setTimeout(ir, 3000); } else setTimeout(ir, 200);
  };

  // ---------- troca de aba ----------
  const trocarOrig = window.trocarAba;
  window.trocarAba = function(a){
    trocarOrig.apply(this, arguments);
    aba.style.display = a === 'usin' ? '' : 'none';
    btn.classList.toggle('on', a === 'usin');
    if(a === 'usin'){ render(); buscar(); } else esconder();
  };
  document.addEventListener('visibilitychange', () => { if(!document.hidden && aba.style.display !== 'none') buscar(); });

  try{ if(typeof ls !== 'undefined' && ls.get('aba') === 'usin') trocarAba('usin'); }catch(e){}
  window.G360Usinadas = {render, buscar, dados: () => REG};
})();
