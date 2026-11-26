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
  // Opções alternativas de um item (ex.: pneu 1000x20 borrachudo × liso): a linha alternativa tem i.alt = id do
  // item original e fica logo abaixo dele, com a mesma unidade e quantidade (ver "cálculo do mapa").
  const raiz = (c, i) => (i.alt && c.itens.find(x => x.id === i.alt)) || i;
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
      itens: [], fs: [], esc: {}, preset: '', lin: '', cmp: 'media,unico', outNome: '', just: '', obs: '', hist: [{q: agoraTxt(), u: usuario(), a: 'Criada'}], upd: agora()};
    if(base){
      c.tit = base.tit ? base.tit + ' (cópia)' : ''; c.o = base.o; c.sol = base.sol;
      c.lin = base.lin == null ? '' : base.lin; c.cmp = base.cmp == null ? c.cmp : base.cmp; c.outNome = base.outNome || '';
      const mp = {}; base.itens.forEach(i => mp[i.id] = uid());
      c.itens = base.itens.map(i => { const n = {id: mp[i.id], desc: i.desc, un: i.un, q: i.q, obs: i.obs};
        if(i.alt && mp[i.alt]) n.alt = mp[i.alt]; if(+i.sl > 1) n.sl = +i.sl; return n; });
      // mesmos fornecedores e marcas, preços em branco
      c.fs = base.fs.map(f => { const mk = {};
        Object.keys(f.mk || {}).forEach(k => { const [iid, s] = k.split('~'); if(mp[iid]) mk[mp[iid] + (s ? '~' + s : '')] = f.mk[k]; });
        return {id: f.id, nome: f.nome, frete: 0, tf: f.tf || 'CIF', desc: 0, imp: 0, out: 0, prazo: '', pag: f.pag || '', val: '', obs: '', p: {}, mk}; });
      c.hist[0].a = 'Criada a partir de ' + numCot(base);
    }
    D.cot.push(c);
    return c;
  }
  function registrar(c, a){ (c.hist = c.hist || []).push({q: agoraTxt(), u: usuario(), a}); if(c.hist.length > 60) c.hist = c.hist.slice(-60); }

  // ---------- cálculo do mapa ----------
  // Mesma estrutura do "Mapa de Cotação" BKP (planilha de suprimentos):
  //  - Necessidade = item original + as opções alternativas dele (i.alt = id do original). Só uma entra na compra.
  //  - Linhas de marca (i.sl > 1): o mesmo item em outra marca. Cada fornecedor lança o preço da marca dele,
  //    todas disputam o mesmo item e só uma entra na conta. Preço da linha k fica em f.p[id + '~' + k].
  //  - Escolha: c.esc[necessidade] = {i, f, k} (célula travada pelo lápis ou por uma predefinição) ou {nao: 1}
  //    (desaprovado: não será comprado). Sem nada travado vale a recomendação automática: a combinação mais
  //    barata já com o frete, que inclui comprar tudo de um fornecedor só.
  //  - Opção que conta para cada fornecedor: c.opf[fornecedor][necessidade] = id do item (original ou alternativa),
  //    escolhida clicando em "usar no total" na célula. Sem escolha vale o item original; se o fornecedor só cotou
  //    uma alternativa, ela entra no lugar. É essa opção que soma no total dele e na recomendação automática.
  const TAXA_MES = 0.015; // custo do dinheiro para trazer compras a prazo a valor presente
  const chP = (id, k) => k ? id + '~' + k : id;
  const slots = i => Math.max(1, +i.sl || 1);
  const precoN = (f, i, k) => { const p = num(f.p && f.p[chP(i.id, k)]); return ok(p) ? p : NaN; };
  const marcaDe = (f, i, k) => String((f.mk && f.mk[chP(i.id, k)]) || '');
  const raizId = (c, i) => i.alt && c.itens.some(x => x.id === i.alt) ? i.alt : i.id;

  function parsePag(txt){
    const s = String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if(!s) return {dias: [0], avista: true, vazio: true, label: ''};
    const ent = /entrada|^1\s*\+|\+\s*\d/.test(s), mx = s.match(/(\d+)\s*x/), barras = s.match(/\d+(\s*\/\s*\d+)+/);
    let dias = null;
    if(barras){ dias = barras[0].split('/').map(x => parseInt(x, 10)); if(ent) dias.unshift(0); }
    else if(mx){ dias = ent ? [0] : []; for(let k = 1; k <= +mx[1]; k++) dias.push(k * 30); }
    else { const md = s.match(/(\d+)\s*(d|dia|ddl|$)/) || s.match(/(\d+)/); if(md) dias = [+md[1]]; }
    if(!dias){
      if(/vista|pix|dinheiro|antecip|debito/.test(s)) return {dias: [0], avista: true, label: 'à vista'};
      return {dias: [0], avista: true, desconhecido: true, label: 'não entendi — considerado à vista'};
    }
    const av = dias.every(d => d <= 0);
    return {dias, avista: av, label: av ? 'à vista' : dias.length === 1 ? 'pagamento em ' + dias[0] + ' dias' : dias.length + ' parcelas · ' + dias.join('/') + ' dias'};
  }
  function valorPresente(v, dias, taxa){
    if(!taxa || !dias || !dias.length) return v;
    const parc = v / dias.length; return dias.reduce((s, d) => s + parc / Math.pow(1 + taxa, Math.max(0, d) / 30), 0);
  }
  const diasEntrega = f => { const m = String(f.prazo || '').match(/\d+/); return m ? +m[0] : Infinity; };

  // escolhas da cotação; as feitas antes desta versão (modo "um fornecedor só", "item a item" e a bolinha da
  // opção) são convertidas só para o cálculo e passam a ser gravadas no formato novo quando alguém mexer
  function escolhas(c){
    if(c.esc) return c.esc;
    const e = {}, fs = c.fs || [];
    const ef = (f, i) => { const p = num(f.p && f.p[i.id]); return ok(p) ? p * (1 - (num(f.desc) || 0) / 100) : null; };
    const priced = (fid, i) => { const f = fs.find(x => x.id === fid); return f && ef(f, i) != null; };
    (c.itens || []).forEach(i => {
      if(i.alt) return;
      const sel = i.sel && c.itens.find(x => x.id === i.sel && x.alt === i.id), at = sel || i;
      if(c.modo === 'manual' && c.venc && c.venc[at.id] && priced(c.venc[at.id], at)) e[i.id] = {i: at.id, f: c.venc[at.id], k: 0};
      else if(c.modo === 'unico' && c.glob && priced(c.glob, at)) e[i.id] = {i: at.id, f: c.glob, k: 0};
      else if(sel){ let b = null; fs.forEach(f => { const v = ef(f, sel); if(v != null && (!b || v < b.v)) b = {f: f.id, v}; }); if(b) e[i.id] = {i: sel.id, f: b.f, k: 0}; }
    });
    return e;
  }

  // opção do item (original ou alternativa) que entra no total de um fornecedor
  function opcaoForn(c, n, f){
    const cot = i => { for(let k = 0; k < slots(i); k++) if(isFinite(precoN(f, i, k))) return true; return false; };
    const ch = c.opf && c.opf[f.id] && c.opf[f.id][n.id], it = ch && n.itens.find(i => i.id === ch);
    if(it && cot(it)) return it;
    if(n.itens.includes(n.orig) && cot(n.orig)) return n.orig;
    return n.itens.find(cot) || null;
  }
  // quantas opções do mesmo item o fornecedor cotou
  const opcoesCotadas = (n, f) => n.itens.filter(i => { for(let k = 0; k < slots(i); k++) if(isFinite(precoN(f, i, k))) return true; return false; }).length;

  function calc(c){
    const fs = c.fs, nf = fs.length, E0 = escolhas(c), fidx = {};
    fs.forEach((f, k) => fidx[f.id] = k);
    const ef = (f, i, k) => { const p = precoN(f, i, k || 0); return isFinite(p) ? p * (1 - Math.min(100, Math.max(0, num(f.desc) || 0)) / 100) : null; };
    const todos = c.itens.filter(i => String(i.desc || '').trim() || ok(num(i.q)));
    const ofertas = i => { const q = num(i.q) || 0, o = [];
      fs.forEach(f => { for(let k = 0; k < slots(i); k++){ const p = ef(f, i, k); if(p != null) o.push({i, fid: f.id, k, p, q, custo: p * q}); } });
      return o; };
    const NN = [], idx = {};
    todos.forEach(i => { const r = raizId(c, i); if(!(r in idx)){ idx[r] = NN.length; NN.push({id: r, orig: c.itens.find(x => x.id === r), itens: []}); } NN[idx[r]].itens.push(i); });
    NN.forEach(n => {
      n.todas = [].concat(...n.itens.map(ofertas));
      // em cada fornecedor conta uma opção só (ver opcaoForn); a recomendação automática usa essas
      n.opc = {}; fs.forEach(f => { const it = opcaoForn(c, n, f); if(it) n.opc[f.id] = it.id; });
      n.auto = n.todas.filter(x => n.opc[x.fid] === x.i.id);
      const e = E0[n.id]; n.nao = !!(e && e.nao); n.trava = null;
      if(e && !e.nao) n.trava = n.todas.find(x => x.i.id === e.i && x.fid === e.f && x.k === (+e.k || 0)) || null;
    });
    const N = NN.filter(n => !n.nao);
    const R = {fs, todos, N, NN, ef, ofertas, it: {}, f: {}};
    todos.forEach(i => {
      const o = ofertas(i), r = {q: num(i.q) || 0, n: o.length, min: null, max: null, med: null, melhores: []};
      if(o.length){ const ps = o.map(x => x.p); r.min = Math.min(...ps); r.max = Math.max(...ps); r.med = ps.reduce((s, v) => s + v, 0) / ps.length;
        r.melhores = [...new Set(o.filter(x => x.p - r.min < 1e-6).map(x => x.fid))]; }
      R.it[i.id] = r;
    });
    // cada fornecedor comprando tudo sozinho (rodapé da tabela)
    fs.forEach(f => {
      let sub = 0, bruto = 0, n = 0; const asg = {};
      N.forEach(nd => { let b = null; nd.auto.forEach(x => { if(x.fid === f.id && (!b || x.custo < b.custo)) b = x; });
        if(b){ sub += b.custo; bruto += precoN(f, b.i, b.k) * b.q; n++; asg[nd.id] = b; } });
      const fr = num(f.frete) || 0, imp = num(f.imp) || 0, out = num(f.out) || 0, tot = sub + fr + imp + out, pg = parsePag(f.pag);
      R.f[f.id] = {f, sub: bruto, dv: bruto - sub, liq: sub, fr, imp, out, tot, n, asg, completo: N.length > 0 && n === N.length, pag: pg, pv: valorPresente(tot, pg.dias, TAXA_MES)};
    });
    const avaliar = asg => {
      let itens = 0; const us = {}, ids = [];
      N.forEach(nd => { const x = asg[nd.id]; if(!x) return; itens += x.custo; if(!us[x.fid]){ us[x.fid] = []; ids.push(x.fid); } us[x.fid].push(x); });
      let fr = 0, out = 0; ids.forEach(id => { fr += R.f[id].fr; out += R.f[id].out; });
      const E = {asg, itens, fr, out, us, usados: ids, imp: 0, integral: false};
      // impostos informados no total da proposta só entram quando a compra é toda com aquele fornecedor
      if(ids.length === 1 && R.f[ids[0]].completo && us[ids[0]].length === N.length){ E.integral = true; E.imp = R.f[ids[0]].imp; }
      E.tot = itens + fr + out + E.imp;
      E.falta = N.filter(nd => !asg[nd.id]);
      return E;
    };
    R.avaliar = avaliar;
    // melhor combinação de fornecedores, com o frete (testa todas as combinações até 14 fornecedores)
    const otim = trav => {
      const needs = []; N.forEach(nd => { const o = trav && nd.trava ? [nd.trava] : nd.auto; if(o.length) needs.push({nd, o}); });
      if(!needs.length) return null;
      let best = null;
      if(nf <= 14){
        for(let mask = 1; mask < (1 << nf); mask++){
          let tot = 0, used = 0, okm = true; const asg = {};
          for(const nn of needs){
            let bo = null; for(const x of nn.o) if(((mask >> fidx[x.fid]) & 1) && (!bo || x.custo < bo.custo)) bo = x;
            if(!bo){ okm = false; break; } tot += bo.custo; used |= 1 << fidx[bo.fid]; asg[nn.nd.id] = bo;
          }
          if(!okm || used !== mask) continue;
          let cnt = 0; for(let k = 0; k < nf; k++) if((mask >> k) & 1){ tot += R.f[fs[k].id].fr + R.f[fs[k].id].out; cnt++; }
          if(!best || tot < best.tot - 0.005 || (Math.abs(tot - best.tot) <= 0.005 && cnt < best.cnt)) best = {tot, asg, cnt};
        }
      } else { const asg = {}; needs.forEach(nn => asg[nn.nd.id] = nn.o.reduce((m, y) => !m || y.custo < m.custo ? y : m, null)); best = {asg, cnt: 0}; }
      return best;
    };
    let un = null; fs.forEach(f => { const x = R.f[f.id]; if(x.completo && (!un || x.tot < un.tot - 0.005)) un = x; });
    R.unico = un ? {f: un.f, tot: un.tot, E: avaliar(un.asg)} : null;
    const cb = otim(false); R.combo = cb ? {E: avaliar(cb.asg), cnt: cb.cnt} : null;
    if(R.unico && (!R.combo || R.unico.E.tot <= R.combo.E.tot + 0.005)) R.rec = {E: R.unico.E, unico: true};
    else R.rec = R.combo ? {E: R.combo.E, unico: R.combo.cnt === 1} : null;
    // escolha do comprador: células travadas + o resto otimizado
    R.manual = N.some(nd => nd.trava);
    if(R.manual){ const cu = otim(true); R.E = avaliar(cu ? cu.asg : {}); } else R.E = R.rec ? R.rec.E : avaliar({});
    R.pend = R.manual ? N.filter(nd => !nd.trava).length : 0;
    // formato usado pela lista, relatórios, mapa de fornecedores e planilha
    R.esc = {}; R.escK = {}; R.itens = [];
    N.forEach(nd => { const x = R.E.asg[nd.id], it = x ? x.i : nd.orig; R.itens.push(it); if(x){ R.esc[it.id] = x.fid; R.escK[it.id] = x.k; } });
    R.final = {tot: R.E.tot, usados: R.E.usados, falta: R.E.falta.map(nd => nd.orig)};
    const mp = {}; N.forEach(nd => { const b = nd.auto.reduce((m, y) => !m || y.custo < m.custo ? y : m, null); if(b) mp[nd.id] = b; });
    R.menor = avaliar(mp);
    R.porItem = {tot: R.menor.tot, usados: R.menor.usados, falta: R.menor.falta.map(nd => nd.orig)};
    // economia: quanto a compra fica abaixo da média dos preços recebidos de cada item escolhido
    let base = 0, pago = 0;
    N.forEach(nd => { const x = R.E.asg[nd.id]; if(!x) return; const o = ofertas(x.i); base += x.q * o.reduce((s, y) => s + y.p, 0) / o.length; pago += x.custo; });
    R.ecoMed = base - pago; R.ecoPct = base > 0 ? R.ecoMed / base * 100 : 0;
    const cs = fs.map(f => R.f[f.id]).filter(x => x.completo);
    R.ecoMax = cs.length ? Math.max(...cs.map(x => x.tot)) - R.E.tot : 0;
    R.semPreco = N.filter(nd => !nd.todas.length).length;
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
  #cot-mapa .cv-meta>div{white-space:nowrap}
  #cot-mapa .cv-meta select{text-align:right;cursor:pointer;width:auto;max-width:260px}
  #cot-mapa .cv-meta input[type=date]{width:118px}
  #cot-mapa .cv-tit{display:block;width:100%;font-size:16px;text-transform:uppercase;padding:2px 0;margin:0 0 12px;letter-spacing:.01em}
  #cot-mapa .cv-tit::placeholder{text-transform:none;font-weight:400;color:var(--ink3,#8e8e8e)}
  #cot-mapa .wrap{overflow:auto}
  #cot-mapa table.cv-t{border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px}
  #cot-mapa .cv-t th{background:var(--cv);color:#fff;text-transform:none;font-size:12px;font-weight:700;letter-spacing:0;text-align:left;vertical-align:bottom;padding:12px 10px;border:0;border-right:1px solid rgba(255,255,255,.14);position:sticky;top:0;z-index:2}
  #cot-mapa .cv-t th:last-child{border-right:0}
  #cot-mapa .cv-t th,#cot-mapa .cv-t td{text-align:left}
  #cot-mapa .cv-t th.c,#cot-mapa .cv-t td.c{text-align:center} #cot-mapa .cv-t th.n,#cot-mapa .cv-t td.n{text-align:right}
  #cot-mapa .cv-t col.cf{width:180px}
  #cot-mapa .cv-t th.fh,#cot-mapa .cv-t td.pc,#cot-mapa .cv-t th.add{width:180px;min-width:180px}
  #cot-mapa .cv-t th.fh{text-transform:uppercase;line-height:1.25}
  #cot-mapa .cv-t th.fh small{display:block;font-weight:400;font-size:10.5px;opacity:.8;margin-top:6px}
  #cot-mapa .cv-t th.fh .x{float:right;background:none;border:0;color:#fff;opacity:0;padding:0 0 0 6px;font-size:16px;line-height:1;cursor:pointer}
  #cot-mapa .cv-t th.fh:hover .x{opacity:.85}
  #cot-mapa .cv-t th.add{background:var(--head,#f6f6f7);color:var(--cv);font-weight:600;vertical-align:bottom}
  #cot-mapa .cv-t th.add input{display:block;width:100%;border:0;background:transparent;padding:6px 0 0;font-size:11.5px;color:var(--ink,#232323);font-weight:400;box-shadow:none}
  #cot-mapa .cv-t th.add input::placeholder{color:var(--ink3,#8e8e8e)}
  #cot-mapa .cv-t .fix{position:sticky;left:0;z-index:1}
  #cot-mapa .cv-t thead .fix{z-index:3}
  #cot-mapa .cv-t td{padding:8px 10px;border-bottom:1px solid var(--line2,#f0f0f2);border-right:1px solid var(--line2,#f0f0f2);vertical-align:top;background:var(--card,#fff)}
  #cot-mapa .cv-t td.it{min-width:250px}
  #cot-mapa .cv-t td.it textarea{display:block;width:100%;resize:none;overflow:hidden;border:1px solid transparent;background:transparent;padding:1px 3px;font:inherit;font-size:12.5px;line-height:1.45;color:var(--ink,#232323);border-radius:4px;min-height:0}
  #cot-mapa .cv-t td.it textarea:hover:not(:disabled){border-color:var(--line,#e8e8ea)}
  #cot-mapa .cv-t td.it textarea:focus{outline:none;border-color:var(--cv);background:var(--card,#fff);box-shadow:0 0 0 2px rgba(15,124,134,.15)}
  #cot-mapa .cv-t td.it textarea:disabled{opacity:1}
  #cot-mapa .cv-t td.u{min-width:74px} #cot-mapa .cv-t td.q{min-width:86px}
  #cot-mapa .cv-t td input,#cot-mapa .cv-t td select{border:1px solid transparent;background:transparent;padding:1px 3px;font-size:12.5px;width:100%;border-radius:4px;color:var(--ink,#232323);box-shadow:none;font-weight:500}
  #cot-mapa .cv-t td input:hover:not(:disabled),#cot-mapa .cv-t td select:hover:not(:disabled){border-color:var(--line,#e8e8ea)}
  #cot-mapa .cv-t td input:focus,#cot-mapa .cv-t td select:focus{border-color:var(--cv);background:var(--card,#fff);box-shadow:0 0 0 2px rgba(15,124,134,.15)}
  #cot-mapa .cv-t td input:disabled,#cot-mapa .cv-t td select:disabled{opacity:1;color:var(--ink,#232323)}
  #cot-mapa .cv-t td.pc{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
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
  #cot-mapa .cv-t td.pc,#cot-mapa .cv-t tfoot td{text-align:right}
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
  #cot-mapa .seg button.on{color:var(--cv)}
  /* estrutura do Mapa de Cotação BKP: marcas, alternativas, lápis, desaprovar, resultado */
  #cot-mapa .cv-t tbody.it td.it{position:relative}
  #cot-mapa .cv-t .gut{position:absolute;top:4px;right:4px;display:flex;gap:3px;opacity:0;transition:opacity .12s;z-index:2}
  #cot-mapa .cv-t tbody.it:hover .gut,#cot-mapa .cv-t tbody.it:focus-within .gut{opacity:1}
  #cot-mapa .cv-t .gut button{width:24px;height:24px;border:1px solid var(--line,#e8e8ea);background:var(--card,#fff);border-radius:6px;cursor:pointer;color:var(--ink2,#5c5c5c);display:flex;align-items:center;justify-content:center;padding:0;line-height:0}
  #cot-mapa .cv-t .gut button svg{width:14px;height:14px}
  #cot-mapa .cv-t .gut button:hover{border-color:var(--cv);color:var(--cv);filter:none}
  #cot-mapa .cv-t .gut button.x{color:#b42318;font-size:15px;line-height:1}
  #cot-mapa .cv-t tbody.it td.it textarea{padding-right:84px}
  #cot-mapa .cv-t tbody.it:not(:hover):not(:focus-within) td.it textarea{padding-right:3px}
  #cot-mapa .cv-t .altde{display:block;font-size:10.5px;font-style:italic;color:var(--cv);padding:0 3px 2px}
  #cot-mapa .cv-t .naotag{display:block;font-size:10.5px;font-style:italic;color:var(--ink3,#8e8e8e);padding:0 3px}
  #cot-mapa .cv-t .naotag:empty{display:none}
  #cot-mapa .cv-t tbody.alt td{border-top:1px dashed var(--line,#e8e8ea)}
  #cot-mapa .cv-t tbody.alt td.it{box-shadow:inset 3px 0 0 var(--cv2)}
  #cot-mapa .cv-t tr.mrc td.pc{border-top:1px dashed var(--line2,#ececee)}
  #cot-mapa .cv-t tbody.naob td>*,#cot-mapa .cv-t tbody.naob td.it textarea{opacity:.42}
  #cot-mapa .cv-t tbody.naob td.it .naotag,#cot-mapa .cv-t tbody.naob td.it .gut{opacity:1}
  #cot-mapa .cv-t tbody.altoff td.pc .pw,#cot-mapa .cv-t tbody.altoff td.pc .tv{color:var(--ink3,#9aa3ab)}
  #cot-mapa .cv-t tbody.altoff td.pc input{color:var(--ink3,#9aa3ab)}
  #cot-mapa .cv-t td.pc .mkl{display:flex;justify-content:flex-end;align-items:center;min-height:15px;gap:4px}
  #cot-mapa .cv-t td.pc .tagb{border:0;background:none;padding:1px;margin:0;cursor:pointer;color:var(--ink,#232323);opacity:.16;line-height:0}
  #cot-mapa .cv-t td.pc:hover .tagb{opacity:.45}
  #cot-mapa .cv-t td.pc .tagb:hover{opacity:.9;color:var(--cv);filter:none}
  #cot-mapa .cv-t td.pc .tagb svg{width:11px;height:11px}
  #cot-mapa .cv-t td.pc input.mke{display:none;width:100%;text-align:right;font-size:10.5px;text-transform:uppercase;color:var(--ink2,#5c5c5c);font-weight:400;padding:0 3px}
  #cot-mapa .cv-t td.pc input.mke.on,#cot-mapa .cv-t td.pc input.mke:focus{display:block}
  #cot-mapa .cv-t td.pc .mkl:has(.mke.on) .tagb,#cot-mapa .cv-t td.pc .mkl:has(.mke:focus) .tagb{display:none}
  #cot-mapa .cv-t td.pc.nc .pw,#cot-mapa .cv-t td.pc.nc .tv,#cot-mapa .cv-t td.pc.nc input,#cot-mapa .cv-t td.pc.nc .mk{color:var(--ink3,#9aa3ab)}
  #cot-mapa .cv-t td.pc .opb{display:inline-block;margin:3px 0 0;border:1px solid var(--line,#e4e4e7);background:var(--card,#fff);color:var(--ink2,#5c5c5c);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:600;line-height:16px;cursor:pointer}
  #cot-mapa .cv-t td.pc .opb[hidden]{display:none}
  #cot-mapa .cv-t td.pc .opb:hover{border-color:var(--cv);color:var(--cv);filter:none}
  #cot-mapa .cv-t td.pc .opb.on{background:var(--cv);border-color:var(--cv);color:#fff;cursor:default}
  #cot-mapa .cv-t td.pc .mkt{font-size:10.5px;color:var(--ink2,#5c5c5c);text-transform:uppercase}
  #cot-mapa .cv-t td.pc.esc.trv{box-shadow:inset 0 0 0 2px var(--cv)}
  #cot-mapa .cv-t td.dim>*{opacity:.4}
  #cot-mapa .cv-t td.gh{background:transparent;border-right:0}
  #cot-mapa.escolhendo .cv-t td.pc{cursor:pointer}
  #cot-mapa.escolhendo .cv-t td.pc:not(.vz):hover{box-shadow:inset 0 0 0 2px var(--cv)}
  #cot-mapa.escolhendo .cv-t td.pc input{cursor:pointer}
  #cot-mapa.escolhendo .cv-t .gut,#cot-mapa.marcando .cv-t .gut{display:none}
  #cot-mapa.marcando .cv-t tbody.it,#cot-mapa.marcando .cv-t tbody.it *{cursor:pointer}
  #cot-mapa.marcando .cv-t tbody.it:hover td{background:#e9ecef}
  #cot-mapa .cv-t tfoot tr.escgap td{border:0;background:transparent;height:18px;padding:0}
  #cot-mapa .cv-t tfoot tr.escrow th,#cot-mapa .cv-t tfoot tr.escrow td{color:var(--cvt);font-weight:600;border-top:1px solid var(--line2,#f0f0f2)}
  #cot-mapa .cv-t tfoot td small[data-pg]{display:block;text-align:left}
  #cot-mapa .cv-edg{display:inline-flex;align-items:stretch}
  #cot-mapa .cv-em{display:none;border:1px solid var(--cv);border-right:0;border-radius:8px 0 0 8px;overflow:hidden;background:var(--card,#fff)}
  #cot-mapa .cv-edg.ab .cv-em{display:inline-flex}
  #cot-mapa .cv-edg.ab .ic{border-radius:0 8px 8px 0}
  #cot-mapa .cv-em button{background:var(--card,#fff);color:var(--ink2,#5c5c5c);border:0;border-radius:0;font-weight:600;padding:0 14px;font-size:12px}
  #cot-mapa .cv-em button+button{border-left:1px solid var(--line,#e8e8ea)}
  #cot-mapa .cv-em button.on{background:var(--cv);color:#fff}
  #cot-mapa .cv-edg .ic.on,#cot-mapa .pen.on{background:var(--cv);color:#fff;border-color:var(--cv)}
  #cv-escbar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:4100;background:var(--card,#fff);color:var(--ink2,#3a444f);border:1px solid var(--line,#cdd2d7);border-radius:12px;box-shadow:0 10px 30px rgba(17,38,48,.18);padding:10px 12px 10px 16px;display:flex;align-items:center;gap:12px;font-size:12.5px;max-width:calc(100% - 24px)}
  #cv-escbar b{color:var(--cv,#0f7c86)}
  #cot-mapa .rhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
  #cot-mapa .rhead h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--cv);margin:0}
  #cot-mapa .rhead button svg{width:14px;height:14px;vertical-align:-3px}
  #cot-mapa .resg{display:grid;grid-template-columns:minmax(0,1fr) 312px;gap:12px;align-items:stretch}
  #cot-mapa .plan{position:relative;border:2px solid #4fad0a;border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;background:var(--card,#fff)}
  #cot-mapa .plan.man{border-color:var(--cv)}
  #cot-mapa .plan .pbtns{position:absolute;top:12px;right:12px;display:flex;gap:6px}
  #cot-mapa .pen{width:32px;height:32px;border:1px solid var(--line,#e8e8ea);background:var(--card,#fff);border-radius:8px;cursor:pointer;color:var(--ink,#232323);display:flex;align-items:center;justify-content:center;padding:0}
  #cot-mapa .pen:hover{border-color:var(--cv);filter:none}
  #cot-mapa .pen svg{width:15px;height:15px}
  #cot-mapa .plan .badge{align-self:flex-start;background:#67bb2c;color:#fff;font-size:11px;font-weight:600;padding:3px 10px;border-radius:7px}
  #cot-mapa .plan.man .badge{background:var(--cv)}
  #cot-mapa .plan .big{font-size:26px;font-weight:700;margin:6px 0 0;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:38px}
  #cot-mapa .plan .big.pend{font-size:22px;color:var(--ink3,#8e8e8e)}
  #cot-mapa .plan .delta{font-size:12.5px;font-style:italic;color:var(--ink2,#5c5c5c);margin:2px 0 10px;min-height:2.9em}
  #cot-mapa .plan .facts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 12px;margin-top:auto;padding-top:9px;border-top:1px solid var(--line2,#f0f0f2)}
  #cot-mapa .plan .facts div{font-size:11px;color:var(--ink3,#8e8e8e)}
  #cot-mapa .plan .facts b{display:block;font-size:12.5px;color:var(--ink,#232323);font-weight:600}
  #cot-mapa .side{display:flex;flex-direction:column;gap:10px}
  #cot-mapa .cmp{position:relative;flex:1;border:1px solid var(--line2,#e7eaed);border-radius:12px;background:var(--head,#fbfcfc);padding:12px 14px;display:flex;flex-direction:column;justify-content:center;min-height:96px;text-align:left}
  #cot-mapa .cmp .k{font-size:11.5px;color:var(--ink3,#8e8e8e);padding-right:16px}
  #cot-mapa .cmp .v{font-size:18px;font-weight:700;color:#58641d;margin-top:3px;font-variant-numeric:tabular-nums}
  #cot-mapa .cmp .v.ruim{color:var(--ink,#232323)}
  #cot-mapa .cmp .s{font-size:11.5px;color:var(--ink3,#8e8e8e);margin-top:1px}
  #cot-mapa .cmpx{position:absolute;top:6px;right:6px;border:0;background:none;color:var(--ink3,#8e8e8e);font-size:12px;cursor:pointer;opacity:0;padding:2px 5px;border-radius:5px}
  #cot-mapa .cmp:hover .cmpx{opacity:1}
  #cot-mapa .cmpx:hover{color:#b42318;filter:none}
  #cot-mapa .cmp.add{border:1.5px dashed var(--line,#cdd2d7);background:var(--card,#fff);cursor:pointer;align-items:center;color:var(--ink3,#8e8e8e)}
  #cot-mapa .cmp.add:hover{border-color:#4fad0a;color:#58641d;filter:none}
  #cot-mapa .cmp.add svg{width:22px;height:22px}
  #cot-mapa .alerts{margin-top:14px;display:flex;flex-direction:column;gap:6px}
  #cot-mapa .al{font-size:12.5px;padding:8px 12px;border-radius:8px;background:#fdf6e3;border-left:3px solid #e0b000;color:#5c4a00}
  #cot-mapa .al.r{background:#fbeeee;border-left-color:#c0392b;color:#7a2318}
  #cot-mapa .cv-dica svg{width:12px;height:12px;vertical-align:-2px}
  #cot-mapa .cv-dica b{font-weight:600}
  #cv-pop{position:fixed;z-index:4200;background:var(--card,#fff);color:var(--ink,#232323);border:1px solid var(--line,#d9dde1);border-radius:10px;box-shadow:0 10px 28px rgba(17,38,48,.16);padding:4px;min-width:200px;max-width:340px;max-height:360px;overflow:auto}
  #cv-pop button{display:flex;align-items:center;gap:9px;width:100%;border:0;background:none;text-align:left;font:inherit;font-size:12.5px;font-weight:500;padding:7px 10px;border-radius:7px;cursor:pointer;color:var(--ink,#232323)}
  #cv-pop button:hover{background:#e9f3f4;filter:none}
  #cv-pop button.on{font-weight:700}
  #cv-pop small{display:block;font-size:11px;color:var(--ink3,#8e8e8e);font-weight:400}
  #cv-pop .cbx{width:14px;height:14px;border:1.5px solid #cdd2d7;border-radius:4px;flex-shrink:0;position:relative}
  #cv-pop .cbx.on{background:#0f7c86;border-color:#0f7c86}
  #cv-pop .cbx.on:after{content:'';position:absolute;left:3.5px;top:.5px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
  #cot-mapa .cv-folha.foto .gut,#cot-mapa .cv-folha.foto .tagb,#cot-mapa .cv-folha.foto td.gh{display:none}
  @media (max-width:900px){ #cot-mapa .resg{grid-template-columns:1fr} }
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
        + h(c.o ? nomeLocal(c.o) : 'Sem obra') + ' · ' + dataBR(c.d) + ' · ' + c.itens.filter(i => !i.alt).length + ' ite' + (c.itens.filter(i => !i.alt).length === 1 ? 'm' : 'ns') + ' · ' + c.fs.length + ' fornecedor' + (c.fs.length === 1 ? '' : 'es')
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
    const lin = [['Nº', 'Data', 'Título', 'Obra', 'Solicitante', 'Comprador', 'Situação', 'Item', 'Un', 'Qtd', 'Fornecedor', 'Marca', 'Preço unit.', 'Total', 'Menor preço', 'Escolhido', 'Opção']];
    vivos(D.cot).forEach(c => { const R = calc(c), nao = new Set(R.NN.filter(n => n.nao).map(n => n.id));
      R.todos.forEach(i => c.fs.forEach(f => { for(let k = 0; k < slots(i); k++){ const p = precoN(f, i, k); if(!isFinite(p)) continue;
        const o = raiz(c, i) !== i ? 'alternativa de ' + raiz(c, i).desc : '';
        lin.push([numCot(c), dataBR(c.d), c.tit, c.o, c.sol, c.u, (SIT[c.st] || {}).n, i.desc, i.un, fq(i.q), f.nome, marcaDe(f, i, k), f2(p), f2(p * (num(i.q) || 0)),
          R.it[i.id].melhores.includes(f.id) && Math.abs(R.ef(f, i, k) - R.it[i.id].min) < 1e-6 ? 'sim' : '', R.esc[i.id] === f.id && R.escK[i.id] === k ? 'sim' : nao.has(raizId(c, i)) ? 'não será comprado' : '', o]); } })); });
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
      R.todos.filter(i => pal.every(p => String(i.desc).toLowerCase().includes(p))).forEach(i => c.fs.forEach(f => { for(let k = 0; k < slots(i); k++){
        const p = precoN(f, i, k); if(isFinite(p)) l.push({c, i, f, p, mk: marcaDe(f, i, k), esc: R.esc[i.id] === f.id && R.escK[i.id] === k && c.st !== 'aberta', min: R.it[i.id].melhores.includes(f.id) && Math.abs(R.ef(f, i, k) - R.it[i.id].min) < 1e-6}); } })); });
    l.sort((a, b2) => String(b2.c.d).localeCompare(String(a.c.d)) || a.p - b2.p);
    const esc = l.filter(x => x.esc);
    const ps = l.map(x => x.p);
    $('pre-res').innerHTML = !l.length ? '<div class="hint" style="margin-top:10px">Nenhum preço encontrado para esse item.</div>'
      : '<div class="kpis" style="margin-top:10px"><div class="kpi"><span>Último escolhido</span><b>' + (esc[0] ? R$(esc[0].p) : '—') + '</b></div>'
      + '<div class="kpi"><span>Menor já cotado</span><b>' + R$(Math.min(...ps)) + '</b></div><div class="kpi"><span>Propostas</span><b>' + l.length + '</b></div></div>'
      + '<table><tr><th>Data</th><th>Item</th><th>Fornecedor</th><th class="n">Preço unit.</th></tr>'
      + l.slice(0, 120).map(x => '<tr><td>' + dataBR(x.c.d) + '<br><small class="hint">' + numCot(x.c) + '</small></td><td>' + h(x.i.desc) + ' <small class="hint">(' + h(x.i.un || '') + ')</small></td><td>'
        + (x.esc ? '★ ' : '') + h(x.f.nome) + (x.mk ? ' <small class="hint">' + h(x.mk) + '</small>' : '') + '</td><td class="n"' + (x.min ? ' style="color:#1f7a3d;font-weight:700"' : '') + '>' + R$(x.p) + '</td></tr>').join('') + '</table>';
  }
  $('pre-busca').oninput = render;
  // último preço escolhido de um item parecido (para mostrar no mapa)
  const cacheR = new WeakMap(); // cálculo das cotações fechadas (não mudam enquanto o mapa está aberto)
  const calcC = c => { const x = cacheR.get(c); if(x && x.u === c.upd) return x.R; const R = calc(c); cacheR.set(c, {u: c.upd, R}); return R; };
  function ultimoPreco(desc, menosId){
    const d = String(desc || '').trim().toLowerCase(); if(d.length < 3) return null;
    let m = null;
    vivos(D.cot).forEach(c => { if(c.id === menosId || c.st === 'aberta' || c.st === 'cancelada' || c.st === 'aprovacao') return; const R = calcC(c);
      R.itens.forEach(i => { if(String(i.desc).trim().toLowerCase() !== d) return; const fid = R.esc[i.id], f = c.fs.find(x => x.id === fid); if(!f) return;
        const p = precoN(f, i, R.escK[i.id] || 0); if(isFinite(p) && (!m || c.d > m.d)) m = {p, d: c.d, f: f.nome}; }); });
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
    bus: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    lap: svg('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>'),
    pre: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
    lin: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h11M18 13.5v5M15.5 16h5"/>'),
    mais: svg('<path d="M12 5v14M5 12h14"/>'),
    eti: svg('<path d="M13.6 3H20.5a.5.5 0 0 1 .5.5v6.9L10.4 21a1.4 1.4 0 0 1-2 0l-5.4-5.4a1.4 1.4 0 0 1 0-2z"/><circle cx="16.8" cy="7.2" r="1.6"/>'),
    tag: svg('<path d="M12.6 3H20.5a.5.5 0 0 1 .5.5v7.9"/><path d="M13.2 20.4 10.4 21a1.4 1.4 0 0 1-2 0l-5.4-5.4a1.4 1.4 0 0 1 0-2L12.6 3"/><circle cx="16.8" cy="7.2" r="1.5"/><circle cx="17.6" cy="17.6" r="4.4"/><path d="M17.6 15.4v4.4M15.4 17.6h4.4"/>'),
    alt: svg('<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>')
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
  // Estrutura do "Mapa de Cotação" BKP: itens nas linhas, fornecedores nas colunas, linhas de marca e opções
  // alternativas por item, rodapé com as linhas que o comprador escolher, recomendação automática (com frete)
  // ou escolha à mão pelo lápis, predefinições, itens desaprovados e comparativos no resultado.
  let ESC = false, NAO = false;   // lápis (escolher a célula que fecha) e "Desaprovar" (itens que não serão comprados)
  function abrirMapa(id, novo){
    const c = achaCot(id); if(!c) return;
    mostrarM(); tela = 'mapa'; aberta = id; ESC = NAO = false;
    montarMapa(c);
    M.querySelector('.corpo').scrollTop = 0;
    if(novo) setTimeout(() => { const t = M.querySelector('[data-k=tit]'); if(t) t.focus(); }, 50);
  }
  function mexeu(c, semMapa){ c.upd = agora(); salvar(true); if(!semMapa) atualizar(c); }
  const redesenhar = (c, foco) => { const cp = M.querySelector('.corpo'), y = cp ? cp.scrollTop : 0, x = (M.querySelector('#cm-t') || {}).parentElement;
    const sx = x ? x.scrollLeft : 0; montarMapa(c); M.querySelector('.corpo').scrollTop = y; const w = M.querySelector('#cm-t'); if(w) w.parentElement.scrollLeft = sx;
    if(foco){ const el = M.querySelector(foco); if(el){ el.focus(); if(el.select) el.select(); } } };
  // a partir da primeira mudança na escolha, ela passa a ser gravada no formato novo
  const garantirEsc = c => { if(!c.esc) c.esc = JSON.parse(JSON.stringify(escolhas(c))); return c.esc; };

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

  // ----- linhas do rodapé (o comprador escolhe quais aparecem; linha com valor nunca some) -----
  const LINHAS = [
    {k: 'desconto', t: 'Desconto (%)', campo: 'desc', s: 'abate em todos os preços do fornecedor'},
    {k: 'frete', t: 'Frete (CIF / FOB)', campo: 'frete'},
    {k: 'impostos', t: 'Impostos (ICMS / IPI)', campo: 'imp', s: 'entram quando a compra é toda com o fornecedor'},
    {k: 'outros', t: 'Outro valor (nome livre)', campo: 'out', s: 'soma no total'},
    {k: 'pagamento', t: 'Condição de pagamento', campo: 'pag', s: 'mostra também o valor presente'},
    {k: 'entrega', t: 'Prazo de entrega', campo: 'prazo'},
    {k: 'validade', t: 'Validade da proposta', campo: 'val'},
    {k: 'cobertura', t: 'Cobertura', s: 'quantos itens cada um cotou'},
    {k: 'obs', t: 'Observação / nº do orçamento', campo: 'obs'}
  ];
  const temValor = (c, campo) => c.fs.some(f => { const v = f[campo]; return v != null && String(v).trim() !== '' && !(+v === 0 && /^[\d.,\s]*$/.test(String(v))); });
  function linhasAtivas(c){
    const at = c.lin == null ? (c.fs.length ? ['frete', 'pagamento', 'entrega'] : []) : String(c.lin).split(',').filter(Boolean);
    LINHAS.forEach(l => { if(l.campo && !at.includes(l.k) && temValor(c, l.campo)) at.push(l.k); });
    return LINHAS.map(l => l.k).filter(k => at.includes(k));
  }

  // ----- menu suspenso (predefinições, linhas, comparativos, situação) -----
  function fecharMenu(){ const m = $('cv-pop'); if(m) m.remove(); document.removeEventListener('mousedown', foraMenu, true); }
  function foraMenu(e){ if(!e.target.closest('#cv-pop')) fecharMenu(); }
  function abrirMenu(anc, ops, atual, pick){
    fecharMenu();
    const m = document.createElement('div'); m.id = 'cv-pop';
    m.innerHTML = ops.map((o, k) => '<button data-mi="' + k + '"' + (o.v === atual ? ' class="on"' : '') + '>' + (o.chk !== undefined ? '<i class="cbx' + (o.chk ? ' on' : '') + '"></i>' : '')
      + (o.cor ? '<i class="dot" style="background:' + o.cor + '"></i>' : '') + '<span>' + h(o.t || o.v) + (o.s ? '<small>' + h(o.s) + '</small>' : '') + '</span></button>').join('');
    document.body.appendChild(m);
    const r = anc.getBoundingClientRect(), w = m.offsetWidth;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    m.style.top = (r.bottom + 4 + m.offsetHeight > innerHeight ? Math.max(8, r.top - m.offsetHeight - 4) : r.bottom + 4) + 'px';
    m.onclick = e => { const b = e.target.closest('[data-mi]'); if(!b) return; fecharMenu(); pick(ops[+b.dataset.mi].v); };
    setTimeout(() => document.addEventListener('mousedown', foraMenu, true), 0);
  }

  // ----- montagem do mapa -----
  function montarMapa(c){
    fecharMenu();
    const tr = travada(c), dis = tr ? ' disabled' : '', si = SIT[c.st] || SIT.aberta;
    if(tr){ ESC = NAO = false; }
    const fs = c.fs, fc = id => achaForn(id) || {};
    M.innerHTML = `
    <div class="cv-top">
      <button class="cv-bk" data-a="fechar" title="Voltar para a lista (Esc)">← Mapas</button>
      <span class="cv-est" id="cv-salvo"></span>
      <span class="esp"></span>
      ${tr ? '' : '<span class="cv-edg"><span class="cv-em"><button data-em="cel">Editar</button><button data-em="nao">Desaprovar</button></span>'
        + '<button class="ic" data-a="lapis" id="cv-lapis" title="Editar a escolha: marcar à mão a célula que fecha em cada item">' + ICO.lap + '</button></span>'}
      <div class="cv-stw"><button class="cv-st" data-a="st" title="Mudar a situação">${si.n} <i style="background:${si.c}"></i></button><div class="cv-menu" hidden></div></div>
      <button class="ic" data-a="pedir" title="Pedir cotação aos fornecedores (WhatsApp / e-mail)">${ICO.env}</button>
      <button class="ic" data-a="foto" title="Imagem para pedir orçamento (WhatsApp) e imagem do mapa">${ICO.cam}</button>
      <button class="ic" data-a="imp" title="Imprimir / salvar PDF">${ICO.imp}</button>
      <button class="ic" data-a="dup" title="Duplicar: nova cotação com os mesmos itens, marcas e fornecedores, sem preços">${ICO.dup}</button>
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
          <colgroup><col><col style="width:64px"><col style="width:86px">${fs.map(() => '<col class="cf">').join('')}${tr ? '' : '<col class="cf">'}</colgroup>
          <thead><tr>
            <th class="it fix">Item</th><th class="c" style="width:64px">Und</th><th class="n" style="width:86px">Qtd</th>
            ${fs.map(f => '<th class="fh">' + (tr ? '' : '<button class="x" data-rf="' + f.id + '" title="Tirar da cotação">×</button>') + h(f.nome)
              + '<small>' + h([fc(f.id).cidade, fc(f.id).tel].filter(Boolean).join(' · ').toUpperCase() || ' ') + '</small></th>').join('')}
            ${tr ? '' : '<th class="add">+ Fornecedor<input id="cm-addf" placeholder="digite o nome"></th>'}
          </tr></thead>
          ${c.itens.map(i => corpoItem(c, i, tr)).join('')}
          ${tr ? '' : '<tbody class="nv"><tr><td class="fix" colspan="3"><a data-a="item">+ novo item</a><a data-a="colar">📋 colar do Excel</a></td><td colspan="' + (fs.length + 1) + '"></td></tr></tbody>'}
          <tfoot id="cm-f"></tfoot>
        </table></div>
        ${tr ? '' : '<div class="hint cv-dica">Clique no valor para lançar o preço unitário (em branco = não cotou); Enter desce, e dá para colar uma coluna de preços do Excel. Verde = menor preço do item · vermelho = o mais caro · fundo verde-petróleo = compra escolhida. Passe o mouse no item: '
          + '<b>' + ICO.tag + ' outra marca</b> (cada fornecedor lança a marca dele, só uma entra na conta) e <b>' + ICO.alt + ' opção alternativa</b> (outro produto no lugar deste). Se o fornecedor cotou mais de uma opção do mesmo item, clique em <b>usar no total</b> na célula para escolher qual entra no total dele.</div>'}
      </div>

      <div class="cv-folha" id="cm-res"></div>

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

    M.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => { c[k] = el.value; mexeu(c, k !== 'o'); });
    });
    ligarCorpo(c);
    M.querySelectorAll('.cv-top [data-a],.trava [data-a],tbody.nv [data-a]').forEach(b => b.onclick = () => acao(c, b.dataset.a, b));
    M.querySelectorAll('[data-em]').forEach(b => b.onclick = () => { const cel = b.dataset.em === 'cel'; ESC = cel ? !ESC : false; NAO = cel ? false : !NAO; aplicarModo(c); });
    M.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => {
      if(MOS === b.dataset.mo) return; MOS = b.dataset.mo;
      try{ localStorage.setItem('dmtbkp_cotMostra', MOS); }catch(e){}
      redesenhar(c);
    });
    M.querySelectorAll('[data-rf]').forEach(b => b.onclick = () => {
      const f = c.fs.find(x => x.id === b.dataset.rf); if(!f) return;
      const n = Object.values(f.p || {}).filter(v => ok(num(v))).length;
      if(n && !confirm('Tirar ' + f.nome + ' da cotação? Os ' + n + ' preço(s) lançados dele serão apagados.')) return;
      c.fs = c.fs.filter(x => x !== f);
      if(c.esc) Object.keys(c.esc).forEach(k => { if(c.esc[k].f === f.id) delete c.esc[k]; });
      registrar(c, 'Fornecedor retirado: ' + f.nome); mexeu(c, true); redesenhar(c);
    });
    const af = $('cm-addf');
    if(af){
      const add = f => { if(c.fs.some(x => x.id === f.id)) return; c.fs.push({id: f.id, nome: f.nome, frete: 0, tf: 'CIF', desc: 0, imp: 0, out: 0, prazo: '', pag: '', val: '', obs: '', p: {}, mk: {}}); registrar(c, 'Fornecedor incluído: ' + f.nome); mexeu(c, true); redesenhar(c);
        setTimeout(() => { const n = $('cm-addf'); if(n) n.focus(); }, 30); };
      sugerir(af, {local: q => {
        const l = vivos(D.forn).filter(f => !c.fs.some(x => x.id === f.id) && (!q || casa(f, q))).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).slice(0, 40);
        return [{tit: l.length ? 'Cadastrados' : '', msg: !l.length && q ? 'Nenhum cadastrado com esse nome.' : '', itens: l.map(f => ({t: f.nome, s: [f.cat, f.cidade].filter(Boolean).join(' · '), ac: () => { af.value = ''; add(f); }}))},
          {itens: [{t: q ? '➕ Cadastrar "' + q + '" como fornecedor novo' : '➕ Cadastrar fornecedor novo…', s: 'Busca no Google e pelo CNPJ', novo: true, ac: () => { af.value = ''; af.blur(); editarForn(null, add, q); }}]}];
      }});
    }
    aplicarModo(c, true);
    atualizar(c);
  }

  function corpoItem(c, i, tr){
    const S = slots(i), dis = tr ? ' disabled' : '', orig = i.alt ? c.itens.find(x => x.id === i.alt) : null, ult = ultimoPreco(i.desc, c.id);
    const edita = !tr && MOS === 'u';
    let t = '<tbody class="it' + (orig ? ' alt' : '') + '" data-i="' + i.id + '" data-need="' + raizId(c, i) + '">';
    for(let k = 0; k < S; k++){
      t += '<tr' + (k ? ' class="mrc"' : '') + '>';
      if(!k) t += '<td class="it fix" rowspan="' + S + '">'
        + (tr ? '' : '<span class="gut"><button data-g="marca" tabindex="-1" title="Outra marca deste produto: cada fornecedor lança a marca dele, só uma entra na conta">' + ICO.tag + '</button>'
          + '<button data-g="alt" tabindex="-1" title="Opção alternativa: outro produto no lugar deste (ex.: pneu 1000x20 borrachudo × liso)">' + ICO.alt + '</button>'
          + '<button data-g="del" class="x" tabindex="-1" title="Remover ' + (orig ? 'esta opção' : 'o item') + '">×</button></span>')
        + (orig ? '<span class="altde">opção alternativa de ' + h(orig.desc || '(sem descrição)') + '</span>' : '')
        + '<textarea data-ik="desc" rows="1" placeholder="' + (orig ? 'descrição da alternativa (outra especificação)' : 'descrição do item') + '"' + dis + '>' + h(i.desc) + '</textarea>'
        + '<span class="naotag"></span>'
        + (ult ? '<span class="ult">último preço: ' + R$(ult.p) + ' · ' + h(ult.f) + ' · ' + dataBR(ult.d) + '</span>' : '') + '</td>'
        + '<td class="c u" rowspan="' + S + '"><input data-ik="un" value="' + h(i.un) + '" list="cot-un" style="text-align:center"' + (orig ? ' disabled title="Mesma unidade do item original"' : dis) + '></td>'
        + '<td class="n q" rowspan="' + S + '"><input data-ik="q" value="' + h(i.q == null ? '' : fqIn(i.q)) + '" inputmode="decimal" style="text-align:right"' + (orig ? ' disabled title="Mesma quantidade do item original"' : dis) + '></td>';
      t += c.fs.map(f => celPreco(i, f, k, edita, tr)).join('') + (tr ? '' : '<td class="gh"></td>') + '</tr>';
    }
    return t + '</tbody>';
  }
  function celPreco(i, f, k, edita, tr){
    const p = precoN(f, i, k), mk = marcaDe(f, i, k);
    return '<td class="pc' + (isFinite(p) ? '' : ' vz') + '" data-cell="' + i.id + '|' + f.id + '|' + k + '">'
      + (edita ? '<div class="pw"><span class="rs">R$</span><input class="pr" data-p="' + f.id + '" data-k="' + k + '" inputmode="decimal" value="' + h(isFinite(p) ? f2(p) : '') + '" placeholder="–"></div>' : '<span class="tv"></span>')
      + '<div class="mkl">' + (edita ? '<button class="tagb" data-tg tabindex="-1" title="Escrever a marca">' + ICO.eti + '</button><input class="mke' + (mk ? ' on' : '') + '" data-mk="' + f.id + '" data-k="' + k + '" value="' + h(mk) + '" placeholder="marca" tabindex="-1">'
        : (mk ? '<span class="mkt">' + h(mk) + '</span>' : '')) + '</div>'
      + '<span class="mk"></span>'
      + (tr ? '' : '<button class="opb" data-op tabindex="-1" hidden></button>') + '</td>';
  }
  const prIn = v => ok(num(v)) ? f2(num(v)) : '';
  const fqIn = v => ok(num(v)) ? fq(num(v)) : String(v || '');

  // ----- itens: marcas, alternativas, remoção -----
  function novaMarca(c, i){
    const S = slots(i);
    for(let k = 1; k < S; k++) if(!c.fs.some(f => isFinite(precoN(f, i, k)) || marcaDe(f, i, k))) return redesenhar(c, '[data-cell="' + i.id + '|' + (c.fs[0] || {}).id + '|' + k + '"] input.pr');
    i.sl = S + 1; registrar(c, 'Linha de marca criada: ' + (i.desc || 'item sem descrição')); mexeu(c, true);
    redesenhar(c, c.fs[0] ? '[data-cell="' + i.id + '|' + c.fs[0].id + '|' + S + '"] input.pr' : null);
    if(!c.fs.length) alert('Inclua os fornecedores para lançar os preços de cada marca.');
  }
  // tira linhas de marca que ficaram vazias (fica pelo menos uma)
  function compactarMarcas(c, i){
    let mudouAlgo = false;
    for(let k = slots(i) - 1; k >= 1; k--){
      if(c.fs.some(f => isFinite(precoN(f, i, k)) || marcaDe(f, i, k))) continue;
      const S = slots(i);
      c.fs.forEach(f => { f.mk = f.mk || {};
        for(let j = k; j < S - 1; j++){ const a = chP(i.id, j), b = chP(i.id, j + 1);
          if(f.p[b] != null) f.p[a] = f.p[b]; else delete f.p[a]; if(f.mk[b]) f.mk[a] = f.mk[b]; else delete f.mk[a]; }
        delete f.p[chP(i.id, S - 1)]; delete f.mk[chP(i.id, S - 1)]; });
      if(c.esc) Object.keys(c.esc).forEach(n => { const e = c.esc[n]; if(e.i === i.id && +e.k > k) e.k = +e.k - 1; else if(e.i === i.id && +e.k === k) delete c.esc[n]; });
      i.sl = S - 1; mudouAlgo = true;
    }
    if(i.sl === 1) delete i.sl;
    return mudouAlgo;
  }
  function novaAlternativa(c, i){
    const r = c.itens.find(x => x.id === raizId(c, i)) || i, op = [r].concat(c.itens.filter(x => x.alt === r.id));
    const n = {id: uid(), desc: '', un: r.un, q: r.q, obs: '', alt: r.id};
    c.itens.splice(c.itens.indexOf(op[op.length - 1]) + 1, 0, n);
    registrar(c, 'Opção alternativa criada para: ' + (r.desc || 'item sem descrição')); mexeu(c, true);
    redesenhar(c, 'tbody[data-i="' + n.id + '"] [data-ik=desc]');
  }
  function removerItem(c, i){
    const alts = c.itens.filter(x => x.alt === i.id);
    const temP = c.fs.some(f => { for(let k = 0; k < slots(i); k++) if(isFinite(precoN(f, i, k))) return true; return false; });
    if((String(i.desc || '').trim() || temP) && !confirm('Remover "' + (i.desc || 'item sem descrição') + '"?' + (temP ? ' Os preços dele também serão apagados.' : ''))) return;
    const e = garantirEsc(c);
    if(alts.length){ const nv = alts[0]; delete nv.alt; alts.slice(1).forEach(x => x.alt = nv.id); if(e[i.id]){ e[nv.id] = e[i.id]; } }
    delete e[i.id]; Object.keys(e).forEach(n => { if(e[n].i === i.id) delete e[n]; });
    c.fs.forEach(f => { for(let k = 0; k < slots(i); k++){ delete f.p[chP(i.id, k)]; if(f.mk) delete f.mk[chP(i.id, k)]; } });
    c.itens = c.itens.filter(x => x !== i); mexeu(c, true); redesenhar(c);
  }

  // ----- escolha pelo lápis e itens desaprovados -----
  function escolherCelula(c, key){
    const [iid, fid, ks] = key.split('|'), k = +ks, i = c.itens.find(x => x.id === iid), f = c.fs.find(x => x.id === fid);
    if(!i || !f || !isFinite(precoN(f, i, k))) return;
    const e = garantirEsc(c), n = raizId(c, i), at = e[n];
    if(at && at.i === iid && at.f === fid && (+at.k || 0) === k) delete e[n]; else e[n] = {i: iid, f: fid, k};
    c.preset = ''; mexeu(c);
  }
  // "usar no total": define qual opção do item (original ou alternativa) conta no total daquele fornecedor
  function usarNoTotal(c, key){
    const [iid, fid] = key.split('|'), i = c.itens.find(x => x.id === iid), f = c.fs.find(x => x.id === fid);
    if(!i || !f) return;
    const n = raizId(c, i); c.opf = c.opf || {}; c.opf[fid] = c.opf[fid] || {};
    if(c.opf[fid][n] === iid) return;
    c.opf[fid][n] = iid;
    registrar(c, f.nome + ': "' + (i.desc || 'item sem descrição') + '" passa a contar no total'); mexeu(c);
  }
  function alternarNao(c, need){
    const e = garantirEsc(c), it = c.itens.find(x => x.id === need);
    if(e[need] && e[need].nao){ delete e[need]; registrar(c, 'Item reaprovado: ' + ((it || {}).desc || '')); }
    else { e[need] = {nao: 1}; registrar(c, 'Item desaprovado (não será comprado): ' + ((it || {}).desc || '')); }
    c.preset = ''; mexeu(c);
  }
  function aplicarModo(c, semAtualizar){
    if(!M) return;
    const at = ESC || NAO;
    M.classList.toggle('escolhendo', ESC); M.classList.toggle('marcando', NAO);
    const g = M.querySelector('.cv-edg'); if(g) g.classList.toggle('ab', at);
    M.querySelectorAll('[data-em]').forEach(b => b.classList.toggle('on', (b.dataset.em === 'cel' && ESC) || (b.dataset.em === 'nao' && NAO)));
    const lp = $('cv-lapis'); if(lp){ lp.classList.toggle('on', at); lp.title = at ? 'Concluir' : 'Editar a escolha: marcar à mão a célula que fecha em cada item'; }
    M.querySelectorAll('#cm-t input.pr,#cm-t input.mke').forEach(x => x.readOnly = at);
    let eb = $('cv-escbar'); if(eb) eb.remove();
    if(at){
      eb = document.createElement('div'); eb.id = 'cv-escbar';
      eb.innerHTML = ESC ? '<span><b>Escolha manual:</b> clique no preço que vai fechar em cada item (pode ser de uma opção alternativa ou de outra marca). Clique de novo para desfazer.</span>'
          + '<button class="sec mini" data-eb="rec">Voltar à recomendação</button><button class="mini" data-eb="ok">Concluir</button>'
        : '<span><b>Desaprovar:</b> clique nas linhas dos itens que não serão comprados. Clique de novo para desfazer.</span><button class="mini" data-eb="ok">Concluir</button>';
      M.appendChild(eb);
      eb.querySelectorAll('[data-eb]').forEach(b => b.onclick = () => {
        if(b.dataset.eb === 'rec'){ soNaoComprar(c); c.preset = ''; registrar(c, 'Voltou à recomendação automática'); mexeu(c, true); }
        ESC = NAO = false; aplicarModo(c);
      });
    }
    if(!semAtualizar) atualizar(c);
  }
  const soNaoComprar = c => { const e = garantirEsc(c); Object.keys(e).forEach(n => { if(!e[n].nao) delete e[n]; }); };

  function ligarCorpo(c){
    if(!document.getElementById('cot-un')){
      const dl = document.createElement('datalist'); dl.id = 'cot-un'; dl.innerHTML = UNID.map(u => '<option value="' + u + '">').join(''); document.body.appendChild(dl);
    }
    const tab = $('cm-t'), tr = travada(c);
    const alt = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    tab.querySelectorAll('textarea[data-ik=desc]').forEach(ta => { requestAnimationFrame(() => alt(ta)); ta.addEventListener('input', () => alt(ta)); });
    tab.querySelectorAll('tbody.it').forEach(tb => {
      const i = c.itens.find(x => x.id === tb.dataset.i); if(!i) return;
      tb.querySelectorAll('[data-ik]').forEach(el => {
        el.addEventListener('input', () => { const k = el.dataset.ik; i[k] = el.value;
          // unidade e quantidade valem para todas as opções do item
          if(k === 'un' || k === 'q') c.itens.filter(x => x.alt === i.id).forEach(x => { x[k] = el.value; const o = tab.querySelector('tbody[data-i="' + x.id + '"] [data-ik=' + k + ']'); if(o) o.value = el.value; });
          if(k === 'desc') tab.querySelectorAll('tbody.alt').forEach(t2 => { const x = c.itens.find(y => y.id === t2.dataset.i); if(x && x.alt === i.id){ const a = t2.querySelector('.altde'); if(a) a.textContent = 'opção alternativa de ' + (i.desc || '(sem descrição)'); } });
          mexeu(c); });
        if(el.dataset.ik === 'q') el.addEventListener('blur', () => { el.value = fqIn(i.q); });
      });
      tb.querySelectorAll('input[data-p]').forEach(el => {
        const f = c.fs.find(x => x.id === el.dataset.p), k = +el.dataset.k, ch = chP(i.id, k);
        const larg = () => { el.style.width = Math.max(3.5, el.value.length * 0.92 + 0.6) + 'ch'; }; larg();
        el.addEventListener('input', () => { larg(); const v = num(el.value); if(ok(v)) f.p[ch] = v; else delete f.p[ch]; mexeu(c); });
        el.addEventListener('blur', () => { el.value = prIn(f.p[ch]); larg(); });
        el.addEventListener('focus', () => { if(!el.readOnly) el.select(); });
        el.addEventListener('paste', e => colarPrecos(c, i, f, k, e));
      });
      tb.querySelectorAll('input[data-mk]').forEach(el => {
        const f = c.fs.find(x => x.id === el.dataset.mk), ch = chP(i.id, +el.dataset.k);
        el.addEventListener('input', () => { f.mk = f.mk || {}; const v = el.value.toUpperCase(); if(v.trim()) f.mk[ch] = v; else delete f.mk[ch]; mexeu(c, true); });
        el.addEventListener('blur', () => { el.value = el.value.toUpperCase(); el.classList.toggle('on', !!el.value.trim()); });
      });
      tb.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const mk = b.parentElement.querySelector('.mke'); if(mk){ mk.classList.add('on'); mk.focus(); } });
      tb.querySelectorAll('[data-g]').forEach(b => b.onclick = e => { e.stopPropagation();
        if(b.dataset.g === 'marca') novaMarca(c, i); else if(b.dataset.g === 'alt') novaAlternativa(c, i); else removerItem(c, i); });
      // ao sair do item, linhas de marca vazias somem
      tb.addEventListener('focusout', e => { if(slots(i) < 2 || (e.relatedTarget && tb.contains(e.relatedTarget))) return;
        const destino = e.relatedTarget;
        setTimeout(() => {
          // o mapa foi redesenhado (ex.: acabou de criar a linha de marca) ou o foco voltou para o mesmo item: não mexe
          const ae = document.activeElement, novo = M.querySelector('tbody.it[data-i="' + i.id + '"]');
          if(!tb.isConnected || (novo && novo.contains(ae))) return;
          if(aberta === c.id && compactarMarcas(c, i)){ mexeu(c, true); const dk = destino && destino.closest && destino.closest('td[data-cell]');
          redesenhar(c, dk ? '[data-cell="' + dk.dataset.cell + '"] input.pr' : null); } }, 0); });
    });
    // clique na célula: no lápis escolhe; no "Total" volta para o unitário; senão leva ao campo
    tab.addEventListener('mousedown', e => {
      const tb = e.target.closest('tbody.it');
      if(NAO){ if(tb && !e.target.closest('.gut')){ e.preventDefault(); alternarNao(c, tb.dataset.need); } return; }
      const td = e.target.closest('td.pc'); if(!td) { if(ESC && tb) e.preventDefault(); return; }
      if(e.target.closest('.tagb') || e.target.closest('.mke')) return;
      if(e.target.closest('.opb')){ e.preventDefault(); if(!tr && !ESC) usarNoTotal(c, td.dataset.cell); return; }
      if(ESC){ e.preventDefault(); escolherCelula(c, td.dataset.cell); return; }
      if(tr) return;
      if(MOS === 't'){ e.preventDefault(); MOS = 'u'; try{ localStorage.setItem('dmtbkp_cotMostra', MOS); }catch(x){} redesenhar(c, '[data-cell="' + td.dataset.cell + '"] input.pr'); return; }
      const inp = td.querySelector('input.pr'); if(inp && e.target !== inp){ e.preventDefault(); inp.focus(); }
    });
    // Enter desce na mesma coluna; na última descrição cria um item novo
    tab.addEventListener('keydown', e => {
      const el = e.target; if(e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if(el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
      if(e.key !== 'Enter' && !el.matches('input.pr,[data-ik=q]')) return;
      e.preventDefault();
      const sel = el.matches('input.pr') ? 'input.pr[data-p="' + el.dataset.p + '"]' : el.matches('input.mke') ? 'input.mke[data-mk="' + el.dataset.mk + '"]' : '[data-ik=' + el.dataset.ik + ']:not(:disabled)';
      const todos = [...tab.querySelectorAll(sel)], k = todos.indexOf(el), alvo = todos[k + (e.key === 'ArrowUp' || e.shiftKey ? -1 : 1)];
      if(alvo){ alvo.focus(); if(alvo.select && alvo.tagName === 'INPUT') alvo.select(); }
      else if(el.dataset.ik === 'desc' && !tr && !e.shiftKey) acao(c, 'item');
      else el.blur();
    });
  }
  // colar uma coluna (ou um bloco) de preços do Excel a partir da célula
  function colarPrecos(c, i, f, k, e){
    const t = ((e.clipboardData || window.clipboardData).getData('text/plain') || '').replace(/\r/g, '').replace(/\n+$/, '');
    if(!/[\n\t]/.test(t)) return;
    e.preventDefault();
    const linhas = []; c.itens.forEach(x => { for(let j = 0; j < slots(x); j++) linhas.push({i: x, k: j}); });
    const r0 = linhas.findIndex(l => l.i === i && l.k === k), c0 = c.fs.indexOf(f);
    let n = 0;
    t.split('\n').forEach((lin, ri) => { const l = linhas[r0 + ri]; if(!l) return;
      lin.split('\t').forEach((v, ci) => { const ff = c.fs[c0 + ci]; if(!ff) return; const p = num(v), ch = chP(l.i.id, l.k); if(ok(p)){ ff.p[ch] = p; n++; } else if(!String(v).trim()) delete ff.p[ch]; }); });
    registrar(c, n + ' preço(s) colados'); mexeu(c, true); redesenhar(c);
  }

  // ----- atualiza destaques, rodapé e resultado sem redesenhar os campos (para não perder o foco) -----
  function atualizar(c){
    if(!M || aberta !== c.id) return;
    const R = calc(c), tr = travada(c), E = R.E;
    estadoSalvo();
    const pickItem = {}, naoN = {}, escCel = {}, ndPor = {};
    R.NN.forEach(n => { ndPor[n.id] = n; if(n.nao) naoN[n.id] = 1; if(n.trava) pickItem[n.id] = n.trava.i.id; });
    Object.values(E.asg).forEach(x => escCel[x.i.id + '|' + x.fid + '|' + x.k] = 1);
    $('cm-t').querySelectorAll('tbody.it').forEach(tb => {
      const i = c.itens.find(x => x.id === tb.dataset.i); if(!i) return;
      const need = tb.dataset.need, nao = !!naoN[need], pk = pickItem[need];
      const nd = ndPor[need], opc = (nd && nd.opc) || {};
      const contam = c.fs.filter(f => opc[f.id] === i.id);
      const fora = nao || !!(pk && pk !== i.id), altoff = !!(i.alt && !pk && !nao && !contam.length);
      tb.classList.toggle('naob', fora); tb.classList.toggle('altoff', altoff);
      const tg = tb.querySelector('.naotag'); if(tg) tg.textContent = nao ? 'não será comprado' : fora ? 'fora da compra — outra opção escolhida'
        : altoff ? 'fora da conta — clique em "usar no total" na célula do fornecedor'
        : (i.alt && !pk) ? 'conta no total de: ' + contam.map(f => f.nome).join(', ') : '';
      const r = R.it[i.id];
      tb.querySelectorAll('td[data-cell]').forEach(td => {
        const [, fid, ks] = td.dataset.cell.split('|'), k = +ks, f = c.fs.find(x => x.id === fid); if(!f) return;
        const p = precoN(f, i, k), v = R.ef(f, i, k), esc = !!escCel[td.dataset.cell] && !fora;
        const desta = opc[f.id] === i.id, conta = !fora && (pk ? true : desta);
        const varias = !!(nd && !pk && !nao && isFinite(p) && opcoesCotadas(nd, f) > 1);
        td.classList.toggle('vz', !isFinite(p));
        td.classList.toggle('nc', !!nd && !fora && !pk && isFinite(p) && !desta);
        const ob = td.querySelector('.opb');
        if(ob){ ob.hidden = !varias || ESC || NAO; ob.classList.toggle('on', desta);
          ob.textContent = desta ? '✓ no total' : 'usar no total';
          ob.title = desta ? 'Esta opção é a que conta no total de ' + f.nome : 'Usar esta opção no total de ' + f.nome + ' (no lugar da outra que ele cotou)'; }
        td.classList.toggle('min', !!(conta && r && v != null && r.n > 1 && Math.abs(v - r.min) < 1e-6));
        td.classList.toggle('alto', !!(conta && r && v != null && r.n > 2 && r.max > r.min && v - r.max > -1e-6));
        td.classList.toggle('esc', esc);
        td.classList.toggle('trv', esc && pk === i.id);
        td.classList.toggle('dim', ESC && !!pk && !esc);
        const q = r ? r.q : (num(i.q) || 0);
        const tv = td.querySelector('.tv'); if(tv) tv.textContent = isFinite(p) ? R$(MOS === 't' ? p * q : p) : 'R$ –';
        const mk = td.querySelector('.mk');
        if(mk) mk.textContent = !isFinite(p) ? '' : MOS === 't' ? 'unit. ' + R$(p) : (q ? '= ' + R$(p * q) : '');
        td.title = r && v != null && r.min != null && v > r.min + 1e-6 ? '+' + pct((v / r.min - 1) * 100) + ' sobre o menor' : (td.classList.contains('min') ? 'Menor preço do item' : '');
      });
    });
    rodape(c, R, tr);
    renderResultado(c, R);
  }

  function rodape(c, R, tr){
    const foot = $('cm-f'), lin = linhasAtivas(c), tem = k => lin.includes(k), fs = c.fs;
    const sig = fs.map(f => f.id).join() + '/' + lin.join() + '/' + tr;
    const focado = document.activeElement && foot.contains(document.activeElement);
    const ult = tr ? '' : '<td class="gh"></td>';
    const span = r => '<th colspan="3" class="fix">' + r + '</th>';
    const din = (f, k, ph, x) => '<input data-fk="' + k + '" data-f="' + f.id + '" value="' + h(x && x.money ? prIn(f[k]) : (f[k] == null ? '' : f[k])) + '" placeholder="' + (ph || '') + '"'
      + (x && x.money ? ' inputmode="decimal" style="text-align:right"' : '') + (x && x.list ? ' list="' + x.list + '"' : '') + (x && x.tipo ? ' type="' + x.tipo + '"' : '') + (tr ? ' disabled' : '') + '>';
    const linha = (rot, cel, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' + span(rot) + fs.map(f => '<td>' + cel(f) + '</td>').join('') + ult + '</tr>';
    if(!focado || foot.dataset.n !== sig){
      foot.dataset.n = sig;
      if(!fs.length){ foot.innerHTML = '<tr><td colspan="' + (3 + (tr ? 0 : 1)) + '" class="hint" style="padding:14px;text-align:left">Adicione os fornecedores digitando o nome em "+ Fornecedor", no cabeçalho do mapa.</td></tr>'; return; }
      let t = '';
      if(['desconto', 'frete', 'impostos', 'outros'].some(tem)) t += '<tr data-r="sub">' + span('Subtotal') + fs.map(f => '<td data-s="' + f.id + '"></td>').join('') + ult + '</tr>';
      if(tem('desconto')) t += linha('Desconto (%)', f => din(f, 'desc', '0', {money: 0}).replace('placeholder', 'inputmode="decimal" style="text-align:right" placeholder'));
      if(tem('frete')) t += linha('Frete', f => '<div style="display:flex;gap:4px;justify-content:flex-end"><select data-fk="tf" data-f="' + f.id + '" style="width:auto"' + (tr ? ' disabled' : '') + '>'
        + ['CIF', 'FOB'].map(x => '<option' + (f.tf === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' + din(f, 'frete', 'R$ –', {money: 1}).replace('style="text-align:right"', 'style="text-align:right;width:110px"') + '</div>');
      if(tem('impostos')) t += linha('Impostos (ICMS / IPI)', f => din(f, 'imp', 'R$ –', {money: 1}));
      if(tem('outros')) t += '<tr>' + span('<input data-on="1" value="' + h(c.outNome || '') + '" placeholder="Outro valor (dê um nome)"' + (tr ? ' disabled' : '') + ' style="font-weight:700">')
        + fs.map(f => '<td>' + din(f, 'out', 'R$ –', {money: 1}) + '</td>').join('') + ult + '</tr>';
      t += '<tr class="tot">' + span('Total<small id="cm-nit"></small>') + fs.map(f => '<td data-tot="' + f.id + '"></td>').join('') + ult + '</tr>';
      if(tem('pagamento')){
        t += linha('Condição de pagamento', f => din(f, 'pag', 'Ex.: 28 dias, 30/60, 3x', {list: 'cot-pag'}) + '<small data-pg="' + f.id + '"></small>', 'cd');
        t += '<tr class="cd" data-r="pv">' + span('Total a valor presente') + fs.map(f => '<td data-pv="' + f.id + '"></td>').join('') + ult + '</tr>';
      }
      if(tem('entrega')) t += linha('Prazo de entrega', f => din(f, 'prazo', 'Ex.: 3 dias úteis'), 'cd');
      if(tem('validade')) t += linha('Validade da proposta', f => din(f, 'val', '', {tipo: 'date'}), 'cd');
      if(tem('cobertura')) t += '<tr class="cd">' + span('Cobertura') + fs.map(f => '<td data-cob="' + f.id + '"></td>').join('') + ult + '</tr>';
      if(tem('obs')) t += linha('Observação / nº do orçamento', f => din(f, 'obs', 'Ex.: orçamento 1234'), 'cd');
      // separado por uma linha em branco: só para conferência, não soma em nada
      t += '<tr class="escgap" data-r="eg"><td colspan="' + (3 + fs.length + (tr ? 0 : 1)) + '"></td></tr>'
        + '<tr class="escrow" data-r="es">' + span('Subtotal das escolhas') + fs.map(f => '<td data-es="' + f.id + '"></td>').join('') + ult + '</tr>';
      foot.innerHTML = t;
      if(!$('cot-pag')){ const dl = document.createElement('datalist'); dl.id = 'cot-pag'; dl.innerHTML = PAG.map(u => '<option value="' + u + '">').join(''); document.body.appendChild(dl); }
      foot.querySelectorAll('[data-fk]').forEach(el => {
        const f = fs.find(x => x.id === el.dataset.f), k = el.dataset.fk, din2 = ['frete', 'desc', 'imp', 'out'].includes(k);
        el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
          if(din2){ const v = num(el.value); f[k] = isFinite(v) && v >= 0 ? Math.min(k === 'desc' ? 100 : 1e12, v) : 0; } else f[k] = el.value;
          mexeu(c);
        });
        if(din2 && k !== 'desc') el.addEventListener('blur', () => { el.value = prIn(f[k]); });
      });
      const on = foot.querySelector('[data-on]'); if(on) on.addEventListener('input', () => { c.outNome = on.value; mexeu(c, true); });
    }
    const n = R.N.length, E = R.E;
    const nit = $('cm-nit'); if(nit) nit.textContent = n + ' ite' + (n === 1 ? 'm cotado' : 'ns cotados');
    let algumPrazo = false;
    fs.forEach(f => {
      const x = R.f[f.id], put = (a, v) => { const el = foot.querySelector('[' + a + '="' + f.id + '"]'); if(el) el.innerHTML = v; return el; };
      put('data-s', x.n ? R$(x.sub) + (x.dv > 0.005 ? '<small>com desconto: ' + R$(x.liq) + '</small>' : '') : '—');
      const best = !!(R.unico && R.unico.f.id === f.id && fs.length > 1);
      const nAlt = Object.values(x.asg).filter(y => y.i.alt).length;
      const t = put('data-tot', x.n ? R$(x.tot) + '<small' + (x.n < n ? ' style="color:#b26a00"' : '') + '>' + (best ? 'menor proposta completa' : x.n < n ? 'cotação parcial · ' + x.n + ' de ' + n : ' ') + '</small>'
        + (nAlt ? '<small style="color:var(--cvt)">com ' + nAlt + (nAlt === 1 ? ' opção alternativa' : ' opções alternativas') + '</small>' : '') : '—<small>não cotou</small>');
      if(t) t.classList.toggle('best', best);
      if(x.n && !x.pag.avista) algumPrazo = true;
      put('data-pv', !x.n ? '—' : x.pag.avista ? '<span class="hint">à vista</span>' : R$(x.pv));
      put('data-pg', x.pag.vazio || (x.pag.avista && !x.pag.desconhecido) ? '' : x.pag.desconhecido ? '<span style="color:#b42318">' + x.pag.label + '</span>' : x.pag.label);
      put('data-cob', x.n + ' de ' + n);
      const us = E.us[f.id] || [];
      put('data-es', us.length ? R$(us.reduce((s, y) => s + y.custo, 0)) + '<small>' + us.length + (us.length === 1 ? ' item' : ' itens') + '</small>' : '—');
    });
    const pv = foot.querySelector('[data-r=pv]'); if(pv) pv.style.display = algumPrazo ? '' : 'none';
    const temEsc = E.usados.length > 0 && fs.length > 1;
    foot.querySelectorAll('[data-r=eg],[data-r=es]').forEach(r => r.style.display = temEsc ? '' : 'none');
  }

  // ----- resultado: card da compra + 2 comparativos -----
  const PRESETS = [
    {k: 'rec', t: 'Recomendação automática', s: 'melhor combinação, já com o frete'},
    {k: 'unico', t: 'Melhor fornecedor único', s: 'tudo num pedido só'},
    {k: 'menor', t: 'Menor preço em cada item', s: 'ignora o frete e o número de pedidos'},
    {k: 'vp', t: 'Melhor a valor presente', s: 'considera o prazo de pagamento'},
    {k: 'entrega', t: 'Entrega mais rápida', s: 'menor prazo de entrega em cada item'}
  ];
  const COMPARATIVOS = [
    {k: 'media', t: 'Economia vs. média das cotações', s: 'quanto a compra fica abaixo da média dos preços recebidos'},
    {k: 'maior', t: 'Economia vs. maior proposta', s: 'diferença para a proposta completa mais cara'},
    {k: 'unico', t: 'Comparado ao melhor fornecedor único', s: 'quanto custaria comprar tudo de um só'},
    {k: 'ultima', t: 'Variação vs. última compra', s: 'preços frente à última compra dos mesmos itens'},
    {k: 'spread', t: 'Dispersão de preços', s: 'distância entre o maior e o menor preço de cada item'},
    {k: 'vp', t: 'Valor presente da compra', s: 'total trazido a hoje pelo prazo de pagamento'},
    {k: 'frete', t: 'Peso do frete', s: 'quanto do total é frete e outros custos do pedido'},
    {k: 'concentracao', t: 'Concentração da compra', s: 'fatia do maior fornecedor e número de pedidos'},
    {k: 'competicao', t: 'Competitividade', s: 'média de propostas recebidas por item'},
    {k: 'prazo', t: 'Prazo para receber tudo', s: 'maior prazo de entrega entre os escolhidos'}
  ];
  const compSel = c => String(c.cmp == null ? 'media,unico' : c.cmp).split(',').filter(k => COMPARATIVOS.some(x => x.k === k)).slice(0, 2);
  function compValor(k, c, R){
    const E = R.E, nf = id => h((c.fs.find(f => f.id === id) || {}).nome || '');
    if(k === 'media'){
      if(!E.usados.length) return {v: '—', s: 'sem preços suficientes'};
      return {ruim: R.ecoMed < -0.005, v: R$(Math.abs(R.ecoMed)), s: (R.ecoMed >= 0 ? '↓ ' + pct(R.ecoPct) + ' abaixo' : '↑ ' + pct(-R.ecoPct) + ' acima') + ' da média'};
    }
    if(k === 'maior'){
      const cs = c.fs.map(f => R.f[f.id]).filter(x => x.completo); if(!cs.length) return {v: '—', s: 'nenhuma proposta completa'};
      const mx = cs.reduce((m, x) => !m || x.tot > m.tot ? x : m, null), d = mx.tot - E.tot;
      if(d <= 0.005) return {v: R$(0), s: 'a compra já é a proposta mais cara'};
      return {v: R$(d), s: '↓ ' + pct(d / mx.tot * 100) + ' abaixo de ' + nf(mx.f.id)};
    }
    if(k === 'unico'){
      if(!R.unico) return {v: '—', s: 'ninguém cotou todos os itens'};
      const d = E.tot - R.unico.E.tot;
      if(Math.abs(d) < 0.01) return {v: R$(R.unico.E.tot), s: 'a compra é tudo com ' + nf(R.unico.f.id)};
      return {ruim: d > 0, v: R$(Math.abs(d)), s: (d < 0 ? '↓ mais barato' : '↑ mais caro') + ' que comprar tudo de ' + nf(R.unico.f.id)};
    }
    if(k === 'ultima'){
      let b = 0, p = 0, n = 0;
      Object.values(E.asg).forEach(x => { const ul = ultimoPreco(x.i.desc, c.id); if(ul){ b += x.q * ul.p; p += x.custo; n++; } });
      if(!n || !(b > 0)) return {v: '—', s: 'sem compra anterior desses itens'};
      const vr = (p - b) / b; return {ruim: vr > 0.0005, v: (vr > 0.0005 ? '↑ ' : vr < -0.0005 ? '↓ ' : '') + pct(Math.abs(vr) * 100), s: (vr > 0 ? 'acima' : 'abaixo') + ' da última compra · ' + n + (n === 1 ? ' item' : ' itens')};
    }
    if(k === 'spread'){
      let t = 0, q = 0;
      R.N.forEach(nd => { const ps = nd.auto.map(x => x.p); if(ps.length < 2) return; const mn = Math.min(...ps); t += (Math.max(...ps) - mn) / mn; q++; });
      if(!q) return {v: '—', s: 'precisa de 2 preços por item'};
      return {v: pct(t / q * 100), s: 'entre o maior e o menor preço, em média · ' + q + (q === 1 ? ' item' : ' itens')};
    }
    if(k === 'vp'){
      let vp = 0, nom = 0, prazo = false;
      E.usados.forEach(fid => { const x = R.f[fid], v = E.us[fid].reduce((s, y) => s + y.custo, 0) + x.fr + x.out; if(!x.pag.avista) prazo = true; nom += v; vp += valorPresente(v, x.pag.dias, TAXA_MES); });
      if(E.imp){ nom += E.imp; vp += E.imp; }
      if(!prazo) return {v: R$(E.tot), s: 'pagamento à vista — igual ao total'};
      return {v: R$(vp), s: '↓ ' + R$(nom - vp) + ' a menos que o total, a ' + pct(TAXA_MES * 100) + ' a.m.'};
    }
    if(k === 'frete'){
      const fr = E.fr + E.out; if(!(E.tot > 0)) return {v: '—', s: ''};
      return {v: pct(fr / E.tot * 100), s: fr ? R$(fr) + ' em frete e outros custos' : 'sem frete nesta compra'};
    }
    if(k === 'concentracao'){
      if(!E.usados.length) return {v: '—', s: ''};
      let top = null, tv = 0;
      E.usados.forEach(fid => { const x = R.f[fid], v = E.us[fid].reduce((s, y) => s + y.custo, 0) + x.fr + x.out; if(v > tv){ tv = v; top = fid; } });
      return {v: pct(tv / E.tot * 100), s: 'com ' + nf(top) + ' · ' + E.usados.length + (E.usados.length === 1 ? ' pedido' : ' pedidos')};
    }
    if(k === 'competicao'){
      let soma = 0, n3 = 0, nn = 0;
      R.N.forEach(nd => { const q = new Set(nd.auto.map(x => x.fid)).size; if(!q) return; soma += q; nn++; if(q >= 3) n3++; });
      if(!nn) return {v: '—', s: ''};
      return {v: (soma / nn).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' propostas', s: 'por item · ' + n3 + ' de ' + nn + ' itens com 3 ou mais'};
    }
    if(k === 'prazo'){
      let pior = null, dp = -1;
      E.usados.forEach(fid => { const d = diasEntrega(R.f[fid].f); if(isFinite(d) && d > dp){ dp = d; pior = fid; } });
      if(!pior) return {v: '—', s: 'preencha o prazo de entrega'};
      return {v: dp + (dp === 1 ? ' dia' : ' dias'), s: 'o mais demorado: ' + nf(pior)};
    }
    return {v: '—', s: ''};
  }
  function asgValorPresente(c, R){
    const fs = c.fs, nf = fs.length, fidx = {}, fat = {};
    fs.forEach((f, k) => { fidx[f.id] = k; fat[f.id] = valorPresente(1, R.f[f.id].pag.dias, TAXA_MES); });
    const needs = R.N.filter(nd => nd.auto.length); let best = null;
    for(let mask = 1; mask < (1 << Math.min(nf, 14)); mask++){
      let tot = 0, used = 0, okm = true; const asg = {};
      for(const nd of needs){ let bo = null, bv = Infinity;
        nd.auto.forEach(x => { if(!((mask >> fidx[x.fid]) & 1)) return; const v = x.custo * fat[x.fid]; if(v < bv){ bv = v; bo = x; } });
        if(!bo){ okm = false; break; } tot += bv; used |= 1 << fidx[bo.fid]; asg[nd.id] = bo; }
      if(!okm || used !== mask) continue;
      for(let k = 0; k < nf; k++) if((mask >> k) & 1) tot += (R.f[fs[k].id].fr + R.f[fs[k].id].out) * fat[fs[k].id];
      if(!best || tot < best.tot - 0.005) best = {tot, asg};
    }
    return best ? best.asg : null;
  }
  function aplicarPreset(c, k){
    const R = calc(c); let asg = null;
    if(k === 'rec'){ soNaoComprar(c); c.preset = ''; registrar(c, 'Escolha: recomendação automática'); mexeu(c); return; }
    if(k === 'unico'){ if(!R.unico) return alert('Nenhum fornecedor cotou todos os itens.'); asg = R.unico.E.asg; }
    if(k === 'menor') asg = R.menor.asg;
    if(k === 'vp'){ asg = asgValorPresente(c, R); if(!asg) return alert('Sem preços para calcular.'); }
    if(k === 'entrega'){
      if(!c.fs.some(f => isFinite(diasEntrega(f)))) return alert('Preencha o prazo de entrega dos fornecedores (linha "Prazo de entrega" — ative em Linhas da tabela).');
      asg = {}; R.N.forEach(nd => { let b = null; nd.auto.forEach(x => { const d = diasEntrega(R.f[x.fid].f), db = b ? diasEntrega(R.f[b.fid].f) : Infinity;
        if(!b || d < db || (d === db && x.custo < b.custo)) b = x; }); if(b) asg[nd.id] = b; });
    }
    soNaoComprar(c); const e = c.esc;
    Object.keys(asg).forEach(n => { const x = asg[n]; e[n] = {i: x.i.id, f: x.fid, k: x.k}; });
    c.preset = k; registrar(c, 'Escolha: ' + PRESETS.find(p => p.k === k).t); mexeu(c);
  }
  function abrirLinhas(c, anc){
    const at = linhasAtivas(c);
    abrirMenu(anc, LINHAS.map(l => ({v: l.k, t: l.t, s: l.s, chk: at.includes(l.k)})), null, k => {
      const l = LINHAS.find(x => x.k === k), novo = linhasAtivas(c);
      if(novo.includes(k)){
        if(l.campo && temValor(c, l.campo)){
          if(!confirm('Tirar a linha "' + l.t + '"? Os valores preenchidos nela serão apagados.')) return;
          c.fs.forEach(f => f[l.campo] = ['frete', 'desc', 'imp', 'out'].includes(l.campo) ? 0 : '');
          if(k === 'outros') c.outNome = '';
        }
        novo.splice(novo.indexOf(k), 1);
      } else novo.push(k);
      c.lin = novo.join(','); mexeu(c, true); redesenhar(c);
      const b = M.querySelector('[data-r=linhas]'); if(b) abrirLinhas(c, b);
    });
  }

  function renderResultado(c, R){
    const tr = travada(c), box = $('cm-res'), E = R.E;
    const nf = id => (c.fs.find(f => f.id === id) || {}).nome || '';
    const cab = '<div class="rhead"><h2>Resultado</h2>' + (tr ? '' : '<button class="sec mini" data-r="linhas" title="Escolher as linhas do rodapé da tabela">' + ICO.lin + ' Linhas da tabela</button>') + '</div>';
    if(!R.N.length || !c.fs.length || !R.N.some(nd => nd.todas.length)){
      box.innerHTML = cab + '<div class="hint">Lance os itens, os fornecedores e os preços para comparar as propostas.</div>';
    } else {
      const pend = (R.manual || ESC) ? R.N.filter(nd => !nd.trava).length : 0;
      const pre = R.manual && c.preset ? PRESETS.find(x => x.k === c.preset) : null;
      const badge = pre ? pre.t : R.manual ? 'Escolha do comprador' : 'Recomendado';
      let linha;
      if(R.manual && R.rec){ const d = E.tot - R.rec.E.tot;
        linha = Math.abs(d) < 0.01 ? 'Mesmo valor da recomendação automática.' : d > 0 ? R$(d) + ' mais caro que a recomendação automática (' + R$(R.rec.E.tot) + ').' : R$(-d) + ' mais barato que a recomendação automática.'; }
      else if(E.usados.length === 1) linha = 'Tudo com ' + h(nf(E.usados[0])) + ' — um pedido só.';
      else if(R.unico) linha = 'Dividida em ' + E.usados.length + ' pedidos · economiza ' + R$(R.unico.E.tot - E.tot) + ' em relação a comprar tudo de ' + h(R.unico.f.nome) + '.';
      else linha = 'Nenhum fornecedor cotou todos os itens; a compra fica dividida em ' + E.usados.length + ' pedidos.';
      const fsu = E.usados.map(id => c.fs.find(f => f.id === id)).filter(Boolean), uni = a => [...new Set(a.filter(Boolean))];
      const pags = uni(fsu.map(f => f.pag)), ents = uni(fsu.map(f => f.prazo));
      const card = '<div class="plan' + (R.manual ? ' man' : '') + '">'
        + (tr ? '' : '<div class="pbtns"><button class="pen" data-r="preset" title="Predefinições de escolha">' + ICO.pre + '</button>'
          + '<button class="pen' + (ESC ? ' on' : '') + '" data-r="lapis" title="' + (ESC ? 'Concluir a escolha' : 'Escolher à mão a célula que fecha em cada item') + '">' + ICO.lap + '</button></div>')
        + '<span class="badge">' + h(badge) + '</span>'
        + (pend ? '<div class="big pend">Escolha pendente</div><div class="delta">Falta escolher ' + pend + ' de ' + R.N.length + (R.N.length === 1 ? ' item' : ' itens') + '. Use o lápis para marcar uma célula em cada item.</div>'
          : '<div class="big">' + R$(E.tot) + '</div><div class="delta">' + linha + '</div>')
        + '<div class="facts"><div>Frete<b>' + (E.fr ? R$(E.fr) : '—') + '</b></div><div>Pagamento<b>' + (pags.length ? h(pags.join(' / ')) : '—') + '</b></div><div>Entrega<b>' + (ents.length ? h(ents.join(' / ')) : '—') + '</b></div></div></div>';
      const sel = compSel(c);
      let side = sel.map(k => { const d = COMPARATIVOS.find(x => x.k === k), r = pend ? {v: '—', s: 'escolha pendente'} : compValor(k, c, R);
        return '<div class="cmp">' + (tr ? '' : '<button class="cmpx" data-cx="' + k + '" title="Remover">✕</button>') + '<div class="k">' + h(d.t) + '</div><div class="v' + (r.ruim ? ' ruim' : '') + '">' + r.v + '</div><div class="s">' + r.s + '</div></div>'; }).join('');
      for(let k = sel.length; k < 2; k++) side += tr ? '' : '<button class="cmp add" data-r="cmpadd" title="Adicionar comparativo">' + ICO.mais + '</button>';
      // avisos
      const al = [];
      const comPreco = c.fs.filter(f => R.N.some(nd => nd.todas.some(x => x.fid === f.id))).length;
      if(comPreco < 3) al.push(['', 'Só ' + comPreco + (comPreco === 1 ? ' fornecedor cotou' : ' fornecedores cotaram') + '. O usual é comparar pelo menos 3 propostas.']);
      R.N.forEach(nd => { const d = h((nd.orig || {}).desc || '(sem descrição)');
        if(!nd.todas.length) al.push(['r', 'Sem nenhum preço: ' + d + '.']);
        else if(!nd.auto.length && !nd.trava) al.push(['r', d + ' não tem preço; só a opção alternativa foi cotada. Use o lápis para fechar a alternativa.']); });
      R.todos.forEach(i => { if(!(num(i.q) > 0)) al.push(['r', 'Quantidade zerada em ' + h(i.desc || '(sem descrição)') + '.']); });
      c.fs.forEach(f => { if(f.val && f.val < hoje() && R.f[f.id].n) al.push(['', 'A proposta de ' + h(f.nome) + ' venceu em ' + dataBR(f.val) + '. Confirme os preços antes de fechar.']);
        if(R.f[f.id].pag.desconhecido) al.push(['', 'Não entendi a condição de pagamento de ' + h(f.nome) + ' ("' + h(f.pag) + '"). Use algo como "à vista", "30 dias", "28/42" ou "3x".']); });
      box.innerHTML = cab + '<div class="resg">' + card + '<div class="side">' + side + '</div></div>'
        + (al.length ? '<div class="alerts">' + al.map(a => '<div class="al ' + a[0] + '">' + a[1] + '</div>').join('') + '</div>' : '');
    }
    box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      const r = b.dataset.r;
      if(r === 'linhas') return abrirLinhas(c, b);
      if(r === 'preset') return abrirMenu(b, PRESETS.map(x => ({v: x.k, t: x.t, s: x.s})), R.manual ? c.preset : 'rec', k => aplicarPreset(c, k));
      if(r === 'lapis'){ ESC = !ESC; NAO = false; return aplicarModo(c); }
      if(r === 'cmpadd'){ const sel = compSel(c);
        return abrirMenu(b, COMPARATIVOS.filter(x => !sel.includes(x.k)).map(x => ({v: x.k, t: x.t, s: x.s})), null, k => { sel.push(k); c.cmp = sel.join(','); mexeu(c); }); }
    });
    box.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => { c.cmp = compSel(c).filter(x => x !== b.dataset.cx).join(','); mexeu(c); });

    // pedido por fornecedor
    const ped = E.usados.map(fid => { const x = R.f[fid], its = E.us[fid];
      return {f: x.f, its, fr: x.fr, out: x.out, imp: E.integral ? E.imp : 0, tot: its.reduce((s, y) => s + y.custo, 0) + x.fr + x.out + (E.integral ? E.imp : 0)}; });
    const mkTxt = (f, x) => { const m = marcaDe(f, x.i, x.k); return m ? ' (' + m + ')' : ''; };
    const naoC = R.NN.filter(nd => nd.nao);
    $('cm-ped').innerHTML = (!ped.length ? '<div class="hint">Assim que houver preços, aparece aqui o que comprar de cada fornecedor.</div>'
      : ped.map(p => '<div class="ped"><b>' + h(p.f.nome) + '</b><b class="t">' + R$(p.tot) + '</b><ul>'
        + p.its.map(x => '<li>' + h(x.i.desc) + h(mkTxt(p.f, x)) + ' — ' + fq(x.q) + ' ' + h(x.i.un || '') + ' × ' + R$(x.p) + '</li>').join('')
        + (p.fr ? '<li>Frete ' + h(p.f.tf || '') + ': ' + R$(p.fr) + '</li>' : '') + (p.out ? '<li>' + h(c.outNome || 'Outro valor') + ': ' + R$(p.out) + '</li>' : '') + (p.imp ? '<li>Impostos (ICMS / IPI): ' + R$(p.imp) + '</li>' : '') + '</ul>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="sec mini" data-pf="' + p.f.id + '" data-t="zap">Pedido no WhatsApp</button><button class="sec mini" data-pf="' + p.f.id + '" data-t="cp">Copiar texto</button>'
        + '<span class="hint">' + [p.f.prazo && 'Entrega: ' + h(p.f.prazo), p.f.pag && 'Pagto: ' + h(p.f.pag)].filter(Boolean).join(' · ') + '</span></div></div>').join('')
        + '<div class="ped" style="background:var(--head,#f6f6f7)"><b>Total da compra</b><b class="t">' + R$(E.tot) + '</b></div>')
      + (E.falta.length ? '<div class="sug al">⚠ Sem preço para comprar: ' + E.falta.map(nd => h((nd.orig || {}).desc || '')).join(', ') + '.</div>' : '')
      + (naoC.length ? '<div class="hint" style="margin-top:8px">Não serão comprados: ' + naoC.map(nd => h((nd.orig || {}).desc || '')).join(', ') + '.</div>' : '');
    $('cm-ped').querySelectorAll('[data-pf]').forEach(b => b.onclick = async () => {
      const p = ped.find(x => x.f.id === b.dataset.pf); if(!p) return;
      const o = c.o ? nomeLocal(c.o) : '';
      const t = '*Pedido de compra – BKP Construtora*\nRef.: ' + numCot(c) + (c.tit ? ' – ' + c.tit : '') + (o ? '\nObra: ' + o : '') + '\n\n'
        + p.its.map((x, k) => (k + 1) + '. ' + x.i.desc + mkTxt(p.f, x) + ' — ' + fq(x.q) + ' ' + (x.i.un || '') + ' × ' + R$(x.p) + ' = ' + R$(x.custo)).join('\n')
        + (p.fr ? '\nFrete (' + (p.f.tf || '') + '): ' + R$(p.fr) : '') + (p.out ? '\n' + (c.outNome || 'Outro valor') + ': ' + R$(p.out) : '') + (p.imp ? '\nImpostos: ' + R$(p.imp) : '')
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
      if(!R.N.length) return alert('Lance os itens antes.');
      const prob = [];
      if(R.pend) prob.push('falta escolher ' + R.pend + ' item(ns) pelo lápis');
      if(R.E.falta.length) prob.push(R.E.falta.length + ' item(ns) sem fornecedor escolhido');
      if(c.fs.length < 3) prob.push('só ' + c.fs.length + ' fornecedor(es) cotado(s) (o usual são 3)');
      if(R.manual && R.rec && R.E.tot > R.rec.E.tot + 0.005 && !String(c.just || '').trim()) prob.push('a escolha fica ' + R$(R.E.tot - R.rec.E.tot) + ' mais cara que a recomendação automática e não há justificativa');
      if(prob.length && !confirm('Atenção:\n• ' + prob.join('\n• ') + '\n\nContinuar mesmo assim?')) return;
    }
    if(s === 'cancelada' && !confirm('Cancelar a ' + numCot(c) + '?')) return;
    if(s === 'aprovada'){ c.apr = usuario(); c.aprd = hoje(); }
    if(s === 'aberta'){ c.apr = ''; c.aprd = ''; }
    if(s === 'pedido') c.pedd = hoje();
    // congela a escolha ao aprovar, para o resultado não mudar se alguém reabrir e mexer
    if(s === 'aprovada' && !R.manual){ const e = garantirEsc(c); R.N.forEach(nd => { const x = R.E.asg[nd.id]; if(x) e[nd.id] = {i: x.i.id, f: x.fid, k: x.k}; }); c.preset = 'rec'; }
    c.st = s; ESC = NAO = false; registrar(c, (SIT[s] || {}).n + (s === 'aprovada' ? ' · ' + R$(R.E.tot) : ''));
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
    if(a === 'lapis'){ if(ESC || NAO){ ESC = NAO = false; } else ESC = true; return aplicarModo(c); }
    if(a === 'foto') return abrirImagem(c);
    if(a === 'item'){
      const i = {id: uid(), desc: '', un: 'un', q: 1, obs: ''}; c.itens.push(i); mexeu(c, true);
      redesenhar(c, 'tbody[data-i="' + i.id + '"] [data-ik=desc]');
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
        c.itens = c.itens.filter(i => String(i.desc).trim() || c.itens.some(x => x.alt === i.id)).concat(novos); registrar(c, novos.length + ' item(ns) colados'); mexeu(c, true); redesenhar(c);
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
      + (() => { let k = 0; return its.map(i => (i.alt && its.some(x => x.id === i.alt) ? '    ou: ' : (++k) + '. ') + i.desc + ' — ' + fq(i.q) + ' ' + (i.un || '')).join('\n'); })()
      + (its.some(i => i.alt) ? '\n\nNos itens com "ou", favor cotar todas as opções.' : '')
      + '\n\nFavor informar: preço unitário, frete (CIF ou FOB), prazo de entrega, condição de pagamento e validade da proposta.'
      + (c.prazo ? '\nPrazo para resposta: ' + dataBR(c.prazo) + '.' : '') + '\nRef.: ' + numCot(c) + '\n\nObrigado!';
    const fsl = c.fs.map(f => ({f, cad: achaForn(f.id) || {}}));
    const m = modal('Pedir cotação aos fornecedores',
      '<div class="hint" style="margin-bottom:6px">Texto pronto com os ' + its.filter(i => !i.alt).length + ' itens. Envie para cada fornecedor pelo WhatsApp ou e-mail.</div>'
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

  // ---------- imagem para pedir orçamento (WhatsApp) ----------
  // PNG com os itens, sem preços (o WhatsApp converte para JPEG; partir de PNG evita comprimir duas vezes).
  // Até 12 itens: uma coluna. Mais: colunas lado a lado numa imagem só, lendo da esquerda para a direita.
  const EMPRESA = 'BKP Construtora', CNPJ = '16.939.495/0001-59';
  function quebrar(ctx, txt, larg){
    const palavras = String(txt || '').split(/\s+/), linhas = []; let atual = '';
    palavras.forEach(p => {
      const t = atual ? atual + ' ' + p : p;
      if(ctx.measureText(t).width <= larg){ atual = t; return; }
      if(atual) linhas.push(atual);
      while(ctx.measureText(p).width > larg){ let k = p.length; while(k > 1 && ctx.measureText(p.slice(0, k)).width > larg) k--; linhas.push(p.slice(0, k)); p = p.slice(k); }
      atual = p;
    });
    if(atual) linhas.push(atual);
    return linhas.length ? linhas : [''];
  }
  function pintarImagem(c, logo){
    const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    let num0 = 0;
    const its = c.itens.filter(i => String(i.desc || '').trim()).map(i => ({i, ou: !!(i.alt && c.itens.some(x => x.id === i.alt)), n: i.alt && c.itens.some(x => x.id === i.alt) ? '' : String(++num0)}));
    const n = its.length, ncol = n <= 12 ? 1 : n <= 50 ? 2 : 3, por = Math.ceil(n / ncol);
    const PAD = 56, COLW = 968, GAP = 64, cN = 76, cUn = 120, cQ = 150, cItem = COLW - cN - cUn - cQ;
    const W = PAD * 2 + ncol * COLW + (ncol - 1) * GAP;
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    ctx.font = '28px ' + FONT;
    const colunas = [];
    for(let ci = 0; ci < ncol; ci++) colunas.push(its.slice(ci * por, (ci + 1) * por).map(x => {
      const txt = quebrar(ctx, (x.ou ? 'ou: ' : '') + x.i.desc.toUpperCase(), cItem - 30);
      return {x, txt, h: Math.max(78, txt.length * 36 + 42)}; }));
    const hHead = 112, hTit = 78, hCap = ncol > 1 ? 44 : 0, hTH = 62, hCont = ncol > 1 ? 52 : 0, temOu = its.some(x => x.ou), hNota = temOu ? 50 : 0;
    const hCol = Math.max(...colunas.map(cl => cl.reduce((s, l) => s + l.h, 0)));
    const H = PAD + hHead + hTit + hCap + hTH + hCol + hCont + hNota + PAD - 8;
    const S = Math.min(2, 4096 / W);
    cv.width = Math.round(W * S); cv.height = Math.round(H * S); ctx.scale(S, S);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    let y = PAD;
    const lh = 67, b1 = y + 29, b2 = y + 57; let lw = 0;
    if(logo){ lw = logo.width * lh / logo.height; ctx.drawImage(logo, PAD, y, lw, lh); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#404040'; ctx.font = '700 27px ' + FONT;
    ctx.fillText(EMPRESA.toUpperCase(), PAD + lw + 19, b1);
    ctx.fillStyle = '#8b949c'; ctx.font = '19px ' + FONT; ctx.fillText('CNPJ ' + CNPJ, PAD + lw + 19, b2);
    ctx.textAlign = 'right';
    const dir = []; if(c.u) dir.push('Comprador: ' + String(c.u).toUpperCase()); dir.push('Mapa nº ' + numCot(c));
    (dir.length === 2 ? [b1, b2] : [b2]).forEach((b, k) => ctx.fillText(dir[k], W - PAD, b));
    y += hHead;
    ctx.textAlign = 'left'; ctx.fillStyle = '#0f7c86'; ctx.font = '700 40px ' + FONT;
    ctx.fillText('Solicitação de orçamento', PAD, y + 40);
    if(c.o){ const w0 = ctx.measureText('Solicitação de orçamento').width; ctx.fillStyle = '#8b949c'; ctx.font = '24px ' + FONT; ctx.fillText('  ·  entrega: ' + nomeLocal(c.o), PAD + w0, y + 40); }
    y += hTit;
    const yTopo = y;
    colunas.forEach((linhas, ci) => {
      const x0 = PAD + ci * (COLW + GAP), xs = [x0, x0 + cN, x0 + cN + cItem, x0 + cN + cItem + cUn, x0 + COLW]; let yy = yTopo;
      if(ncol > 1){
        ctx.textAlign = 'left'; ctx.fillStyle = '#0a5b66'; ctx.font = '700 23px ' + FONT;
        ctx.fillText('Parte ' + (ci + 1) + ' de ' + ncol, x0, yy + 26); yy += hCap;
      }
      ctx.fillStyle = '#0f7c86'; ctx.fillRect(x0, yy, COLW, hTH);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 25px ' + FONT;
      ctx.textAlign = 'center'; ctx.fillText('#', (xs[0] + xs[1]) / 2, yy + 40);
      ctx.textAlign = 'left'; ctx.fillText('Item', xs[1] + 16, yy + 40);
      ctx.textAlign = 'center'; ctx.fillText('Und', (xs[2] + xs[3]) / 2, yy + 40); ctx.fillText('Qtd', (xs[3] + xs[4]) / 2, yy + 40);
      yy += hTH;
      linhas.forEach((l, k) => {
        ctx.fillStyle = k % 2 ? '#ffffff' : '#f4f7f8'; ctx.fillRect(x0, yy, COLW, l.h);
        ctx.strokeStyle = '#e1e5e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, yy + l.h - .5); ctx.lineTo(x0 + COLW, yy + l.h - .5); ctx.stroke();
        const base = yy + (l.h - (l.txt.length - 1) * 36) / 2 + 10;
        ctx.fillStyle = '#76808a'; ctx.font = '26px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(l.x.n, (xs[0] + xs[1]) / 2, base);
        ctx.fillStyle = l.x.ou ? '#3a444f' : '#1d2630'; ctx.font = (l.x.ou ? 'italic ' : '') + '28px ' + FONT; ctx.textAlign = 'left';
        l.txt.forEach((t, j) => ctx.fillText(t, xs[1] + 16, base + j * 36));
        ctx.font = '28px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(String(l.x.i.un || '').toUpperCase(), (xs[2] + xs[3]) / 2, base);
        ctx.font = '700 28px ' + FONT; ctx.fillText(fq(l.x.i.q), (xs[3] + xs[4]) / 2, base);
        yy += l.h;
      });
      if(ci < ncol - 1){
        ctx.textAlign = 'right'; ctx.fillStyle = '#0f7c86'; ctx.font = '700 24px ' + FONT; ctx.fillText('continua  →', x0 + COLW, yy + 38);
        const xd = x0 + COLW + GAP / 2; ctx.strokeStyle = '#cdd2d7'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(xd, yTopo); ctx.lineTo(xd, yTopo + hCap + hTH + hCol + hCont - 10); ctx.stroke(); ctx.setLineDash([]);
      } else if(ncol > 1){ ctx.textAlign = 'right'; ctx.fillStyle = '#8b949c'; ctx.font = '24px ' + FONT; ctx.fillText('fim da lista', x0 + COLW, yy + 38); }
    });
    if(temOu){ ctx.textAlign = 'left'; ctx.fillStyle = '#76808a'; ctx.font = '24px ' + FONT;
      ctx.fillText('Nos itens com "ou", favor cotar todas as opções.', PAD, yTopo + hCap + hTH + hCol + hCont + 34); }
    return cv;
  }
  function abrirImagem(c){
    if(!c.itens.some(i => String(i.desc || '').trim())) return alert('Adicione os itens antes de gerar a imagem.');
    const logo = new Image();
    const fazer = lg => {
      const cv = pintarImagem(c, lg);
      try{ cv.toDataURL('image/png', 0); }catch(e){ if(lg) return fazer(null); } // logo bloqueado pelo navegador: sai sem ele
      cv.toBlob(b => {
        const url = URL.createObjectURL(b), nome = 'orcamento-' + numCot(c) + '.png';
        let share = false; try{ share = !!(navigator.canShare && navigator.canShare({files: [new File([b], nome, {type: 'image/png'})]})); }catch(e){}
        const m = modal('Solicitação de orçamento',
          '<div class="hint" style="margin-bottom:8px">Imagem com os itens, sem preços, para mandar aos fornecedores. No WhatsApp Web, clique em Copiar e cole na conversa (Ctrl+V).</div>'
          + '<div style="background:#eef1f3;padding:10px;border-radius:8px;max-height:52vh;overflow:auto"><img src="' + url + '" alt="solicitação de orçamento" style="max-width:100%;display:block;box-shadow:0 2px 10px rgba(0,0,0,.15)"></div>'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button type="button" class="sec mini" data-im="baixar">Baixar</button>' + (share ? '<button type="button" class="sec mini" data-im="share">Compartilhar…</button>' : '')
          + '<button type="button" class="sec mini" data-im="mapa" title="Imagem do mapa inteiro, com os preços">Copiar imagem do mapa (com preços)</button></div>',
          (d, fm) => { const bt = fm.querySelector('button[type=submit]');
            if(!(navigator.clipboard && window.ClipboardItem)){ bt.textContent = 'Este navegador não copia — use Baixar'; return false; }
            navigator.clipboard.write([new ClipboardItem({'image/png': b})]).then(() => { bt.textContent = 'Copiada ✓ — cole no WhatsApp'; }, () => { bt.textContent = 'Não deu para copiar — use Baixar'; });
            return false; }, null, 'Copiar imagem');
        m.querySelector('form').style.width = '760px';
        m.querySelectorAll('[data-im]').forEach(x => x.onclick = () => {
          if(x.dataset.im === 'baixar'){ const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
          else if(x.dataset.im === 'share') navigator.share({files: [new File([b], nome, {type: 'image/png'})]}).catch(() => {});
          else { m.remove(); const bt = M.querySelector('[data-a=foto]'); foto(c, bt); }
        });
      }, 'image/png');
    };
    logo.onload = () => fazer(logo); logo.onerror = () => fazer(null); logo.src = 'logo-bkp.png';
  }

  // ---------- impressão do mapa ----------
  function imprimir(c){
    const R = calc(c), fs = c.fs, base = location.href.replace(/[^/]*$/, ''), si = SIT[c.st] || SIT.aberta, E = R.E;
    const nf = id => (fs.find(f => f.id === id) || {}).nome || '';
    const lin = linhasAtivas(c), tem = k => lin.includes(k);
    const larg = fs.length > 4 ? 'font-size:8.5px' : fs.length > 3 ? 'font-size:9.5px' : '';
    const linhaCond = (rot, fn) => '<tr class="cond"><td colspan="4" class="r">' + rot + '</td>' + fs.map(f => '<td colspan="2" class="c">' + fn(f) + '</td>').join('') + '</tr>';
    // uma linha por item que entra na compra; em cada fornecedor, a marca escolhida (ou a mais barata dele)
    const linhasItens = R.N.map((nd, k) => {
      const x = E.asg[nd.id], i = x ? x.i : nd.orig, r = R.it[i.id] || {}, outros = nd.itens.filter(o => o !== i);
      const nota = (i.alt ? '<br><small style="color:#0b5d65">opção alternativa de ' + h((nd.orig || {}).desc || '') + '</small>' : '')
        + (outros.length ? '<br><small style="color:#8e8e8e">outra(s) opção(ões): ' + outros.map(o => h(o.desc) + (R.it[o.id] && R.it[o.id].min != null ? ' – melhor ' + R$(R.it[o.id].min * R.it[o.id].q) : ' – sem preço')).join('; ') + '</small>' : '');
      return '<tr><td class="c">' + (k + 1) + '</td><td>' + h(i.desc) + nota + '</td><td class="c">' + h(i.un || '') + '</td><td class="n">' + fq(i.q) + '</td>'
        + fs.map(f => {
          let o = x && x.fid === f.id ? x : null;
          if(!o) for(let s = 0; s < slots(i); s++){ const p = R.ef(f, i, s); if(p != null && (!o || p < o.p)) o = {p, k: s}; }
          if(!o){ const y = R.f[f.id].asg[nd.id];
            if(y) return '<td class="n">' + f2(y.p) + '<br><small style="color:#0b5d65">' + h(y.i.desc || '') + '</small></td><td class="n">' + f2(y.custo) + '</td>';
            return '<td class="c" colspan="2" style="color:#aaa">não cotou</td>'; }
          const mk = marcaDe(f, i, o.k), min = r.n > 1 && Math.abs(o.p - r.min) < 1e-6, e = !!(x && x.fid === f.id && x.k === o.k);
          const cl = (min ? 'min ' : '') + (e ? 'esc' : '');
          return '<td class="n ' + cl + '">' + f2(o.p) + (mk ? '<br><small>' + h(mk) + '</small>' : '') + '</td><td class="n ' + cl + '">' + f2(o.p * (num(i.q) || 0)) + '</td>';
        }).join('') + '</tr>';
    }).join('');
    const naoC = R.NN.filter(nd => nd.nao);
    const pre = R.manual && c.preset ? PRESETS.find(x => x.k === c.preset) : null;
    const comps = compSel(c).map(k => { const d = COMPARATIVOS.find(x => x.k === k), v = compValor(k, c, R); return '<div><span>' + h(d.t) + '</span><b>' + v.v + '</b><br>' + v.s + '</div>'; }).join('');
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
 td small{font-size:8px;color:#8e8e8e;font-weight:400}
 td.min{font-weight:700;color:#1f7a3d} td.esc{background:#e3f1f2;font-weight:700;color:#0b5d65}
 tr.tot td{font-weight:700;font-size:11px;background:#f6f6f7} tr.tot td.best{background:#e3f1f2;color:#0b5d65}
 tr.cond td{background:#fafafa}
 .bx{display:flex;gap:10px;margin-top:9px}
 .bx div{flex:1;border:1px solid #e3e3e5;border-radius:6px;padding:6px 9px;font-size:9.5px;color:#5c5c5c} .bx span{display:block;font-size:8px;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em;font-weight:700} .bx b{font-size:13px;color:#232323}
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
 ${linhasItens}
 ${['desconto', 'frete', 'impostos', 'outros'].some(tem) ? linhaCond('Subtotal', f => R.f[f.id].n ? R$(R.f[f.id].sub) : '—') : ''}
 ${fs.some(f => num(f.desc) > 0) ? linhaCond('Desconto', f => num(f.desc) > 0 ? pct(num(f.desc)) + ' (− ' + R$(R.f[f.id].dv) + ')' : '—') : ''}
 ${tem('frete') ? linhaCond('Frete', f => (f.tf || '') + (R.f[f.id].fr ? ' · ' + R$(R.f[f.id].fr) : '')) : ''}
 ${tem('impostos') ? linhaCond('Impostos (ICMS / IPI)', f => R.f[f.id].imp ? R$(R.f[f.id].imp) : '—') : ''}
 ${tem('outros') ? linhaCond(h(c.outNome || 'Outro valor'), f => R.f[f.id].out ? R$(R.f[f.id].out) : '—') : ''}
 <tr class="tot"><td colspan="4" class="r">Total da proposta</td>${fs.map(f => '<td colspan="2" class="c' + (R.unico && R.unico.f.id === f.id && fs.length > 1 ? ' best' : '') + '">' + (R.f[f.id].n ? R$(R.f[f.id].tot) : '—') + '</td>').join('')}</tr>
 ${linhaCond('Itens cotados', f => R.f[f.id].n + ' de ' + R.N.length)}
 ${tem('entrega') ? linhaCond('Prazo de entrega', f => h(f.prazo || '—')) : ''}
 ${tem('pagamento') ? linhaCond('Pagamento', f => h(f.pag || '—')) : ''}
 ${tem('validade') ? linhaCond('Validade', f => f.val ? dataBR(f.val) : '—') : ''}
 ${tem('obs') ? linhaCond('Observação', f => h(f.obs || '')) : ''}
</tbody></table>
${naoC.length ? '<div class="leg" style="color:#5c5c5c">Não serão comprados: ' + naoC.map(nd => h((nd.orig || {}).desc || '')).join('; ') + '.</div>' : ''}
<div class="bx">
 <div class="v"><span>Compra escolhida · ${h(pre ? pre.t : R.manual ? 'escolha do comprador' : 'recomendação automática')}</span><b>${R.pend ? 'Escolha pendente' : R$(E.tot)}</b><br>${E.usados.map(nf).map(h).join(' + ') || '—'}</div>
 ${R.manual && R.rec ? '<div><span>Recomendação automática</span><b>' + R$(R.rec.E.tot) + '</b><br>' + R.rec.E.usados.map(nf).map(h).join(' + ') + '</div>' : ''}
 ${comps}
</div>
<div class="ped">${E.usados.map(fid => { const x = R.f[fid], its = E.us[fid];
  return '<b>' + h(nf(fid)) + ':</b> itens ' + its.map(y => R.N.findIndex(nd => E.asg[nd.id] === y) + 1).join(', ') + ' — ' + R$(its.reduce((s, y) => s + y.custo, 0) + x.fr + x.out + (E.integral ? E.imp : 0)); }).join(' &nbsp;·&nbsp; ')}</div>
<div class="just"><span>Justificativa da escolha</span>${h(c.just || '').replace(/\n/g, '<br>') || '&nbsp;'}</div>
<div class="ass"><div>Comprador<small>${h(c.u || '')}</small></div><div>Solicitante<small>${h(c.sol || '')}</small></div><div>Aprovação${c.apr ? '<small>' + h(c.apr) + ' · ' + dataBR(c.aprd) + '</small>' : '<small>&nbsp;</small>'}</div></div>
<div class="leg">Verde = menor preço do item (já com desconto). Fundo verde-petróleo = proposta escolhida. Totais incluem desconto, frete e outros valores. Gerado pelo Gestão 360º BKP em ${dataBR(hoje())}.</div>
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
        return Object.assign({}, c, {res: {tot: Math.round(R.final.tot * 100) / 100, forn: R.final.usados.map(id => (c.fs.find(f => f.id === id) || {}).nome), esc: R.esc, escK: R.escK, nao: R.NN.filter(n => n.nao).map(n => n.id)}}); })});
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
