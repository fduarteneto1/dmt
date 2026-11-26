// Aba "Cotações" do Gestão 360º BKP: mapa de cotação para o comprador.
// Carregado por index.html depois do app (como diarias.js). Não guarda nada secreto:
// os dados ficam na aba oculta "G360Cotacoes" da planilha Google (e nas abas legíveis
// "Cotações" e "Cotações – Preços"), pela mesma ligação da aba Emulsão (txApi).
//
// Como funciona:
//  - Cada cotação tem itens (descrição, unidade, quantidade) e fornecedores. No mapa, o comprador
//    lança o preço unitário de cada fornecedor e as condições (frete, desconto, prazo, pagamento).
//  - A ferramenta destaca o menor preço de cada item, compara "menor preço por item" com
//    "tudo num fornecedor só" (o frete pode inverter a conta) e calcula a economia.
//  - Fluxo: Em cotação → Aguardando aprovação → Aprovada → Pedido emitido (ou Cancelada).
//    Aprovada em diante, o mapa fica travado (dá para reabrir).
(function(){
  if(typeof txApi !== 'function' || typeof st === 'undefined' || typeof trocarAba !== 'function') return;

  const KEY = 'dmtbkp_cotacoes', PEND = 'dmtbkp_cotacoesPend';
  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const cod = v => typeof codObra === 'function' ? codObra(v) : String(v || '').trim().toUpperCase();
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const hoje = () => iso(new Date());
  const somaDias = (s, n) => { const p = s.split('-'); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return iso(d); };
  const dataBR = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const usuario = () => (window.DMT_SESSAO && window.DMT_SESSAO.u) || '';
  const agora = () => Date.now();
  const agoraTxt = () => { const d = new Date(); return iso(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  // números no padrão brasileiro: aceita "1.234,56", "1234,56", "1234.56", "R$ 12"
  const num = v => {
    if(typeof v === 'number') return v;
    let s = String(v == null ? '' : v).replace(/[R$\s]/g, '');
    if(!s) return NaN;
    if(s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s);
  };
  const ok = v => typeof v === 'number' && isFinite(v) && v > 0;
  const f2 = v => (+v || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const fq = v => (+v || 0).toLocaleString('pt-BR', {maximumFractionDigits: 3});
  const R$ = v => 'R$ ' + f2(v);
  const pct = v => (+v || 0).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%';
  const UNID = ['un', 'pç', 'cj', 'kg', 't', 'm', 'm²', 'm³', 'L', 'cx', 'sc', 'rolo', 'gl', 'balde', 'tambor', 'par', 'vb', 'h', 'dia', 'mês', 'km', 'viagem'];

  const SIT = {
    aberta:    {n: 'Em cotação', c: '#b26a00'},
    aprovacao: {n: 'Aguardando aprovação', c: '#6941c6'},
    aprovada:  {n: 'Aprovada', c: '#1f7a3d'},
    pedido:    {n: 'Pedido emitido', c: '#175cd3'},
    cancelada: {n: 'Cancelada', c: '#8e8e8e'}
  };
  const travada = c => c.st === 'aprovada' || c.st === 'pedido' || c.st === 'cancelada';
  const PAG = ['À vista', 'Antecipado (PIX)', '7 dias', '14 dias', '21 dias', '28 dias', '30 dias', '30/60 dias', '30/60/90 dias', 'Boleto 28 dias', 'Cartão'];

  // ---------- dados ----------
  const VAZIO = () => ({v: 1, forn: [], cot: [], cfg: {}});
  let D = VAZIO();
  try{ const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if(v && Array.isArray(v.cot)) D = Object.assign(VAZIO(), v); }catch(e){}
  let timer = null, ultimaLeitura = 0, aberta = null; // aberta = id da cotação no mapa

  const vivos = l => (l || []).filter(x => !x.del);
  const achaCot = id => D.cot.find(c => c.id === id);
  const achaForn = id => D.forn.find(f => f.id === id);
  const numCot = c => 'COT-' + (c.ano || String(c.d || '').slice(0, 4)) + '-' + String(c.n || 0).padStart(3, '0');

  function locais(){
    const l = [{cod: 'ADM', nome: 'Sede (ADM)'}];
    (st.obras || []).forEach(o => {
      const c = cod(o.codigo); if(!c || l.some(x => x.cod === c)) return;
      if(o.status === 'concluida') return;
      l.push({cod: c, nome: c + ' – ' + (o.local || o.nome)});
    });
    return l;
  }
  const nomeLocal = c => (locais().find(x => x.cod === c) || {}).nome || c || '—';
  const optLocais = (sel, vazio) => (vazio ? '<option value="">' + h(vazio) + '</option>' : '') + locais().map(l => '<option value="' + h(l.cod) + '"' + (l.cod === sel ? ' selected' : '') + '>' + h(l.nome) + '</option>').join('');

  function novaCotacao(base){
    const ano = hoje().slice(0, 4);
    const n = Math.max(0, ...D.cot.filter(c => String(c.ano) === ano).map(c => +c.n || 0)) + 1;
    const c = {id: uid(), n, ano, tit: '', o: '', sol: '', u: usuario(), d: hoje(), prazo: somaDias(hoje(), 3), st: 'aberta',
      itens: [], fs: [], venc: {}, modo: 'auto', glob: '', just: '', obs: '', hist: [{q: agoraTxt(), u: usuario(), a: 'Criada'}], upd: agora()};
    if(base){
      c.tit = base.tit ? base.tit + ' (cópia)' : ''; c.o = base.o; c.sol = base.sol;
      c.itens = base.itens.map(i => ({id: uid(), desc: i.desc, un: i.un, q: i.q, obs: i.obs}));
      c.fs = base.fs.map(f => ({id: f.id, nome: f.nome, frete: 0, tf: f.tf || 'CIF', desc: 0, prazo: '', pag: f.pag || '', val: '', obs: '', p: {}}));
      c.hist[0].a = 'Criada a partir de ' + numCot(base);
    }
    D.cot.push(c);
    return c;
  }
  function registrar(c, a){ (c.hist = c.hist || []).push({q: agoraTxt(), u: usuario(), a}); if(c.hist.length > 60) c.hist = c.hist.slice(-60); }

  // ---------- cálculo do mapa ----------
  function calc(c){
    const itens = c.itens.filter(i => String(i.desc || '').trim() || ok(num(i.q)));
    const fs = c.fs;
    const ef = (f, i) => { const p = num(f.p && f.p[i.id]); return ok(p) ? p * (1 - (num(f.desc) || 0) / 100) : null; };
    const R = {itens, fs, it: {}, f: {}, semPreco: 0};
    itens.forEach(i => {
      const q = num(i.q) || 0, vs = fs.map(f => ({f, v: ef(f, i)})).filter(x => x.v != null);
      const r = {q, n: vs.length, min: null, max: null, med: null, melhores: []};
      if(vs.length){
        r.min = Math.min(...vs.map(x => x.v)); r.max = Math.max(...vs.map(x => x.v));
        r.med = vs.reduce((s, x) => s + x.v, 0) / vs.length;
        r.melhores = vs.filter(x => x.v - r.min < 0.000001).map(x => x.f.id);
      } else R.semPreco++;
      R.it[i.id] = r;
    });
    fs.forEach(f => {
      let sub = 0, n = 0;
      itens.forEach(i => { const p = num(f.p && f.p[i.id]); if(ok(p)){ sub += p * R.it[i.id].q; n++; } });
      const dv = sub * (num(f.desc) || 0) / 100, fr = num(f.frete) || 0;
      R.f[f.id] = {sub, dv, fr, tot: sub - dv + fr, n, completo: itens.length > 0 && n === itens.length};
    });
    // cenário 1: menor preço em cada item (+ frete de cada fornecedor envolvido)
    const cen = escolha => {
      let tot = 0; const usados = new Set(), falta = [];
      itens.forEach(i => { const fid = escolha(i); const f = fs.find(x => x.id === fid); const v = f && ef(f, i);
        if(v == null){ falta.push(i); return; } tot += v * R.it[i.id].q; usados.add(fid); });
      usados.forEach(fid => tot += R.f[fid].fr);
      return {tot, usados: [...usados], falta};
    };
    R.porItem = cen(i => R.it[i.id].melhores[0]);
    const comp = fs.filter(f => R.f[f.id].completo).sort((a, b) => R.f[a.id].tot - R.f[b.id].tot);
    R.unico = comp.length ? {f: comp[0], tot: R.f[comp[0].id].tot} : null;
    // sugestão automática: o mais barato entre os dois cenários
    R.sugUnico = !!(R.unico && (R.porItem.falta.length || R.unico.tot <= R.porItem.tot + 0.005));
    // escolha valendo (automática, um fornecedor só, ou item a item à mão)
    let modo = c.modo || 'auto';
    if(modo === 'unico' && !fs.some(f => f.id === c.glob)) modo = 'auto';
    R.modo = modo;
    R.esc = {};
    itens.forEach(i => {
      let fid;
      if(modo === 'unico') fid = c.glob;
      else if(modo === 'manual' && c.venc && c.venc[i.id] && fs.some(f => f.id === c.venc[i.id] && ef(f, i) != null)) fid = c.venc[i.id];
      else if(modo === 'auto' && R.sugUnico) fid = R.unico.f.id;
      else fid = R.it[i.id].melhores[0];
      const f = fs.find(x => x.id === fid);
      R.esc[i.id] = f && ef(f, i) != null ? fid : '';
    });
    R.final = cen(i => R.esc[i.id]);
    let eMed = 0, eMax = 0, base = 0;
    itens.forEach(i => { const fid = R.esc[i.id], r = R.it[i.id]; if(!fid || r.med == null) return;
      const v = ef(fs.find(x => x.id === fid), i); eMed += (r.med - v) * r.q; eMax += (r.max - v) * r.q; base += r.med * r.q; });
    // economia: com 2+ propostas completas, compara totais (já com frete e desconto); senão, item a item
    const tc = fs.filter(f => R.f[f.id].completo).map(f => R.f[f.id].tot);
    if(tc.length >= 2 && !R.final.falta.length){
      const med = tc.reduce((s, v) => s + v, 0) / tc.length;
      eMed = med - R.final.tot; eMax = Math.max(...tc) - R.final.tot; base = med;
    }
    R.ecoMed = eMed; R.ecoMax = eMax; R.ecoPct = base > 0 ? eMed / base * 100 : 0;
    R.ef = ef;
    return R;
  }

  // ---------- montar a aba ----------
  const css = document.createElement('style');
  css.textContent = `
  #aba-cot .seg{margin-bottom:12px}
  #aba-cot ul{list-style:none;margin:6px 0 0;padding:0}
  #aba-cot .li{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--line2,#f2f2f3);font-size:12.5px;cursor:pointer;border-radius:6px}
  #aba-cot .li:hover{background:var(--head,#f6f6f7)}
  #aba-cot .li .nm{flex:1 1 auto;min-width:0}
  #aba-cot .li .nm b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  #aba-cot .li .nm small{display:block;color:var(--ink3,#8e8e8e);font-size:11px}
  #aba-cot .li .vl{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap;text-align:right}
  #aba-cot .li .vl small{display:block;font-weight:400;color:#1f7a3d;font-size:10.5px}
  .cot-tag{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:0 6px;border:1px solid currentColor;white-space:nowrap;line-height:16px}
  #aba-cot .row3{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:0 8px}
  #aba-cot .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  #aba-cot .kpi{background:var(--head,#f6f6f7);border-radius:9px;padding:8px 10px}
  #aba-cot .kpi span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8e8e8e)}
  #aba-cot .kpi b{font-size:17px;font-variant-numeric:tabular-nums}
  #aba-cot table{width:100%;border-collapse:collapse;margin-top:6px}
  #aba-cot th,#aba-cot td{text-align:left;padding:5px 4px;vertical-align:top}
  #aba-cot td.n,#aba-cot th.n{text-align:right;white-space:nowrap}
  #aba-cot .aviso{color:#b42318;font-size:11.5px}

  #cot-mapa *,#cot-modal *{box-sizing:border-box}
  #cot-mapa input,#cot-mapa select{min-width:0}
  #cot-mapa{position:fixed;inset:0;z-index:4000;background:var(--bg,#FBFBFC);color:var(--ink,#232323);display:flex;flex-direction:column}
  #cot-mapa .topo{display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--line,#e8e8ea);background:var(--card,#fff);flex-wrap:wrap}
  #cot-mapa .topo h2{margin:0;font-size:17px;white-space:nowrap}
  #cot-mapa .topo .esp{flex:1}
  #cot-mapa .topo .btns{display:flex;gap:6px;flex-wrap:wrap}
  #cot-mapa .corpo{flex:1;overflow:auto;padding:14px 18px 40px}
  #cot-mapa .card{max-width:none}
  #cot-mapa .cab{display:grid;grid-template-columns:2.2fr 1.3fr 1fr .8fr .8fr;gap:0 10px}
  #cot-mapa .cab input,#cot-mapa .cab select{width:100%}
  #cot-mapa .wrap{overflow:auto;border:1px solid var(--line,#e8e8ea);border-radius:10px;background:var(--card,#fff)}
  #cot-mapa table.m{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:100%}
  #cot-mapa table.m th,#cot-mapa table.m td{padding:4px 6px;border-bottom:1px solid var(--line2,#f2f2f3);border-right:1px solid var(--line2,#f2f2f3);vertical-align:middle;background:var(--card,#fff)}
  #cot-mapa table.m thead th{position:sticky;top:0;z-index:2;background:var(--head,#f6f6f7);font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:var(--ink3,#8e8e8e);text-align:center}
  #cot-mapa table.m thead tr:nth-child(2) th{top:var(--cot-h1,38px)}
  #cot-mapa table.m .fix{position:sticky;left:0;z-index:1}
  #cot-mapa table.m thead .fix{z-index:3}
  #cot-mapa table.m td input,#cot-mapa table.m td select{width:100%;padding:5px 7px;font-size:12.5px;border-radius:6px}
  #cot-mapa table.m td input.pr{text-align:right;font-variant-numeric:tabular-nums;min-width:92px}
  #cot-mapa table.m td.tt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink2,#5c5c5c);min-width:96px}
  #cot-mapa table.m td.min{background:#e8f5ec}
  #cot-mapa table.m td.min input{border-color:#5fb37b;background:#f4fbf6;font-weight:700;color:#14532d}
  #cot-mapa table.m td.min.tt{color:#14532d;font-weight:700}
  #cot-mapa table.m td.esc{box-shadow:inset 0 -3px 0 #1f7a3d}
  #cot-mapa table.m td.alto input{color:#b42318}
  #cot-mapa table.m th.fh{min-width:200px;color:var(--ink,#232323);font-size:12px;text-transform:none;letter-spacing:0}
  #cot-mapa table.m th.fh .x{background:none;border:0;color:#b42318;padding:0 4px;font-size:14px;cursor:pointer;float:right}
  #cot-mapa table.m th.fh small{display:block;font-weight:400;color:var(--ink3,#8e8e8e);font-size:10.5px}
  #cot-mapa table.m tfoot td,#cot-mapa table.m tfoot th{background:var(--head,#f6f6f7);font-size:12px}
  #cot-mapa table.m tfoot th{text-align:right;color:var(--ink2,#5c5c5c);font-weight:600;white-space:nowrap}
  #cot-mapa table.m tfoot tr.tot td{font-weight:700;font-size:13.5px}
  #cot-mapa table.m tfoot tr.tot td.best{color:#14532d;background:#e8f5ec}
  #cot-mapa table.m td.num-i{color:var(--ink3,#8e8e8e);text-align:center;width:28px}
  #cot-mapa table.m td .x{background:none;border:0;color:#b42318;padding:2px 5px;font-size:14px;cursor:pointer}
  #cot-mapa .linhab{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
  #cot-mapa .res{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
  #cot-mapa .res .bx{background:var(--card,#fff);border:1px solid var(--line,#e8e8ea);border-radius:10px;padding:10px 12px}
  #cot-mapa .res .bx span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8e8e8e)}
  #cot-mapa .res .bx b{display:block;font-size:20px;font-variant-numeric:tabular-nums;margin-top:2px}
  #cot-mapa .res .bx small{display:block;color:var(--ink2,#5c5c5c);font-size:11px}
  #cot-mapa .res .bx.ver{border-color:#1f7a3d;box-shadow:0 0 0 2px rgba(31,122,61,.15)}
  #cot-mapa .res .bx.ver b{color:#14532d}
  #cot-mapa .sug{margin-top:10px;padding:9px 12px;border-radius:9px;background:#e8f5ec;color:#14532d;font-size:12.5px}
  #cot-mapa .sug.al{background:#fdf0e8;color:#8a3a12}
  #cot-mapa .duas{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}
  #cot-mapa .ped{border:1px solid var(--line,#e8e8ea);border-radius:9px;padding:8px 10px;margin-top:8px;font-size:12.5px}
  #cot-mapa .ped b.t{float:right;font-variant-numeric:tabular-nums}
  #cot-mapa .ped ul{margin:4px 0 6px;padding-left:18px;color:var(--ink2,#5c5c5c);font-size:11.5px}
  #cot-mapa textarea{width:100%;min-height:62px;font-family:inherit;font-size:12.5px;border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:8px 11px;background:var(--card,#fff);color:var(--ink,#232323)}
  #cot-mapa .modos{display:flex;gap:4px;flex-wrap:wrap}
  #cot-mapa .hist{font-size:11.5px;color:var(--ink2,#5c5c5c);max-height:160px;overflow:auto}
  #cot-mapa .trava{padding:8px 12px;border-radius:9px;background:#eef4ff;color:#1d3d7a;font-size:12.5px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  #cot-mapa .ult{display:block;font-size:10.5px;color:var(--ink3,#8e8e8e);margin-top:2px;white-space:nowrap}
  @media (max-width:900px){ #cot-mapa .cab{grid-template-columns:1fr 1fr} #cot-mapa .res{grid-template-columns:1fr 1fr} #cot-mapa .duas{grid-template-columns:1fr} #cot-mapa .corpo{padding:10px} }
  #cot-modal{position:fixed;inset:0;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;z-index:5000}
  #cot-modal form{background:var(--card,#fff);color:var(--ink,#232323);border-radius:12px;padding:18px;width:460px;max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.14)}
  #cot-modal input,#cot-modal select,#cot-modal textarea{width:100%}
  #cot-modal textarea{min-height:150px;font-family:inherit;font-size:12.5px;border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:8px 11px}
  #cot-modal h2{margin:0 0 6px;font-size:15px}
  #cot-modal .g2{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
  #cot-sug{position:fixed;z-index:6000;background:var(--card,#fff);color:var(--ink,#232323);border:1px solid var(--line,#e8e8ea);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);overflow:auto;padding:4px 0;font-size:12.5px}
  #cot-sug .gt{padding:7px 12px 3px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3,#8e8e8e);font-weight:600}
  #cot-sug .op{padding:7px 12px;cursor:pointer;line-height:1.3}
  #cot-sug .op b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #cot-sug .op small{display:block;color:var(--ink3,#8e8e8e);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #cot-sug .op:hover,#cot-sug .op.on{background:var(--head,#f6f6f7)}
  #cot-sug .op.nv{border-top:1px solid var(--line2,#f2f2f3)}
  #cot-sug .op.nv b{color:#175cd3}
  #cot-sug .ms{padding:6px 12px 8px;color:var(--ink3,#8e8e8e);font-size:11.5px}
  @keyframes cotPisca{from{background:#fff4c2}to{background:transparent}}
  #cot-modal input.pisca{animation:cotPisca 1.6s ease-out}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.dataset.aba = 'cot'; btn.textContent = 'Cotações';
  $('abas').appendChild(btn);
  btn.addEventListener('click', () => trocarAba('cot'));

  const aba = document.createElement('div');
  aba.id = 'aba-cot'; aba.style.display = 'none';
  aba.innerHTML = `
    <div class="seg" id="cot-sub">
      <button data-s="lis" class="on">Cotações</button><button data-s="for">Fornecedores</button><button data-s="pre">Histórico de preços</button>
    </div>
    <div data-p="lis">
      <div class="card">
        <h2>Mapas de cotação</h2>
        <div class="kpis"><div class="kpi"><span>Em andamento</span><b id="cot-k1">0</b></div>
          <div class="kpi"><span>Aguardando aprovação</span><b id="cot-k2">0</b></div>
          <div class="kpi"><span>Economia no ano</span><b id="cot-k3">R$ 0</b></div></div>
        <div class="btns" style="margin-bottom:8px"><button id="cot-nova">+ Nova cotação</button></div>
        <div class="row3">
          <div><label for="cot-busca">Buscar</label><input id="cot-busca" placeholder="Nº, título, item, fornecedor…" style="width:100%"></div>
          <div><label for="cot-fs">Situação</label><select id="cot-fs" style="width:100%"><option value="">Todas (sem canceladas)</option>
            ${Object.entries(SIT).map(([k, s]) => '<option value="' + k + '">' + s.n + '</option>').join('')}<option value="*">Todas</option></select></div>
          <div><label for="cot-fo">Obra</label><select id="cot-fo" style="width:100%"></select></div>
        </div>
        <ul id="cot-lista"></ul>
        <div class="btns" style="margin-top:10px"><button class="sec mini" id="cot-csv">Baixar planilha (CSV)</button></div>
        <div class="hint" id="cot-estado" style="margin-top:6px"></div>
      </div>
    </div>
    <div data-p="for" style="display:none">
      <div class="card">
        <h2>Fornecedores</h2>
        <div style="display:flex;gap:8px;align-items:end"><div style="flex:1"><label for="for-busca">Buscar</label><input id="for-busca" placeholder="Nome, cidade, categoria…" style="width:100%"></div>
          <button id="for-novo">+ Fornecedor</button><button class="sec" id="for-gcfg" title="Configurar a busca de empresas no Google">⚙ Busca no Google</button></div>
        <ul id="for-lista"></ul>
      </div>
    </div>
    <div data-p="pre" style="display:none">
      <div class="card">
        <h2>Histórico de preços</h2>
        <label for="pre-busca">Item</label><input id="pre-busca" placeholder="Ex.: emulsão RL-1C, pneu 295/80, óleo 15W40" style="width:100%">
        <div class="hint" style="margin-top:4px">Preços de todas as cotações, do mais recente para o mais antigo. ★ = proposta escolhida.</div>
        <div id="pre-res"></div>
      </div>
    </div>`;
  const ref = $('aba-rel') || $('aba-clima') || $('aba-diar') || $('aba-equip') || $('aba-taxa');
  ref.parentElement.insertBefore(aba, ref.nextSibling);

  aba.querySelectorAll('#cot-sub button').forEach(b => b.onclick = () => {
    aba.querySelectorAll('#cot-sub button').forEach(x => x.classList.toggle('on', x === b));
    aba.querySelectorAll('[data-p]').forEach(p => p.style.display = p.dataset.p === b.dataset.s ? '' : 'none');
    render();
  });
  const sub = () => (aba.querySelector('#cot-sub button.on') || {}).dataset.s || 'lis';

  // ---------- lista ----------
  function resumo(c){
    const R = calc(c);
    return {R, tot: R.final.tot, eco: R.ecoMed, forn: R.final.usados.map(id => (c.fs.find(f => f.id === id) || {}).nome).filter(Boolean)};
  }
  function render(){
    if(aba.style.display === 'none') return;
    const s = sub();
    if(s === 'lis') renderLista(); else if(s === 'for') renderForn(); else renderPrecos();
  }
  function renderLista(){
    const fo = $('cot-fo'), v = fo.value;
    fo.innerHTML = optLocais(v, 'Todas as obras'); fo.value = v;
    const b = $('cot-busca').value.trim().toLowerCase(), fs = $('cot-fs').value;
    const cs = vivos(D.cot);
    $('cot-k1').textContent = cs.filter(c => c.st === 'aberta').length;
    $('cot-k2').textContent = cs.filter(c => c.st === 'aprovacao').length;
    const ano = hoje().slice(0, 4);
    $('cot-k3').textContent = R$(cs.filter(c => (c.st === 'aprovada' || c.st === 'pedido') && String(c.ano) === ano).reduce((s, c) => s + Math.max(0, resumo(c).eco), 0)).replace(/,\d\d$/, '');
    const l = cs.filter(c => (fs === '*' ? true : fs ? c.st === fs : c.st !== 'cancelada') && (!v || c.o === v) && (!b ||
      (numCot(c) + ' ' + c.tit + ' ' + c.sol + ' ' + c.o + ' ' + c.itens.map(i => i.desc).join(' ') + ' ' + c.fs.map(f => f.nome).join(' ')).toLowerCase().includes(b)))
      .sort((a, b2) => String(b2.d).localeCompare(String(a.d)) || (b2.n || 0) - (a.n || 0));
    $('cot-lista').innerHTML = l.map(c => {
      const r = resumo(c), si = SIT[c.st] || SIT.aberta, venc = c.prazo && c.st === 'aberta' && c.prazo < hoje();
      return '<li class="li" data-id="' + c.id + '"><span class="nm"><b>' + numCot(c) + ' · ' + h(c.tit || 'Sem título') + '</b><small>'
        + h(c.o ? nomeLocal(c.o) : 'Sem obra') + ' · ' + dataBR(c.d) + ' · ' + c.itens.length + ' ite' + (c.itens.length === 1 ? 'm' : 'ns') + ' · ' + c.fs.length + ' fornecedor' + (c.fs.length === 1 ? '' : 'es')
        + (venc ? ' · <span style="color:#b42318">prazo vencido</span>' : '') + '</small>'
        + '<small><span class="cot-tag" style="color:' + si.c + '">' + si.n + '</span>' + (r.forn.length ? ' ' + h(r.forn.join(', ')) : '') + '</small></span>'
        + '<span class="vl">' + (r.tot > 0 ? R$(r.tot) : '—') + (r.eco > 0.005 ? '<small>economia ' + R$(r.eco) + '</small>' : '') + '</span></li>';
    }).join('') || '<li class="hint" style="padding:10px 0;cursor:default">Nenhuma cotação' + (b || fs || v ? ' com esse filtro.' : ' ainda. Clique em <b>+ Nova cotação</b>.') + '</li>';
    $('cot-lista').querySelectorAll('li[data-id]').forEach(li => li.onclick = () => abrirMapa(li.dataset.id));
  }
  $('cot-busca').oninput = render; $('cot-fs').onchange = render; $('cot-fo').onchange = render;
  $('cot-nova').onclick = () => { const c = novaCotacao(); salvar(true); abrirMapa(c.id, true); };

  $('cot-csv').onclick = () => {
    const lin = [['Nº', 'Data', 'Título', 'Obra', 'Solicitante', 'Comprador', 'Situação', 'Item', 'Un', 'Qtd', 'Fornecedor', 'Preço unit.', 'Total', 'Menor preço', 'Escolhido']];
    vivos(D.cot).forEach(c => { const R = calc(c);
      R.itens.forEach(i => c.fs.forEach(f => { const p = num(f.p[i.id]); if(!ok(p)) return;
        lin.push([numCot(c), dataBR(c.d), c.tit, c.o, c.sol, c.u, (SIT[c.st] || {}).n, i.desc, i.un, fq(i.q), f.nome, f2(p), f2(p * (num(i.q) || 0)),
          R.it[i.id].melhores.includes(f.id) ? 'sim' : '', R.esc[i.id] === f.id ? 'sim' : '']); })); });
    const csv = '\ufeff' + lin.map(r => r.map(x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    a.download = 'cotacoes-' + hoje() + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // ---------- fornecedores ----------
  function renderForn(){
    const b = $('for-busca').value.trim().toLowerCase();
    const l = vivos(D.forn).filter(f => !b || casa(Object.assign({}, f, {cat: [f.cat, f.contato, f.end].join(' ')}), b))
      .sort((a, b2) => String(a.nome).localeCompare(String(b2.nome), 'pt-BR'));
    const usos = id => vivos(D.cot).filter(c => c.fs.some(f => f.id === id));
    $('for-lista').innerHTML = l.map(f => { const u = usos(f.id), ganhou = u.filter(c => calc(c).final.usados.includes(f.id) && c.st !== 'aberta' && c.st !== 'cancelada').length;
      return '<li class="li" data-id="' + f.id + '"><span class="nm"><b>' + h(f.nome) + '</b><small>' + [f.cat, f.cidade, f.cnpj && 'CNPJ ' + f.cnpj].filter(Boolean).map(h).join(' · ')
        + '</small><small>' + [f.contato, f.tel, f.email].filter(Boolean).map(h).join(' · ') + '</small></span>'
        + '<span class="vl" style="font-weight:400;font-size:11px;color:var(--ink3)">' + u.length + ' cotaç' + (u.length === 1 ? 'ão' : 'ões') + (ganhou ? '<br>' + ganhou + ' escolhida' + (ganhou > 1 ? 's' : '') : '') + '</span></li>'; }).join('')
      || '<li class="hint" style="padding:10px 0;cursor:default">Nenhum fornecedor' + (b ? ' com essa busca.' : ' cadastrado. Dá para cadastrar aqui ou direto no mapa.') + '</li>';
    $('for-lista').querySelectorAll('li[data-id]').forEach(li => li.onclick = () => editarForn(li.dataset.id));
  }
  $('for-busca').oninput = render;
  $('for-novo').onclick = () => editarForn();
  $('for-gcfg').onclick = () => configGoogle();

  function editarForn(id, depois, nomeIni){
    const f = id ? achaForn(id) : null;
    const v = f || {nome: nomeIni || ''};
    const m = modal(f ? 'Editar fornecedor' : 'Novo fornecedor',
      '<label>Nome do fornecedor</label><input name="nome" required value="' + h(v.nome) + '" placeholder="Digite o nome (busca nos cadastrados e no Google) ou o CNPJ">'
      + '<input type="hidden" name="razao" value="' + h(v.razao) + '"><input type="hidden" name="gid" value="' + h(v.gid) + '"><input type="hidden" name="geo" value="' + h(v.geo) + '">'
      + '<div class="g2"><div><label>CNPJ</label><input name="cnpj" value="' + h(v.cnpj) + '" placeholder="00.000.000/0000-00"></div>'
      + '<div><label>Categoria</label><input name="cat" value="' + h(v.cat) + '" list="cot-cats" placeholder="Peças, emulsão, EPI…"></div></div>'
      + '<datalist id="cot-cats">' + [...new Set(vivos(D.forn).map(x => x.cat).filter(Boolean).concat(['Peças e filtros', 'Pneus', 'Lubrificantes', 'Combustível', 'Emulsão e CAP', 'Agregados', 'EPI', 'Material de construção', 'Ferramentas', 'Serviços', 'Locação de equipamentos', 'Escritório']))].map(x => '<option value="' + h(x) + '">').join('') + '</datalist>'
      + '<div class="g2"><div><label>Contato</label><input name="contato" value="' + h(v.contato) + '" placeholder="Nome do vendedor"></div>'
      + '<div><label>Telefone / WhatsApp</label><input name="tel" value="' + h(v.tel) + '" placeholder="(65) 99999-9999"></div></div>'
      + '<div class="g2"><div><label>E-mail</label><input name="email" type="email" value="' + h(v.email) + '"></div>'
      + '<div><label>Cidade</label><input name="cidade" value="' + h(v.cidade) + '" placeholder="Cuiabá-MT"></div></div>'
      + '<label>Endereço</label><input name="end" value="' + h(v.end) + '" placeholder="Rua, número, bairro">'
      + '<label>Observação</label><input name="obs" value="' + h(v.obs) + '" placeholder="Ex.: entrega em obra só acima de R$ 2 mil">'
      + '<div class="hint" id="for-st" style="margin-top:8px;min-height:16px"></div>',
      d => {
        d.nome = String(d.nome || '').trim(); if(!d.nome) return false;
        const dc = String(d.cnpj || '').replace(/\D/g, '');
        const dupC = dc.length === 14 && vivos(D.forn).find(x => x.id !== id && String(x.cnpj || '').replace(/\D/g, '') === dc);
        if(dupC && !confirm('O CNPJ ' + fmtCnpj(dc) + ' já está cadastrado em "' + dupC.nome + '". Cadastrar de novo mesmo assim?')) return false;
        const dup = !dupC && vivos(D.forn).find(x => x.id !== id && x.nome.trim().toLowerCase() === d.nome.toLowerCase());
        if(dup && !confirm('Já existe um fornecedor chamado "' + dup.nome + '". Cadastrar outro com o mesmo nome?')) return false;
        let o = f;
        if(!o){ o = {id: uid()}; D.forn.push(o); }
        ['nome', 'razao', 'cnpj', 'cat', 'contato', 'tel', 'email', 'cidade', 'end', 'obs', 'gid', 'geo'].forEach(k => o[k] = String(d[k] || '').trim());
        o.cnpj = fmtCnpj(o.cnpj); o.tel = fmtTel(o.tel);
        o.upd = agora();
        // o nome também muda nas cotações em aberto
        vivos(D.cot).forEach(c => { if(travada(c)) return; c.fs.forEach(x => { if(x.id === o.id && x.nome !== o.nome){ x.nome = o.nome; c.upd = agora(); } }); });
        salvar(); if(depois) depois(o);
      },
      f ? ['Excluir', () => { if(!confirm('Excluir "' + f.nome + '" do cadastro? As cotações em que ele aparece não mudam.')) return false; f.del = true; f.upd = agora(); salvar(); }] : null);
    ligarBuscaForn(m, id, depois);
  }

  // ---------- busca de fornecedor enquanto digita ----------
  // Lista suspensa com três fontes: fornecedores já cadastrados (para não duplicar), Google
  // (Places API, só quando a chave estiver configurada em Fornecedores › ⚙ Busca no Google)
  // e a Receita Federal pelo CNPJ (BrasilAPI, gratuita, sem chave; reserva: publica.cnpj.ws).
  const sem = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const casa = (f, q) => { const t = sem([f.nome, f.razao, f.cnpj, String(f.cnpj || '').replace(/\D/g, ''), f.cidade, f.cat].join(' ')); return sem(q).split(/\s+/).filter(Boolean).every(p => t.includes(p)); };
  const MIN = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const tit = s => String(s || '').toLowerCase().replace(/(^|[\s\-\/(])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).split(' ').map((w, i) => i && MIN.has(w.toLowerCase()) ? w.toLowerCase() : w).join(' ');
  const fmtTel = v => { const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : String(v || '').trim(); };
  const fmtCnpj = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : String(v || '').trim(); };
  const fmtCep = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : ''; };
  const CATS = [[/pneu/, 'Pneus'], [/lubrific|oleo/, 'Lubrificantes'], [/combust|posto|derivados de petroleo/, 'Combustível'], [/asfalt|betum|emuls/, 'Emulsão e CAP'],
    [/pedra|brita|areia|cascalho|agregad|pedreira/, 'Agregados'], [/pecas|acessorios para veiculos|autopec|filtro|maquinas e equipamentos/, 'Peças e filtros'],
    [/seguranca|epi|protecao/, 'EPI'], [/locacao|aluguel de maquinas/, 'Locação de equipamentos'], [/material de construcao|ferragens|cimento|madeira/, 'Material de construção'],
    [/ferramenta/, 'Ferramentas'], [/papelaria|escritorio|informatica/, 'Escritório']];
  const catDe = t => { t = sem(t); const c = CATS.find(x => x[0].test(t)); return c ? c[1] : ''; };

  // caixa da lista (uma só, presa ao body, para não ser cortada pela rolagem do formulário)
  let SUG = null, sugDona = null;
  function caixa(){
    if(SUG) return SUG;
    SUG = document.createElement('div'); SUG.id = 'cot-sug'; SUG.hidden = true; document.body.appendChild(SUG);
    const pos = () => { if(SUG.hidden || !sugDona) return; if(!sugDona.isConnected){ SUG.hidden = true; return; }
      const r = sugDona.getBoundingClientRect(), baixo = innerHeight - r.bottom;
      SUG.style.left = Math.max(4, r.left) + 'px'; SUG.style.width = Math.max(r.width, 280) + 'px';
      if(baixo < 220 && r.top > baixo){ SUG.style.top = ''; SUG.style.bottom = (innerHeight - r.top + 2) + 'px'; SUG.style.maxHeight = Math.min(320, r.top - 8) + 'px'; }
      else { SUG.style.bottom = ''; SUG.style.top = (r.bottom + 2) + 'px'; SUG.style.maxHeight = Math.min(320, baixo - 8) + 'px'; } };
    SUG.pos = pos;
    addEventListener('resize', pos); addEventListener('scroll', pos, true);
    return SUG;
  }
  // fonte.local(q) → grupos na hora; fonte.remoto(q) → Promise de grupos (com espera de 350 ms)
  // grupo = {tit, msg, itens: [{t, s, ac}]}
  function sugerir(inp, fonte){
    const box = caixa();
    inp.setAttribute('autocomplete', 'off');
    let itens = [], sel = -1, seq = 0, tmr = null, fechado = false;
    const minha = () => sugDona === inp;
    const fechar = () => { if(minha()){ box.hidden = true; } sel = -1; clearTimeout(tmr); seq++; };
    const marcar = k => { sel = k; const ops = box.querySelectorAll('.op'); ops.forEach((el, i) => el.classList.toggle('on', i === k)); if(ops[k] && ops[k].scrollIntoView) ops[k].scrollIntoView({block: 'nearest'}); };
    const escolher = k => { const it = itens[k]; if(!it) return; fechar(); fechado = true; it.ac(); };
    function desenhar(grupos){
      if(document.activeElement !== inp) return;
      sugDona = inp; itens = []; let html = '';
      grupos.filter(Boolean).forEach(g => {
        if(!g.msg && !(g.itens || []).length) return;
        if(g.tit) html += '<div class="gt">' + h(g.tit) + '</div>';
        (g.itens || []).forEach(it => { html += '<div class="op' + (it.novo ? ' nv' : '') + '" data-k="' + itens.length + '"><b>' + h(it.t) + '</b>' + (it.s ? '<small>' + h(it.s) + '</small>' : '') + '</div>'; itens.push(it); });
        if(g.msg) html += '<div class="ms">' + h(g.msg) + '</div>';
      });
      box.innerHTML = html; box.hidden = !html; sel = -1; box.pos();
      box.querySelectorAll('.op').forEach(el => { el.onpointerdown = e => { e.preventDefault(); escolher(+el.dataset.k); }; });
    }
    function buscar(){
      const q = inp.value.trim(), n = ++seq; fechado = false;
      const loc = fonte.local(q) || [];
      clearTimeout(tmr);
      const rem = fonte.remoto && fonte.remoto(q);
      if(!rem){ desenhar(loc); return; }
      desenhar(loc.concat([{tit: rem.tit, msg: 'Buscando…'}]));
      tmr = setTimeout(async () => {
        let g; try{ g = await rem.fn(); }catch(e){ g = [{tit: rem.tit, msg: e.message}]; }
        if(n === seq && !fechado) desenhar(loc.concat(g));
      }, 350);
    }
    inp.addEventListener('input', buscar);
    inp.addEventListener('focus', () => { if(!fechado) buscar(); });
    inp.addEventListener('blur', () => setTimeout(() => { if(document.activeElement !== inp) fechar(); }, 120));
    inp.addEventListener('keydown', e => {
      if(box.hidden || !minha()){ if(e.key === 'ArrowDown'){ fechado = false; buscar(); e.preventDefault(); } return; }
      if(e.key === 'ArrowDown'){ e.preventDefault(); marcar(Math.min(itens.length - 1, sel + 1)); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); marcar(Math.max(-1, sel - 1)); }
      else if(e.key === 'Enter' && sel >= 0){ e.preventDefault(); escolher(sel); }
      else if(e.key === 'Tab') fechar();
    });
    // Esc fecha só a lista (sem fechar a janela do cadastro)
    const esc = e => { if(!inp.isConnected){ removeEventListener('keydown', esc, true); return; }
      if(e.key === 'Escape' && document.activeElement === inp && !box.hidden && minha()){ e.stopPropagation(); e.preventDefault(); fechar(); fechado = true; } };
    addEventListener('keydown', esc, true);
    return {buscar, fechar};
  }

  // Google Places (API nova). A chave fica na planilha (D.cfg.gkey) e vale para todos os usuários.
  // Restrinja a chave no Google Cloud a "fduarteneto1.github.io/*" e à "Places API (New)".
  const GURL = 'https://places.googleapis.com/v1/places';
  const gkey = () => String((D.cfg && D.cfg.gkey) || '').trim();
  let gTok = '';
  const gToken = () => gTok || (gTok = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()));
  const gErro = async r => { const j = await r.json().catch(() => ({})); const m = (j.error && j.error.message) || ('HTTP ' + r.status);
    return new Error('Google: ' + (/not been used|disabled/i.test(m) ? 'ative a "Places API (New)" no Google Cloud.' : /referer|referrer|API key not valid|blocked/i.test(m) ? 'chave inválida ou sem permissão para este site.' : m)); };
  async function gAuto(q){
    const r = await fetch(GURL + ':autocomplete', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Goog-Api-Key': gkey()},
      body: JSON.stringify({input: q, sessionToken: gToken(), languageCode: 'pt-BR', regionCode: 'br', includedRegionCodes: ['br'],
        locationBias: {rectangle: {low: {latitude: -18.1, longitude: -61.7}, high: {latitude: -7.3, longitude: -50.1}}}})}); // Mato Grosso primeiro
    if(!r.ok) throw await gErro(r);
    const j = await r.json();
    return (j.suggestions || []).map(s => s.placePrediction).filter(Boolean);
  }
  async function gDet(id){
    const r = await fetch(GURL + '/' + encodeURIComponent(id) + '?languageCode=pt-BR&regionCode=br&sessionToken=' + encodeURIComponent(gToken()),
      {headers: {'X-Goog-Api-Key': gkey(), 'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents,nationalPhoneNumber,location,primaryTypeDisplayName,types'}});
    gTok = ''; // a sessão do Google termina ao abrir o detalhe
    if(!r.ok) throw await gErro(r);
    const p = await r.json(), comp = t => (p.addressComponents || []).find(c => (c.types || []).includes(t));
    const cid = comp('administrative_area_level_2') || comp('locality'), uf = comp('administrative_area_level_1');
    return {nome: p.displayName && p.displayName.text, end: String(p.formattedAddress || '').replace(/,\s*Brasil$/i, ''), tel: fmtTel(p.nationalPhoneNumber),
      cidade: cid ? cid.longText + (uf ? '-' + uf.shortText : '') : '', gid: p.id, geo: p.location ? (+p.location.latitude).toFixed(6) + ',' + (+p.location.longitude).toFixed(6) : '',
      cat: catDe([p.primaryTypeDisplayName && p.primaryTypeDisplayName.text, (p.types || []).join(' ').replace(/_/g, ' '), p.displayName && p.displayName.text].join(' '))};
  }

  // Receita Federal pelo CNPJ
  async function buscaCnpj(v){
    const c = String(v || '').replace(/\D/g, ''); if(c.length !== 14) return null;
    const end = (tl, lg, nu, co, ba, cep) => [[tit(tl), tit(lg)].filter(Boolean).join(' ') + (nu ? ', ' + nu : ''), tit(co), tit(ba), fmtCep(cep)].filter(Boolean).join(' – ');
    try{
      const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + c);
      if(r.status === 404) return {nao: true};
      if(r.ok){ const j = await r.json();
        return {razao: j.razao_social, fant: tit(j.nome_fantasia), cidade: j.municipio ? tit(j.municipio) + '-' + j.uf : '', tel: fmtTel(j.ddd_telefone_1), email: String(j.email || '').toLowerCase(),
          end: end(j.descricao_tipo_de_logradouro, j.logradouro, j.numero, j.complemento, j.bairro, j.cep), sit: j.descricao_situacao_cadastral, ativ: j.cnae_fiscal_descricao}; }
    }catch(e){}
    const r = await fetch('https://publica.cnpj.ws/cnpj/' + c); // reserva (até 3 consultas por minuto)
    if(r.status === 404 || r.status === 400) return {nao: true};
    if(!r.ok) throw new Error('Consulta de CNPJ indisponível agora (HTTP ' + r.status + ').');
    const j = await r.json(), e = j.estabelecimento || {};
    return {razao: j.razao_social, fant: tit(e.nome_fantasia), cidade: e.cidade ? tit(e.cidade.nome) + '-' + ((e.estado || {}).sigla || '') : '',
      tel: fmtTel(String(e.ddd1 || '') + String(e.telefone1 || '')), email: String(e.email || '').toLowerCase(),
      end: end(e.tipo_logradouro, e.logradouro, e.numero, e.complemento, e.bairro, e.cep), sit: e.situacao_cadastral, ativ: (e.atividade_principal || {}).descricao};
  }

  // liga a busca no formulário do cadastro
  function ligarBuscaForn(m, id, depois){
    const fm = m.querySelector('form'), cp = n => fm.querySelector('[name="' + n + '"]');
    const stEl = m.querySelector('#for-st');
    const msg = (t, erro) => { stEl.textContent = t || ''; stEl.style.color = erro ? '#b42318' : ''; };
    const por = (n, v, forcar) => { const el = cp(n); if(!el || !v) return; if(forcar || !el.value.trim()){ if(el.value !== v){ el.value = v; el.classList.remove('pisca'); void el.offsetWidth; el.classList.add('pisca'); } } };
    const usarCnpj = async v => {
      msg('Consultando o CNPJ na Receita…');
      try{
        const r = await buscaCnpj(v);
        if(!r) return msg('');
        if(r.nao) return msg('CNPJ não encontrado na Receita.', true);
        por('cnpj', fmtCnpj(v), true); por('razao', r.razao, true);
        por('nome', r.fant || tit(r.razao)); por('cidade', r.cidade); por('end', r.end); por('tel', r.tel); por('email', r.email); por('cat', catDe(r.ativ));
        msg('Receita: ' + [r.razao, r.sit, r.ativ].filter(Boolean).join(' · '), r.sit && !/ativa/i.test(r.sit));
      }catch(e){ msg(e.message, true); }
    };
    sugerir(cp('nome'), {
      local: q => {
        const g = [];
        if(q.replace(/\D/g, '').length === 14) g.push({tit: 'Receita Federal', itens: [{t: 'Buscar o CNPJ ' + fmtCnpj(q), s: 'Preenche razão social, endereço, telefone e e-mail', ac: () => { cp('nome').value = ''; usarCnpj(q); }}]});
        if(q.length >= 2){
          const l = vivos(D.forn).filter(x => x.id !== id && casa(x, q)).slice(0, 6);
          if(l.length) g.push({tit: 'Já cadastrados', itens: l.map(x => ({t: x.nome, s: [x.cat, x.cidade, x.cnpj && 'CNPJ ' + x.cnpj].filter(Boolean).join(' · ') + (depois ? '' : ' — abrir cadastro'),
            ac: () => { m.querySelector('[data-c]').click(); if(depois) depois(x); else editarForn(x.id); }}))});
        }
        return g;
      },
      remoto: q => q.length < 3 || /^\d[\d.\/-]*$/.test(q) ? null : !gkey()
        ? {tit: 'Google', fn: async () => [{tit: 'Google', msg: 'Busca no Google desligada. Para ligar: Fornecedores › ⚙ Busca no Google.'}]}
        : {tit: 'No Google', fn: async () => {
            const l = await gAuto(q);
            return [{tit: 'No Google', msg: l.length ? '' : 'Nada encontrado no Google.', itens: l.slice(0, 6).map(p => ({
              t: (p.structuredFormat && p.structuredFormat.mainText && p.structuredFormat.mainText.text) || (p.text && p.text.text),
              s: p.structuredFormat && p.structuredFormat.secondaryText && p.structuredFormat.secondaryText.text,
              ac: async () => {
                msg('Buscando os dados no Google…');
                try{ const d = await gDet(p.placeId);
                  por('nome', d.nome, true); por('end', d.end, true); por('cidade', d.cidade, true); por('tel', d.tel); por('cat', d.cat); por('gid', d.gid, true); por('geo', d.geo, true);
                  msg('Dados do Google preenchidos. Confira e complete com CNPJ e contato.');
                  const c = cp('cnpj'); if(!c.value.trim()) setTimeout(() => c.focus(), 30);
                }catch(e){ msg(e.message, true); }
              }}))}];
          }}
    });
    let ultimo = String((cp('cnpj').value || '')).replace(/\D/g, '');
    cp('cnpj').addEventListener('input', () => { const d = cp('cnpj').value.replace(/\D/g, ''); if(d.length === 14 && d !== ultimo){ ultimo = d; usarCnpj(d); } });
    cp('cnpj').addEventListener('blur', () => { cp('cnpj').value = fmtCnpj(cp('cnpj').value); });
    cp('tel').addEventListener('blur', () => { cp('tel').value = fmtTel(cp('tel').value); });
  }

  function configGoogle(){
    const v = gkey();
    modal('Busca no Google',
      '<div class="hint" style="margin-bottom:8px">Com a chave, ao digitar o nome do fornecedor aparecem as empresas do Google Maps e, ao escolher uma, o endereço, a cidade e o telefone são preenchidos. A chave fica na planilha e vale para todos os usuários.</div>'
      + '<label>Chave de API do Google (Places API New)</label><input name="gkey" value="' + h(v) + '" placeholder="AIza…" autocomplete="off" spellcheck="false">'
      + '<div class="hint" style="margin-top:8px;line-height:1.5">Como criar: console.cloud.google.com › crie um projeto › ative <b>Places API (New)</b> › Credenciais › Criar chave de API.<br>'
      + 'Depois, na chave: <b>Restrições de aplicativo</b> = Sites › <code>https://fduarteneto1.github.io/*</code>; <b>Restrições de API</b> = só Places API (New). Assim ninguém usa a chave fora do Gestão 360º.<br>'
      + 'Sem chave, a busca continua funcionando nos fornecedores cadastrados e pelo CNPJ.</div>',
      d => {
        D.cfg = Object.assign({}, D.cfg, {gkey: String(d.gkey || '').trim(), upd: agora()}); salvar();
        if(!gkey()) return;
        gAuto('Disbral Cuiabá').then(l => alert('Busca do Google funcionando ✓ (' + l.length + ' resultado(s) no teste).'), e => alert(e.message + '\n\nA chave foi salva; confira as configurações no Google Cloud.'));
      });
  }

  // ---------- histórico de preços ----------
  function renderPrecos(){
    const b = $('pre-busca').value.trim().toLowerCase();
    if(b.length < 2){ $('pre-res').innerHTML = ''; return; }
    const pal = b.split(/\s+/);
    const l = [];
    vivos(D.cot).filter(c => c.st !== 'cancelada').forEach(c => { const R = calc(c);
      R.itens.filter(i => pal.every(p => String(i.desc).toLowerCase().includes(p))).forEach(i => c.fs.forEach(f => {
        const p = num(f.p[i.id]); if(ok(p)) l.push({c, i, f, p, esc: R.esc[i.id] === f.id && c.st !== 'aberta', min: R.it[i.id].melhores.includes(f.id)}); })); });
    l.sort((a, b2) => String(b2.c.d).localeCompare(String(a.c.d)) || a.p - b2.p);
    const esc = l.filter(x => x.esc);
    const ps = l.map(x => x.p);
    $('pre-res').innerHTML = !l.length ? '<div class="hint" style="margin-top:10px">Nenhum preço encontrado para esse item.</div>'
      : '<div class="kpis" style="margin-top:10px"><div class="kpi"><span>Último escolhido</span><b>' + (esc[0] ? R$(esc[0].p) : '—') + '</b></div>'
      + '<div class="kpi"><span>Menor já cotado</span><b>' + R$(Math.min(...ps)) + '</b></div><div class="kpi"><span>Propostas</span><b>' + l.length + '</b></div></div>'
      + '<table><tr><th>Data</th><th>Item</th><th>Fornecedor</th><th class="n">Preço unit.</th></tr>'
      + l.slice(0, 120).map(x => '<tr><td>' + dataBR(x.c.d) + '<br><small class="hint">' + numCot(x.c) + '</small></td><td>' + h(x.i.desc) + ' <small class="hint">(' + h(x.i.un || '') + ')</small></td><td>'
        + (x.esc ? '★ ' : '') + h(x.f.nome) + '</td><td class="n"' + (x.min ? ' style="color:#1f7a3d;font-weight:700"' : '') + '>' + R$(x.p) + '</td></tr>').join('') + '</table>';
  }
  $('pre-busca').oninput = render;
  // último preço escolhido de um item parecido (para mostrar no mapa)
  function ultimoPreco(desc, menosId){
    const d = String(desc || '').trim().toLowerCase(); if(d.length < 3) return null;
    let m = null;
    vivos(D.cot).forEach(c => { if(c.id === menosId || c.st === 'aberta' || c.st === 'cancelada' || c.st === 'aprovacao') return; const R = calc(c);
      R.itens.forEach(i => { if(String(i.desc).trim().toLowerCase() !== d) return; const fid = R.esc[i.id], f = c.fs.find(x => x.id === fid); if(!f) return;
        const p = num(f.p[i.id]); if(ok(p) && (!m || c.d > m.d)) m = {p, d: c.d, f: f.nome}; }); });
    return m;
  }

  // ---------- modal genérico ----------
  function modal(tit, corpo, okFn, extra, okTxt){
    const m = document.createElement('div'); m.id = 'cot-modal';
    m.innerHTML = '<form><h2>' + h(tit) + '</h2>' + corpo + '<div class="btns" style="margin-top:14px;display:flex;gap:6px"><button type="submit">' + (okTxt || 'Salvar') + '</button><button type="button" class="sec" data-c>Cancelar</button>'
      + (extra ? '<button type="button" class="sec" data-x style="margin-left:auto;color:#b42318">' + h(extra[0]) + '</button>' : '') + '</div></form>';
    document.body.appendChild(m);
    const fm = m.querySelector('form'), fechar = () => { m.remove(); document.removeEventListener('keydown', esc, true); };
    const esc = e => { if(e.key === 'Escape'){ e.stopPropagation(); fechar(); } };
    document.addEventListener('keydown', esc, true);
    m.querySelector('[data-c]').onclick = fechar;
    m.addEventListener('mousedown', e => { if(e.target === m) fechar(); });
    if(extra) m.querySelector('[data-x]').onclick = () => { if(extra[1]() !== false) fechar(); };
    fm.onsubmit = e => { e.preventDefault(); const d = {}; new FormData(fm).forEach((v, k) => d[k] = v);
      fm.querySelectorAll('input[type=checkbox]').forEach(i => d[i.name] = i.checked); if(okFn(d, fm) !== false) fechar(); };
    const pri = fm.querySelector('input:not([type=hidden]),textarea,select'); if(pri) setTimeout(() => pri.focus(), 30);
    return m;
  }
  async function copiar(t){
    try{ await navigator.clipboard.writeText(t); return true; }
    catch(e){ const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); let r = false; try{ r = document.execCommand('copy'); }catch(x){} ta.remove(); return r; }
  }
  const zap = tel => { let d = String(tel || '').replace(/\D/g, ''); if(d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 ? d : ''; };

  // ---------- mapa (tela cheia) ----------
  let M = null; // elemento do mapa aberto
  function abrirMapa(id, novo){
    const c = achaCot(id); if(!c) return;
    aberta = id;
    if(!M){
      M = document.createElement('div'); M.id = 'cot-mapa';
      document.body.appendChild(M);
      document.addEventListener('keydown', e => { if(e.key === 'Escape' && M && M.style.display !== 'none' && !$('cot-modal')) fecharMapa(); });
    }
    M.style.display = '';
    document.documentElement.style.overflow = 'hidden';
    montarMapa(c);
    if(novo) setTimeout(() => { const t = M.querySelector('[data-k=tit]'); if(t) t.focus(); }, 50);
  }
  function fecharMapa(){
    if(!M) return; const id = aberta; M.style.display = 'none'; aberta = null;
    document.documentElement.style.overflow = '';
    const c = D.cot.find(x => x.id === id && !x.del && !String(x.tit || '').trim() && !x.itens.length && !x.fs.length && x.hist && x.hist.length === 1);
    if(c){ c.del = true; c.upd = agora(); } // cotação criada e deixada em branco
    salvar();
  }
  function mexeu(c, semMapa){ c.upd = agora(); salvar(true); if(!semMapa) atualizar(c); }

  function montarMapa(c){
    const tr = travada(c), dis = tr ? ' disabled' : '', si = SIT[c.st] || SIT.aberta;
    const fs = c.fs;
    M.innerHTML = `
    <div class="topo">
      <h2>${numCot(c)}</h2><span class="cot-tag" style="color:${si.c}">${si.n}</span>
      <span class="hint" id="cm-salvo"></span>
      <span class="esp"></span>
      <div class="btns">
        <button class="sec" data-a="pedir">✉ Pedir cotação</button>
        <button class="sec" data-a="imp">🖨 Imprimir mapa</button>
        <button class="sec" data-a="dup">Duplicar</button>
        <button class="sec" data-a="del" style="color:#b42318">Excluir</button>
        <button data-a="fechar">Fechar ✕</button>
      </div>
    </div>
    <div class="corpo">
      ${tr ? '<div class="trava">🔒 ' + (c.st === 'cancelada' ? 'Cotação cancelada.' : 'Cotação ' + si.n.toLowerCase() + (c.apr ? ' por ' + h(c.apr) + ' em ' + dataBR(c.aprd) : '') + '. O mapa está travado para edição.')
        + ' <button class="sec mini" data-a="reabrir">Reabrir para edição</button></div>' : ''}
      <div class="card">
        <h2>Dados da cotação</h2>
        <div class="cab">
          <div><label>Título / o que está sendo comprado</label><input data-k="tit" value="${h(c.tit)}" placeholder="Ex.: Filtros e óleo para revisão dos caminhões"${dis}></div>
          <div><label>Obra / centro de custo</label><select data-k="o"${dis}>${optLocais(c.o, '— escolha —')}</select></div>
          <div><label>Solicitante</label><input data-k="sol" value="${h(c.sol)}" placeholder="Quem pediu" list="cot-sols"${dis}></div>
          <div><label>Data</label><input type="date" data-k="d" value="${h(c.d)}"${dis}></div>
          <div><label>Responder até</label><input type="date" data-k="prazo" value="${h(c.prazo)}"${dis}></div>
        </div>
        <datalist id="cot-sols">${[...new Set(vivos(D.cot).map(x => x.sol).filter(Boolean))].map(x => '<option value="' + h(x) + '">').join('')}</datalist>
        <div class="hint" style="margin-top:6px">Comprador: <b>${h(c.u || '—')}</b></div>
      </div>

      <div class="card">
        <h2>Mapa de cotação</h2>
        <div class="wrap"><table class="m" id="cm-t">
          <thead>
            <tr><th class="fix" rowspan="2" style="left:0">#</th><th rowspan="2" style="min-width:240px;text-align:left">Item / descrição</th><th rowspan="2">Un</th><th rowspan="2">Qtd</th>
              ${fs.map(f => '<th class="fh" colspan="2">' + h(f.nome) + (tr ? '' : '<button class="x" data-rf="' + f.id + '" title="Tirar da cotação">×</button>')
                + '<small>' + h([(achaForn(f.id) || {}).cidade, (achaForn(f.id) || {}).tel].filter(Boolean).join(' · ')) + '&nbsp;</small></th>').join('')}
              ${fs.length > 1 ? '<th rowspan="2" style="min-width:150px">Comprar de</th>' : ''}
              ${tr ? '' : '<th rowspan="2" style="width:30px"></th>'}</tr>
            <tr>${fs.map(() => '<th>Preço unit.</th><th>Total</th>').join('')}</tr>
          </thead>
          <tbody id="cm-b">
            ${c.itens.map((i, k) => linhaItem(c, i, k, tr)).join('')}
          </tbody>
          <tfoot id="cm-f"></tfoot>
        </table></div>
        ${tr ? '' : `<div class="linhab">
          <button class="sec mini" data-a="item">+ Item</button>
          <button class="sec mini" data-a="colar">📋 Colar itens do Excel</button>
          <span style="width:12px"></span>
          <input id="cm-addf" style="width:280px;max-width:100%" placeholder="+ Adicionar fornecedor (digite o nome)…">
          <span class="hint">Deixe o preço em branco quando o fornecedor não cotou o item. Enter desce para o próximo item.</span>
        </div>`}
      </div>

      <div class="card">
        <h2>Resultado</h2>
        <div id="cm-res"></div>
      </div>

      <div class="duas">
        <div class="card">
          <h2>Pedido por fornecedor</h2>
          <div id="cm-ped"></div>
        </div>
        <div class="card">
          <h2>Justificativa e aprovação</h2>
          <label>Justificativa da escolha</label>
          <textarea data-k="just" placeholder="Ex.: menor preço global; fornecedor B tem entrega em 2 dias na obra; fornecedor C não cotou todos os itens"${dis}>${h(c.just)}</textarea>
          <label>Observação interna</label>
          <textarea data-k="obs" style="min-height:40px" placeholder="Opcional"${dis}>${h(c.obs)}</textarea>
          <div class="linhab" id="cm-fluxo"></div>
          <label style="margin-top:14px">Histórico</label>
          <div class="hist">${(c.hist || []).slice().reverse().map(x => dataBR(x.q) + ' ' + String(x.q).slice(11, 16) + ' · ' + h(x.u || '—') + ' · ' + h(x.a)).join('<br>')}</div>
        </div>
      </div>
    </div>`;

    // cabeçalho fixo da 2ª linha do thead
    const h1 = M.querySelector('#cm-t thead tr'); if(h1) M.querySelector('#cm-t').style.setProperty('--cot-h1', h1.getBoundingClientRect().height + 'px');

    // campos do cabeçalho e textos
    M.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => { c[k] = el.value; mexeu(c, k !== 'o'); });
    });
    // itens e preços
    ligarCorpo(c);
    // botões
    M.querySelectorAll('[data-a]').forEach(b => b.onclick = () => acao(c, b.dataset.a));
    M.querySelectorAll('[data-rf]').forEach(b => b.onclick = () => {
      const f = c.fs.find(x => x.id === b.dataset.rf); if(!f) return;
      const n = Object.values(f.p || {}).filter(v => ok(num(v))).length;
      if(n && !confirm('Tirar ' + f.nome + ' da cotação? Os ' + n + ' preço(s) lançados dele serão apagados.')) return;
      c.fs = c.fs.filter(x => x !== f); if(c.glob === f.id) c.glob = '';
      registrar(c, 'Fornecedor retirado: ' + f.nome); mexeu(c, true); montarMapa(c);
    });
    const af = $('cm-addf');
    if(af){
      const add = f => { if(c.fs.some(x => x.id === f.id)) return; c.fs.push({id: f.id, nome: f.nome, frete: 0, tf: 'CIF', desc: 0, prazo: '', pag: '', val: '', obs: '', p: {}}); registrar(c, 'Fornecedor incluído: ' + f.nome); mexeu(c, true); montarMapa(c);
        setTimeout(() => { const n = $('cm-addf'); if(n) n.focus(); }, 30); };
      sugerir(af, {local: q => {
        const l = vivos(D.forn).filter(f => !c.fs.some(x => x.id === f.id) && (!q || casa(f, q))).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).slice(0, 40);
        return [{tit: l.length ? 'Cadastrados' : '', msg: !l.length && q ? 'Nenhum cadastrado com esse nome.' : '', itens: l.map(f => ({t: f.nome, s: [f.cat, f.cidade].filter(Boolean).join(' · '), ac: () => { af.value = ''; add(f); }}))},
          {itens: [{t: q ? '➕ Cadastrar "' + q + '" como fornecedor novo' : '➕ Cadastrar fornecedor novo…', s: 'Busca no Google e pelo CNPJ', novo: true, ac: () => { af.value = ''; af.blur(); editarForn(null, add, q); }}]}];
      }});
    }
    atualizar(c);
  }

  function linhaItem(c, i, k, tr){
    const dis = tr ? ' disabled' : '';
    const ult = ultimoPreco(i.desc, c.id);
    return '<tr data-i="' + i.id + '"><td class="num-i fix">' + (k + 1) + '</td>'
      + '<td><input data-ik="desc" value="' + h(i.desc) + '" placeholder="Descrição do item"' + dis + '>'
      + (ult ? '<span class="ult">último preço: ' + R$(ult.p) + ' · ' + h(ult.f) + ' · ' + dataBR(ult.d) + '</span>' : '') + '</td>'
      + '<td><input data-ik="un" value="' + h(i.un) + '" list="cot-un" style="width:62px"' + dis + '></td>'
      + '<td><input data-ik="q" value="' + h(i.q == null ? '' : fqIn(i.q)) + '" style="width:76px;text-align:right"' + dis + '></td>'
      + c.fs.map(f => '<td data-c="' + f.id + '"><input class="pr" data-p="' + f.id + '" inputmode="decimal" value="' + h(prIn(f.p[i.id])) + '" placeholder="—"' + dis + '></td><td class="tt" data-t="' + f.id + '"></td>').join('')
      + (c.fs.length > 1 ? '<td><select data-v' + dis + ' style="min-width:140px"></select></td>' : '')
      + (tr ? '' : '<td><button class="x" data-ri title="Excluir item">×</button></td>') + '</tr>';
  }
  const prIn = v => ok(num(v)) ? f2(num(v)) : '';
  const fqIn = v => ok(num(v)) ? fq(num(v)) : String(v || '');

  function ligarCorpo(c){
    if(!document.getElementById('cot-un')){
      const dl = document.createElement('datalist'); dl.id = 'cot-un'; dl.innerHTML = UNID.map(u => '<option value="' + u + '">').join(''); document.body.appendChild(dl);
    }
    const tb = $('cm-b');
    tb.querySelectorAll('tr[data-i]').forEach(tr => {
      const i = c.itens.find(x => x.id === tr.dataset.i); if(!i) return;
      tr.querySelectorAll('[data-ik]').forEach(el => {
        el.addEventListener('input', () => { i[el.dataset.ik] = el.value; mexeu(c); });
        if(el.dataset.ik === 'q') el.addEventListener('blur', () => { el.value = fqIn(i.q); });
      });
      tr.querySelectorAll('input[data-p]').forEach(el => {
        const f = c.fs.find(x => x.id === el.dataset.p);
        el.addEventListener('input', () => { const v = num(el.value); if(ok(v)) f.p[i.id] = v; else delete f.p[i.id]; mexeu(c); });
        el.addEventListener('blur', () => { el.value = prIn(f.p[i.id]); });
        el.addEventListener('focus', () => el.select());
      });
      const sv = tr.querySelector('select[data-v]');
      if(sv) sv.onchange = () => {
        c.venc = c.venc || {};
        if(c.modo !== 'manual'){ const R = calc(c); c.itens.forEach(x => c.venc[x.id] = R.esc[x.id] || ''); c.modo = 'manual'; }
        c.venc[i.id] = sv.value; mexeu(c);
      };
      const ri = tr.querySelector('[data-ri]');
      if(ri) ri.onclick = () => {
        if((i.desc || c.fs.some(f => ok(num(f.p[i.id])))) && !confirm('Excluir o item "' + (i.desc || 'sem descrição') + '"?')) return;
        c.itens = c.itens.filter(x => x !== i); c.fs.forEach(f => delete f.p[i.id]); mexeu(c, true); montarMapa(c);
      };
    });
    // Enter desce na mesma coluna; na última linha cria um item novo (coluna descrição)
    tb.addEventListener('keydown', e => {
      if(e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const td = e.target.closest('td'), tr = td.parentElement, col = [...tr.children].indexOf(td);
      const prox = tr.nextElementSibling;
      if(prox){ const inp = prox.children[col] && prox.children[col].querySelector('input'); if(inp) inp.focus(); }
      else if(e.target.dataset.ik === 'desc' && !travada(c)){ acao(c, 'item'); }
    });
  }

  // atualiza totais, destaques e resultado sem redesenhar os campos (para não perder o foco)
  function atualizar(c){
    if(!M || aberta !== c.id) return;
    const R = calc(c), tr = travada(c);
    const cs = $('cm-salvo'); if(cs) cs.textContent = localStorage.getItem(PEND) ? 'salvando…' : '';
    $('cm-b').querySelectorAll('tr[data-i]').forEach(row => {
      const i = c.itens.find(x => x.id === row.dataset.i), r = R.it[i.id];
      c.fs.forEach(f => {
        const p = num(f.p[i.id]), td = row.querySelector('td[data-c="' + f.id + '"]'), tt = row.querySelector('td[data-t="' + f.id + '"]');
        const v = R.ef(f, i), min = r && v != null && r.n > 1 && r.melhores.includes(f.id), esc = r && R.esc[i.id] === f.id && c.fs.length > 1;
        td.classList.toggle('min', !!min); tt.classList.toggle('min', !!min);
        td.classList.toggle('esc', !!esc); tt.classList.toggle('esc', !!esc);
        td.classList.toggle('alto', !!(r && v != null && r.n > 2 && v - r.max > -0.000001 && r.max > r.min));
        tt.textContent = ok(p) && r ? f2(p * r.q) : '';
        tt.title = r && v != null && r.min != null && v > r.min ? '+' + pct((v / r.min - 1) * 100) + ' sobre o menor' : '';
      });
      const sv = row.querySelector('select[data-v]');
      if(sv){
        const opts = '<option value="">— sem preço —</option>' + c.fs.filter(f => R.ef(f, i) != null).map(f => '<option value="' + f.id + '">' + h(f.nome) + '</option>').join('');
        if(sv.dataset.o !== opts){ sv.innerHTML = opts; sv.dataset.o = opts; }
        sv.value = R.esc[i.id] || '';
      }
    });
    // rodapé: totais e condições comerciais
    const n = R.itens.length;
    const melhorTot = Math.min(...c.fs.filter(f => R.f[f.id].completo).map(f => R.f[f.id].tot), Infinity);
    const span = '<th colspan="4" class="fix" style="left:0">';
    const ultCol = (c.fs.length > 1 ? '<td></td>' : '') + (tr ? '' : '<td></td>');
    const campo = (f, k, ph, tipo) => '<td colspan="2"><input data-fk="' + k + '" data-f="' + f.id + '" value="' + h(k === 'frete' ? prIn(f.frete) : f[k] || '') + '" placeholder="' + ph + '"' + (tipo ? ' type="' + tipo + '"' : '') + (k === 'frete' || k === 'desc' ? ' inputmode="decimal" style="text-align:right"' : '') + (tr ? ' disabled' : '') + '></td>';
    const foot = $('cm-f');
    const focado = document.activeElement && foot.contains(document.activeElement) ? document.activeElement : null;
    if(!focado || foot.dataset.n !== c.fs.map(f => f.id).join()){
      foot.dataset.n = c.fs.map(f => f.id).join();
      foot.innerHTML = !c.fs.length ? '<tr><td colspan="6" class="hint" style="padding:12px">Adicione os fornecedores pelo seletor "+ Adicionar fornecedor" abaixo do mapa.</td></tr>' :
        '<tr data-r="sub">' + span + 'Subtotal</th>' + c.fs.map(f => '<td colspan="2" class="tt" data-s="' + f.id + '"></td>').join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Desconto (%)</th>' + c.fs.map(f => campo(f, 'desc', '0')).join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Frete</th>' + c.fs.map(f => '<td colspan="2"><div style="display:flex;gap:4px"><select data-fk="tf" data-f="' + f.id + '" style="width:auto"' + (tr ? ' disabled' : '') + '>'
          + ['CIF', 'FOB'].map(t => '<option' + (f.tf === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>'
          + '<input data-fk="frete" data-f="' + f.id + '" value="' + h(prIn(f.frete)) + '" placeholder="R$ 0,00" inputmode="decimal" style="text-align:right"' + (tr ? ' disabled' : '') + '></div></td>').join('') + ultCol + '</tr>'
        + '<tr class="tot">' + span + 'Total da proposta</th>' + c.fs.map(f => '<td colspan="2" class="tt" data-tot="' + f.id + '"></td>').join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Itens cotados</th>' + c.fs.map(f => '<td colspan="2" style="text-align:center" data-n="' + f.id + '"></td>').join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Prazo de entrega</th>' + c.fs.map(f => campo(f, 'prazo', 'Ex.: 3 dias úteis')).join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Condição de pagamento</th>' + c.fs.map(f => '<td colspan="2"><input data-fk="pag" data-f="' + f.id + '" value="' + h(f.pag || '') + '" list="cot-pag" placeholder="Ex.: 28 dias"' + (tr ? ' disabled' : '') + '></td>').join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Validade da proposta</th>' + c.fs.map(f => campo(f, 'val', '', 'date')).join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Observação / marca</th>' + c.fs.map(f => campo(f, 'obs', 'Ex.: marca, nº do orçamento')).join('') + ultCol + '</tr>';
      if(!$('cot-pag')){ const dl = document.createElement('datalist'); dl.id = 'cot-pag'; dl.innerHTML = PAG.map(u => '<option value="' + u + '">').join(''); document.body.appendChild(dl); }
      foot.querySelectorAll('[data-fk]').forEach(el => {
        const f = c.fs.find(x => x.id === el.dataset.f), k = el.dataset.fk;
        el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
          if(k === 'frete' || k === 'desc'){ const v = num(el.value); f[k] = isFinite(v) && v >= 0 ? Math.min(k === 'desc' ? 100 : 1e12, v) : 0; } else f[k] = el.value;
          mexeu(c);
        });
        if(k === 'frete') el.addEventListener('blur', () => { el.value = prIn(f.frete); });
      });
    }
    c.fs.forEach(f => {
      const x = R.f[f.id];
      const s = foot.querySelector('[data-s="' + f.id + '"]'); if(s) s.textContent = R$(x.sub);
      const t = foot.querySelector('[data-tot="' + f.id + '"]'); if(t){ t.textContent = x.n ? R$(x.tot) : '—'; t.classList.toggle('best', x.completo && Math.abs(x.tot - melhorTot) < 0.005 && c.fs.length > 1); }
      const nn = foot.querySelector('[data-n="' + f.id + '"]'); if(nn){ nn.textContent = x.n + ' de ' + n; nn.style.color = x.n < n ? '#b26a00' : ''; }
    });
    renderResultado(c, R);
  }

  function renderResultado(c, R){
    const tr = travada(c);
    const nf = id => (c.fs.find(f => f.id === id) || {}).nome || '';
    const pi = R.porItem, un = R.unico;
    let html = '';
    if(!R.itens.length || !c.fs.length){
      html = '<div class="hint">Lance os itens e pelo menos dois fornecedores para comparar as propostas.</div>';
    } else {
      const ver = R.final.tot;
      html = '<div class="res">'
        + '<div class="bx ver"><span>Compra escolhida</span><b>' + R$(ver) + '</b><small>' + (R.final.usados.length ? R.final.usados.map(nf).map(h).join(' + ') : '—') + '</small></div>'
        + '<div class="bx"><span>Menor preço por item</span><b>' + R$(pi.tot) + '</b><small>' + pi.usados.length + ' fornecedor(es), com frete' + (pi.falta.length ? ' · ' + pi.falta.length + ' item(ns) sem preço' : '') + '</small></div>'
        + '<div class="bx"><span>Tudo num fornecedor só</span><b>' + (un ? R$(un.tot) : '—') + '</b><small>' + (un ? h(un.f.nome) : 'ninguém cotou todos os itens') + '</small></div>'
        + '<div class="bx"><span>Economia sobre a média das propostas</span><b style="color:' + (R.ecoMed > 0.005 ? '#1f7a3d' : 'inherit') + '">' + R$(R.ecoMed) + '</b><small>' + pct(R.ecoPct) + ' · sobre o maior preço: ' + R$(R.ecoMax) + '</small></div>'
        + '</div>';
      // sugestão
      if(un && !pi.falta.length && Math.abs(un.tot - pi.tot) > 0.005){
        html += un.tot < pi.tot
          ? '<div class="sug">💡 Comprar tudo de <b>' + h(un.f.nome) + '</b> sai <b>' + R$(pi.tot - un.tot) + '</b> mais barato do que dividir por menor preço por item (o frete pesa).</div>'
          : '<div class="sug">💡 Dividir a compra pelo menor preço de cada item economiza <b>' + R$(un.tot - pi.tot) + '</b> em relação a comprar tudo de ' + h(un.f.nome) + ' (já com frete).</div>';
      } else if(un && !pi.falta.length) html += '<div class="sug">💡 Comprar tudo de <b>' + h(un.f.nome) + '</b> já é o menor preço em todos os itens.</div>';
      if(R.semPreco) html += '<div class="sug al">⚠ ' + R.semPreco + ' item(ns) sem nenhum preço ainda.</div>';
      const comp = c.fs.filter(f => !R.f[f.id].completo && R.f[f.id].n);
      if(comp.length) html += '<div class="hint" style="margin-top:6px">Não cotaram todos os itens: ' + comp.map(f => h(f.nome) + ' (' + R.f[f.id].n + '/' + R.itens.length + ')').join(', ') + '.</div>';
      // modo da escolha
      html += '<label style="margin-top:12px">Como escolher</label><div class="seg modos" id="cm-modo">'
        + '<button data-m="auto"' + (R.modo === 'auto' ? ' class="on"' : '') + '>Automático (mais barato)</button>'
        + '<button data-m="item"' + (R.modo === 'item' ? ' class="on"' : '') + '>Menor preço por item</button>'
        + (un || c.fs.length ? '<button data-m="unico"' + (R.modo === 'unico' ? ' class="on"' : '') + '>Um fornecedor só</button>' : '')
        + '<button data-m="manual"' + (R.modo === 'manual' ? ' class="on"' : '') + '>Escolher item a item</button></div>'
        + (R.modo === 'unico' || c.modo === 'unico' ? '<select id="cm-glob" style="margin-top:6px"><option value="">— escolha o fornecedor —</option>' + c.fs.map(f => '<option value="' + f.id + '"' + (f.id === c.glob ? ' selected' : '') + '>' + h(f.nome) + ' · ' + R$(R.f[f.id].tot) + (R.f[f.id].completo ? '' : ' (cotou ' + R.f[f.id].n + '/' + R.itens.length + ')') + '</option>').join('') + '</select>' : '')
        + (R.modo === 'manual' ? '<div class="hint" style="margin-top:4px">Escolha na coluna "Comprar de" do mapa.</div>' : '');
      if(R.final.falta.length && R.modo === 'unico') html += '<div class="sug al">⚠ ' + h(nf(c.glob)) + ' não cotou ' + R.final.falta.length + ' item(ns): ' + R.final.falta.map(i => h(i.desc)).join(', ') + '.</div>';
    }
    $('cm-res').innerHTML = html;
    M.querySelectorAll('#cm-modo button').forEach(b => { b.disabled = tr; b.onclick = () => {
      const m = b.dataset.m;
      if(m === 'item'){ c.modo = 'manual'; c.venc = {}; R.itens.forEach(i => c.venc[i.id] = R.it[i.id].melhores[0] || ''); }
      else if(m === 'manual'){ c.venc = {}; R.itens.forEach(i => c.venc[i.id] = R.esc[i.id] || ''); c.modo = 'manual'; }
      else if(m === 'unico'){ c.modo = 'unico'; if(!c.glob) c.glob = (R.unico && R.unico.f.id) || (c.fs[0] || {}).id || ''; }
      else c.modo = 'auto';
      mexeu(c);
    }; });
    // "Menor preço por item" fica marcado quando a escolha manual bate com o menor de cada item
    if(R.modo === 'manual' && R.itens.every(i => !R.it[i.id].melhores.length || R.it[i.id].melhores.includes(R.esc[i.id]))){
      M.querySelectorAll('#cm-modo button').forEach(b => b.classList.toggle('on', b.dataset.m === 'item'));
    }
    const g = $('cm-glob'); if(g){ g.disabled = tr; g.onchange = () => { c.glob = g.value; c.modo = 'unico'; mexeu(c); }; }

    // pedido por fornecedor
    const ped = R.final.usados.map(fid => {
      const f = c.fs.find(x => x.id === fid), its = R.itens.filter(i => R.esc[i.id] === fid);
      const tot = its.reduce((s, i) => s + R.ef(f, i) * R.it[i.id].q, 0) + R.f[fid].fr;
      return {f, its, tot};
    });
    $('cm-ped').innerHTML = !ped.length ? '<div class="hint">Assim que houver preços, aparece aqui o que comprar de cada fornecedor.</div>'
      : ped.map(p => '<div class="ped"><b>' + h(p.f.nome) + '</b><b class="t">' + R$(p.tot) + '</b><ul>'
        + p.its.map(i => '<li>' + h(i.desc) + ' — ' + fq(i.q) + ' ' + h(i.un || '') + ' × ' + R$(R.ef(p.f, i)) + '</li>').join('')
        + (R.f[p.f.id].fr ? '<li>Frete ' + h(p.f.tf || '') + ': ' + R$(R.f[p.f.id].fr) + '</li>' : '') + '</ul>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="sec mini" data-pf="' + p.f.id + '" data-t="zap">Pedido no WhatsApp</button><button class="sec mini" data-pf="' + p.f.id + '" data-t="cp">Copiar texto</button>'
        + '<span class="hint">' + [p.f.prazo && 'Entrega: ' + h(p.f.prazo), p.f.pag && 'Pagto: ' + h(p.f.pag)].filter(Boolean).join(' · ') + '</span></div></div>').join('')
        + '<div class="ped" style="background:var(--head,#f6f6f7)"><b>Total da compra</b><b class="t">' + R$(R.final.tot) + '</b></div>';
    $('cm-ped').querySelectorAll('[data-pf]').forEach(b => b.onclick = async () => {
      const p = ped.find(x => x.f.id === b.dataset.pf); if(!p) return;
      const o = c.o ? nomeLocal(c.o) : '';
      const t = '*Pedido de compra – BKP Construtora*\nRef.: ' + numCot(c) + (c.tit ? ' – ' + c.tit : '') + (o ? '\nObra: ' + o : '') + '\n\n'
        + p.its.map((i, k) => (k + 1) + '. ' + i.desc + ' — ' + fq(i.q) + ' ' + (i.un || '') + ' × ' + R$(R.ef(p.f, i)) + ' = ' + R$(R.ef(p.f, i) * R.it[i.id].q)).join('\n')
        + (R.f[p.f.id].fr ? '\nFrete (' + (p.f.tf || '') + '): ' + R$(R.f[p.f.id].fr) : '')
        + '\n\n*Total: ' + R$(p.tot) + '*' + (p.f.pag ? '\nPagamento: ' + p.f.pag : '') + (p.f.prazo ? '\nEntrega: ' + p.f.prazo : '')
        + '\n\nPor favor, confirme o recebimento do pedido e a data de entrega. Faturar para BKP Construtora.';
      if(b.dataset.t === 'zap'){ const n = zap((achaForn(p.f.id) || {}).tel); window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(t), '_blank'); }
      else { b.textContent = (await copiar(t)) ? 'Copiado ✓' : 'Não deu para copiar'; setTimeout(() => b.textContent = 'Copiar texto', 1800); }
    });

    // fluxo de aprovação
    const fl = $('cm-fluxo'), bts = [];
    if(c.st === 'aberta') bts.push(['aprovacao', 'Enviar para aprovação', 1]);
    if(c.st === 'aberta' || c.st === 'aprovacao') bts.push(['aprovada', '✓ Aprovar compra', c.st === 'aprovacao' ? 1 : 0]);
    if(c.st === 'aprovacao') bts.push(['aberta', 'Voltar para cotação', 0]);
    if(c.st === 'aprovada') bts.push(['pedido', 'Marcar pedido emitido', 1]);
    if(c.st !== 'cancelada' && c.st !== 'pedido') bts.push(['cancelada', 'Cancelar cotação', 0, 1]);
    if(c.st === 'cancelada') bts.push(['aberta', 'Reativar cotação', 0]);
    fl.innerHTML = bts.map(b => '<button data-st="' + b[0] + '"' + (b[2] ? '' : ' class="sec"') + (b[3] ? ' style="color:#b42318"' : '') + '>' + b[1] + '</button>').join('');
    fl.querySelectorAll('[data-st]').forEach(b => b.onclick = () => mudarSit(c, b.dataset.st));
  }

  function mudarSit(c, s){
    const R = calc(c);
    if(s === 'aprovacao' || s === 'aprovada'){
      const prob = [];
      if(!R.itens.length) prob.push('não há itens');
      if(R.final.falta.length) prob.push(R.final.falta.length + ' item(ns) sem fornecedor escolhido');
      if(c.fs.length < 3) prob.push('só ' + c.fs.length + ' fornecedor(es) cotado(s) (o usual são 3)');
      const caro = R.final.usados.length && R.itens.some(i => R.esc[i.id] && !R.it[i.id].melhores.includes(R.esc[i.id]));
      if(caro && !String(c.just || '').trim()) prob.push('a escolha não é o menor preço em todos os itens e não há justificativa');
      if(!R.itens.length) return alert('Lance os itens antes.');
      if(prob.length && !confirm('Atenção:\n• ' + prob.join('\n• ') + '\n\nContinuar mesmo assim?')) return;
    }
    if(s === 'cancelada' && !confirm('Cancelar a ' + numCot(c) + '?')) return;
    if(s === 'aprovada'){ c.apr = usuario(); c.aprd = hoje(); }
    if(s === 'aberta'){ c.apr = ''; c.aprd = ''; }
    if(s === 'pedido') c.pedd = hoje();
    // congela a escolha ao aprovar, para o resultado não mudar se alguém reabrir e mexer
    if(s === 'aprovada' && c.modo === 'auto'){ c.venc = {}; R.itens.forEach(i => c.venc[i.id] = R.esc[i.id] || ''); c.modo = 'manual'; }
    c.st = s; registrar(c, (SIT[s] || {}).n + (s === 'aprovada' ? ' · ' + R$(R.final.tot) : ''));
    mexeu(c, true); montarMapa(c);
  }

  function acao(c, a){
    if(a === 'fechar') return fecharMapa();
    if(a === 'item'){
      const i = {id: uid(), desc: '', un: 'un', q: 1, obs: ''}; c.itens.push(i); mexeu(c, true); montarMapa(c);
      const ins = M.querySelectorAll('#cm-b tr:last-child input[data-ik=desc]'); if(ins[0]) ins[0].focus();
      return;
    }
    if(a === 'colar') return modal('Colar itens do Excel',
      '<div class="hint" style="margin-bottom:6px">Copie da planilha as colunas <b>Descrição · Unidade · Quantidade</b> (nessa ordem) e cole aqui. Uma linha por item. Também aceita "descrição ; un ; qtd".</div>'
      + '<textarea name="t" placeholder="Filtro de óleo PSL 55\tun\t6&#10;Óleo 15W40\tL\t40"></textarea>',
      d => {
        const novos = String(d.t || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
          let p = l.split(/\t|;/).map(x => x.trim());
          if(p.length === 1){ const m = l.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Z²³]{1,6})?$/); if(m) p = [m[1], m[3] || 'un', m[2]]; }
          let [desc, un, q] = p;
          if(p.length === 2 && isFinite(num(p[1]))){ un = 'un'; q = p[1]; }
          if(un && isFinite(num(un)) && q && !isFinite(num(q))){ const t = un; un = q; q = t; }
          return {id: uid(), desc: desc || '', un: un || 'un', q: isFinite(num(q)) ? num(q) : 1, obs: ''};
        }).filter(i => i.desc && !/^descri/i.test(i.desc));
        if(!novos.length) return false;
        c.itens = c.itens.filter(i => String(i.desc).trim()).concat(novos); registrar(c, novos.length + ' item(ns) colados'); mexeu(c, true); montarMapa(c);
      }, null, 'Incluir itens');
    if(a === 'pedir') return pedirCotacao(c);
    if(a === 'imp') return imprimir(c);
    if(a === 'dup'){ const n = novaCotacao(c); salvar(true); abrirMapa(n.id); return; }
    if(a === 'del'){
      if(!confirm('Excluir a ' + numCot(c) + (c.tit ? ' (' + c.tit + ')' : '') + '? Ela some da lista e do histórico de preços.')) return;
      c.del = true; c.upd = agora(); fecharMapa(); render(); return;
    }
    if(a === 'reabrir'){
      if(!confirm('Reabrir a ' + numCot(c) + ' para edição? A situação volta para "Em cotação" e a aprovação é desfeita.')) return;
      c.st = 'aberta'; c.apr = ''; c.aprd = ''; registrar(c, 'Reaberta para edição'); mexeu(c, true); montarMapa(c);
    }
  }

  // ---------- pedir cotação ao fornecedor ----------
  function pedirCotacao(c){
    const its = c.itens.filter(i => String(i.desc).trim());
    if(!its.length) return alert('Lance os itens antes de pedir a cotação.');
    const o = c.o ? nomeLocal(c.o) : '';
    const texto = nome => 'Olá' + (nome ? ', ' + nome : '') + '! Aqui é da *BKP Construtora*' + (c.u ? ' (' + c.u + ')' : '') + '.\n'
      + 'Poderia nos passar orçamento dos itens abaixo?' + (o ? '\nEntrega: ' + o : '') + '\n\n'
      + its.map((i, k) => (k + 1) + '. ' + i.desc + ' — ' + fq(i.q) + ' ' + (i.un || '')).join('\n')
      + '\n\nFavor informar: preço unitário, frete (CIF ou FOB), prazo de entrega, condição de pagamento e validade da proposta.'
      + (c.prazo ? '\nPrazo para resposta: ' + dataBR(c.prazo) + '.' : '') + '\nRef.: ' + numCot(c) + '\n\nObrigado!';
    const fsl = c.fs.map(f => ({f, cad: achaForn(f.id) || {}}));
    const m = modal('Pedir cotação aos fornecedores',
      '<div class="hint" style="margin-bottom:6px">Texto pronto com os ' + its.length + ' itens. Envie para cada fornecedor pelo WhatsApp ou e-mail.</div>'
      + '<textarea name="t" style="min-height:220px">' + h(texto('')) + '</textarea>'
      + (fsl.length ? '<label>Enviar para</label>' + fsl.map(x => '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line2,#f2f2f3)"><span style="flex:1">' + h(x.f.nome) + '<br><small class="hint">' + h([x.cad.contato, x.cad.tel, x.cad.email].filter(Boolean).join(' · ') || 'sem contato no cadastro') + '</small></span>'
        + '<button type="button" class="sec mini" data-z="' + x.f.id + '">WhatsApp</button>' + (x.cad.email ? '<button type="button" class="sec mini" data-e="' + x.f.id + '">E-mail</button>' : '') + '</div>').join('')
        : '<div class="hint">Inclua os fornecedores no mapa para enviar direto a cada um.</div>'),
      (d, fm) => { const b = fm.querySelector('button[type=submit]'); copiar(d.t).then(r => { b.textContent = r ? 'Copiado ✓' : 'Não deu para copiar'; setTimeout(() => b.textContent = 'Copiar texto', 1500); }); return false; },
      null, 'Copiar texto');
    const ta = m.querySelector('textarea');
    const personal = x => ta.value.replace(/^Olá[^!]*!/, 'Olá' + (x.cad.contato ? ', ' + x.cad.contato.split(' ')[0] : '') + '!');
    m.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const x = fsl.find(y => y.f.id === b.dataset.z); window.open('https://wa.me/' + zap(x.cad.tel) + '?text=' + encodeURIComponent(personal(x)), '_blank'); b.textContent = 'WhatsApp ✓'; });
    m.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { const x = fsl.find(y => y.f.id === b.dataset.e);
      location.href = 'mailto:' + encodeURIComponent(x.cad.email) + '?subject=' + encodeURIComponent('Solicitação de orçamento – BKP Construtora – ' + numCot(c)) + '&body=' + encodeURIComponent(personal(x).replace(/\*/g, '')); b.textContent = 'E-mail ✓'; });
  }

  // ---------- impressão do mapa ----------
  function imprimir(c){
    const R = calc(c), fs = c.fs, base = location.href.replace(/[^/]*$/, ''), si = SIT[c.st] || SIT.aberta;
    const nf = id => (fs.find(f => f.id === id) || {}).nome || '';
    const larg = fs.length > 4 ? 'font-size:8.5px' : fs.length > 3 ? 'font-size:9.5px' : '';
    const linhaCond = (rot, fn) => '<tr class="cond"><td colspan="4" class="r">' + rot + '</td>' + fs.map(f => '<td colspan="2" class="c">' + fn(f) + '</td>').join('') + '</tr>';
    const melhorTot = Math.min(...fs.filter(f => R.f[f.id].completo).map(f => R.f[f.id].tot), Infinity);
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Mapa de cotação ${numCot(c)}</title>
<style>
 @page{size:A4 landscape;margin:10mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#232323;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #C05621;padding-bottom:7px;margin-bottom:8px}
 .cab img{height:32px} .cab h1{font-size:16px;margin:0} .cab span{font-size:9.5px;color:#8e8e8e;letter-spacing:.1em;text-transform:uppercase}
 .cab .nr{margin-left:auto;text-align:right} .cab .nr b{font-size:15px;display:block}
 .info{display:grid;grid-template-columns:2fr 1.4fr 1fr 1fr 1fr;gap:4px 14px;margin-bottom:8px;border:1px solid #e3e3e5;border-radius:6px;padding:6px 9px}
 .info div span{display:block;font-size:8px;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em;font-weight:700} .info div b{font-size:11px}
 table{width:100%;border-collapse:collapse;${larg}} tr{page-break-inside:avoid}
 th{background:#f1f1f3;font-size:8.5px;text-transform:uppercase;padding:4px 5px;border:1px solid #d9d9dc;text-align:center}
 th.f{font-size:10px;text-transform:none;background:#e9e9ec}
 td{padding:3px 5px;border:1px solid #e3e3e5;vertical-align:middle} .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums} .c{text-align:center} .r{text-align:right;font-weight:700;color:#5c5c5c}
 td.min{background:#dcf1e3;font-weight:700;color:#14532d} td.esc{outline:2px solid #1f7a3d;outline-offset:-2px}
 tr.tot td{font-weight:700;font-size:11px;background:#f6f6f7} tr.tot td.best{background:#dcf1e3;color:#14532d}
 tr.cond td{background:#fafafa}
 .bx{display:flex;gap:10px;margin-top:9px}
 .bx div{flex:1;border:1px solid #e3e3e5;border-radius:6px;padding:6px 9px} .bx span{display:block;font-size:8px;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em;font-weight:700} .bx b{font-size:13px}
 .bx .v{border-color:#1f7a3d;background:#f1faf4} .bx .v b{color:#14532d}
 .just{margin-top:8px;border:1px solid #e3e3e5;border-radius:6px;padding:6px 9px;min-height:28px} .just span{display:block;font-size:8px;color:#8e8e8e;text-transform:uppercase;font-weight:700}
 .ped{margin-top:6px;font-size:10px} .ped b{font-weight:700}
 .ass{display:flex;gap:40px;margin-top:34px} .ass div{flex:1;border-top:1px solid #999;padding-top:3px;text-align:center;font-size:9.5px}
 .ass small{display:block;color:#8e8e8e}
 .leg{margin-top:6px;font-size:8.5px;color:#8e8e8e}
 .sit{display:inline-block;border:1px solid ${si.c};color:${si.c};border-radius:4px;padding:0 6px;font-weight:700;font-size:9.5px}
</style></head><body>
<div class="cab"><img src="${base}logo-bkp.png" alt=""><div><h1>Mapa de cotação de preços</h1><span>BKP Construtora</span></div>
 <div class="nr"><b>${numCot(c)}</b><span class="sit">${si.n}</span></div></div>
<div class="info"><div><span>Objeto</span><b>${h(c.tit || '—')}</b></div><div><span>Obra / centro de custo</span><b>${h(c.o ? nomeLocal(c.o) : '—')}</b></div>
 <div><span>Solicitante</span><b>${h(c.sol || '—')}</b></div><div><span>Comprador</span><b>${h(c.u || '—')}</b></div><div><span>Data</span><b>${dataBR(c.d)}</b></div></div>
<table><thead><tr><th rowspan="2" style="width:22px">#</th><th rowspan="2" style="text-align:left">Item / descrição</th><th rowspan="2">Un</th><th rowspan="2">Qtd</th>
 ${fs.map(f => '<th colspan="2" class="f">' + h(f.nome) + '</th>').join('')}</tr>
 <tr>${fs.map(() => '<th>Unitário</th><th>Total</th>').join('')}</tr></thead><tbody>
 ${R.itens.map((i, k) => '<tr><td class="c">' + (k + 1) + '</td><td>' + h(i.desc) + '</td><td class="c">' + h(i.un || '') + '</td><td class="n">' + fq(i.q) + '</td>'
   + fs.map(f => { const p = num(f.p[i.id]), r = R.it[i.id], min = ok(p) && r.n > 1 && r.melhores.includes(f.id), e = R.esc[i.id] === f.id && fs.length > 1;
     const cl = (min ? 'min ' : '') + (e ? 'esc' : '');
     return ok(p) ? '<td class="n ' + cl + '">' + f2(p) + '</td><td class="n ' + cl + '">' + f2(p * r.q) + '</td>' : '<td class="c" colspan="2" style="color:#aaa">não cotou</td>'; }).join('') + '</tr>').join('')}
 ${linhaCond('Subtotal', f => R$(R.f[f.id].sub))}
 ${fs.some(f => num(f.desc) > 0) ? linhaCond('Desconto', f => num(f.desc) > 0 ? pct(num(f.desc)) + ' (− ' + R$(R.f[f.id].dv) + ')' : '—') : ''}
 ${linhaCond('Frete', f => (f.tf || '') + (R.f[f.id].fr ? ' · ' + R$(R.f[f.id].fr) : ''))}
 <tr class="tot"><td colspan="4" class="r">Total da proposta</td>${fs.map(f => '<td colspan="2" class="c' + (R.f[f.id].completo && Math.abs(R.f[f.id].tot - melhorTot) < 0.005 && fs.length > 1 ? ' best' : '') + '">' + (R.f[f.id].n ? R$(R.f[f.id].tot) : '—') + '</td>').join('')}</tr>
 ${linhaCond('Itens cotados', f => R.f[f.id].n + ' de ' + R.itens.length)}
 ${linhaCond('Prazo de entrega', f => h(f.prazo || '—'))}
 ${linhaCond('Pagamento', f => h(f.pag || '—'))}
 ${linhaCond('Validade', f => f.val ? dataBR(f.val) : '—')}
 ${fs.some(f => f.obs) ? linhaCond('Observação', f => h(f.obs || '')) : ''}
</tbody></table>
<div class="bx">
 <div class="v"><span>Compra escolhida</span><b>${R$(R.final.tot)}</b><br>${R.final.usados.map(nf).map(h).join(' + ') || '—'}</div>
 <div><span>Menor preço por item</span><b>${R$(R.porItem.tot)}</b></div>
 <div><span>Tudo num fornecedor só</span><b>${R.unico ? R$(R.unico.tot) : '—'}</b>${R.unico ? '<br>' + h(R.unico.f.nome) : ''}</div>
 <div><span>Economia sobre a média das propostas</span><b>${R$(R.ecoMed)}</b> (${pct(R.ecoPct)})</div>
</div>
<div class="ped">${R.final.usados.map(fid => { const f = fs.find(x => x.id === fid), its = R.itens.filter(i => R.esc[i.id] === fid);
  return '<b>' + h(f.nome) + ':</b> itens ' + its.map(i => R.itens.indexOf(i) + 1).join(', ') + ' — ' + R$(its.reduce((s, i) => s + R.ef(f, i) * R.it[i.id].q, 0) + R.f[fid].fr); }).join(' &nbsp;·&nbsp; ')}</div>
<div class="just"><span>Justificativa da escolha</span>${h(c.just || '').replace(/\n/g, '<br>') || '&nbsp;'}</div>
<div class="ass"><div>Comprador<small>${h(c.u || '')}</small></div><div>Solicitante<small>${h(c.sol || '')}</small></div><div>Aprovação${c.apr ? '<small>' + h(c.apr) + ' · ' + dataBR(c.aprd) + '</small>' : '<small>&nbsp;</small>'}</div></div>
<div class="leg">Verde = menor preço do item (já com desconto). Contorno verde = proposta escolhida. Totais incluem desconto e frete. Gerado pelo Gestão 360º BKP em ${dataBR(hoje())}.</div>
</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const ir = () => { try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){} setTimeout(() => fr.remove(), 60000); };
    const img = doc.querySelector('img');
    if(img && !img.complete){ img.onload = img.onerror = ir; setTimeout(ir, 3000); } else setTimeout(ir, 200);
    window.G360Cotacoes._ultimaImpressao = html;
  }

  // ---------- planilha ----------
  function aviso(t, erro){ const el = $('cot-estado'); if(el){ el.textContent = t; el.style.color = erro ? '#b42318' : ''; }
    const cs = $('cm-salvo'); if(cs){ cs.textContent = erro ? '⚠ ' + t : t; cs.style.color = erro ? '#b42318' : ''; } }

  // junta duas versões (deste computador e da planilha): vale a alteração mais recente de cada cotação e fornecedor
  function juntar(a, b){
    (b.cot || []).forEach(c => delete c.res);
    const lista = (x, y) => { const m = new Map(); (x || []).concat(y || []).forEach(i => { const o = m.get(i.id); if(!o || (i.upd || 0) > (o.upd || 0)) m.set(i.id, i); }); return [...m.values()]; };
    const r = VAZIO();
    ['forn', 'cot'].forEach(k => r[k] = lista(a[k], b[k]));
    r.cfg = ((b.cfg && (b.cfg.upd || 0) > ((a.cfg || {}).upd || 0)) ? b.cfg : a.cfg) || {};
    // dois computadores criaram cotação com o mesmo número: renumera a mais nova
    const vis = {};
    r.cot.filter(c => !c.del).sort((x, y) => (x.hist && x.hist[0] ? x.hist[0].q : '').localeCompare(y.hist && y.hist[0] ? y.hist[0].q : '') || String(x.id).localeCompare(String(y.id))).forEach(c => {
      const k = c.ano + '-' + c.n;
      if(vis[k] && vis[k] !== c.id){ c.n = Math.max(0, ...r.cot.filter(x => String(x.ano) === String(c.ano)).map(x => +x.n || 0)) + 1; c.upd = agora(); }
      vis[c.ano + '-' + c.n] = c.id;
    });
    return r;
  }

  function salvar(semRender){
    localStorage.setItem(KEY, JSON.stringify(D));
    localStorage.setItem(PEND, '1');
    if(!semRender) render();
    clearTimeout(timer); timer = setTimeout(enviar, 1500);
  }

  const msgErro = e => /desconhecida/i.test(e.message) ? 'A planilha ainda não aceita cotações: atualize o Apps Script (ver README). Por enquanto fica salvo neste computador.' : 'Sem ligação com a planilha agora. As cotações ficam neste computador e são enviadas depois.';

  async function enviar(){
    clearTimeout(timer);
    try{
      const j = await txApi({acao: 'lerCotacoes'});
      if(j.dados && Array.isArray(j.dados.cot)){ D = juntar(D, j.dados); localStorage.setItem(KEY, JSON.stringify(D)); }
      // resumo de cada cotação, só para as abas de consulta da planilha
      const env = Object.assign({}, D, {cot: D.cot.map(c => { if(c.del) return c; const R = calc(c);
        return Object.assign({}, c, {res: {tot: Math.round(R.final.tot * 100) / 100, forn: R.final.usados.map(id => (c.fs.find(f => f.id === id) || {}).nome), esc: R.esc}}); })});
      await txApi({acao: 'gravarCotacoes', dados: env});
      localStorage.removeItem(PEND);
      aviso('Salvo na planilha às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '.');
      if(aba.style.display !== 'none' && !aberta) render();
    }catch(e){
      aviso(msgErro(e), true);
      timer = setTimeout(enviar, 60000);
    }
  }

  async function receber(){
    if(localStorage.getItem(PEND)) return enviar();
    if(Date.now() - ultimaLeitura < 15000) return;
    ultimaLeitura = Date.now();
    try{
      const j = await txApi({acao: 'lerCotacoes'});
      if(!j.dados || !Array.isArray(j.dados.cot)) return;
      const novo = juntar(D, j.dados);
      if(JSON.stringify(novo) !== JSON.stringify(D)){
        D = novo; localStorage.setItem(KEY, JSON.stringify(D));
        if(aberta){ const c = achaCot(aberta); if(c && !c.del && !(M && M.contains(document.activeElement))) montarMapa(c); }
        render();
      }
      aviso('Sincronizado com a planilha.');
    }catch(e){ aviso(msgErro(e), true); }
  }

  // ---------- troca de aba ----------
  const trocarOrig = window.trocarAba;
  window.trocarAba = function(a){
    trocarOrig.apply(this, arguments);
    aba.style.display = a === 'cot' ? '' : 'none';
    btn.classList.toggle('on', a === 'cot');
    if(a === 'cot'){ render(); receber(); }
  };
  document.addEventListener('visibilitychange', () => { if(!document.hidden && (aba.style.display !== 'none' || aberta)) receber(); });

  receber();
  try{ if(ls.get('aba') === 'cot') trocarAba('cot'); }catch(e){}
  window.G360Cotacoes = {render, receber, enviar, abrir: abrirMapa, calc, dados: () => D};
})();
