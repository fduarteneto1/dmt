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
    aberta:    {n: 'Em cotação', c: '#0f7c86'},
    aprovacao: {n: 'Aguardando aprovação', c: '#e08a00'},
    aprovada:  {n: 'Aprovada', c: '#6aa84f'},
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
  #for-lista .li.sel{background:#cffafe;box-shadow:inset 3px 0 0 #0e7490}
  #for-lista .li .ed{flex:none;width:auto;min-width:0;margin:0;border:1px solid var(--line,#e4e4e7);background:#fff;border-radius:6px;padding:3px 7px;font-size:13px;line-height:1;cursor:pointer;color:var(--ink2,#555)}
  #for-lista .li .ed:hover{background:var(--head,#f6f6f7)}
  #for-lista .li .sp{display:block;color:#b45309;font-size:10.5px}
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
  #cot-mapa{--cv:#0f7c86;--cv2:#e3f1f2;--cvt:#0b5d65;position:fixed;inset:0;z-index:4000;background:#f3f4f5;color:var(--ink,#232323);display:flex;flex-direction:column}
  html.tema-escuro #cot-mapa{background:var(--bg);--cv2:#173b3f;--cvt:#7fd3da}
  #cot-mapa input,#cot-mapa select{min-width:0}
  #cot-mapa .cv-top{display:flex;align-items:center;gap:8px;padding:10px 18px;flex-wrap:wrap;border-bottom:1px solid var(--line,#e8e8ea);background:var(--card,#fff)}
  #cot-mapa .cv-top .esp{flex:1}
  #cot-mapa .cv-bk{background:var(--card,#fff);color:var(--ink,#232323);border:1px solid var(--line,#e8e8ea);font-weight:600}
  #cot-mapa .cv-bk:hover{background:var(--head,#f6f6f7);filter:none}
  #cot-mapa .cv-est{font-size:12px;color:var(--ink2,#5c5c5c);display:inline-flex;align-items:center;gap:6px}
  #cot-mapa .cv-est:before{content:'';width:7px;height:7px;border-radius:50%;background:#3aa655;flex:none}
  #cot-mapa .cv-est.pend:before{background:#e08a00}
  #cot-mapa .cv-est.err{color:#b42318} #cot-mapa .cv-est.err:before{background:#b42318}
  #cot-mapa .ic{background:var(--card,#fff);border:1px solid var(--line,#e8e8ea);color:var(--ink2,#5c5c5c);padding:8px 10px;line-height:0}
  #cot-mapa .ic svg{width:16px;height:16px}
  #cot-mapa .ic:hover:not(:disabled){background:var(--head,#f6f6f7);color:var(--ink,#232323);filter:none}
  #cot-mapa .ic.dg:hover:not(:disabled){color:#b42318}
  #cot-mapa .ic.sm{padding:5px 6px;border-color:transparent;background:transparent}
  #cot-mapa .ic.sm svg{width:15px;height:15px}
  #cot-mapa .cv-stw{position:relative}
  #cot-mapa .cv-st{background:var(--card,#fff);color:var(--ink,#232323);border:1px solid var(--line,#e8e8ea);display:inline-flex;align-items:center;gap:8px}
  #cot-mapa .cv-st:hover{background:var(--head,#f6f6f7);filter:none}
  #cot-mapa .cv-st i,#cot-mapa .cv-pill i{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
  #cot-mapa .cv-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:10;background:var(--card,#fff);border:1px solid var(--line,#e8e8ea);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;min-width:220px}
  #cot-mapa .cv-menu button{display:block;width:100%;text-align:left;background:transparent;color:var(--ink,#232323);border:0;font-weight:500;padding:8px 10px}
  #cot-mapa .cv-menu button:hover{background:var(--head,#f6f6f7);filter:none}
  #cot-mapa .cv-menu .hint{padding:6px 10px}
  #cot-mapa .cv-mos{display:inline-flex;align-items:stretch;border:1px solid var(--line,#e8e8ea);border-radius:8px;overflow:hidden;background:var(--card,#fff)}
  #cot-mapa .cv-mos span{font-size:11.5px;color:var(--ink3,#8e8e8e);padding:8px 10px;display:flex;align-items:center}
  #cot-mapa .cv-mos button{background:transparent;color:var(--ink2,#5c5c5c);border:0;border-left:1px solid var(--line,#e8e8ea);border-radius:0;font-weight:500;padding:7px 12px}
  #cot-mapa .cv-mos button.on{background:var(--head,#f6f6f7);color:var(--ink,#232323);font-weight:700}
  #cot-mapa .cv-mos button:hover{filter:none;color:var(--ink,#232323)}
  #cot-mapa .corpo{flex:1;overflow:auto;padding:18px 18px 40px}
  #cot-mapa .cv-folha{background:var(--card,#fff);border:1px solid var(--line2,#eeeef0);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.05);padding:26px 30px 30px;margin:0 auto 16px;max-width:1500px}
  #cot-mapa .cv-folha>h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cv);margin:0 0 12px}
  #cot-mapa .cv-doc{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap}
  #cot-mapa .cv-marca{display:flex;align-items:center;gap:14px}
  #cot-mapa .cv-marca img{height:44px;width:auto;display:block}
  #cot-mapa .cv-marca b{display:block;font-size:22px;line-height:1.1}
  #cot-mapa .cv-marca span{display:block;font-size:10.5px;letter-spacing:.2em;color:var(--ink3,#8e8e8e);font-weight:700;margin-top:3px}
  #cot-mapa .cv-meta{text-align:right;font-size:12px;color:var(--ink2,#5c5c5c);line-height:1.5;display:grid;gap:3px;justify-items:end}
  #cot-mapa .cv-meta b{color:var(--ink,#232323)}
  #cot-mapa .cv-meta input,#cot-mapa .cv-meta select,#cot-mapa .cv-tit{border:0;border-bottom:1px dashed transparent;border-radius:0;background:transparent;color:var(--ink,#232323);font-weight:700;font-size:12px;padding:0 2px;box-shadow:none}
  #cot-mapa .cv-meta input:hover,#cot-mapa .cv-meta select:hover,#cot-mapa .cv-tit:hover,#cot-mapa .cv-meta input:focus,#cot-mapa .cv-meta select:focus,#cot-mapa .cv-tit:focus{border-bottom-color:var(--cv);box-shadow:none}
  #cot-mapa .cv-meta select{text-align:right;cursor:pointer;max-width:260px}
  #cot-mapa .cv-meta input[type=date]{width:118px}
  #cot-mapa .cv-tit{display:block;width:100%;font-size:16px;text-transform:uppercase;padding:2px 0;margin:0 0 12px;letter-spacing:.01em}
  #cot-mapa .cv-tit::placeholder{text-transform:none;font-weight:400;color:var(--ink3,#8e8e8e)}
  #cot-mapa .wrap{overflow:auto}
  #cot-mapa table.cv-t{border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px}
  #cot-mapa .cv-t th{background:var(--cv);color:#fff;text-transform:none;font-size:12px;font-weight:700;letter-spacing:0;text-align:left;vertical-align:bottom;padding:12px 10px;border:0;border-right:1px solid rgba(255,255,255,.14);position:sticky;top:0;z-index:2}
  #cot-mapa .cv-t th:last-child{border-right:0}
  #cot-mapa .cv-t th.c,#cot-mapa .cv-t td.c{text-align:center} #cot-mapa .cv-t th.n,#cot-mapa .cv-t td.n{text-align:right}
  #cot-mapa .cv-t th.fh{min-width:140px;text-transform:uppercase;line-height:1.25}
  #cot-mapa .cv-t th.fh small{display:block;font-weight:400;font-size:10.5px;opacity:.8;margin-top:6px}
  #cot-mapa .cv-t th.fh .x{float:right;background:none;border:0;color:#fff;opacity:0;padding:0 0 0 6px;font-size:16px;line-height:1;cursor:pointer}
  #cot-mapa .cv-t th.fh:hover .x{opacity:.85}
  #cot-mapa .cv-t th.add{background:var(--head,#f6f6f7);color:var(--cv);font-weight:600;min-width:160px;vertical-align:bottom}
  #cot-mapa .cv-t th.add input{display:block;width:100%;border:0;background:transparent;padding:6px 0 0;font-size:11.5px;color:var(--ink,#232323);font-weight:400;box-shadow:none}
  #cot-mapa .cv-t th.add input::placeholder{color:var(--ink3,#8e8e8e)}
  #cot-mapa .cv-t .fix{position:sticky;left:0;z-index:1}
  #cot-mapa .cv-t thead .fix{z-index:3}
  #cot-mapa .cv-t td{padding:8px 10px;border-bottom:1px solid var(--line2,#f0f0f2);border-right:1px solid var(--line2,#f0f0f2);vertical-align:top;background:var(--card,#fff)}
  #cot-mapa .cv-t td.it{min-width:250px;width:300px}
  #cot-mapa .cv-t td.it textarea{display:block;width:100%;resize:none;overflow:hidden;border:1px solid transparent;background:transparent;padding:1px 3px;font:inherit;font-size:12.5px;line-height:1.45;color:var(--ink,#232323);border-radius:4px;min-height:0}
  #cot-mapa .cv-t td.it textarea:hover:not(:disabled){border-color:var(--line,#e8e8ea)}
  #cot-mapa .cv-t td.it textarea:focus{outline:none;border-color:var(--cv);background:var(--card,#fff);box-shadow:0 0 0 2px rgba(15,124,134,.15)}
  #cot-mapa .cv-t td.it textarea:disabled{opacity:1}
  #cot-mapa .cv-t td.u{min-width:74px} #cot-mapa .cv-t td.q{min-width:86px}
  #cot-mapa .cv-t td input,#cot-mapa .cv-t td select{border:1px solid transparent;background:transparent;padding:1px 3px;font-size:12.5px;width:100%;border-radius:4px;color:var(--ink,#232323);box-shadow:none;font-weight:500}
  #cot-mapa .cv-t td input:hover:not(:disabled),#cot-mapa .cv-t td select:hover:not(:disabled){border-color:var(--line,#e8e8ea)}
  #cot-mapa .cv-t td input:focus,#cot-mapa .cv-t td select:focus{border-color:var(--cv);background:var(--card,#fff);box-shadow:0 0 0 2px rgba(15,124,134,.15)}
  #cot-mapa .cv-t td input:disabled,#cot-mapa .cv-t td select:disabled{opacity:1;color:var(--ink,#232323)}
  #cot-mapa .cv-t td.pc{text-align:right;white-space:nowrap;min-width:140px;font-variant-numeric:tabular-nums}
  #cot-mapa .cv-t td.pc .pw{display:flex;align-items:center;justify-content:flex-end;gap:3px}
  #cot-mapa .cv-t td.pc .rs{color:var(--ink3,#8e8e8e)}
  #cot-mapa .cv-t td.pc input{text-align:right;width:9ch;font-variant-numeric:tabular-nums;max-width:150px;box-sizing:content-box}
  #cot-mapa .cv-t td.pc .tv{display:block;padding:1px 3px}
  #cot-mapa .cv-t td.pc .mk{display:block;font-size:10.5px;color:var(--ink3,#8e8e8e);padding:1px 3px 0;min-height:14px}
  #cot-mapa .cv-t td.pc.vz .tv,#cot-mapa .cv-t td.pc.vz .rs{color:var(--ink3,#b0b0b0)}
  #cot-mapa .cv-t td.min input,#cot-mapa .cv-t td.min .tv{color:#1f7a3d;font-weight:700}
  #cot-mapa .cv-t td.alto input,#cot-mapa .cv-t td.alto .tv{color:#b42318}
  #cot-mapa .cv-t td.esc{background:var(--cv2)}
  #cot-mapa .cv-t td.esc input,#cot-mapa .cv-t td.esc .tv,#cot-mapa .cv-t td.esc .rs{color:var(--cvt);font-weight:700}
  #cot-mapa .cv-t td.cd select{min-width:140px;font-size:12px}
  #cot-mapa .cv-t td.ac{width:40px;text-align:center;background:var(--card,#fff)}
  #cot-mapa .cv-t td.ac .x{background:none;border:0;color:#b42318;padding:0 4px;font-size:15px;cursor:pointer;opacity:0}
  #cot-mapa .cv-t tr:hover td.ac .x{opacity:.8}
  #cot-mapa .cv-t .ult{display:block;font-size:10.5px;color:var(--ink3,#8e8e8e);margin-top:2px;padding:0 3px}
  #cot-mapa .cv-t tbody.nv td{padding:9px 10px}
  #cot-mapa .cv-t tbody.nv a{color:var(--cv);font-weight:600;cursor:pointer;text-decoration:none;margin-right:16px}
  #cot-mapa .cv-t tbody.nv a:hover{text-decoration:underline}
  #cot-mapa .cv-t tfoot th{position:static;background:var(--card,#fff);color:var(--ink,#232323);font-weight:700;vertical-align:middle;border-bottom:1px solid var(--line2,#f0f0f2);border-right:1px solid var(--line2,#f0f0f2);padding:9px 10px}
  #cot-mapa .cv-t tfoot th.fix{z-index:1}
  #cot-mapa .cv-t tfoot td{text-align:right;vertical-align:middle;font-variant-numeric:tabular-nums}
  #cot-mapa .cv-t tfoot tr.tot th,#cot-mapa .cv-t tfoot tr.tot td{font-weight:700;font-size:13.5px;border-top:1px solid var(--line,#e8e8ea);border-bottom:1px solid var(--line,#e8e8ea)}
  #cot-mapa .cv-t tfoot small{display:block;font-weight:400;font-size:10.5px;color:var(--ink3,#8e8e8e)}
  #cot-mapa .cv-t tfoot td.best{color:#14532d} #cot-mapa .cv-t tfoot td.best small{color:#1f7a3d}
  #cot-mapa .cv-t tfoot tr.cd th{font-weight:600;color:var(--ink2,#5c5c5c);font-size:11.5px}
  #cot-mapa .cv-t tfoot tr.cd td{font-size:12px}
  #cot-mapa .cv-t tfoot input,#cot-mapa .cv-t tfoot select{text-align:right}
  #cot-mapa .cv-t tfoot tr.cd input{text-align:left}
  #cot-mapa .cv-dica{margin-top:10px}
  #cot-mapa .cv-folha.foto th.add,#cot-mapa .cv-folha.foto td.ac,#cot-mapa .cv-folha.foto .cv-dica,#cot-mapa .cv-folha.foto tbody.nv,#cot-mapa .cv-folha.foto .trava{display:none}
  #cot-mapa .cv-folha.foto .wrap{overflow:visible}
  #cot-mapa .linhab{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
  #cot-mapa .res{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
  #cot-mapa .res .bx{background:var(--card,#fff);border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:10px 12px}
  #cot-mapa .res .bx span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8e8e8e)}
  #cot-mapa .res .bx b{display:block;font-size:20px;font-variant-numeric:tabular-nums;margin-top:2px}
  #cot-mapa .res .bx small{display:block;color:var(--ink2,#5c5c5c);font-size:11px}
  #cot-mapa .res .bx.ver{border-color:var(--cv);background:var(--cv2)}
  #cot-mapa .res .bx.ver b{color:var(--cvt)}
  #cot-mapa .sug{margin-top:10px;padding:9px 12px;border-radius:8px;background:#e8f5ec;color:#14532d;font-size:12.5px}
  #cot-mapa .sug{box-shadow:none;border:0}
  #cot-mapa .sug.al{background:#fdf0e8;color:#8a3a12}
  #cot-mapa .duas{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;max-width:1500px;margin:0 auto}
  #cot-mapa .duas .cv-folha{margin:0 0 16px;max-width:none}
  #cot-mapa .ped{border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12.5px}
  #cot-mapa .ped b.t{float:right;font-variant-numeric:tabular-nums}
  #cot-mapa .ped ul{margin:4px 0 6px;padding-left:18px;color:var(--ink2,#5c5c5c);font-size:11.5px}
  #cot-mapa textarea{width:100%;min-height:62px;font-family:inherit;font-size:12.5px;border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:8px 11px;background:var(--card,#fff);color:var(--ink,#232323)}
  #cot-mapa .modos{display:flex;gap:4px;flex-wrap:wrap}
  #cot-mapa .seg button.on{color:var(--cv)}
  #cot-mapa .hist{font-size:11.5px;color:var(--ink2,#5c5c5c);max-height:160px;overflow:auto}
  #cot-mapa .trava{padding:8px 12px;border-radius:8px;background:#eef4ff;color:#1d3d7a;font-size:12.5px;margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  #cot-mapa .cv-lis{padding:22px 24px 26px}
  #cot-mapa .cv-kp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}
  #cot-mapa .cv-kp div{border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:9px 12px}
  #cot-mapa .cv-kp span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8e8e8e)}
  #cot-mapa .cv-kp b{font-size:19px;font-variant-numeric:tabular-nums}
  #cot-mapa .cv-bus{display:flex;gap:8px;margin-bottom:14px}
  #cot-mapa .cv-in{flex:1;display:flex;align-items:center;gap:8px;border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:0 12px;margin:0;background:var(--card,#fff);color:var(--ink3,#8e8e8e);text-transform:none;letter-spacing:0;font-weight:400;font-size:12.5px}
  #cot-mapa .cv-in:focus-within{border-color:var(--cv);box-shadow:0 0 0 2px rgba(15,124,134,.15)}
  #cot-mapa .cv-in svg{width:16px;height:16px;flex:none}
  #cot-mapa .cv-in input{flex:1;border:0;padding:11px 0;background:transparent;box-shadow:none;font-size:13px}
  #cot-mapa .ic.on{border-color:var(--cv);color:var(--cv)}
  #cot-mapa .cv-fil{display:flex;gap:10px;margin:-4px 0 14px;flex-wrap:wrap}
  #cot-mapa .cv-fil div{min-width:220px}
  #cot-mapa .cv-fil select{width:100%}
  #cot-mapa .cv-lt td{vertical-align:middle;padding:10px}
  #cot-mapa .cv-lt th{padding:9px 10px;vertical-align:middle}
  #cot-mapa .cv-lt tbody tr{cursor:pointer}
  #cot-mapa .cv-lt tbody tr:hover td{background:var(--head,#f8f8f9)}
  #cot-mapa .cv-lt td.nr{white-space:nowrap;width:110px}
  #cot-mapa .cv-lt td.mp b{display:block;font-weight:600;text-transform:uppercase}
  #cot-mapa .cv-lt td small{display:block;font-size:11px;color:var(--ink3,#8e8e8e);margin-top:2px}
  #cot-mapa .cv-lt td.cp b{font-weight:600;white-space:nowrap}
  #cot-mapa .cv-lt td.cp small{text-transform:uppercase;font-size:10.5px}
  #cot-mapa .cv-lt td.cp small.eco{text-transform:none;color:#1f7a3d}
  #cot-mapa .cv-lt td.op{white-space:nowrap;width:86px}
  #cot-mapa .cv-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line,#e8e8ea);border-radius:999px;padding:3px 11px;font-size:11.5px;white-space:nowrap;background:var(--card,#fff)}
  #cot-mapa .cv-vazio{padding:26px 10px;text-align:center;color:var(--ink3,#8e8e8e)}
  @media (max-width:900px){ #cot-mapa .res{grid-template-columns:1fr 1fr} #cot-mapa .duas{grid-template-columns:1fr} #cot-mapa .corpo{padding:10px} #cot-mapa .cv-folha{padding:16px} #cot-mapa .cv-meta{text-align:left;justify-items:start} #cot-mapa .cv-kp{grid-template-columns:1fr} #cot-mapa .cv-lt td.op,#cot-mapa .cv-lt th.op{display:none} }
  #aba-cot .cv-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#e8e8ea);border-radius:999px;padding:0 9px;font-size:10.5px;line-height:18px;white-space:nowrap;color:var(--ink,#232323);font-weight:600}
  #aba-cot .cv-pill i{width:7px;height:7px;border-radius:50%;display:inline-block}
  #aba-cot .li .nm b{text-transform:uppercase}
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
        <div class="btns" style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap"><button id="cot-tela">▦ Abrir mapas de cotação</button><button class="sec" id="cot-nova">+ Nova cotação</button></div>
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
    if(tela === 'lista') preencherLista();
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
        + '<small><span class="cv-pill"><i style="background:' + si.c + '"></i>' + si.n + '</span>' + (r.forn.length ? ' ' + h(r.forn.join(', ')) : '') + '</small></span>'
        + '<span class="vl">' + (r.tot > 0 ? R$(r.tot) : '—') + (r.eco > 0.005 ? '<small>economia ' + R$(r.eco) + '</small>' : '') + '</span></li>';
    }).join('') || '<li class="hint" style="padding:10px 0;cursor:default">Nenhuma cotação' + (b || fs || v ? ' com esse filtro.' : ' ainda. Clique em <b>+ Nova cotação</b>.') + '</li>';
    $('cot-lista').querySelectorAll('li[data-id]').forEach(li => li.onclick = () => abrirMapa(li.dataset.id));
  }
  $('cot-busca').oninput = render; $('cot-fs').onchange = render; $('cot-fo').onchange = render;
  $('cot-nova').onclick = () => { const c = novaCotacao(); salvar(true); abrirMapa(c.id, true); };
  $('cot-tela').onclick = () => abrirLista();

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
  let fornSel = null;
  function renderForn(){
    const b = $('for-busca').value.trim().toLowerCase();
    const l = vivos(D.forn).filter(f => !b || casa(Object.assign({}, f, {cat: [f.cat, f.contato, f.end].join(' ')}), b))
      .sort((a, b2) => String(a.nome).localeCompare(String(b2.nome), 'pt-BR'));
    const usos = id => vivos(D.cot).filter(c => c.fs.some(f => f.id === id));
    $('for-lista').innerHTML = l.map(f => { const u = usos(f.id), ganhou = u.filter(c => calc(c).final.usados.includes(f.id) && c.st !== 'aberta' && c.st !== 'cancelada').length;
      return '<li class="li" data-id="' + f.id + '"><span class="nm"><b>' + h(f.nome) + '</b><small>' + [f.cat, f.cidade, f.cnpj && 'CNPJ ' + f.cnpj].filter(Boolean).map(h).join(' · ')
        + '</small><small>' + [f.contato, f.tel, f.email].filter(Boolean).map(h).join(' · ') + '</small></span>'
        + '<span class="vl" style="font-weight:400;font-size:11px;color:var(--ink3)">' + u.length + ' cotaç' + (u.length === 1 ? 'ão' : 'ões') + (ganhou ? '<br>' + ganhou + ' escolhida' + (ganhou > 1 ? 's' : '') : '') + '</span>'
        + '<button type="button" class="ed" title="Abrir cadastro">✎</button></li>'; }).join('')
      || '<li class="hint" style="padding:10px 0;cursor:default">Nenhum fornecedor' + (b ? ' com essa busca.' : ' cadastrado. Dá para cadastrar aqui ou direto no mapa.') + '</li>';
    // clique no fornecedor: destaca no mapa; o lápis abre o cadastro
    $('for-lista').querySelectorAll('li[data-id]').forEach(li => {
      if(li.dataset.id === fornSel) li.classList.add('sel');
      li.querySelector('.ed').onclick = ev => { ev.stopPropagation(); editarForn(li.dataset.id); };
      li.onclick = () => {
        $('for-lista').querySelectorAll('li.sel').forEach(x => x.classList.remove('sel'));
        $('for-lista').querySelectorAll('.sp').forEach(x => x.remove());
        fornSel = li.dataset.id; li.classList.add('sel');
        const M = window.G360FornMapa;
        if(!M || !M.destacar(fornSel)){
          const sp = document.createElement('small'); sp.className = 'sp';
          sp.textContent = 'Ainda sem posição no mapa — abra o cadastro (✎) e confira o endereço.';
          li.querySelector('.nm').appendChild(sp);
        }
      };
    });
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
  const CATS = [[/pneu/, 'Pneus'], [/lubrific|oleos? lubr/, 'Lubrificantes'], [/combust|posto|derivados de petroleo/, 'Combustível'], [/asfalt|betum|emuls/, 'Emulsão e CAP'],
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

  // ---------- tela cheia: lista de mapas e mapa de cotação ----------
  // Visual de "documento": lista em tabela (Nº · Mapa · Data · Compra escolhida · Status · Opções)
  // e o mapa com cabeçalho da BKP, tabela com cabeçalho verde-petróleo e um valor por fornecedor
  // (Mostrar: Unitário ou Total). Os cálculos e o fluxo continuam os mesmos.
  let M = null;      // elemento da tela cheia
  let tela = '';     // 'lista' | 'mapa' | ''
  let ultErro = '';  // último aviso de erro da planilha (para o indicador "Salvo na planilha")
  let MOS = 'u';     // mapa mostra preço unitário ('u') ou total ('t')
  try{ MOS = localStorage.getItem('dmtbkp_cotMostra') === 't' ? 't' : 'u'; }catch(e){}
  const LF = {q: '', st: '', o: '', fil: false}; // filtros da lista em tela cheia
  const svg = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICO = {
    dup: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a2 2 0 0 1 2-2h11"/><path d="M14.5 12v6M11.5 15h6"/>'),
    del: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
    cam: svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    imp: svg('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    env: svg('<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M22 6l-10 7L2 6"/>'),
    fil: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/></svg>',
    bus: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')
  };
  const pill = si => '<span class="cv-pill"><i style="background:' + si.c + '"></i>' + h(si.n) + '</span>';

  function garantirM(){
    if(M) return;
    M = document.createElement('div'); M.id = 'cot-mapa'; M.style.display = 'none';
    document.body.appendChild(M);
    document.addEventListener('keydown', e => {
      if(e.key !== 'Escape' || !M || M.style.display === 'none' || $('cot-modal') || $('cot-sug')) return;
      const mn = M.querySelector('.cv-menu:not([hidden])'); if(mn){ mn.hidden = true; return; }
      if(tela === 'mapa') voltarLista(); else fecharTela();
    });
    document.addEventListener('mousedown', e => { if(!M) return; const mn = M.querySelector('.cv-menu:not([hidden])'); if(mn && !mn.parentElement.contains(e.target)) mn.hidden = true; });
  }
  function mostrarM(){ garantirM(); M.style.display = ''; document.documentElement.style.overflow = 'hidden'; }
  function fecharTela(){
    if(!M) return; M.style.display = 'none'; tela = ''; aberta = null;
    document.documentElement.style.overflow = '';
    render();
  }
  // cotação criada e deixada em branco some ao sair dela
  function limparEmBranco(id){
    const c = D.cot.find(x => x.id === id && !x.del && !String(x.tit || '').trim() && !x.itens.length && !x.fs.length && x.hist && x.hist.length === 1);
    if(c){ c.del = true; c.upd = agora(); }
  }
  function voltarLista(){ const id = aberta; aberta = null; limparEmBranco(id); salvar(true); abrirLista(); }
  function fecharMapa(){ const id = aberta; aberta = null; limparEmBranco(id); salvar(true); fecharTela(); } // usado por quem abre só o mapa

  // indicador "● Salvo na planilha" no topo da tela cheia
  function estadoSalvo(){
    const el = M && M.querySelector('#cv-salvo'); if(!el) return;
    const pend = !!localStorage.getItem(PEND);
    el.className = 'cv-est' + (ultErro ? ' err' : pend ? ' pend' : '');
    el.textContent = ultErro ? 'Não salvo na planilha' : pend ? 'Salvando…' : (ultSalvo || 'Salvo na planilha');
    el.title = ultErro || '';
  }
  let ultSalvo = '';

  // ----- lista em tela cheia -----
  function abrirLista(){
    mostrarM(); tela = 'lista'; aberta = null;
    M.innerHTML = `
    <div class="cv-top">
      <button class="cv-bk" data-l="sair" title="Voltar ao painel (Esc)">← Gestão 360º</button>
      <span class="cv-est" id="cv-salvo"></span>
      <span class="esp"></span>
      <button class="sec" data-l="csv">Baixar planilha (CSV)</button>
      <button data-l="nova">+ Nova cotação</button>
    </div>
    <div class="corpo"><div class="cv-folha cv-lis">
      <div class="cv-kp"><div><span>Em cotação</span><b id="cv-k1">0</b></div><div><span>Aguardando aprovação</span><b id="cv-k2">0</b></div><div><span>Economia no ano</span><b id="cv-k3">R$ 0</b></div></div>
      <div class="cv-bus">
        <label class="cv-in">${ICO.bus}<input id="cv-q" placeholder="Buscar por título, número, centro de custo, item, solicitante ou fornecedor…" value="${h(LF.q)}"></label>
        <button class="ic${LF.fil || LF.st || LF.o ? ' on' : ''}" data-l="fil" title="Filtrar por situação e obra">${ICO.fil}</button>
      </div>
      <div class="cv-fil"${LF.fil ? '' : ' hidden'}>
        <div><label for="cv-fs">Situação</label><select id="cv-fs"><option value="">Todas (sem canceladas)</option>
          ${Object.entries(SIT).map(([k, s]) => '<option value="' + k + '"' + (LF.st === k ? ' selected' : '') + '>' + s.n + '</option>').join('')}<option value="*"${LF.st === '*' ? ' selected' : ''}>Todas</option></select></div>
        <div><label for="cv-fo">Obra / centro de custo</label><select id="cv-fo">${optLocais(LF.o, 'Todas as obras')}</select></div>
      </div>
      <div class="wrap"><table class="cv-t cv-lt"><thead><tr><th>Nº</th><th>Mapa</th><th>Data</th><th>Compra escolhida</th><th class="c">Status</th><th class="c op">Opções</th></tr></thead>
        <tbody id="cv-lb"></tbody></table></div>
    </div></div>`;
    const q = $('cv-q');
    q.oninput = () => { LF.q = q.value; preencherLista(); };
    $('cv-fs').onchange = e => { LF.st = e.target.value; preencherLista(); };
    $('cv-fo').onchange = e => { LF.o = e.target.value; preencherLista(); };
    M.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
      const a = b.dataset.l;
      if(a === 'sair') return fecharTela();
      if(a === 'csv') return $('cot-csv').click();
      if(a === 'nova'){ const c = novaCotacao(); salvar(true); return abrirMapa(c.id, true); }
      if(a === 'fil'){ LF.fil = !LF.fil; M.querySelector('.cv-fil').hidden = !LF.fil; b.classList.toggle('on', LF.fil || !!LF.st || !!LF.o); }
    });
    preencherLista();
    setTimeout(() => q.focus(), 30);
  }
  function preencherLista(){
    if(!M || tela !== 'lista') return;
    const cs = vivos(D.cot), ano = hoje().slice(0, 4);
    $('cv-k1').textContent = cs.filter(c => c.st === 'aberta').length;
    $('cv-k2').textContent = cs.filter(c => c.st === 'aprovacao').length;
    $('cv-k3').textContent = R$(cs.filter(c => (c.st === 'aprovada' || c.st === 'pedido') && String(c.ano) === ano).reduce((s, c) => s + Math.max(0, resumo(c).eco), 0)).replace(/,\d\d$/, '');
    const b = LF.q.trim().toLowerCase();
    const l = cs.filter(c => (LF.st === '*' ? true : LF.st ? c.st === LF.st : c.st !== 'cancelada') && (!LF.o || c.o === LF.o) && (!b ||
      (numCot(c) + ' ' + c.tit + ' ' + c.sol + ' ' + c.u + ' ' + c.o + ' ' + c.itens.map(i => i.desc).join(' ') + ' ' + c.fs.map(f => f.nome).join(' ')).toLowerCase().includes(b)))
      .sort((a, b2) => String(b2.d).localeCompare(String(a.d)) || (b2.n || 0) - (a.n || 0));
    const tb = $('cv-lb');
    tb.innerHTML = l.map(c => {
      const r = resumo(c), si = SIT[c.st] || SIT.aberta, venc = c.prazo && c.st === 'aberta' && c.prazo < hoje();
      const sub = [c.o || 'Sem obra', c.u, c.itens.length + ' ite' + (c.itens.length === 1 ? 'm' : 'ns'), c.fs.length + ' fornecedor' + (c.fs.length === 1 ? '' : 'es')].filter(Boolean).map(h).join(' · ');
      return '<tr data-id="' + c.id + '"><td class="nr">' + numCot(c) + '</td>'
        + '<td class="mp"><b>' + h(c.tit || '(sem título)') + '</b><small>' + sub + (c.sol ? ' · solicitante: ' + h(c.sol) : '') + (venc ? ' · <span style="color:#b42318">prazo vencido</span>' : '') + '</small></td>'
        + '<td>' + dataBR(c.d) + '</td>'
        + '<td class="cp"><b>' + (r.tot > 0 ? R$(r.tot) : '—') + '</b>' + (r.forn.length ? '<small>' + h(r.forn.join(' + ')) + '</small>' : '')
        + (r.eco > 0.005 ? '<small class="eco">economia ' + R$(r.eco) + '</small>' : '') + '</td>'
        + '<td class="c">' + pill(si) + '</td>'
        + '<td class="c op"><button class="ic sm" data-o="dup" title="Duplicar">' + ICO.dup + '</button><button class="ic sm dg" data-o="del" title="Excluir">' + ICO.del + '</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="cv-vazio">Nenhuma cotação' + (b || LF.st || LF.o ? ' com esse filtro.' : ' ainda. Clique em <b>+ Nova cotação</b>.') + '</td></tr>';
    tb.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = e => {
      const c = achaCot(tr.dataset.id); if(!c) return;
      const o = e.target.closest('[data-o]');
      if(!o) return abrirMapa(c.id);
      e.stopPropagation();
      if(o.dataset.o === 'dup'){ const n = novaCotacao(c); salvar(true); abrirMapa(n.id); }
      else if(confirm('Excluir a ' + numCot(c) + (c.tit ? ' (' + c.tit + ')' : '') + '? Ela some da lista e do histórico de preços.')){ c.del = true; c.upd = agora(); salvar(); preencherLista(); }
    });
    estadoSalvo();
  }

  // ----- mapa -----
  function abrirMapa(id, novo){
    const c = achaCot(id); if(!c) return;
    mostrarM(); tela = 'mapa'; aberta = id;
    montarMapa(c);
    M.querySelector('.corpo').scrollTop = 0;
    if(novo) setTimeout(() => { const t = M.querySelector('[data-k=tit]'); if(t) t.focus(); }, 50);
  }
  function mexeu(c, semMapa){ c.upd = agora(); salvar(true); if(!semMapa) atualizar(c); }

  // situações para onde a cotação pode ir agora: [situação, texto, principal, perigo]
  function transicoes(c){
    const bts = [];
    if(c.st === 'aberta') bts.push(['aprovacao', 'Enviar para aprovação', 1]);
    if(c.st === 'aberta' || c.st === 'aprovacao') bts.push(['aprovada', '✓ Aprovar compra', c.st === 'aprovacao' ? 1 : 0]);
    if(c.st === 'aprovacao') bts.push(['aberta', 'Voltar para cotação', 0]);
    if(c.st === 'aprovada') bts.push(['pedido', 'Marcar pedido emitido', 1]);
    if(c.st !== 'cancelada' && c.st !== 'pedido') bts.push(['cancelada', 'Cancelar cotação', 0, 1]);
    if(c.st === 'cancelada') bts.push(['aberta', 'Reativar cotação', 0]);
    return bts;
  }

  function montarMapa(c){
    const tr = travada(c), dis = tr ? ' disabled' : '', si = SIT[c.st] || SIT.aberta;
    const fs = c.fs, fc = id => achaForn(id) || {};
    M.innerHTML = `
    <div class="cv-top">
      <button class="cv-bk" data-a="fechar" title="Voltar para a lista (Esc)">← Mapas</button>
      <span class="cv-est" id="cv-salvo"></span>
      <span class="esp"></span>
      <div class="cv-stw"><button class="cv-st" data-a="st" title="Mudar a situação">${si.n} <i style="background:${si.c}"></i></button><div class="cv-menu" hidden></div></div>
      <button class="ic" data-a="pedir" title="Pedir cotação aos fornecedores (WhatsApp / e-mail)">${ICO.env}</button>
      <button class="ic" data-a="foto" title="Copiar imagem do mapa">${ICO.cam}</button>
      <button class="ic" data-a="imp" title="Imprimir mapa (A4 paisagem)">${ICO.imp}</button>
      <button class="ic" data-a="dup" title="Duplicar cotação">${ICO.dup}</button>
      <button class="ic dg" data-a="del" title="Excluir cotação">${ICO.del}</button>
      <div class="cv-mos"><span>Mostrar</span><button data-mo="u"${MOS === 'u' ? ' class="on"' : ''}>Unitário</button><button data-mo="t"${MOS === 't' ? ' class="on"' : ''}>Total</button></div>
    </div>
    <div class="corpo">
      <div class="cv-folha" id="cv-folha">
        ${tr ? '<div class="trava">🔒 ' + (c.st === 'cancelada' ? 'Cotação cancelada.' : 'Cotação ' + si.n.toLowerCase() + (c.apr ? ' por ' + h(c.apr) + ' em ' + dataBR(c.aprd) : '') + '. O mapa está travado para edição.')
          + ' <button class="sec mini" data-a="reabrir">Reabrir para edição</button></div>' : ''}
        <div class="cv-doc">
          <div class="cv-marca"><img src="logo-bkp.png" alt="BKP"><div><b>Mapa de Cotação</b><span>BKP CONSTRUTORA</span></div></div>
          <div class="cv-meta">
            <div>Mapa nº <b>${numCot(c)}</b> · <input type="date" data-k="d" value="${h(c.d)}" title="Data da cotação"${dis}></div>
            <div>Comprador: <b>${h(c.u || '—')}</b></div>
            <div>Centro de Custo: <select data-k="o"${dis}>${optLocais(c.o, '— escolha —')}</select></div>
            <div>Solicitante: <input data-k="sol" value="${h(c.sol)}" placeholder="quem pediu" list="cot-sols" style="width:160px;field-sizing:content;min-width:90px;text-align:right"${dis}></div>
            <div>Responder até: <input type="date" data-k="prazo" value="${h(c.prazo)}" title="Prazo para os fornecedores responderem"${dis}></div>
          </div>
        </div>
        <datalist id="cot-sols">${[...new Set(vivos(D.cot).map(x => x.sol).filter(Boolean))].map(x => '<option value="' + h(x) + '">').join('')}</datalist>
        <input class="cv-tit" data-k="tit" value="${h(c.tit)}" placeholder="Título do mapa — o que está sendo comprado (ex.: filtros e óleo para revisão dos caminhões)"${dis}>
        <div class="wrap"><table class="cv-t" id="cm-t">
          <thead><tr>
            <th class="it fix">Item</th><th class="c" style="width:64px">Und</th><th class="n" style="width:86px">Qtd</th>
            ${fs.map(f => '<th class="fh">' + (tr ? '' : '<button class="x" data-rf="' + f.id + '" title="Tirar da cotação">×</button>') + h(f.nome)
              + '<small>' + h([fc(f.id).cidade, fc(f.id).tel].filter(Boolean).join(' · ').toUpperCase() || ' ') + '</small></th>').join('')}
            ${fs.length > 1 ? '<th style="min-width:150px">Comprar de</th>' : ''}
            ${tr ? '' : '<th class="add">+ Fornecedor<input id="cm-addf" placeholder="digite o nome"></th>'}
          </tr></thead>
          <tbody id="cm-b">${c.itens.map((i, k) => linhaItem(c, i, k, tr)).join('')}</tbody>
          ${tr ? '' : '<tbody class="nv"><tr><td class="fix" colspan="3"><a data-a="item">+ novo item</a><a data-a="colar">📋 colar do Excel</a></td>' + '<td colspan="' + (fs.length + (fs.length > 1 ? 1 : 0) + 1) + '"></td></tr></tbody>'}
          <tfoot id="cm-f"></tfoot>
        </table></div>
        ${tr ? '' : '<div class="hint cv-dica">Clique no valor para lançar o preço unitário; em branco = o fornecedor não cotou. Enter desce para o próximo item. Verde = menor preço do item (já com desconto) · vermelho = o mais caro · fundo verde-petróleo = compra escolhida.</div>'}
      </div>

      <div class="cv-folha"><h2>Resultado</h2><div id="cm-res"></div></div>

      <div class="duas">
        <div class="cv-folha"><h2>Pedido por fornecedor</h2><div id="cm-ped"></div></div>
        <div class="cv-folha">
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

    // campos do cabeçalho e textos
    M.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => { c[k] = el.value; mexeu(c, k !== 'o'); });
    });
    // itens e preços
    ligarCorpo(c);
    // botões
    M.querySelectorAll('[data-a]').forEach(b => b.onclick = () => acao(c, b.dataset.a, b));
    M.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => {
      if(MOS === b.dataset.mo) return; MOS = b.dataset.mo;
      try{ localStorage.setItem('dmtbkp_cotMostra', MOS); }catch(e){}
      const y = M.querySelector('.corpo').scrollTop; montarMapa(c); M.querySelector('.corpo').scrollTop = y;
    });
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
    const edita = !tr && MOS === 'u';
    return '<tr data-i="' + i.id + '">'
      + '<td class="it fix"><textarea data-ik="desc" rows="1" placeholder="descrição do item"' + dis + '>' + h(i.desc) + '</textarea>'
      + (ult ? '<span class="ult">último preço: ' + R$(ult.p) + ' · ' + h(ult.f) + ' · ' + dataBR(ult.d) + '</span>' : '') + '</td>'
      + '<td class="c u"><input data-ik="un" value="' + h(i.un) + '" list="cot-un" style="text-align:center"' + dis + '></td>'
      + '<td class="n q"><input data-ik="q" value="' + h(i.q == null ? '' : fqIn(i.q)) + '" inputmode="decimal" style="text-align:right"' + dis + '></td>'
      + c.fs.map(f => '<td class="pc" data-c="' + f.id + '">'
        + (edita ? '<div class="pw"><span class="rs">R$</span><input class="pr" data-p="' + f.id + '" inputmode="decimal" value="' + h(prIn(f.p[i.id])) + '" placeholder="–"></div>' : '<span class="tv"></span>')
        + '<span class="mk"></span></td>').join('')
      + (c.fs.length > 1 ? '<td class="cd"><select data-v' + dis + '></select></td>' : '')
      + (tr ? '' : '<td class="ac"><button class="x" data-ri title="Excluir item">×</button></td>') + '</tr>';
  }
  const prIn = v => ok(num(v)) ? f2(num(v)) : '';
  const fqIn = v => ok(num(v)) ? fq(num(v)) : String(v || '');

  function ligarCorpo(c){
    if(!document.getElementById('cot-un')){
      const dl = document.createElement('datalist'); dl.id = 'cot-un'; dl.innerHTML = UNID.map(u => '<option value="' + u + '">').join(''); document.body.appendChild(dl);
    }
    const tb = $('cm-b');
    const alt = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    tb.querySelectorAll('textarea[data-ik=desc]').forEach(ta => { requestAnimationFrame(() => alt(ta)); ta.addEventListener('input', () => alt(ta)); });
    tb.querySelectorAll('tr[data-i]').forEach(tr => {
      const i = c.itens.find(x => x.id === tr.dataset.i); if(!i) return;
      tr.querySelectorAll('[data-ik]').forEach(el => {
        el.addEventListener('input', () => { i[el.dataset.ik] = el.value; mexeu(c); });
        if(el.dataset.ik === 'q') el.addEventListener('blur', () => { el.value = fqIn(i.q); });
      });
      tr.querySelectorAll('input[data-p]').forEach(el => {
        const f = c.fs.find(x => x.id === el.dataset.p);
        const larg = () => { el.style.width = Math.max(4, el.value.length + 1) + 'ch'; }; larg(); // "R$" colado no valor
        el.addEventListener('input', () => { larg(); const v = num(el.value); if(ok(v)) f.p[i.id] = v; else delete f.p[i.id]; mexeu(c); });
        el.addEventListener('blur', () => { el.value = prIn(f.p[i.id]); larg(); });
        el.addEventListener('focus', () => el.select());
      });
      // clicar em qualquer ponto da célula do preço leva ao campo
      tr.querySelectorAll('td.pc').forEach(td => td.addEventListener('mousedown', e => { const inp = td.querySelector('input'); if(inp && e.target !== inp){ e.preventDefault(); inp.focus(); } }));
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
      if(e.key !== 'Enter' || (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA')) return;
      e.preventDefault();
      const td = e.target.closest('td'), tr = td.parentElement, col = [...tr.children].indexOf(td);
      const prox = tr.nextElementSibling;
      if(prox){ const inp = prox.children[col] && prox.children[col].querySelector('input,textarea'); if(inp) inp.focus(); }
      else if(e.target.dataset.ik === 'desc' && !travada(c)){ acao(c, 'item'); }
    });
  }

  // atualiza totais, destaques e resultado sem redesenhar os campos (para não perder o foco)
  function atualizar(c){
    if(!M || aberta !== c.id) return;
    const R = calc(c), tr = travada(c);
    estadoSalvo();
    $('cm-b').querySelectorAll('tr[data-i]').forEach(row => {
      const i = c.itens.find(x => x.id === row.dataset.i), r = R.it[i.id];
      c.fs.forEach(f => {
        const p = num(f.p[i.id]), td = row.querySelector('td[data-c="' + f.id + '"]'); if(!td) return;
        const v = R.ef(f, i), min = r && v != null && r.n > 1 && r.melhores.includes(f.id), esc = r && R.esc[i.id] === f.id && c.fs.length > 1;
        td.classList.toggle('min', !!min);
        td.classList.toggle('esc', !!esc);
        td.classList.toggle('alto', !!(r && v != null && r.n > 2 && v - r.max > -0.000001 && r.max > r.min));
        td.classList.toggle('vz', !ok(p));
        const q = r ? r.q : (num(i.q) || 0);
        const tv = td.querySelector('.tv'); if(tv) tv.textContent = ok(p) ? R$(MOS === 't' ? p * q : p) : 'R$ –';
        const mk = td.querySelector('.mk');
        if(mk) mk.textContent = !ok(p) ? '' : MOS === 't' ? 'unit. ' + R$(p) : (q ? '= ' + R$(p * q) : '');
        td.title = r && v != null && r.min != null && v > r.min ? '+' + pct((v / r.min - 1) * 100) + ' sobre o menor' : (min ? 'Menor preço do item' : '');
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
    const span = '<th colspan="3" class="fix">';
    const ultCol = (c.fs.length > 1 ? '<td></td>' : '') + (tr ? '' : '<td></td>');
    const campo = (f, k, ph, tipo) => '<td><input data-fk="' + k + '" data-f="' + f.id + '" value="' + h(k === 'frete' ? prIn(f.frete) : f[k] || '') + '" placeholder="' + ph + '"' + (tipo ? ' type="' + tipo + '"' : '') + (k === 'frete' || k === 'desc' ? ' inputmode="decimal" style="text-align:right"' : '') + (tr ? ' disabled' : '') + '></td>';
    const foot = $('cm-f');
    const focado = document.activeElement && foot.contains(document.activeElement) ? document.activeElement : null;
    if(!focado || foot.dataset.n !== c.fs.map(f => f.id).join()){
      foot.dataset.n = c.fs.map(f => f.id).join();
      foot.innerHTML = !c.fs.length ? '<tr><td colspan="' + (3 + (tr ? 0 : 1)) + '" class="hint" style="padding:14px;text-align:left">Adicione os fornecedores digitando o nome em "+ Fornecedor", no cabeçalho do mapa.</td></tr>' :
        '<tr data-r="sub">' + span + 'Subtotal</th>' + c.fs.map(f => '<td data-s="' + f.id + '"></td>').join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Desconto (%)</th>' + c.fs.map(f => campo(f, 'desc', '0')).join('') + ultCol + '</tr>'
        + '<tr>' + span + 'Frete</th>' + c.fs.map(f => '<td><div style="display:flex;gap:4px;justify-content:flex-end"><select data-fk="tf" data-f="' + f.id + '" style="width:auto"' + (tr ? ' disabled' : '') + '>'
          + ['CIF', 'FOB'].map(t => '<option' + (f.tf === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>'
          + '<input data-fk="frete" data-f="' + f.id + '" value="' + h(prIn(f.frete)) + '" placeholder="R$ –" inputmode="decimal" style="text-align:right;width:110px"' + (tr ? ' disabled' : '') + '></div></td>').join('') + ultCol + '</tr>'
        + '<tr class="tot">' + span + 'Total<small id="cm-nit"></small></th>' + c.fs.map(f => '<td data-tot="' + f.id + '"></td>').join('') + ultCol + '</tr>'
        + '<tr class="cd">' + span + 'Prazo de entrega</th>' + c.fs.map(f => campo(f, 'prazo', 'Ex.: 3 dias úteis')).join('') + ultCol + '</tr>'
        + '<tr class="cd">' + span + 'Condição de pagamento</th>' + c.fs.map(f => '<td><input data-fk="pag" data-f="' + f.id + '" value="' + h(f.pag || '') + '" list="cot-pag" placeholder="Ex.: 28 dias"' + (tr ? ' disabled' : '') + '></td>').join('') + ultCol + '</tr>'
        + '<tr class="cd">' + span + 'Validade da proposta</th>' + c.fs.map(f => campo(f, 'val', '', 'date')).join('') + ultCol + '</tr>'
        + '<tr class="cd">' + span + 'Observação / marca</th>' + c.fs.map(f => campo(f, 'obs', 'Ex.: marca, nº do orçamento')).join('') + ultCol + '</tr>';
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
    const nit = $('cm-nit'); if(nit) nit.textContent = n + ' ite' + (n === 1 ? 'm cotado' : 'ns cotados');
    c.fs.forEach(f => {
      const x = R.f[f.id];
      const s = foot.querySelector('[data-s="' + f.id + '"]'); if(s) s.textContent = R$(x.sub);
      const t = foot.querySelector('[data-tot="' + f.id + '"]');
      if(t){
        const best = x.completo && Math.abs(x.tot - melhorTot) < 0.005 && c.fs.length > 1;
        t.innerHTML = (x.n ? R$(x.tot) : '—') + '<small' + (x.n < n ? ' style="color:#b26a00"' : '') + '>' + (best ? 'menor proposta completa' : x.n < n ? 'cotou ' + x.n + ' de ' + n : ' ') + '</small>';
        t.classList.toggle('best', best);
      }
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
    const fl = $('cm-fluxo'), bts = transicoes(c);
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

  function acao(c, a, el){
    if(a === 'fechar') return voltarLista();
    if(a === 'st'){
      const mn = el.parentElement.querySelector('.cv-menu');
      if(!mn.hidden){ mn.hidden = true; return; }
      const bts = transicoes(c);
      mn.innerHTML = (bts.length ? bts.map(b => '<button data-st="' + b[0] + '"' + (b[3] ? ' style="color:#b42318"' : '') + '>' + b[1] + '</button>').join('') : '<div class="hint">Sem mudança possível.</div>')
        + (travada(c) && c.st !== 'cancelada' ? '<button data-re>Reabrir para edição</button>' : '');
      mn.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { mn.hidden = true; mudarSit(c, b.dataset.st); });
      const re = mn.querySelector('[data-re]'); if(re) re.onclick = () => { mn.hidden = true; acao(c, 'reabrir'); };
      mn.hidden = false; return;
    }
    if(a === 'foto') return foto(c, el);
    if(a === 'item'){
      const i = {id: uid(), desc: '', un: 'un', q: 1, obs: ''}; c.itens.push(i); mexeu(c, true); montarMapa(c);
      const ins = M.querySelectorAll('#cm-b tr:last-child [data-ik=desc]'); if(ins[0]) ins[0].focus();
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
      c.del = true; c.upd = agora(); aberta = null; salvar(true); abrirLista(); return;
    }
    if(a === 'reabrir'){
      if(!confirm('Reabrir a ' + numCot(c) + ' para edição? A situação volta para "Em cotação" e a aprovação é desfeita.')) return;
      c.st = 'aberta'; c.apr = ''; c.aprd = ''; registrar(c, 'Reaberta para edição'); mexeu(c, true); montarMapa(c);
    }
  }

  // ---------- imagem do mapa (botão da câmera) ----------
  // Copia o mapa como imagem (para colar no WhatsApp/e-mail); se o navegador não deixar, baixa o PNG.
  let h2c = null;
  const carregarH2c = () => h2c || (h2c = new Promise((ok2, erro) => {
    if(window.html2canvas) return ok2(window.html2canvas);
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload = () => ok2(window.html2canvas); s.onerror = () => { h2c = null; erro(new Error('sem internet')); }; document.head.appendChild(s);
  }));
  async function foto(c, b){
    const el = $('cv-folha'); if(!el) return;
    const ori = b.innerHTML; b.disabled = true;
    const fim = t => { b.title = t; const e = $('cv-salvo'); if(e){ e.className = 'cv-est'; e.textContent = t; setTimeout(estadoSalvo, 3500); } b.innerHTML = ori; b.disabled = false; };
    try{
      const H = await carregarH2c();
      el.classList.add('foto');
      const cv = await H(el, {backgroundColor: getComputedStyle(el).backgroundColor || '#fff', scale: Math.min(2, window.devicePixelRatio > 1 ? 2 : 1.5), logging: false, useCORS: true,
        windowWidth: Math.max(el.scrollWidth + 80, document.documentElement.clientWidth), width: el.scrollWidth, height: el.scrollHeight});
      el.classList.remove('foto');
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      try{ await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]); fim('Imagem do mapa copiada — é só colar (Ctrl+V)'); }
      catch(e){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mapa-' + numCot(c) + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); fim('Imagem do mapa baixada'); }
    }catch(e){ el.classList.remove('foto'); fim('Não deu para gerar a imagem agora (' + e.message + '). Use a impressora → Salvar como PDF.'); }
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
 .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #0f7c86;padding-bottom:7px;margin-bottom:8px}
 .cab img{height:32px} .cab h1{font-size:16px;margin:0} .cab span{font-size:9.5px;color:#8e8e8e;letter-spacing:.1em;text-transform:uppercase}
 .cab .nr{margin-left:auto;text-align:right} .cab .nr b{font-size:15px;display:block}
 .info{display:grid;grid-template-columns:2fr 1.4fr 1fr 1fr 1fr;gap:4px 14px;margin-bottom:8px;border:1px solid #e3e3e5;border-radius:6px;padding:6px 9px}
 .info div span{display:block;font-size:8px;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em;font-weight:700} .info div b{font-size:11px}
 table{width:100%;border-collapse:collapse;${larg}} tr{page-break-inside:avoid}
 th{background:#0f7c86;color:#fff;font-size:8.5px;text-transform:uppercase;padding:5px;border:1px solid #0d6c75;text-align:center}
 th.f{font-size:9.5px}
 td{padding:3px 5px;border:1px solid #e3e3e5;vertical-align:middle} .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums} .c{text-align:center} .r{text-align:right;font-weight:700;color:#5c5c5c}
 td.min{font-weight:700;color:#1f7a3d} td.esc{background:#e3f1f2;font-weight:700;color:#0b5d65}
 tr.tot td{font-weight:700;font-size:11px;background:#f6f6f7} tr.tot td.best{background:#e3f1f2;color:#0b5d65}
 tr.cond td{background:#fafafa}
 .bx{display:flex;gap:10px;margin-top:9px}
 .bx div{flex:1;border:1px solid #e3e3e5;border-radius:6px;padding:6px 9px} .bx span{display:block;font-size:8px;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em;font-weight:700} .bx b{font-size:13px}
 .bx .v{border-color:#0f7c86;background:#e3f1f2} .bx .v b{color:#0b5d65}
 .just{margin-top:8px;border:1px solid #e3e3e5;border-radius:6px;padding:6px 9px;min-height:28px} .just span{display:block;font-size:8px;color:#8e8e8e;text-transform:uppercase;font-weight:700}
 .ped{margin-top:6px;font-size:10px} .ped b{font-weight:700}
 .ass{display:flex;gap:40px;margin-top:34px} .ass div{flex:1;border-top:1px solid #999;padding-top:3px;text-align:center;font-size:9.5px}
 .ass small{display:block;color:#8e8e8e}
 .leg{margin-top:6px;font-size:8.5px;color:#8e8e8e}
 .sit{display:inline-block;border:1px solid ${si.c};color:${si.c};border-radius:4px;padding:0 6px;font-weight:700;font-size:9.5px}
</style></head><body>
<div class="cab"><img src="${base}logo-bkp.png" alt=""><div><h1>Mapa de Cotação</h1><span>BKP Construtora</span></div>
 <div class="nr"><b>${numCot(c)}</b><span class="sit">${si.n}</span></div></div>
<div class="info"><div><span>Objeto</span><b style="text-transform:uppercase">${h(c.tit || '—')}</b></div><div><span>Obra / centro de custo</span><b>${h(c.o ? nomeLocal(c.o) : '—')}</b></div>
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
<div class="leg">Verde = menor preço do item (já com desconto). Fundo verde-petróleo = proposta escolhida. Totais incluem desconto e frete. Gerado pelo Gestão 360º BKP em ${dataBR(hoje())}.</div>
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
    ultErro = erro ? t : ''; if(!erro && /^Salvo/.test(t)) ultSalvo = t.replace(/\.$/, '');
    estadoSalvo(); }

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

  // avisa quem mostra cotações fora da aba (ex.: Relatórios › Cotações)
  const avisarMudanca = () => { try{ document.dispatchEvent(new Event('g360-cotacoes')); }catch(e){} };
  function salvar(semRender){
    localStorage.setItem(KEY, JSON.stringify(D));
    localStorage.setItem(PEND, '1');
    if(!semRender) render();
    avisarMudanca();
    clearTimeout(timer); timer = setTimeout(enviar, 1500);
  }

  const msgErro = e => /desconhecida/i.test(e.message) ? 'A planilha ainda não aceita cotações: atualize o Apps Script (ver README). Por enquanto fica salvo neste computador.' : 'Sem ligação com a planilha agora. As cotações ficam neste computador e são enviadas depois.';

  async function enviar(){
    clearTimeout(timer);
    try{
      const j = await txApi({acao: 'lerCotacoes'});
      if(j.dados && Array.isArray(j.dados.cot)){ D = juntar(D, j.dados); localStorage.setItem(KEY, JSON.stringify(D)); avisarMudanca(); }
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
        render(); avisarMudanca();
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
  // posição do fornecedor no mapa (arrastada em fornecedores-mapa.js)
  const posForn = (id, lat, lng) => { const f = achaForn(id); if(!f) return; f.geo = (+lat).toFixed(6) + ',' + (+lng).toFixed(6); f.upd = agora(); salvar(); };
  window.G360Cotacoes = {render, receber, enviar, abrir: abrirMapa, lista: abrirLista, calc, dados: () => D, numCot, nomeLocal, SIT, editarForn, posForn};
})();
