// Relatório "RH" do Gestão 360º BKP (dentro da aba Relatórios, relatorios.js).
// Carregado por index.html logo depois de rh.js (só para quem tem o módulo RH). Não guarda nada secreto:
// usa os mesmos dados e cálculos do módulo RH (window.G360RH.api), já sincronizados com a planilha.
//
// Seis visões, todas no período e na obra escolhidos:
//  - Movimentação: admissões, desligamentos (por tipo, obra, função, tempo de casa) e turnover do período
//  - Ocorrências:  advertências e registros, por obra, motivo (art. 482) e grau; reincidentes; cartas a assinar
//  - Férias:       quem sai de férias no período, custo, avisos a emitir, limites que vencem e férias vencidas
//  - Quadro:       retrato do efetivo no último dia do período (por obra, função, tempo de casa)
//  - Experiência:  contratos de 45 e 90 dias que vencem no período e o que aconteceu (ou falta decidir)
//  - Ficha:        histórico completo de um colaborador, para abrir ou imprimir
// O texto para WhatsApp leva só números (sem nomes nem salários). PDF e CSV levam o detalhe.
(function(){
  if(!window.G360Relatorios || !window.G360RH || !window.G360RH.api) return;
  const RH = window.G360RH, A = RH.api;

  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dt = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const hoje = () => iso(new Date());
  const somaDias = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const dif = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const br = s => ok(String(s || '').slice(0, 10)) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—';
  const dm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const fN = (v, c) => (+v || 0).toLocaleString('pt-BR', {minimumFractionDigits: c || 0, maximumFractionDigits: c == null ? 1 : c});
  const R$ = v => (+v || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const pct = v => fN(v * 100, 1) + '%';
  const nm = s => A.titulo(s || '');
  const casaTxt = d => d == null ? '—' : d >= 365 ? fN(d / 365, 1) + ' anos' : d >= 60 ? fN(d / 30.4, 0) + ' meses' : d + ' dias';
  const csvBR = v => (+v || 0).toFixed(2).replace('.', ',');
  const SEM = '__sem';
  const COR = {adm: '#1f7a3d', dem: '#c0392b', exp: '#e08a00', azul: '#257de0', cinza: '#8e8e8e', acc: '#C05621'};
  const VIEWS = [['mov', 'Movimentação'], ['oc', 'Ocorrências'], ['fer', 'Férias'], ['qua', 'Quadro'], ['exp', 'Experiência'], ['fic', 'Ficha']];

  // ---------- seleção ----------
  const KSEL = 'dmtbkp_relrh_sel';
  const SEL = {per: 'ano', ini: '', fim: '', obra: '', ver: 'mov', lmov: 'dem', busca: ''};
  try{ const s = JSON.parse(localStorage.getItem(KSEL) || '{}'); Object.keys(SEL).forEach(k => { if(s[k] != null) SEL[k] = s[k]; }); }catch(e){}
  const guardar = () => { try{ localStorage.setItem(KSEL, JSON.stringify(SEL)); }catch(e){} };

  function periodo(){
    const t = hoje();
    if(SEL.per === '30d') return [somaDias(t, -29), t];
    if(SEL.per === 'mes') return [t.slice(0, 8) + '01', t];
    if(SEL.per === 'mesant'){ const d = dt(t.slice(0, 8) + '01'); d.setDate(0); const f = iso(d); return [f.slice(0, 8) + '01', f]; }
    if(SEL.per === 'ano') return [t.slice(0, 4) + '-01-01', t];
    if(SEL.per === 'anoant'){ const y = +t.slice(0, 4) - 1; return [y + '-01-01', y + '-12-31']; }
    if(SEL.per === 'p60') return [t, somaDias(t, 59)];
    let a = SEL.ini || t, b = SEL.fim || t;
    if(a > b) [a, b] = [b, a];
    return [a, b];
  }
  const perTxt = (a, b) => a === b ? br(a) : br(a) + ' a ' + br(b);
  const obraNome = o => !o ? 'Sem alocação' : A.nomeLocal(o);
  const naObra = o => !SEL.obra || (SEL.obra === SEM ? !o : o === SEL.obra);
  const obraP = p => A.obraDe(p) || '';
  const sitHoje = p => A.desligado(p) ? 'Desligado' + (p.dem ? ' em ' + br(p.dem) : '') : (A.SITP[p.sit] || 'Ativo');
  const conta = (l, f) => { const o = new Map(); l.forEach(x => { const k = f(x); o.set(k, (o.get(k) || 0) + 1); }); return [...o.entries()].sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0]))); };

  // ---------- cálculos ----------
  // segmentos mensais do período (para o quadro médio, como no painel do RH)
  function meses(a, b){
    const l = []; let y = +a.slice(0, 4), m = +a.slice(5, 7) - 1;
    for(let k = 0; k < 400; k++){
      const ini = iso(new Date(y, m, 1)); if(ini > b) break;
      const fim = iso(new Date(y, m + 1, 0));
      l.push({ini: ini < a ? a : ini, fim: fim > b ? b : fim, rot: MES[m] + (a.slice(0, 4) !== b.slice(0, 4) ? '/' + String(y).slice(2) : '')});
      m++; if(m > 11){ m = 0; y++; }
    }
    return l;
  }
  const dentro = (s, a, b) => !!s && s >= a && s <= b;
  const pessoasObra = () => A.quadro().filter(p => naObra(obraP(p)));

  function movimentacao(a, b){
    const ps = pessoasObra().filter(p => A.saida(p));
    const adm = ps.filter(p => dentro(p.adm, a, b)).sort((x, y) => y.adm.localeCompare(x.adm));
    const dem = ps.filter(p => dentro(A.saida(p), a, b)).sort((x, y) => A.saida(y).localeCompare(A.saida(x)));
    const bAte = b > hoje() ? hoje() : b;
    const segs = meses(a, bAte < a ? a : bAte).map(s => {
      const ini = ps.filter(p => A.entrada(p) < s.ini && A.saida(p) >= s.ini).length;
      const ad = ps.filter(p => dentro(p.adm, s.ini, s.fim)).length, de = ps.filter(p => dentro(A.saida(p), s.ini, s.fim)).length;
      return {ini, fim: ini + ad - de};
    });
    const qm = segs.length ? segs.reduce((s, x) => s + (x.ini + x.fim) / 2, 0) / segs.length : 0;
    const casa = p => p.adm ? dif(p.adm, A.saida(p)) : null;
    const exp = dem.filter(p => casa(p) != null && casa(p) <= 90);
    const semTipo = dem.filter(p => !p.tipoDem).length, semData = dem.filter(p => !p.dem).length;
    return {adm, dem, exp, qm, to: qm ? (adm.length + dem.length) / 2 / qm : 0, casa, semTipo, semData,
      porTipo: conta(dem, p => p.tipoDem || 'NÃO INFORMADO'), porIni: conta(dem, p => A.iniciativa(p.tipoDem)),
      porFx: A.FAIXAS.map(f => [f[0], dem.filter(p => A.faixa(casa(p)) === f[0]).length]).concat([['Sem data', dem.filter(p => casa(p) == null).length]]).filter(x => x[0] !== 'Sem data' || x[1]),
      porObra: (() => { const m = new Map(); const g = o => { if(!m.has(o)) m.set(o, {o, adm: 0, dem: 0, exp: 0}); return m.get(o); };
        adm.forEach(p => g(obraP(p)).adm++); dem.forEach(p => { const r = g(obraP(p)); r.dem++; if(casa(p) != null && casa(p) <= 90) r.exp++; });
        return [...m.values()].sort((x, y) => (y.adm + y.dem) - (x.adm + x.dem)); })(),
      porFun: (() => { const m = new Map(); const g = f => { if(!m.has(f)) m.set(f, {f, adm: 0, dem: 0}); return m.get(f); };
        adm.forEach(p => g(A.funcaoDe(p) || 'NÃO INFORMADA').adm++); dem.forEach(p => g(A.funcaoDe(p) || 'NÃO INFORMADA').dem++);
        return [...m.values()].sort((x, y) => (y.adm + y.dem) - (x.adm + x.dem)); })()};
  }

  function ocorrencias(a, b){
    const os = A.ocs().filter(o => dentro(o.data, a, b));
    const it = []; os.forEach(o => (o.itens || []).forEach(i => { if(naObra(i.obra || '')) it.push({o, i}); }));
    it.sort((x, y) => y.o.data.localeCompare(x.o.data) || String(x.i.nome).localeCompare(String(y.i.nome)));
    const adv = it.filter(x => x.o.medida !== 'reg'), reg = it.filter(x => x.o.medida === 'reg');
    const porPes = new Map(); adv.forEach(x => { const k = x.i.pid || x.i.nome; if(!porPes.has(k)) porPes.set(k, []); porPes.get(k).push(x); });
    const reinc = [...porPes.entries()].filter(([, l]) => l.length >= 2).map(([k, l]) => ({k, l, p: A.pessoa(k), total: A.advDe(k).length, maior: Math.max(...l.map(x => +x.i.grau || 1))}))
      .sort((x, y) => y.l.length - x.l.length || y.maior - x.maior);
    const mot = new Map(); it.forEach(x => (x.o.letras || []).forEach(l => { const k = A.motivo([l]); mot.set(k, (mot.get(k) || 0) + 1); }));
    const porObra = new Map(); it.forEach(x => { const o = x.i.obra || ''; if(!porObra.has(o)) porObra.set(o, {o, adv: 0, reg: 0, pes: new Set()}); const r = porObra.get(o); x.o.medida === 'reg' ? r.reg++ : r.adv++; r.pes.add(x.i.pid || x.i.nome); });
    return {os: new Set(it.map(x => x.o.id)).size, it, adv, reg, reinc, pes: new Set(it.map(x => x.i.pid || x.i.nome)).size,
      aAss: adv.filter(x => !x.i.ass), motivos: [...mot.entries()].sort((x, y) => y[1] - x[1]),
      graus: [1, 2, 3].map(g => [g + 'ª advertência', adv.filter(x => (+x.i.grau || 1) === g).length]),
      porObra: [...porObra.values()].sort((x, y) => (y.adv + y.reg) - (x.adv + x.reg))};
  }

  function ferias(a, b){
    const t = hoje(), D = RH.dados();
    const gs = A.vivos(D.gozos).filter(g => g.st !== 'canc' && g.st !== 'sug' && ok(g.ini)).map(g => ({g, p: A.pessoa(g.pid)}))
      .filter(x => x.p && naObra(obraP(x.p)) && x.g.ini <= b && A.fimG(x.g) >= a)
      .map(x => { const fim = A.fimG(x.g), i = x.g.ini < a ? a : x.g.ini, f = fim > b ? b : fim;
        return Object.assign(x, {fim, diasPer: dif(i, f) + 1, st: A.situacao(x.g, t), aviso: A.avisoStatus(x.g, t), custo: A.custoGozo(x.g)}); })
      .sort((x, y) => x.g.ini.localeCompare(y.g.ini));
    const fl = A.fila(t).filter(x => naObra(obraP(x.p)));
    const venc = fl.filter(x => x.niv === 'venc');
    const lim = fl.filter(x => x.niv !== 'ok' && x.niv !== 'venc' && dentro(x.lim, a, b)).sort((x, y) => x.lim.localeCompare(y.lim));
    const avisos = A.vivos(D.gozos).filter(g => g.st !== 'canc' && g.st !== 'sug').map(g => ({g, p: A.pessoa(g.pid), av: A.avisoStatus(g, t)}))
      .filter(x => x.p && x.av && x.av.k !== 'ok' && naObra(obraP(x.p))).sort((x, y) => x.g.ini.localeCompare(y.g.ini));
    const ini = gs.filter(x => dentro(x.g.ini, a, b));
    return {gs, ini, venc, lim, avisos, pes: new Set(gs.map(x => x.p.id)).size, dias: gs.reduce((s, x) => s + x.diasPer, 0),
      custo: ini.reduce((s, x) => s + x.custo, 0), semSal: ini.filter(x => !x.custo).length,
      dobro: venc.reduce((s, x) => s + (x.custoSaldo || 0), 0)};
  }

  function quadroEm(b){
    const ref = b > hoje() ? hoje() : b;
    const l = pessoasObra().filter(p => A.entrada(p) <= ref && A.saida(p) >= ref).map(p => ({p, casa: p.adm ? dif(p.adm, ref) : null, o: obraP(p), f: A.funcaoDe(p) || 'NÃO INFORMADA'}))
      .sort((x, y) => x.o.localeCompare(y.o) || x.p.nome.localeCompare(y.p.nome));
    const exp = l.filter(x => x.casa != null && x.casa <= 90), afa = ref === hoje() ? l.filter(x => x.p.sit === 'afastado') : [];
    const cs = l.filter(x => x.casa != null).map(x => x.casa), folha = l.reduce((s, x) => s + (+x.p.sal || 0), 0);
    const porObra = new Map(); l.forEach(x => { if(!porObra.has(x.o)) porObra.set(x.o, {o: x.o, n: 0, exp: 0, afa: 0, folha: 0, casa: []}); const r = porObra.get(x.o); r.n++; if(x.casa != null && x.casa <= 90) r.exp++; if(ref === hoje() && x.p.sit === 'afastado') r.afa++; r.folha += +x.p.sal || 0; if(x.casa != null) r.casa.push(x.casa); });
    return {ref, l, exp, afa, folha, semSal: l.filter(x => !x.p.sal).length, media: cs.length ? cs.reduce((s, v) => s + v, 0) / cs.length : null,
      porObra: [...porObra.values()].sort((x, y) => y.n - x.n), porFun: conta(l, x => x.f),
      porFx: A.FAIXAS.map(f => [f[0], l.filter(x => A.faixa(x.casa) === f[0]).length])};
  }

  function experiencia(a, b){
    const t = hoje(), l = [];
    pessoasObra().filter(p => ok(p.adm)).forEach(p => {
      [[44, '45 dias', 1], [89, '90 dias', 2]].forEach(([n, rot, k]) => {
        const d = somaDias(p.adm, n); if(!dentro(d, a, b)) return;
        const s = A.saida(p), saiu = !!s && s !== '9999-12-31' && s <= d;
        if(saiu && s < a) return; // saiu antes do período: o contrato não chegou a vencer nele
        let res, cor;
        if(saiu){ res = 'Saiu em ' + br(s) + (p.tipoDem ? ' · ' + nm(p.tipoDem).toLowerCase() : ''); cor = COR.dem; }
        else if(d < t){ res = k === 1 ? 'Prorrogado (seguiu)' : 'Efetivado'; cor = COR.adm; }
        else { const f = dif(t, d); res = 'A decidir · ' + (f === 0 ? 'vence hoje' : 'faltam ' + f + ' dia' + (f > 1 ? 's' : '')); cor = COR.exp; }
        l.push({p, d, rot, k, saiu, decidir: !saiu && d >= t, res, cor, adv: A.advDe(p.id).length});
      });
    });
    l.sort((x, y) => x.d.localeCompare(y.d) || x.p.nome.localeCompare(y.p.nome));
    const coorte = l.filter(x => x.k === 2 && (x.d < t || x.saiu));
    const efet = coorte.filter(x => !x.saiu).length;
    return {l, decidir: l.filter(x => x.decidir), efet, saiu: coorte.filter(x => x.saiu).length, taxa: coorte.length ? efet / coorte.length : null, coorte: coorte.length};
  }

  // ---------- estilos ----------
  const css = document.createElement('style');
  css.textContent = `
  #rel-rh .rr-per{display:flex;flex-wrap:wrap;gap:4px} #rel-rh .rr-per button{flex:1 1 auto}
  #rel-rh .rr-ver{display:flex;flex-wrap:wrap;gap:4px} #rel-rh .rr-ver button{flex:1 1 auto}
  #rel-rh .row2{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
  #rel-rh .row2 input,#rel-rh #rr-obra{width:100%}
  #rel-rh .rr-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px}
  #rel-rh .rr-kpi>div{border:1px solid var(--line,#E8E8EA);border-radius:10px;padding:9px 10px;background:#fff;min-width:0;border-top-width:3px}
  #rel-rh .rr-kpi span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8E8E8E)}
  #rel-rh .rr-kpi b{display:block;font-size:22px;line-height:1.2;margin-top:3px;font-variant-numeric:tabular-nums}
  #rel-rh .rr-kpi small{display:block;color:var(--ink3,#8E8E8E);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #rel-rh .rr-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:0 18px}
  #rel-rh .tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
  #rel-rh .rr-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ink2,#5C5C5C);margin:0 0 6px}
  #rel-rh .rr-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  #rel-rh svg{display:block;width:100%;height:auto;overflow:visible}
  #rel-rh .rr-vazio{padding:16px 8px;text-align:center;color:var(--ink3,#8E8E8E);font-size:12.5px}
  #rel-rh h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3,#8e8e8e);margin:14px 0 6px}
  #rel-rh h3:first-child{margin-top:0}
  #rel-rh table{width:100%;border-collapse:collapse;font-size:12.5px}
  #rel-rh th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3,#8e8e8e);font-weight:700;border-bottom:1px solid var(--line,#E8E8EA)}
  #rel-rh th,#rel-rh td{padding:6px 5px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  #rel-rh td{border-bottom:1px solid var(--line2,#f2f2f3)}
  #rel-rh th:first-child,#rel-rh td:first-child,#rel-rh td.tx,#rel-rh th.tx{text-align:left;white-space:normal}
  #rel-rh td small{display:block;color:var(--ink3,#8E8E8E);font-size:11px}
  #rel-rh tr[data-pid]{cursor:pointer} #rel-rh tr[data-pid]:hover td{background:var(--head,#F6F6F7)}
  #rel-rh tr.tot td{font-weight:700;border-top:1px solid var(--line,#E8E8EA);border-bottom:0}
  #rel-rh .bar{display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0}
  #rel-rh .bar .rt{flex:0 0 42%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2,#5c5c5c)}
  #rel-rh .bar .tr{flex:1;height:10px;background:#f1f1f3;border-radius:5px;overflow:hidden}
  #rel-rh .bar .tr i{display:block;height:100%;border-radius:5px}
  #rel-rh .bar b{flex:0 0 52px;text-align:right;font-variant-numeric:tabular-nums}
  #rel-rh .tag{display:inline-block;font-size:10.5px;font-weight:700;border-radius:5px;padding:1px 7px;white-space:nowrap}
  #rel-rh .seg2{display:flex;gap:4px;margin-bottom:8px} #rel-rh .seg2 button{flex:1 1 auto}
  #rel-rh .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  #rel-rh .rr-txt{box-sizing:border-box;width:100%;min-height:130px;font-family:inherit;font-size:12px;border:1px solid var(--line,#E8E8EA);border-radius:8px;padding:8px 10px;resize:vertical;margin-top:8px}
  #rel-rh .rr-alerta{background:#fff5dc;color:#7a5200;border-radius:8px;padding:7px 10px;font-size:12px;margin-top:8px}
  #rel-rh #rr-busca{width:100%}
  #rel-rh .mini{padding:3px 9px;font-size:11.5px}
  #rr-tip{position:fixed;z-index:6000;pointer-events:none;background:#fff;border:1px solid #E8E8EA;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.14);padding:7px 10px;font-size:12px;line-height:1.45;color:#232323;display:none}
  #rr-tip i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}`;
  document.head.appendChild(css);

  const aba = document.createElement('div');
  aba.id = 'rel-rh';
  aba.innerHTML = `
    <div class="card">
      <h2>Relatório de RH</h2>
      <div class="seg rr-ver" id="rr-ver" role="tablist">${VIEWS.map(v => `<button data-v="${v[0]}">${v[1]}</button>`).join('')}</div>
      <div id="rr-filtros">
        <div class="seg rr-per" id="rr-per" style="margin-top:10px">
          <button data-p="mes">Este mês</button><button data-p="mesant">Mês passado</button><button data-p="30d">30 dias</button>
          <button data-p="ano">Este ano</button><button data-p="anoant">Ano passado</button><button data-p="p60">Próximos 60 dias</button><button data-p="per">Período</button>
        </div>
        <div class="row2" id="rr-datas" style="display:none">
          <div><label for="rr-ini">De</label><input type="date" id="rr-ini"></div>
          <div><label for="rr-fim">Até</label><input type="date" id="rr-fim"></div>
        </div>
        <label for="rr-obra">Obra / centro de custo</label><select id="rr-obra"></select>
      </div>
      <div class="hint" style="margin-top:8px"><span id="rr-estado">Mesmos dados do módulo RH, sincronizados com a planilha.</span>
        <button class="sec mini" id="rr-atual" style="margin-left:6px">Atualizar</button></div>
    </div>
    <div id="rr-corpo"></div>
    <div class="card" id="rr-exp-card">
      <h2>Enviar / exportar</h2>
      <div class="btns">
        <button id="rr-pdf">Imprimir / PDF</button>
        <button class="sec" id="rr-pdfall">PDF completo (todas as visões)</button>
        <button class="sec" id="rr-wpp">Enviar no WhatsApp</button>
        <button class="sec" id="rr-copiar">Copiar texto</button>
        <button class="sec" id="rr-csv">Baixar planilha (CSV)</button>
      </div>
      <textarea class="rr-txt" id="rr-txt" readonly></textarea>
      <div class="hint" id="rr-env" style="margin-top:4px">O texto do WhatsApp leva só os números, sem nomes nem salários. O PDF e a planilha levam o detalhe: guarde e envie só para quem cuida de RH.</div>
    </div>`;
  aba.style.display = 'none';
  const tip = document.createElement('div'); tip.id = 'rr-tip'; document.body.appendChild(tip);

  // ---------- eventos ----------
  aba.addEventListener('click', e => {
    const v = e.target.closest('#rr-ver button'); if(v){ SEL.ver = v.dataset.v; guardar(); render(); return; }
    const p = e.target.closest('#rr-per button');
    if(p){ SEL.per = p.dataset.p; if(SEL.per === 'per' && !SEL.ini){ SEL.ini = hoje().slice(0, 8) + '01'; SEL.fim = hoje(); } guardar(); render(); return; }
    const lm = e.target.closest('[data-lmov]'); if(lm){ SEL.lmov = lm.dataset.lmov; guardar(); render(); return; }
    const imp = e.target.closest('[data-fimp]'); if(imp){ e.stopPropagation(); imprimir(fichaHTML(imp.dataset.fimp), 'Ficha'); return; }
    const tr = e.target.closest('[data-pid]'); if(tr && A.pessoa(tr.dataset.pid)){ try{ RH.ficha(tr.dataset.pid); }catch(x){} }
  });
  aba.addEventListener('change', e => {
    if(e.target.id === 'rr-ini'){ SEL.ini = e.target.value; guardar(); render(); }
    if(e.target.id === 'rr-fim'){ SEL.fim = e.target.value; guardar(); render(); }
    if(e.target.id === 'rr-obra'){ SEL.obra = e.target.value; guardar(); render(); }
  });
  aba.addEventListener('input', e => { if(e.target.id === 'rr-busca'){ SEL.busca = e.target.value; guardar(); renderFichaLista(); } });
  aba.querySelector('#rr-atual').onclick = async () => { aba.querySelector('#rr-estado').textContent = 'Lendo a planilha…'; try{ await RH.receber(true); }catch(e){} render(true); };

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
  document.addEventListener('g360-rh', () => render());
  document.addEventListener('g360-rh-acesso', () => acesso());

  // ---------- peças de desenho ----------
  const kpi = (rot, val, sub, cor) => `<div style="border-top-color:${cor || COR.acc}"><span>${rot}</span><b>${val}</b><small>${sub || '&nbsp;'}</small></div>`;
  const barras = (l, cor, tot) => { const mx = Math.max(1, ...l.map(x => x[1])); tot = tot || l.reduce((s, x) => s + x[1], 0);
    return l.map(x => `<div class="bar"><span class="rt" title="${h(x[0])}">${h(x[0])}</span><span class="tr"><i style="width:${x[1] / mx * 100}%;background:${cor}"></i></span><b>${x[1]}${tot ? ' <small style="color:#8e8e8e;font-weight:400">' + Math.round(x[1] / tot * 100) + '%</small>' : ''}</b></div>`).join(''); };
  const vazio = t => `<div class="rr-vazio">${t}</div>`;
  const card = (tit, corpo, sub) => `<div class="card"><h2>${tit}</h2>${sub ? `<div class="hint" style="margin:-4px 0 8px">${sub}</div>` : ''}${corpo}</div>`;
  const escala = max => { if(!(max > 0)) return {max: 1, passo: 1}; const bruto = max / 4, p = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / p;
    const passo = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p); return {max: Math.ceil(max / passo) * passo, passo}; };
  // admissões x desligamentos por mês (até 31 dias: por semana)
  function grafMov(a, b, M){
    const n = dif(a, b) + 1; let l;
    if(n <= 31){ l = []; for(let d = a; d <= b; d = somaDias(d, 7)){ const f = somaDias(d, 6); l.push({ini: d, fim: f > b ? b : f, rot: dm(d)}); } }
    else l = meses(a, b);
    const cont = l.map(k => ({k, adm: M.adm.filter(p => dentro(p.adm, k.ini, k.fim)).length, dem: M.dem.filter(p => dentro(A.saida(p), k.ini, k.fim)).length}));
    const W = 640, H = 190, pl = 28, pr = 6, pt = 8, pb = 24, gw = (W - pl - pr) / l.length;
    const e = escala(Math.max(0, ...cont.map(r => Math.max(r.adm, r.dem)))), y = v => pt + (H - pt - pb) * (1 - v / e.max);
    const bw = Math.max(3, Math.min(20, gw * 0.8 / 2));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Admissões e desligamentos">`;
    for(let v = 0; v <= e.max + 1e-9; v += e.passo) s += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#EDEDEF"/><text x="${pl - 5}" y="${y(v) + 3.5}" font-size="10" fill="#8E8E8E" text-anchor="end">${v}</text>`;
    cont.forEach((r, i) => {
      const cx = pl + gw * i + gw / 2, tipTxt = `<b>${perTxt(r.k.ini, r.k.fim)}</b><br><i style="background:${COR.adm}"></i>Admissões: <b>${r.adm}</b><br><i style="background:${COR.dem}"></i>Desligamentos: <b>${r.dem}</b><br>Saldo: <b>${r.adm - r.dem > 0 ? '+' : ''}${r.adm - r.dem}</b>`;
      s += `<rect x="${pl + gw * i}" y="${pt}" width="${gw}" height="${H - pt - pb}" fill="transparent" data-tip="${h(tipTxt)}"/>`;
      [['adm', 0], ['dem', 1]].forEach(([k, j]) => { const v = r[k]; if(!v) return;
        s += `<rect x="${cx - bw + bw * j + 0.5}" y="${y(v)}" width="${bw - 1}" height="${y(0) - y(v)}" rx="2" fill="${COR[k]}" data-tip="${h(tipTxt)}"/>`;
        if(gw > 26) s += `<text x="${cx - bw + bw * j + bw / 2}" y="${y(v) - 3}" font-size="9.5" fill="#5c5c5c" text-anchor="middle">${v}</text>`; });
      s += `<text x="${cx}" y="${H - 8}" font-size="10" fill="#5C5C5C" text-anchor="middle">${h(r.k.rot)}</text>`;
    });
    return s + `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" stroke="#BDBDC2"/></svg>`;
  }
  const legMov = `<div class="rr-leg"><span><i style="background:${COR.adm}"></i>Admissões</span><span><i style="background:${COR.dem}"></i>Desligamentos</span></div>`;
  const pid = p => p ? ` data-pid="${h(p.id)}"` : '';

  // ---------- visões ----------
  function vMov(a, b){
    const M = movimentacao(a, b), saldo = M.adm.length - M.dem.length;
    let s = card('Resumo · ' + perTxt(a, b) + (SEL.obra ? ' · ' + h(obraNome(SEL.obra === SEM ? '' : SEL.obra)) : ''),
      `<div class="rr-kpi">${kpi('Admissões', M.adm.length, M.adm.filter(p => !A.desligado(p)).length + ' seguem na empresa', COR.adm)}
      ${kpi('Desligamentos', M.dem.length, M.porIni.filter(x => x[0] === 'EMPRESA').map(x => x[1] + ' pela empresa')[0] || '&nbsp;', COR.dem)}
      ${kpi('Saldo', (saldo > 0 ? '+' : '') + saldo, 'quadro médio ' + fN(M.qm, 0), saldo >= 0 ? COR.adm : COR.dem)}
      ${kpi('Turnover', pct(M.to), M.dem.length ? M.exp.length + ' saíram na experiência (' + Math.round(M.exp.length / M.dem.length * 100) + '%)' : '&nbsp;', COR.exp)}</div>
      ${M.semTipo || M.semData ? `<div class="rr-alerta">${M.semTipo ? M.semTipo + ' desligamento(s) sem o tipo informado' : ''}${M.semTipo && M.semData ? ' · ' : ''}${M.semData ? M.semData + ' sem a data exata (contado no fim do mês)' : ''}. Complete na ficha do colaborador.</div>` : ''}
      <div class="hint" style="margin-top:6px">Turnover = média de admissões e desligamentos ÷ quadro médio do período (mesma conta do painel do RH). Saída na experiência = até 90 dias de casa.</div>`);
    if(M.adm.length || M.dem.length) s += card('Admissões e desligamentos', legMov + grafMov(a, b, M));
    s += `<div class="card"><div class="rr-2"><div><h3>Desligamentos por tipo</h3>${M.dem.length ? barras(M.porTipo.map(x => [nm(x[0]), x[1]]), COR.dem) : vazio('Nenhum desligamento.')}
        ${M.dem.length ? '<h3>Por iniciativa</h3>' + barras(M.porIni.map(x => [nm(x[0]), x[1]]), COR.cinza) : ''}</div>
      <div><h3>Tempo de casa de quem saiu</h3>${M.dem.length ? barras(M.porFx, COR.exp) : vazio('Nenhum desligamento.')}</div></div></div>`;
    if(M.porObra.length) s += card('Por obra', `<table><tr><th>Obra</th><th>Admissões</th><th>Desligamentos</th><th>Na experiência</th><th>Saldo</th></tr>${M.porObra.map(r => `<tr><td>${h(obraNome(r.o))}</td><td>${r.adm}</td><td>${r.dem}</td><td>${r.exp}</td><td>${r.adm - r.dem > 0 ? '+' : ''}${r.adm - r.dem}</td></tr>`).join('')}
      ${M.porObra.length > 1 ? `<tr class="tot"><td>Total</td><td>${M.adm.length}</td><td>${M.dem.length}</td><td>${M.exp.length}</td><td>${saldo > 0 ? '+' : ''}${saldo}</td></tr>` : ''}</table>`, 'Obra atual do cadastro (para quem saiu, a última alocação registrada).');
    if(M.porFun.length) s += card('Por função', `<table><tr><th>Função</th><th>Admissões</th><th>Desligamentos</th></tr>${M.porFun.slice(0, 15).map(r => `<tr><td>${h(nm(r.f))}</td><td>${r.adm}</td><td>${r.dem}</td></tr>`).join('')}</table>${M.porFun.length > 15 ? '<div class="hint">+ ' + (M.porFun.length - 15) + ' funções na planilha (CSV).</div>' : ''}`);
    const lAdm = `<table><tr><th>Colaborador</th><th>Admissão</th><th class="tx">Obra</th><th class="tx">Situação hoje</th></tr>${M.adm.map(p => `<tr${pid(p)}><td><b>${h(nm(p.nome))}</b><small>${h(nm(A.funcaoDe(p)) || '—')}</small></td><td>${br(p.adm)}</td><td class="tx">${h(obraNome(obraP(p)))}</td><td class="tx">${h(sitHoje(p))}</td></tr>`).join('')}</table>`;
    const lDem = `<table><tr><th>Colaborador</th><th>Desligamento</th><th>Tempo de casa</th><th class="tx">Tipo</th><th class="tx">Obra</th></tr>${M.dem.map(p => `<tr${pid(p)}><td><b>${h(nm(p.nome))}</b><small>${h(nm(A.funcaoDe(p)) || '—')} · admissão ${br(p.adm)}</small></td><td>${p.dem ? br(p.dem) : 'mês ' + h(p.mesDem || '—')}</td><td>${casaTxt(M.casa(p))}${M.casa(p) != null && M.casa(p) <= 90 ? '<small style="color:' + COR.exp + '">experiência</small>' : ''}</td><td class="tx">${h(nm(p.tipoDem || 'não informado'))}<small>${h(nm(A.iniciativa(p.tipoDem)))}</small></td><td class="tx">${h(obraNome(obraP(p)))}</td></tr>`).join('')}</table>`;
    s += `<div class="card"><h2>Lista</h2><div class="seg seg2"><button data-lmov="dem" class="${SEL.lmov === 'dem' ? 'on' : ''}">Desligamentos (${M.dem.length})</button><button data-lmov="adm" class="${SEL.lmov === 'adm' ? 'on' : ''}">Admissões (${M.adm.length})</button></div>
      ${SEL.lmov === 'adm' ? (M.adm.length ? lAdm : vazio('Nenhuma admissão no período.')) : (M.dem.length ? lDem : vazio('Nenhum desligamento no período.'))}<div class="hint" style="margin-top:6px">Clique num nome para abrir a ficha.</div></div>`;
    return {html: s, vazio: !M.adm.length && !M.dem.length, M};
  }

  function vOc(a, b){
    const O = ocorrencias(a, b);
    let s = card('Resumo · ' + perTxt(a, b), `<div class="rr-kpi">${kpi('Ocorrências', O.os, O.pes + ' colaborador(es) envolvido(s)', COR.acc)}
      ${kpi('Advertências escritas', O.adv.length, O.reg.length + ' só registro', COR.dem)}
      ${kpi('Cartas a assinar', O.aAss.length, O.adv.length ? Math.round((O.adv.length - O.aAss.length) / O.adv.length * 100) + '% assinadas' : '&nbsp;', O.aAss.length ? COR.exp : COR.adm)}
      ${kpi('Reincidentes', O.reinc.length, '2 ou mais advertências no período', O.reinc.length ? COR.dem : COR.cinza)}</div>`);
    if(!O.it.length) return {html: s + card('Ocorrências', vazio('Nenhuma ocorrência registrada neste período.')), vazio: true, O};
    if(O.reinc.length) s += card('Reincidentes', `<table><tr><th>Colaborador</th><th>No período</th><th>Total na casa</th><th>Maior grau</th><th class="tx">Última</th></tr>${O.reinc.map(r => { const u = r.l[0];
      return `<tr${pid(r.p)}><td><b>${h(nm(u.i.nome))}</b><small>${h(nm(u.i.cargo) || '—')} · ${h(obraNome(u.i.obra))}${r.p && A.desligado(r.p) ? ' · desligado' : ''}</small></td><td>${r.l.length}</td><td>${r.total}</td><td>${r.maior >= 3 ? '<span class="tag" style="background:#fde8e6;color:#b42318">' + r.maior + 'ª</span>' : r.maior + 'ª'}</td><td class="tx">${br(u.o.data)}<small>${h(A.motivo(u.o.letras))}</small></td></tr>`; }).join('')}</table>`,
      'Base para decidir o próximo passo (suspensão ou justa causa) com histórico documentado. Confirme sempre com a contabilidade ou o jurídico.');
    s += `<div class="card"><div class="rr-2"><div><h3>Por motivo (art. 482 da CLT)</h3>${O.motivos.length ? barras(O.motivos, COR.dem) : vazio('Sem motivo informado.')}</div>
      <div><h3>Por grau</h3>${O.adv.length ? barras(O.graus, COR.exp) : vazio('Nenhuma advertência escrita.')}</div></div></div>`;
    s += card('Por obra', `<table><tr><th>Obra</th><th>Advertências</th><th>Só registro</th><th>Colaboradores</th></tr>${O.porObra.map(r => `<tr><td>${h(obraNome(r.o))}</td><td>${r.adv}</td><td>${r.reg}</td><td>${r.pes.size}</td></tr>`).join('')}</table>`);
    s += card('Lista', `<table><tr><th>Colaborador</th><th>Data</th><th class="tx">Medida</th><th class="tx">Motivo</th><th class="tx">Carta</th></tr>${O.it.map(x => `<tr${pid(A.pessoa(x.i.pid))}><td><b>${h(nm(x.i.nome))}</b><small>${h(obraNome(x.i.obra))}</small></td><td>${br(x.o.data)}</td>
      <td class="tx">${x.o.medida === 'reg' ? 'Só registro' : (+x.i.grau || 1) + 'ª advertência'}</td><td class="tx">${h(A.motivo(x.o.letras) || '—')}<small>${h(String(x.o.desc || '').slice(0, 90))}${String(x.o.desc || '').length > 90 ? '…' : ''}</small></td>
      <td class="tx">${x.o.medida === 'reg' ? '—' : x.i.ass ? '<span class="tag" style="background:#e7f6ea;color:#14602a">assinada</span>' : '<span class="tag" style="background:#fff5dc;color:#7a5200">a assinar</span>'}</td></tr>`).join('')}</table>`);
    return {html: s, vazio: false, O};
  }

  function vFer(a, b){
    const F = ferias(a, b), SIT = A.SIT;
    let s = card('Resumo · ' + perTxt(a, b), `<div class="rr-kpi">${kpi('De férias no período', F.pes, fN(F.dias, 0) + ' dia(s) de férias no período', COR.adm)}
      ${kpi('Custo estimado', R$(F.custo).replace(/,\d\d$/, ''), F.ini.length + ' férias começando no período' + (F.semSal ? ' · ' + F.semSal + ' sem salário' : ''), COR.azul)}
      ${kpi('Avisos a emitir', F.avisos.length, 'prazo de 30 dias antes', F.avisos.length ? COR.exp : COR.adm)}
      ${kpi('Férias vencidas hoje', F.venc.length, F.lim.length + ' limite(s) vencendo no período', F.venc.length ? COR.dem : COR.adm)}</div>
      <div class="hint" style="margin-top:6px">Custo = salário ÷ 30 × (dias + abono) × 4/3. Vencidas e avisos são a situação de hoje.</div>`);
    const st = k => `<span class="tag" style="background:${SIT[k].c};color:${SIT[k].tx};border:1px solid ${SIT[k].b}">${SIT[k].t}</span>`;
    s += card('Férias no período', F.gs.length ? `<table><tr><th>Colaborador</th><th>Início</th><th>Retorno</th><th>Dias</th><th class="tx">Situação</th><th>Custo</th></tr>${F.gs.map(x => `<tr${pid(x.p)}><td><b>${h(nm(x.p.nome))}</b><small>${h(obraNome(obraP(x.p)))}</small></td><td>${br(x.g.ini)}</td><td>${br(somaDias(x.fim, 1))}</td><td>${x.g.dias}${+x.g.abono ? '<small>+' + x.g.abono + ' abono</small>' : ''}</td><td class="tx">${st(x.st)}${x.aviso && x.aviso.k !== 'ok' ? '<small style="color:#b42318">' + h(x.aviso.t) + '</small>' : ''}</td><td>${x.custo ? R$(x.custo) : '—'}</td></tr>`).join('')}
      <tr class="tot"><td>${F.gs.length} lançamento(s)</td><td></td><td></td><td>${fN(F.gs.reduce((s2, x) => s2 + (+x.g.dias || 0), 0), 0)}</td><td></td><td>${R$(F.gs.reduce((s2, x) => s2 + x.custo, 0))}</td></tr></table>` : vazio('Ninguém de férias neste período.'));
    if(F.avisos.length) s += card('Avisos a emitir', `<table><tr><th>Colaborador</th><th>Início das férias</th><th class="tx">Aviso</th></tr>${F.avisos.map(x => `<tr${pid(x.p)}><td><b>${h(nm(x.p.nome))}</b><small>${h(obraNome(obraP(x.p)))}</small></td><td>${br(x.g.ini)}</td><td class="tx" style="color:${x.av.k === 'atras' ? '#b42318' : '#7a5200'}">${h(x.av.t)}</td></tr>`).join('')}</table>`);
    const tabPer = l => `<table><tr><th>Colaborador</th><th>Aquisitivo</th><th>Saldo</th><th>Limite p/ iniciar</th><th class="tx">Nível</th></tr>${l.map(x => `<tr${pid(x.p)}><td><b>${h(nm(x.p.nome))}</b><small>${h(obraNome(obraP(x.p)))}</small></td><td>${br(x.per.ini)}<small>a ${br(x.per.fim)}</small></td><td>${fN(x.saldo, 0)} d</td><td>${x.lim ? br(x.lim) : x.niv === 'venc' ? '<small style="color:#b42318">lançada fora do prazo</small>' : '—'}</td><td class="tx"><span class="tag" style="background:${A.NIV[x.niv].c};color:${A.NIV[x.niv].tx}">${A.NIV[x.niv].t}</span></td></tr>`).join('')}</table>`;
    if(F.venc.length) s += card('Férias vencidas (hoje)', tabPer(F.venc), 'O que cair fora do período concessivo é pago em dobro (CLT art. 137). Conceder já.');
    if(F.lim.length) s += card('Limites que vencem no período', tabPer(F.lim), 'Férias que precisam começar até a data limite para não cair em dobro.');
    return {html: s, vazio: !F.gs.length && !F.venc.length && !F.lim.length && !F.avisos.length, F};
  }

  function vQua(a, b){
    const Q = quadroEm(b);
    let s = card('Quadro em ' + br(Q.ref) + (SEL.obra ? ' · ' + h(obraNome(SEL.obra === SEM ? '' : SEL.obra)) : ''), `<div class="rr-kpi">${kpi('No quadro', Q.l.length, Q.porObra.length + ' local(is)', COR.acc)}
      ${kpi('Em experiência', Q.exp.length, 'até 90 dias de casa', COR.exp)}
      ${kpi('Afastados', Q.ref === hoje() ? Q.afa.length : '—', Q.ref === hoje() ? 'situação de hoje' : 'só para a data de hoje', COR.cinza)}
      ${kpi('Tempo médio de casa', Q.media == null ? '—' : casaTxt(Math.round(Q.media)), Q.folha ? 'folha base ' + R$(Q.folha).replace(/,\d\d$/, '') : '&nbsp;', COR.azul)}</div>
      <div class="hint" style="margin-top:6px">Retrato no último dia do período escolhido. A obra é a alocação atual do cadastro.${Q.folha && Q.semSal ? ' ' + Q.semSal + ' pessoa(s) sem salário cadastrado ficam fora da folha.' : ''}</div>`);
    if(!Q.l.length) return {html: s, vazio: true, Q};
    s += card('Por obra', `<table><tr><th>Obra</th><th>Colaboradores</th><th>Experiência</th>${Q.ref === hoje() ? '<th>Afastados</th>' : ''}<th>Tempo médio</th>${Q.folha ? '<th>Folha base</th>' : ''}</tr>${Q.porObra.map(r => `<tr><td>${h(obraNome(r.o))}</td><td>${r.n}</td><td>${r.exp}</td>${Q.ref === hoje() ? '<td>' + r.afa + '</td>' : ''}<td>${r.casa.length ? casaTxt(Math.round(r.casa.reduce((x, y) => x + y, 0) / r.casa.length)) : '—'}</td>${Q.folha ? '<td>' + R$(r.folha) + '</td>' : ''}</tr>`).join('')}
      ${Q.porObra.length > 1 ? `<tr class="tot"><td>Total</td><td>${Q.l.length}</td><td>${Q.exp.length}</td>${Q.ref === hoje() ? '<td>' + Q.afa.length + '</td>' : ''}<td>${Q.media == null ? '—' : casaTxt(Math.round(Q.media))}</td>${Q.folha ? '<td>' + R$(Q.folha) + '</td>' : ''}</tr>` : ''}</table>`);
    s += `<div class="card"><div class="rr-2"><div><h3>Por função</h3>${barras(Q.porFun.slice(0, 12).map(x => [nm(x[0]), x[1]]), COR.azul, Q.l.length)}${Q.porFun.length > 12 ? '<div class="hint">+ ' + (Q.porFun.length - 12) + ' funções na planilha (CSV).</div>' : ''}</div>
      <div><h3>Tempo de casa</h3>${barras(Q.porFx, COR.exp, Q.l.length)}</div></div></div>`;
    s += card('Colaboradores', `<table><tr><th>Colaborador</th><th>Admissão</th><th>Tempo de casa</th><th class="tx">Obra</th></tr>${Q.l.map(x => `<tr${pid(x.p)}><td><b>${h(nm(x.p.nome))}</b><small>${h(nm(x.f))}${x.p.sit === 'afastado' ? ' · afastado' : ''}</small></td><td>${br(x.p.adm)}</td><td>${casaTxt(x.casa)}</td><td class="tx">${h(obraNome(x.o))}</td></tr>`).join('')}</table>`);
    return {html: s, vazio: false, Q};
  }

  function vExp(a, b){
    const E = experiencia(a, b);
    let s = card('Resumo · ' + perTxt(a, b), `<div class="rr-kpi">${kpi('Vencimentos', E.l.length, E.l.filter(x => x.k === 1).length + ' de 45 dias · ' + E.l.filter(x => x.k === 2).length + ' de 90', COR.acc)}
      ${kpi('A decidir', E.decidir.length, 'efetivar, prorrogar ou desligar', E.decidir.length ? COR.exp : COR.adm)}
      ${kpi('Efetivados', E.efet, 'passaram dos 90 dias', COR.adm)}
      ${kpi('Taxa de efetivação', E.taxa == null ? '—' : pct(E.taxa), E.coorte ? E.saiu + ' de ' + E.coorte + ' saíram antes dos 90 dias' : 'sem 90º dia no período', COR.azul)}</div>
      <div class="hint" style="margin-top:6px">Contrato de experiência de 45 + 45 dias a partir da admissão. Use "Próximos 60 dias" para ver o que vem pela frente. Advertências = total do colaborador na casa.</div>`);
    s += card('Contratos de experiência', E.l.length ? `<table><tr><th>Colaborador</th><th>Vence</th><th>Etapa</th><th>Advertências</th><th class="tx">Resultado</th></tr>${E.l.map(x => `<tr${pid(x.p)}><td><b>${h(nm(x.p.nome))}</b><small>${h(nm(A.funcaoDe(x.p)) || '—')} · ${h(obraNome(obraP(x.p)))} · admissão ${br(x.p.adm)}</small></td><td>${br(x.d)}</td><td>${x.rot}</td><td>${x.adv ? '<b style="color:#b42318">' + x.adv + '</b>' : '0'}</td><td class="tx" style="color:${x.cor};font-weight:600">${h(x.res)}</td></tr>`).join('')}</table>` : vazio('Nenhum contrato de experiência vence neste período.'));
    return {html: s, vazio: !E.l.length, E};
  }

  // ---------- ficha individual ----------
  function vFic(){
    const s = `<div class="card"><h2>Ficha do colaborador</h2><div class="hint" style="margin:-4px 0 8px">Histórico completo: cadastro, férias, ocorrências e desligamento. Abra para editar ou imprima para arquivar.</div>
      <input type="search" id="rr-busca" placeholder="Buscar pelo nome, função ou obra (inclui ex-colaboradores)" value="${h(SEL.busca)}" autocomplete="off"><div id="rr-flista" style="margin-top:8px"></div></div>`;
    return {html: s, vazio: true};
  }
  const nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  function renderFichaLista(){
    const el = aba.querySelector('#rr-flista'); if(!el) return;
    const q = nrm(SEL.busca).trim();
    const l = A.vivos(RH.dados().pes).filter(p => naObra(obraP(p)) && (!q || nrm(p.nome + ' ' + A.funcaoDe(p) + ' ' + obraP(p)).includes(q)))
      .sort((x, y) => (A.desligado(x) - A.desligado(y)) || x.nome.localeCompare(y.nome));
    el.innerHTML = l.length ? `<div class="tw"><table><tr><th>Colaborador</th><th class="tx">Situação</th><th class="tx">Obra</th><th></th></tr>${l.slice(0, 60).map(p => `<tr${pid(p)}><td><b>${h(nm(p.nome))}</b><small>${h(nm(A.funcaoDe(p)) || '—')} · admissão ${br(p.adm)}</small></td><td class="tx">${h(sitHoje(p))}</td><td class="tx">${h(obraNome(obraP(p)))}</td><td><button class="sec mini">Abrir</button> <button class="mini" data-fimp="${h(p.id)}">Imprimir</button></td></tr>`).join('')}</table></div>${l.length > 60 ? '<div class="hint">Mostrando 60 de ' + l.length + '. Refine a busca.</div>' : ''}` : vazio('Ninguém encontrado.');
  }

  function fichaHTML(id){
    const p = A.pessoa(id); if(!p) return '';
    const t = hoje(), des = A.desligado(p), casa = A.casaDias(p, t);
    const pers = A.periodos(p).slice().sort((x, y) => y.ini.localeCompare(x.ini)).map(y => A.calcPer(p, y, t));
    const gs = A.gozosDe(p.id).filter(g => g.st !== 'sug').sort((x, y) => y.ini.localeCompare(x.ini));
    const oc = A.ocs().filter(o => (o.itens || []).some(i => i.pid === p.id)).sort((x, y) => y.data.localeCompare(x.data));
    const dado = (r, v) => `<div><span>${r}</span><b>${h(v || '—')}</b></div>`;
    return `<h1 class="nm">${h(nm(p.nome))}</h1>
    <div class="dados">${dado('Função', nm(A.funcaoDe(p)))}${dado('Obra / alocação', obraNome(obraP(p)))}${dado('Setor', p.setor === 'SEDE' ? 'Sede' : p.setor ? 'Obra' : '')}${dado('Código contabilidade', p.cod)}
      ${dado('Admissão', br(p.adm))}${dado('Tempo de casa', casaTxt(casa))}${dado('Situação', sitHoje(p))}${dado('Registrado em carteira', p.reg)}${dado('Salário', p.sal ? R$(p.sal) : '')}</div>
    ${des ? `<h2>Desligamento</h2><div class="dados">${dado('Data', p.dem ? br(p.dem) : 'mês ' + (p.mesDem || ''))}${dado('Tipo', nm(p.tipoDem || 'não informado'))}${dado('Iniciativa', nm(A.iniciativa(p.tipoDem)))}${dado('Observação', p.obsDem || p.obs)}</div>` : ''}
    <h2>Ocorrências (${oc.length})</h2>${oc.length ? `<table><tr><th>Data</th><th>Medida</th><th class="tx">Motivo (art. 482)</th><th class="tx">Ocorrido</th><th>Carta</th></tr>${oc.map(o => { const i = o.itens.find(x => x.pid === p.id) || {};
      return `<tr><td>${br(o.data)}</td><td>${o.medida === 'reg' ? 'Só registro' : (+i.grau || 1) + 'ª advertência'}</td><td class="tx">${h(A.motivo(o.letras) || '—')}</td><td class="tx">${h(o.desc || '')}</td><td>${o.medida === 'reg' ? '—' : i.ass ? 'Assinada' : 'A assinar'}</td></tr>`; }).join('')}</table>` : '<p class="mut">Nenhuma ocorrência registrada.</p>'}
    <h2>Férias lançadas (${gs.length})</h2>${gs.length ? `<table><tr><th>Aquisitivo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Abono</th><th>Situação</th></tr>${gs.map(g => `<tr><td>${br(g.per)}</td><td>${br(g.ini)}</td><td>${br(A.fimG(g))}</td><td>${g.dias}</td><td>${+g.abono || 0}</td><td>${A.SIT[A.situacao(g, t)].t}</td></tr>`).join('')}</table>` : '<p class="mut">Nenhuma férias lançada.</p>'}
    ${!des && pers.length ? `<h2>Períodos aquisitivos</h2><table><tr><th>Aquisitivo</th><th>Direito</th><th>Saldo a lançar</th><th>Concessivo até</th><th>Limite p/ iniciar</th><th>Situação</th></tr>${pers.map(x => `<tr><td>${br(x.per.ini)} a ${br(x.per.fim)}</td><td>${fN(x.aberto ? 30 : x.per.dir, 0)} d</td><td>${fN(x.saldo, 0)} d</td><td>${br(x.fimConc)}</td><td>${x.lim ? br(x.lim) : '—'}</td><td>${A.NIV[x.niv].t}</td></tr>`).join('')}</table>` : ''}`;
  }

  // ---------- render ----------
  const FUN = {mov: vMov, oc: vOc, fer: vFer, qua: vQua, exp: vExp, fic: vFic};
  function render(lido){
    if(!G360Relatorios.visivel('rh')) return;
    esconderTip();
    const [a, b] = periodo();
    aba.querySelectorAll('#rr-ver button').forEach(x => { x.classList.toggle('on', x.dataset.v === SEL.ver); x.setAttribute('aria-selected', String(x.dataset.v === SEL.ver)); });
    aba.querySelectorAll('#rr-per button').forEach(x => x.classList.toggle('on', x.dataset.p === SEL.per));
    aba.querySelector('#rr-per').style.display = SEL.ver === 'fic' ? 'none' : '';
    aba.querySelector('#rr-datas').style.display = SEL.per === 'per' && SEL.ver !== 'fic' ? '' : 'none';
    aba.querySelector('#rr-ini').value = a; aba.querySelector('#rr-fim').value = b;
    const obras = new Map(); A.locais().forEach(l => obras.set(l.cod, l.nome));
    A.vivos(RH.dados().pes).forEach(p => { const o = obraP(p); if(o && !obras.has(o)) obras.set(o, obraNome(o)); });
    aba.querySelector('#rr-obra').innerHTML = '<option value="">Todas as obras</option>' + [...obras.entries()].map(([c, n]) => `<option value="${h(c)}"${c === SEL.obra ? ' selected' : ''}>${h(n)}</option>`).join('') + `<option value="${SEM}"${SEL.obra === SEM ? ' selected' : ''}>Sem alocação</option>`;
    if(lido) aba.querySelector('#rr-estado').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '.';
    let r;
    try{ r = FUN[SEL.ver](a, b); }catch(e){ console.error(e); r = {html: card('Erro', vazio('Não deu para montar esta visão: ' + h(e.message))), vazio: true}; }
    aba.querySelector('#rr-corpo').innerHTML = r.html.replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, '</table></div>');
    if(SEL.ver === 'fic') renderFichaLista();
    aba.querySelector('#rr-exp-card').style.display = SEL.ver === 'fic' ? 'none' : '';
    aba.querySelector('#rr-txt').value = SEL.ver === 'fic' ? '' : texto(SEL.ver, a, b);
    ['rr-pdf', 'rr-wpp', 'rr-copiar', 'rr-csv'].forEach(id => aba.querySelector('#' + id).disabled = !!r.vazio && SEL.ver !== 'qua');
  }

  // ---------- texto (WhatsApp): só números ----------
  function texto(v, a, b){
    const ob = SEL.obra ? ' · ' + obraNome(SEL.obra === SEM ? '' : SEL.obra) : '';
    const lin = ['*Relatório de RH – ' + VIEWS.find(x => x[0] === v)[1] + ' – BKP Construtora*', '📅 ' + (v === 'qua' ? 'Quadro em ' + br(quadroEm(b).ref) : perTxt(a, b)) + ob, ''];
    if(v === 'mov'){ const M = movimentacao(a, b), s = M.adm.length - M.dem.length;
      lin.push('➕ Admissões: *' + M.adm.length + '*', '➖ Desligamentos: *' + M.dem.length + '*' + (M.exp.length ? ' (' + M.exp.length + ' na experiência)' : ''), '⚖️ Saldo: *' + (s > 0 ? '+' : '') + s + '*', '🔄 Turnover: *' + pct(M.to) + '* (quadro médio ' + fN(M.qm, 0) + ')');
      if(M.dem.length){ lin.push('', '*Desligamentos por tipo*'); M.porTipo.forEach(x => lin.push('• ' + nm(x[0]) + ': ' + x[1])); }
      if(M.porObra.length > 1){ lin.push('', '*Por obra* (adm./desl.)'); M.porObra.forEach(r => lin.push('• ' + (r.o || 'Sem alocação') + ': ' + r.adm + ' / ' + r.dem)); } }
    if(v === 'oc'){ const O = ocorrencias(a, b);
      lin.push('📋 Ocorrências: *' + O.os + '* (' + O.pes + ' colaborador(es))', '⚠️ Advertências escritas: *' + O.adv.length + '*' + (O.reg.length ? ' · ' + O.reg.length + ' só registro' : ''), '✍️ Cartas a assinar: *' + O.aAss.length + '*', '🔁 Reincidentes: *' + O.reinc.length + '*');
      if(O.motivos.length){ lin.push('', '*Por motivo*'); O.motivos.forEach(x => lin.push('• ' + x[0] + ': ' + x[1])); }
      if(O.porObra.length > 1){ lin.push('', '*Por obra*'); O.porObra.forEach(r => lin.push('• ' + (r.o || 'Sem alocação') + ': ' + (r.adv + r.reg))); } }
    if(v === 'fer'){ const F = ferias(a, b);
      lin.push('🏖️ De férias no período: *' + F.pes + '* (' + fN(F.dias, 0) + ' dias)', '📨 Avisos a emitir: *' + F.avisos.length + '*', '⏰ Limites vencendo no período: *' + F.lim.length + '*', '🚨 Férias vencidas hoje: *' + F.venc.length + '*'); }
    if(v === 'qua'){ const Q = quadroEm(b);
      lin.push('👷 No quadro: *' + Q.l.length + '*', '🆕 Em experiência: *' + Q.exp.length + '*' + (Q.ref === hoje() ? ' · afastados: ' + Q.afa.length : ''), '');
      lin.push('*Por obra*'); Q.porObra.forEach(r => lin.push('• ' + (r.o || 'Sem alocação') + ': ' + r.n)); }
    if(v === 'exp'){ const E = experiencia(a, b);
      lin.push('📆 Vencimentos de experiência: *' + E.l.length + '*', '❓ A decidir: *' + E.decidir.length + '*', '✅ Efetivados: *' + E.efet + '*' + (E.taxa != null ? ' (efetivação ' + pct(E.taxa) + ')' : '')); }
    lin.push('', '_Gestão 360º BKP_');
    return lin.join('\n');
  }
  const avisoEnv = (t, e) => { const el = aba.querySelector('#rr-env'); el.textContent = t; el.style.color = e ? '#b42318' : ''; };
  async function copiar(t){
    try{ await navigator.clipboard.writeText(t); return true; }
    catch(e){ const ta = aba.querySelector('#rr-txt'); ta.removeAttribute('readonly'); ta.select(); let r = false; try{ r = document.execCommand('copy'); }catch(x){} ta.setAttribute('readonly', ''); return r; }
  }
  aba.querySelector('#rr-copiar').onclick = async () => avisoEnv(await copiar(aba.querySelector('#rr-txt').value) ? 'Texto copiado.' : 'Não deu para copiar: selecione o texto acima e copie.');
  aba.querySelector('#rr-wpp').onclick = async () => {
    const t = aba.querySelector('#rr-txt').value;
    if(navigator.share && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)){ try{ await navigator.share({text: t}); return; }catch(e){ if(e && e.name === 'AbortError') return; } }
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
  };

  // ---------- CSV ----------
  const csvL = r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';');
  aba.querySelector('#rr-csv').onclick = () => {
    const [a, b] = periodo(), v = SEL.ver, l = [];
    if(v === 'mov'){ const M = movimentacao(a, b);
      l.push(['Movimento', 'Data', 'Nome', 'Função', 'Obra', 'Setor', 'Admissão', 'Desligamento', 'Dias de casa', 'Tipo de desligamento', 'Iniciativa', 'Na experiência', 'Situação hoje', 'Observação']);
      M.adm.forEach(p => l.push(['Admissão', br(p.adm), p.nome, A.funcaoDe(p), obraP(p), p.setor, br(p.adm), p.dem ? br(p.dem) : '', '', '', '', '', sitHoje(p), p.obs]));
      M.dem.forEach(p => l.push(['Desligamento', p.dem ? br(p.dem) : p.mesDem, p.nome, A.funcaoDe(p), obraP(p), p.setor, br(p.adm), p.dem ? br(p.dem) : '', M.casa(p) == null ? '' : M.casa(p), p.tipoDem || 'NÃO INFORMADO', A.iniciativa(p.tipoDem), M.casa(p) != null && M.casa(p) <= 90 ? 'Sim' : 'Não', sitHoje(p), p.obsDem || p.obs])); }
    if(v === 'oc'){ const O = ocorrencias(a, b);
      l.push(['Data do ocorrido', 'Data da carta', 'Colaborador', 'Cargo', 'Obra', 'Medida', 'Grau', 'Art. 482', 'Motivo', 'Descrição', 'Assinada', 'Advertências no período', 'Advertências na casa', 'Lançado por']);
      const nPer = {}; O.adv.forEach(x => { const k = x.i.pid || x.i.nome; nPer[k] = (nPer[k] || 0) + 1; });
      O.it.forEach(x => l.push([br(x.o.data), x.o.medida === 'reg' ? '' : br(x.o.emissao), x.i.nome, x.i.cargo, x.i.obra, x.o.medida === 'reg' ? 'Só registro' : 'Advertência escrita', x.o.medida === 'reg' ? '' : A.GRAU(x.i.grau), (x.o.letras || []).join(', '), A.motivo(x.o.letras), x.o.desc, x.o.medida === 'reg' ? '' : x.i.ass ? 'Sim' : 'Não', nPer[x.i.pid || x.i.nome] || 0, x.i.pid ? A.advDe(x.i.pid).length : '', x.o.u || ''])); }
    if(v === 'fer'){ const F = ferias(a, b);
      l.push(['Tipo', 'Nome', 'Obra', 'Função', 'Aquisitivo', 'Início', 'Fim', 'Retorno', 'Dias', 'Abono', 'Dias dentro do período', 'Situação', 'Aviso', 'Saldo (dias)', 'Limite p/ iniciar', 'Nível', 'Custo estimado']);
      F.gs.forEach(x => l.push(['Férias no período', x.p.nome, obraP(x.p), A.funcaoDe(x.p), br(x.g.per), br(x.g.ini), br(x.fim), br(somaDias(x.fim, 1)), x.g.dias, x.g.abono || 0, x.diasPer, A.SIT[x.st].t, x.aviso ? x.aviso.t : '', '', '', '', csvBR(x.custo)]));
      F.venc.concat(F.lim).forEach(x => l.push([x.niv === 'venc' ? 'Férias vencidas' : 'Limite no período', x.p.nome, obraP(x.p), A.funcaoDe(x.p), br(x.per.ini), '', '', '', '', '', '', '', '', fN(x.saldo, 0), x.lim ? br(x.lim) : '', A.NIV[x.niv].t, csvBR(x.custoSaldo)])); }
    if(v === 'qua'){ const Q = quadroEm(b);
      l.push(['Quadro em', 'Nome', 'Função', 'Obra', 'Setor', 'Admissão', 'Dias de casa', 'Em experiência', 'Situação', 'Registrado', 'Código', 'Salário']);
      Q.l.forEach(x => l.push([br(Q.ref), x.p.nome, x.f, x.o, x.p.setor, br(x.p.adm), x.casa == null ? '' : x.casa, x.casa != null && x.casa <= 90 ? 'Sim' : 'Não', A.SITP[x.p.sit] || 'Ativo', x.p.reg, x.p.cod, csvBR(x.p.sal)])); }
    if(v === 'exp'){ const E = experiencia(a, b);
      l.push(['Nome', 'Função', 'Obra', 'Admissão', 'Etapa', 'Vence em', 'Advertências na casa', 'Resultado']);
      E.l.forEach(x => l.push([x.p.nome, A.funcaoDe(x.p), obraP(x.p), br(x.p.adm), x.rot, br(x.d), x.adv, x.res])); }
    const csv = '﻿' + l.map(csvL).join('\r\n');
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    el.download = 'rh-' + {mov: 'movimentacao', oc: 'ocorrencias', fer: 'ferias', qua: 'quadro', exp: 'experiencia'}[v] + '-' + a + '_a_' + b + '.csv'; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 5000);
  };

  // ---------- impressão / PDF ----------
  // reaproveita o HTML da tela: tira botões, tooltips e o que é só interação
  const paraPapel = html => html.replace(/ data-tip="[^"]*"/g, '').replace(/<div class="seg seg2">[\s\S]*?<\/div>/g, '').replace(/<div class="hint" style="margin-top:6px">Clique num nome[^<]*<\/div>/g, '').replace(/<button[^>]*>[\s\S]*?<\/button>/g, '');
  function secao(v, a, b){
    if(v === 'mov'){ // no papel vão as duas listas
      const M = movimentacao(a, b), keep = SEL.lmov; let s = '';
      SEL.lmov = 'dem'; s = vMov(a, b).html;
      if(M.adm.length){ SEL.lmov = 'adm'; const x = vMov(a, b).html; const i = x.lastIndexOf('<div class="card"><h2>Lista</h2>'); s += x.slice(i).replace('<h2>Lista</h2>', '<h2>Admissões</h2>'); }
      SEL.lmov = keep; return s.replace('<h2>Lista</h2>', '<h2>Desligamentos</h2>');
    }
    return FUN[v](a, b).html;
  }
  function imprimir(corpo, tit){
    const [a, b] = periodo(), base = location.href.replace(/[^/]*$/, '');
    const sub = tit === 'Ficha' ? 'Ficha do colaborador' : 'Relatório de RH · ' + tit + (SEL.ver === 'qua' && tit !== 'Completo' ? '' : ' · ' + perTxt(a, b));
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${h(sub)}</title>
<style>
 @page{size:A4;margin:12mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#232323;margin:0}
 .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #C05621;padding-bottom:7px;margin-bottom:8px}
 .cab img{height:34px} .cab h1{font-size:16px;margin:0} .cab span{font-size:10px;color:#8e8e8e;letter-spacing:.1em;text-transform:uppercase}
 .card{margin:0 0 6px;page-break-inside:auto}
 .card>h2,h2{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px;color:#5c5c5c}
 h3{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;margin:8px 0 3px;color:#8e8e8e}
 .sec-tit{font-size:13px;margin:16px 0 2px;color:#C05621;border-bottom:1px solid #eee;padding-bottom:3px;page-break-after:avoid}
 .rr-kpi{display:flex;gap:8px;margin:4px 0 6px} .rr-kpi>div{flex:1;border:1px solid #e8e8ea;border-top-width:3px;border-radius:8px;padding:6px 8px}
 .rr-kpi span{display:block;font-size:8.5px;font-weight:700;color:#8e8e8e;text-transform:uppercase;letter-spacing:.05em} .rr-kpi b{font-size:17px;display:block} .rr-kpi small{display:block;color:#8e8e8e;font-size:8.5px}
 .rr-2{display:flex;gap:18px} .rr-2>div{flex:1}
 .bar{display:flex;align-items:center;gap:6px;margin:2px 0} .bar .rt{flex:0 0 42%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#5c5c5c} .bar .tr{flex:1;height:8px;background:#f1f1f3;border-radius:4px;overflow:hidden} .bar .tr i{display:block;height:100%} .bar b{flex:0 0 52px;text-align:right}
 .rr-leg{font-size:9.5px;color:#5c5c5c;display:flex;gap:12px} .rr-leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}
 svg{width:100%;height:auto;max-height:180px}
 .hint{font-size:8.5px;color:#8e8e8e;margin:3px 0} .rr-alerta{background:#fff5dc;color:#7a5200;padding:4px 7px;border-radius:5px;font-size:9.5px;margin-top:4px}
 .rr-vazio{color:#8e8e8e;padding:6px 0}
 table{width:100%;border-collapse:collapse} tr{page-break-inside:avoid}
 th{background:#f6f6f7;font-size:8.5px;text-transform:uppercase;text-align:right;padding:4px 5px;border-bottom:1px solid #ddd} th:first-child,th.tx,td.tx,td:first-child{text-align:left}
 td{padding:3.5px 5px;border-bottom:1px solid #eee;text-align:right;vertical-align:top} td small{display:block;color:#8e8e8e;font-size:8.5px}
 .tot td{font-weight:700;border-top:1.5px solid #999}
 .tag{font-weight:700;font-size:9px;border-radius:4px;padding:0 5px}
 .nm{font-size:17px;margin:6px 0 8px} .mut{color:#8e8e8e}
 .dados{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;border:1px solid #e8e8ea;border-radius:8px;padding:8px 10px}
 .dados span{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#8e8e8e;font-weight:700} .dados b{font-size:11px}
 .rod{margin-top:14px;font-size:8.5px;color:#8e8e8e}
 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>
<div class="cab"><img src="${base}logo-bkp.png" alt=""><div><h1>${h(sub)}</h1><span>BKP Construtora${SEL.obra && tit !== 'Ficha' ? ' · ' + h(obraNome(SEL.obra === SEM ? '' : SEL.obra)) : ''} · documento interno de RH</span></div></div>
${corpo}
<div class="rod">Gerado pelo Gestão 360º BKP em ${new Date().toLocaleString('pt-BR')}${window.DMT_SESSAO && window.DMT_SESSAO.u ? ' por ' + h(window.DMT_SESSAO.u) : ''}. Contém dados pessoais: uso restrito ao RH.</div>
</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const ir = () => { try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){} setTimeout(() => fr.remove(), 60000); };
    const img = doc.querySelector('img');
    if(img && !img.complete){ img.onload = img.onerror = ir; setTimeout(ir, 3000); } else setTimeout(ir, 200);
  }
  aba.querySelector('#rr-pdf').onclick = () => { const [a, b] = periodo(); imprimir(paraPapel(secao(SEL.ver, a, b)), VIEWS.find(x => x[0] === SEL.ver)[1]); };
  aba.querySelector('#rr-pdfall').onclick = () => { const [a, b] = periodo();
    imprimir(VIEWS.filter(v => v[0] !== 'fic').map((v, i) => `<div class="sec-tit"${i ? ' style="page-break-before:always"' : ''}>${v[1]}</div>` + paraPapel(secao(v[0], a, b))).join(''), 'Completo'); };

  // ---------- registro na aba Relatórios ----------
  const reg = {id: 'rh', nome: 'RH', el: aba, mostrar(){ render(); Promise.resolve(RH.receber()).then(() => render()).catch(() => {}); }, esconder: esconderTip};
  G360Relatorios.registrar(reg);
  // quem não tem o módulo RH liberado não vê o relatório
  function acesso(){
    const okA = !RH.liberado || RH.liberado();
    if(reg.btn) reg.btn.style.display = okA ? '' : 'none';
    if(!okA && G360Relatorios.atual() === 'rh'){ const outro = document.querySelector('#rel-sub button:not([style*="none"])'); if(outro) outro.click(); else aba.style.display = 'none'; }
  }
  acesso();
  window.G360RelRH = {render, _mov: movimentacao, _oc: ocorrencias, _fer: ferias, _qua: quadroEm, _exp: experiencia};
})();
