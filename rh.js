// Módulo RH do Gestão 360º BKP — Gestão de Férias.
// Carregado por index.html depois do app (como diarias.js). Não guarda nada secreto: os dados
// ficam na aba oculta "G360RH" da planilha Google (e nas abas legíveis "Férias – Períodos" e
// "Férias – Programação"), lidos e gravados pela mesma ligação da aba Emulsão (txApi).
//
// De onde vêm os dados:
//  - "Programação de Férias" da contabilidade (PDF): código, admissão, períodos aquisitivos,
//    dias de direito, gozados, restantes, limite, afastamentos e faltas. Importado na aba Ajustes.
//  - Salários: planilha (.xlsx, aba "Base salários") ou colados do Excel. Servem só para o custo.
//  - Obra e função: aba Colaboradores do Gestão 360º (ligação automática pelo nome).
//
// Regras da CLT usadas:
//  - Período concessivo = 12 meses após o fim do aquisitivo (art. 134). Passou disso: dobro (art. 137).
//  - Limite para iniciar = fim do concessivo − saldo + 1 dia.
//  - Aviso com 30 dias de antecedência (art. 135); pagamento até 2 dias antes (art. 145).
//  - Não pode começar nos 2 dias antes de feriado ou do repouso semanal (art. 134 §3º).
//  - Fracionamento em até 3 períodos, um com 14 dias ou mais e os demais com 5 ou mais (art. 134 §1º).
//  - Abono pecuniário: até 1/3 do direito (art. 143).
(function(){
  if(typeof txApi !== 'function' || typeof trocarAba !== 'function') return;
  const ABAS = document.getElementById('abas');
  if(!ABAS) return;

  const KEY = 'dmtbkp_rh', PEND = 'dmtbkp_rhPend', SUBK = 'dmtbkp_rh_sub';
  const EMPRESA = {nome: 'BKP CONSTRUTORA LTDA', cnpj: '16.939.495/0001-59', end: 'Av. José Estevão Torquato da Silva, 1370, Jardim Vitória, Cuiabá-MT', cidade: 'Cuiabá-MT'};

  // ---------- utilidades ----------
  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const P = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const hoje = () => iso(new Date());
  const addD = (s, n) => { const d = P(s); d.setDate(d.getDate() + n); return iso(d); };
  const addM = (s, n) => { const d = P(s), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
  const dif = (a, b) => Math.round((P(b) - P(a)) / 864e5); // b − a, em dias
  const br = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—';
  const brc = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : '—';
  const deBR = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim()); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const mesTxt = s => MES[+s.slice(5, 7) - 1] + '/' + s.slice(2, 4);
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const fmtN = (v, c) => (+v || 0).toLocaleString('pt-BR', {minimumFractionDigits: c || 0, maximumFractionDigits: c == null ? 1 : c});
  const R$ = v => (+v || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const R$k = v => { v = +v || 0; return Math.abs(v) >= 1000 ? 'R$ ' + fmtN(v / 1000, 1) + ' mil' : R$(v); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const agora = () => Date.now();
  const usuario = () => (window.DMT_SESSAO && window.DMT_SESSAO.u) || '';
  const cod = v => typeof codObra === 'function' ? codObra(v) : String(v || '').trim().toUpperCase();
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const titulo = s => String(s || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, m => m.toLowerCase());
  const lsGet = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const lsDel = k => { try{ localStorage.removeItem(k); }catch(e){} };

  // ---------- dados ----------
  const CFG0 = () => ({crit: 60, alto: 120, medio: 240, aviso: 30, maxAus: 30, acesso: [], upd: 0});
  const VAZIO = () => ({v: 1, cfg: CFG0(), pes: [], gozos: [], imp: null});
  let D = VAZIO();
  try{ const v = JSON.parse(lsGet(KEY) || 'null'); if(v && Array.isArray(v.pes)) D = Object.assign(VAZIO(), v, {cfg: Object.assign(CFG0(), v.cfg)}); }catch(e){}
  let timer = null, ultimaLeitura = 0, estado = {t: '', err: false};

  const vivos = l => (l || []).filter(x => !x.del);
  const pesAtivas = () => vivos(D.pes).filter(p => p.ativo !== false);
  const pessoa = id => D.pes.find(p => p.id === id);

  // colaboradores do Gestão 360º (aba Colaboradores): obra e função
  const colaboradores = () => { try{ return (JSON.parse(lsGet('dmtbkp_colaboradores') || '[]') || []).filter(c => !c.situacao || /ATIV/i.test(c.situacao)); }catch(e){ return []; } };
  const PARADA = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
  const tokens = s => norm(s).split(' ').filter(t => t && !PARADA.has(t));
  function lev(a, b){
    if(a === b) return 0; if(Math.abs(a.length - b.length) > 2) return 9;
    const m = []; for(let i = 0; i <= a.length; i++){ m[i] = [i]; }
    for(let j = 1; j <= b.length; j++) m[0][j] = j;
    for(let i = 1; i <= a.length; i++) for(let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }
  // semelhança de nomes (0 a 1): primeiro nome precisa bater; tolera uma letra trocada e partículas
  function semelhanca(a, b){
    const A = tokens(a), B = tokens(b);
    if(!A.length || !B.length) return 0;
    if(norm(a) === norm(b)) return 1.01;
    if(lev(A[0], B[0]) > 1) return 0;
    let iguais = 0, exatos = 0; const usado = new Set();
    A.forEach(t => { const j = B.findIndex((u, k) => !usado.has(k) && lev(t, u) <= (t.length > 4 ? 1 : 0)); if(j >= 0){ usado.add(j); iguais++; if(B[j] === t) exatos++; } });
    return iguais / Math.max(A.length, B.length) + exatos * 0.001;
  }
  let vinculos = new Map(), vincCache = '';
  function ligar(){
    const cs = colaboradores(), ps = pesAtivas();
    const chave = JSON.stringify(cs.map(c => [c.id, c.nome, c.obra, c.funcao])) + '|' + ps.map(p => p.id + p.nome + (p.cid || '')).join();
    if(chave === vincCache) return vinculos;
    vincCache = chave; vinculos = new Map();
    const usados = new Set();
    ps.filter(p => p.cid != null && p.cid !== '').forEach(p => { const c = cs.find(x => String(x.id) === String(p.cid)); if(c){ vinculos.set(p.id, c); usados.add(c.id); } });
    const pares = [];
    ps.filter(p => !vinculos.has(p.id) && p.cid !== 'nenhum').forEach(p => cs.forEach(c => { if(usados.has(c.id)) return; const s = semelhanca(p.nome, c.nome); if(s >= 0.6) pares.push({p, c, s}); }));
    pares.sort((a, b) => b.s - a.s).forEach(x => { if(vinculos.has(x.p.id) || usados.has(x.c.id)) return; vinculos.set(x.p.id, x.c); usados.add(x.c.id); });
    return vinculos;
  }
  const colabDe = p => ligar().get(p.id) || null;
  const obraDe = p => { const o = cod(p.obra || (colabDe(p) || {}).obra || ''); return /^[-–—]*$/.test(o) ? '' : o; };
  const funcaoDe = p => String(p.funcao || (colabDe(p) || {}).funcao || p.funcaoPl || '').toUpperCase();
  function locais(){
    const l = [{cod: 'ADM', nome: 'Sede (ADM)'}];
    try{ (st.obras || []).forEach(o => { const c = cod(o.codigo); if(c && !l.some(x => x.cod === c) && o.status !== 'concluida') l.push({cod: c, nome: c + ' – ' + (o.local || o.nome || '')}); }); }catch(e){}
    colaboradores().forEach(c => { const o = cod(c.obra); if(o && o !== '-' && !l.some(x => x.cod === o)) l.push({cod: o, nome: o}); });
    pesAtivas().forEach(p => { const o = obraDe(p); if(o && !l.some(x => x.cod === o)) l.push({cod: o, nome: o}); });
    return l;
  }
  const nomeLocal = c => !c ? 'Sem alocação' : ((locais().find(x => x.cod === c) || {}).nome || c);
  const equipe = o => colaboradores().filter(c => cod(c.obra) === o).length;

  // ---------- feriados (nacionais + os cadastrados na aba Diárias) ----------
  function pascoa(y){
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451),
      mes = Math.floor((hh + l - 7 * m + 114) / 31), dia = ((hh + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  const ferCache = {};
  function feriadosAno(y){
    if(ferCache[y]) return ferCache[y];
    const f = {};
    [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência'],
     ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal']]
      .forEach(([md, n]) => f[y + '-' + md] = n);
    const sx = pascoa(y); sx.setDate(sx.getDate() - 2); f[iso(sx)] = 'Sexta-feira Santa';
    return ferCache[y] = f;
  }
  function feriado(d, obra){
    const n = feriadosAno(+d.slice(0, 4))[d];
    if(n) return n;
    try{
      const ex = window.G360Diarias && window.G360Diarias.dados && window.G360Diarias.dados();
      const m = ex && (ex.feriados || []).find(x => !x.del && (!x.o || x.o === obra) && (x.anual ? x.d.slice(5) === d.slice(5) : x.d === d));
      if(m) return m.nome;
    }catch(e){}
    return '';
  }

  // ---------- cálculos de férias ----------
  const NIV = {
    venc:  {t: 'Vencida',      c: '#dc3c3d', tx: '#fff', d: 'Prazo legal passou (ou não cabe mais o saldo): o que cair fora do período concessivo é pago em dobro (CLT art. 137). Conceder imediatamente.'},
    crit:  {t: 'Crítico',      c: '#f18a59', tx: '#fff', d: 'Faltam até {crit} dias para o limite. Emitir o aviso e programar agora.'},
    alto:  {t: 'Alto',         c: '#fbb315', tx: '#0b0b0b', d: 'Faltam de {crit1} a {alto} dias. Programar no próximo trimestre.'},
    medio: {t: 'Médio',        c: '#519ced', tx: '#fff', d: 'Faltam de {alto1} a {medio} dias. Planejar com antecedência.'},
    baixo: {t: 'Baixo',        c: '#9dc8f7', tx: '#0b0b0b', d: 'Faltam mais de {medio} dias. Sem urgência.'},
    aquis: {t: 'Em aquisição', c: '#c2c2c2', tx: '#0b0b0b', d: 'O período aquisitivo ainda não terminou. Já entra no planejamento futuro.'},
    ok:    {t: 'Programado',   c: '#0aac23', tx: '#fff', d: 'Todo o saldo do período já está programado dentro do prazo.'}
  };
  const ORDEM = ['venc', 'crit', 'alto', 'medio', 'baixo', 'aquis', 'ok'];
  const nivDesc = k => NIV[k].d.replace('{crit}', D.cfg.crit).replace('{crit1}', D.cfg.crit + 1).replace('{alto}', D.cfg.alto).replace('{alto1}', D.cfg.alto + 1).replace('{medio}', D.cfg.medio);
  const badge = (k, extra) => `<span class="rh-bd" style="background:${NIV[k].c};color:${NIV[k].tx}">${NIV[k].t}${extra ? ' · ' + extra : ''}</span>`;

  const fimG = g => addD(g.ini, Math.max(1, +g.dias || 0) - 1);
  const gozosDe = pid => vivos(D.gozos).filter(g => g.pid === pid && g.st !== 'canc');
  // situação do gozo: sug (sugestão), prog, aviso (aviso emitido), gozo (em andamento), feito (já gozado), canc
  function situacao(g, ref){
    ref = ref || hoje();
    if(g.st === 'canc') return 'canc';
    if(g.st === 'sug') return 'sug';
    if(ref > fimG(g)) return 'feito';
    if(ref >= g.ini) return 'gozo';
    return g.st === 'aviso' ? 'aviso' : 'prog';
  }
  const SIT = {
    sug:   {t: 'Sugestão',       c: '#fff',    b: '#C05621', tx: '#C05621', dash: true},
    prog:  {t: 'Programada',     c: '#C05621', b: '#C05621', tx: '#fff'},
    aviso: {t: 'Aviso emitido',  c: '#7a3410', b: '#7a3410', tx: '#fff'},
    gozo:  {t: 'Em férias',      c: '#0aac23', b: '#0aac23', tx: '#fff'},
    feito: {t: 'Gozada',         c: '#9fd9a8', b: '#7cc488', tx: '#0b3d14'},
    canc:  {t: 'Cancelada',      c: '#eee',    b: '#ccc',    tx: '#777'}
  };
  const sitBadge = k => `<span class="rh-bd" style="background:${SIT[k].c};color:${SIT[k].tx};border:1px ${SIT[k].dash ? 'dashed' : 'solid'} ${SIT[k].b}">${SIT[k].t}</span>`;

  // calcula um período aquisitivo da pessoa
  function calcPer(p, per, ref, ignorar){
    ref = ref || hoje();
    const fimConc = addM(per.fim, 12), iniConc = addD(per.fim, 1);
    // gozos que entram na conta: os do período que começam depois da data-base da contabilidade
    const gs = gozosDe(p.id).filter(g => g.per === per.ini && g.id !== ignorar && (!per.base || g.ini >= per.base));
    const progr = gs.reduce((s, g) => s + (+g.dias || 0) + (+g.abono || 0), 0);
    const progConf = gs.filter(g => g.st !== 'sug').reduce((s, g) => s + (+g.dias || 0) + (+g.abono || 0), 0);
    const rest = Math.max(0, +per.rest || 0);
    const saldo = Math.max(0, rest - progConf);           // falta programar (sugestões não contam)
    const saldoSug = Math.max(0, rest - progr);
    const aberto = per.fim >= ref;
    const lim = saldo > 0 ? addD(fimConc, -saldo + 1) : '';
    const dias = lim ? dif(ref, lim) : null;
    const foraPrazo = gs.some(g => g.st !== 'sug' && fimG(g) > fimConc);
    let niv;
    if(rest <= 0) niv = 'ok';
    else if(saldo <= 0) niv = foraPrazo ? 'venc' : 'ok';
    else if(aberto) niv = 'aquis';
    else if(dias < 0) niv = 'venc';
    else if(dias <= D.cfg.crit) niv = 'crit';
    else if(dias <= D.cfg.alto) niv = 'alto';
    else if(dias <= D.cfg.medio) niv = 'medio';
    else niv = 'baixo';
    const sal = +p.sal || 0;
    return {p, per, iniConc, fimConc, rest, progr, progConf, saldo, saldoSug, aberto, lim, dias, niv, gs, foraPrazo,
      custoSaldo: sal ? sal / 30 * saldo * 4 / 3 : 0,
      dobro: niv === 'venc' && !aberto,
      perdeDireito: (+per.afast || 0) > 180};
  }
  // todos os períodos com algo a fazer (ou já programados), do mais urgente ao menos
  function fila(ref){
    const l = [];
    pesAtivas().forEach(p => (p.per || []).forEach(per => { if((+per.rest || 0) > 0) l.push(calcPer(p, per, ref)); }));
    const peso = x => ORDEM.indexOf(x.niv);
    return l.sort((a, b) => (a.niv === 'aquis' || a.niv === 'ok' || b.niv === 'aquis' || b.niv === 'ok') && peso(a) !== peso(b) ? peso(a) - peso(b)
      : (a.lim || a.fimConc).localeCompare(b.lim || b.fimConc) || a.p.nome.localeCompare(b.p.nome));
  }
  // o período mais urgente de cada pessoa
  function principal(p, ref){
    const l = (p.per || []).filter(per => (+per.rest || 0) > 0).map(per => calcPer(p, per, ref));
    if(!l.length) return null;
    const ab = l.filter(x => x.niv !== 'ok');
    const base = ab.length ? ab : l;
    return base.sort((a, b) => ORDEM.indexOf(a.niv) - ORDEM.indexOf(b.niv) || (a.lim || a.fimConc).localeCompare(b.lim || b.fimConc))[0];
  }
  const custoGozo = g => { const p = pessoa(g.pid), s = p ? +p.sal || 0 : 0; return s ? s / 30 * ((+g.dias || 0) + (+g.abono || 0)) * 4 / 3 : 0; };
  // tabela do art. 130 (faltas injustificadas no período aquisitivo)
  const direitoFaltas = f => f <= 5 ? 30 : f <= 14 ? 24 : f <= 23 ? 18 : f <= 32 ? 12 : 0;
  // prazo do aviso
  function avisoStatus(g, ref){
    ref = ref || hoje();
    const s = situacao(g, ref);
    if(s !== 'prog') return null;
    const ate = addD(g.ini, -D.cfg.aviso);
    if(ref > ate) return {k: 'atras', t: 'Emitir já (fora do prazo)', ate};
    if(dif(ref, ate) <= 7) return {k: 'ja', t: 'Emitir até ' + brc(ate), ate};
    return {k: 'ok', t: 'Emitir até ' + brc(ate), ate};
  }

  // ---------- validação de uma programação ----------
  function validar(g, ref){
    ref = ref || hoje();
    const p = pessoa(g.pid), out = [];
    const er = t => out.push({k: 'erro', t}), al = t => out.push({k: 'alerta', t}), ok = t => out.push({k: 'ok', t});
    if(!p){ er('Escolha o colaborador.'); return out; }
    const per = (p.per || []).find(x => x.ini === g.per);
    if(!per){ er('Escolha o período aquisitivo.'); return out; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(g.ini || '')){ er('Informe a data de início.'); return out; }
    const dias = +g.dias || 0, abono = +g.abono || 0, c = calcPer(p, per, ref, g.id), fim = fimG(g), obra = obraDe(p);
    if(dias < 5) er('Cada período de férias precisa ter no mínimo 5 dias corridos (CLT art. 134 §1º).');
    if(g.ini <= per.fim) er('O período aquisitivo só termina em ' + br(per.fim) + '. As férias podem começar a partir de ' + br(addD(per.fim, 1)) + '.');
    if(dias + abono > c.rest - c.progConf + 0.001 && dias + abono > 0) er('Saldo do período: ' + fmtN(c.rest - c.progConf) + ' dia(s). Programado aqui: ' + (dias + abono) + '.');
    const maxAb = Math.floor((+per.dir || 30) / 3);
    if(abono > maxAb) er('O abono pecuniário pode ser de no máximo 1/3 do direito (' + maxAb + ' dias, CLT art. 143).');
    // fracionamento
    const fr = []; if((+per.goz || 0) > 0) fr.push(+per.goz);
    c.gs.filter(x => x.st !== 'sug').forEach(x => fr.push(+x.dias || 0)); fr.push(dias);
    const sobra = Math.max(0, c.rest - c.progConf - dias - abono);
    if(fr.length > 3) er('Férias podem ser divididas em no máximo 3 períodos (CLT art. 134 §1º).');
    else if(Math.max.apply(null, fr) < 14){
      if(sobra < 14 && fr.length >= 3 || sobra < 14 && (fr.length === 2 && sobra < 5)) er('Um dos períodos precisa ter no mínimo 14 dias corridos (CLT art. 134 §1º).');
      else al('Lembrete: um dos períodos precisa ter 14 dias ou mais. Sobram ' + fmtN(sobra) + ' dia(s) para isso.');
    }
    if(sobra > 0 && sobra < 5 && fr.length < 3) al('Vão sobrar ' + fmtN(sobra) + ' dia(s), menos que o mínimo de 5 para um novo período.');
    // início
    const w = P(g.ini).getDay();
    const f1 = feriado(addD(g.ini, 1), obra), f2 = feriado(addD(g.ini, 2), obra), f0 = feriado(g.ini, obra);
    if(w === 5 || w === 6) er('Não pode começar ' + (w === 5 ? 'na sexta' : 'no sábado') + ': são os 2 dias antes do repouso semanal (CLT art. 134 §3º). Prefira segunda-feira.');
    else if(f1 || f2) er('Não pode começar nos 2 dias antes de feriado (' + (f1 || f2) + ', CLT art. 134 §3º).');
    else if(w === 0 || f0) al('Começa ' + (f0 ? 'num feriado (' + f0 + ')' : 'num domingo') + '. O usual é começar num dia útil, de preferência segunda-feira.');
    // prazo
    if(fim > c.fimConc) (c.fimConc < ref || addD(c.fimConc, -dias + 1) < addD(ref, D.cfg.aviso) ? al : er)('Termina depois do fim do período concessivo (' + br(c.fimConc) + '): ' + Math.min(dias, dif(c.fimConc, fim)) + ' dia(s) serão pagos em dobro (CLT art. 137).' + (c.fimConc < ref ? ' O prazo já passou: conceda o quanto antes.' : ''));
    if(g.st !== 'aviso' && g.ini >= ref && dif(ref, g.ini) < D.cfg.aviso) al('O aviso precisa ser entregue com ' + D.cfg.aviso + ' dias de antecedência (CLT art. 135). Para essa data, o prazo já passou.');
    if((+per.afast || 0) > 180) al('Afastamento de ' + per.afast + ' dias neste período: acima de 6 meses o direito às férias se perde (CLT art. 133). Confirme com a contabilidade.');
    if((+per.faltas || 0) > 5) al(per.faltas + ' falta(s) no período: o direito cai para ' + direitoFaltas(+per.faltas) + ' dias (CLT art. 130). Confirme com a contabilidade.');
    // sobreposição com a própria pessoa
    vivos(D.gozos).filter(x => x.pid === p.id && x.id !== g.id && x.st !== 'canc' && x.st !== 'sug').forEach(x => {
      if(x.ini <= fim && fimG(x) >= g.ini) er('Já existe férias programada de ' + br(x.ini) + ' a ' + br(fimG(x)) + ' para esta pessoa.');
    });
    // cobertura da equipe
    if(obra){
      const junto = outrosFora(p, g.ini, fim, g.id);
      const tam = Math.max(equipe(obra), 1), tot = junto.length + 1, pct = tot / tam * 100;
      if(junto.length && pct > D.cfg.maxAus) al(tot + ' de ' + tam + ' pessoas de ' + obra + ' fora ao mesmo tempo (' + fmtN(pct, 0) + '%; limite ' + D.cfg.maxAus + '%): ' + junto.map(x => titulo(x.p.nome.split(' ')[0])).join(', ') + '.');
      const fn = funcaoDe(p), mesmaFn = junto.filter(x => fn && funcaoDe(x.p) === fn);
      if(mesmaFn.length) al('Outro(s) ' + fn.toLowerCase() + ' de ' + obra + ' de férias no mesmo período: ' + mesmaFn.map(x => titulo(x.p.nome)).join(', ') + '.');
    }
    if(!out.some(x => x.k !== 'ok')) ok('Dentro das regras da CLT e sem conflito na equipe.');
    return out;
  }
  // quem da mesma obra está fora entre ini e fim
  function outrosFora(p, ini, fim, ignorar, comSug){
    const obra = obraDe(p), l = [];
    vivos(D.gozos).forEach(x => {
      if(x.id === ignorar || x.pid === p.id || x.st === 'canc' || (!comSug && x.st === 'sug')) return;
      const q = pessoa(x.pid); if(!q || q.ativo === false || obraDe(q) !== obra) return;
      if(x.ini <= fim && fimG(x) >= ini && !l.some(y => y.p.id === q.id)) l.push({p: q, g: x});
    });
    return l;
  }
  const proxSegunda = s => { const d = P(s), w = d.getDay(); d.setDate(d.getDate() + (w === 1 ? 0 : (8 - w) % 7)); return iso(d); };
  function inicioValido(s, obra){
    const w = P(s).getDay();
    return w >= 1 && w <= 4 && !feriado(s, obra) && !feriado(addD(s, 1), obra) && !feriado(addD(s, 2), obra);
  }

  // ---------- sugestão automática ----------
  function sugerir(){
    const ref = hoje();
    D.gozos.forEach(g => { if(g.st === 'sug' && !g.del){ g.del = true; g.upd = agora(); } });
    const lista = fila(ref).filter(x => x.saldo >= 5 && (!x.aberto || dif(ref, x.per.fim) <= 180) && x.niv !== 'ok');
    let n = 0, apertadas = 0;
    lista.forEach(x => {
      const obra = obraDe(x.p);
      let dias = x.saldo;
      const g = {id: uid(), pid: x.p.id, per: x.per.ini, dias, abono: 0, adi13: false, st: 'sug', u: usuario(), upd: agora(), criado: agora()};
      let ini = addD(ref, D.cfg.aviso); if(ini <= x.per.fim) ini = addD(x.per.fim, 1);
      ini = proxSegunda(ini);
      const ultimo = addD(x.fimConc, -dias + 1);
      // data ideal: uns 45 dias antes do limite (folga para imprevistos), nunca antes do aviso
      const folga = dif(ini, ultimo) - 30, alvo = folga > 0 ? proxSegunda(addD(ini, Math.round(folga / 2))) : ini;
      let melhor = null, melhorPena = 1e9;
      for(let s = ini, k = 0; k < 70; s = addD(s, 7), k++){
        if(s > ultimo && melhor) break;
        let d0 = s; while(!inicioValido(d0, obra) && dif(s, d0) < 4) d0 = addD(d0, 1);
        const fim = addD(d0, dias - 1), junto = obra ? outrosFora(x.p, d0, fim, null, true) : [];
        const tam = Math.max(equipe(obra), 1), pct = (junto.length + 1) / tam * 100;
        const fn = funcaoDe(x.p), mesma = junto.some(y => fn && funcaoDe(y.p) === fn);
        const pena = (pct > D.cfg.maxAus && junto.length ? 20 : 0) + (mesma ? 10 : 0) + junto.length * 1.5
          + (d0 > ultimo ? 100 : 0) + Math.abs(dif(alvo, d0)) / 30;
        if(pena < melhorPena){ melhor = d0; melhorPena = pena; }
      }
      g.ini = melhor || ini;
      if(melhorPena >= 100) apertadas++;
      D.gozos.push(g); n++;
    });
    salvar();
    return {n, apertadas};
  }

  // ---------- leitura do PDF da contabilidade ----------
  const carregar = (src, glob) => new Promise((ok, er) => {
    if(glob && window[glob]) return ok(window[glob]);
    const s = document.createElement('script'); s.src = src;
    s.onload = () => ok(glob ? window[glob] : true); s.onerror = () => er(new Error('Não foi possível carregar ' + src));
    document.head.appendChild(s);
  });
  async function linhasPDF(buf){
    const PDFV = '3.11.174';
    const lib = await carregar('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFV + '/pdf.min.js', 'pdfjsLib');
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFV + '/pdf.worker.min.js';
    const doc = await lib.getDocument({data: new Uint8Array(buf)}).promise, out = [];
    for(let i = 1; i <= doc.numPages; i++){
      const pg = await doc.getPage(i), tc = await pg.getTextContent();
      const it = tc.items.filter(x => x.str && x.str.trim()).map(x => ({s: x.str.trim(), x: x.transform[4], y: x.transform[5]}));
      const rows = [];
      it.sort((a, b) => b.y - a.y || a.x - b.x).forEach(x => { let r = rows.find(r => Math.abs(r.y - x.y) < 2.5); if(!r){ r = {y: x.y, it: []}; rows.push(r); } r.it.push(x); });
      rows.forEach(r => out.push(r.it.sort((a, b) => a.x - b.x).map(x => x.s).join(' ')));
    }
    return out;
  }
  // interpreta as linhas do relatório "Programação de Férias"
  function lerProgramacao(linhas){
    const DT = '(\\d{2}\\/\\d{2}\\/\\d{4})', GZ = '(\\d{2}\\/\\d{2}\\/\\d{4}|[.\\/]+)', X = '(\\S+)', NN = '([\\d.,]+)';
    const cauda = DT + '\\s+' + DT + '\\s+' + GZ + '\\s+' + X + '\\s+' + X + '\\s+' + X + '\\s+' + NN + '\\s+' + NN + '\\s+' + NN + '\\s+' + DT + '\\s+' + X + '\\s+' + X + '\\s*$';
    const reP = new RegExp('^(\\d+)\\s+(.+?)\\s+' + DT + '\\s+' + DT + '\\s+(\\d+)\\s+(\\d{2}\\/\\d{2})\\s+' + cauda);
    const reC = new RegExp('^' + cauda);
    const v = s => /^[-.]+$/.test(s) ? 0 : num(s);
    let emissao = '', base = '', empresa = '', atual = null, total = null;
    const pes = [], ignoradas = [];
    linhas.forEach(l => {
      l = l.replace(/\s+/g, ' ').trim();
      let m;
      if(!emissao && (m = /Emiss[aã]o:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(l))) emissao = deBR(m[1]);
      if(!base && (m = /Data base:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(l))) base = deBR(m[1]);
      if(!empresa && /CONSTRUTORA|LTDA/.test(l) && !/licenciado/i.test(l)) empresa = l.replace(/P[aá]gina.*$/i, '').trim();
      if((m = /Total de empregados:?\s*(\d+)/i.exec(l))) total = +m[1];
      const per = a => ({ini: deBR(a[0]), fim: deBR(a[1]), gozo: deBR(a[2]), gdias: v(a[3]), gabono: v(a[4]), g13: a[5], dir: v(a[6]), goz: v(a[7]), rest: v(a[8]), limCont: deBR(a[9]), afast: v(a[10]), faltas: v(a[11])});
      if((m = reP.exec(l))){
        atual = {cod: m[1], nome: m[2].trim(), adm: deBR(m[3]), venc: deBR(m[4]), ferVenc: +m[5], prop: m[6], per: [per(m.slice(7))]};
        pes.push(atual);
      }else if((m = reC.exec(l)) && atual){
        atual.per.push(per(m.slice(1)));
      }else if(/^\d+\s+[A-Z]/.test(l) && /\d{2}\/\d{2}\/\d{4}/.test(l)) ignoradas.push(l);
    });
    return {emissao, base, empresa, total, pes, ignoradas};
  }
  // aplica a programação lida: substitui os períodos de quem veio no relatório
  function aplicarProgramacao(r, arquivo){
    const vistos = new Set(), ref = r.emissao || hoje();
    let novos = 0, atual = 0;
    r.pes.forEach(x => {
      let p = vivos(D.pes).find(q => q.cod === x.cod) || vivos(D.pes).find(q => !q.cod && norm(q.nome) === norm(x.nome));
      if(!p){ p = {id: 'p' + x.cod, cod: x.cod, nome: x.nome, sal: 0, obra: '', funcao: '', cid: '', ativo: true}; D.pes.push(p); novos++; } else atual++;
      p.nome = x.nome; p.cod = x.cod; p.adm = x.adm; p.ativo = true; p.upd = agora();
      p.per = x.per.map(y => ({ini: y.ini, fim: y.fim, dir: y.dir, goz: y.goz, rest: y.rest, limCont: y.limCont, afast: y.afast, faltas: y.faltas, base: ref}));
      vistos.add(p.id);
      // férias já marcadas no sistema da contabilidade
      x.per.forEach(y => {
        if(!y.gozo || !(y.gdias > 0)) return;
        const id = 'c' + x.cod + '-' + y.ini + '-' + y.gozo;
        if(!D.gozos.some(g => g.id === id)) D.gozos.push({id, pid: p.id, per: y.ini, ini: y.gozo, dias: y.gdias, abono: y.gabono || 0, adi13: /S/i.test(y.g13), st: 'aviso', obs: 'Lançada pela contabilidade', u: 'contabilidade', upd: agora(), criado: agora()});
      });
    });
    let sairam = 0;
    vivos(D.pes).forEach(p => { if(p.ativo !== false && p.cod && !vistos.has(p.id)){ p.ativo = false; p.upd = agora(); sairam++; } });
    D.imp = {quando: agora(), emissao: r.emissao, base: r.base, arquivo: arquivo || '', n: r.pes.length, per: r.pes.reduce((s, x) => s + x.per.length, 0), u: usuario()};
    salvar();
    return {novos, atual, sairam};
  }
  // salários de uma planilha (.xlsx) ou de texto colado (Nome ⇥ Salário)
  async function salariosXLSX(buf){
    const X = await carregar('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
    const wb = X.read(buf, {type: 'array'}), achados = [];
    const nomes = wb.SheetNames.slice().sort((a, b) => (/sal/i.test(b) ? 1 : 0) - (/sal/i.test(a) ? 1 : 0));
    for(const sn of nomes){
      const rows = X.utils.sheet_to_json(wb.Sheets[sn], {header: 1, raw: true, defval: ''});
      for(let i = 0; i < Math.min(rows.length, 80); i++){
        const hd = rows[i].map(c => norm(c));
        const cn = hd.findIndex(c => c === 'NOME' || c === 'COLABORADOR' || c === 'EMPREGADO');
        let cs = hd.findIndex(c => c === 'TOTAL');
        if(cs < 0) cs = hd.findIndex(c => /^SALARIO BRUTO/.test(c));
        if(cs < 0) cs = hd.findIndex(c => /^SALARIO( BASE)?$/.test(c));
        if(cn < 0 || cs < 0) continue;
        const cf = hd.findIndex(c => c === 'FUNCAO' || c === 'CARGO');
        for(let j = i + 1; j < rows.length; j++){
          const n = String(rows[j][cn] || '').trim(), s = num(rows[j][cs]);
          if(!n || /TOTAL/i.test(n)) continue;
          if(s > 0) achados.push({nome: n, sal: s, fn: cf >= 0 ? String(rows[j][cf] || '').trim() : ''});
        }
        if(achados.length) return {aba: sn, l: achados};
      }
    }
    return {aba: '', l: []};
  }
  function salariosTexto(t){
    return String(t || '').split(/\r?\n/).map(l => l.split(/\t|;/)).filter(c => c.length >= 2).map(c => {
      const sal = num(String(c[c.length - 1]).replace(/R\$\s*/, '')); return {nome: c[0].trim(), sal};
    }).filter(x => x.nome && x.sal > 0);
  }
  function aplicarSalarios(l){
    const ps = pesAtivas(); let ok = 0; const sem = [];
    l.forEach(x => {
      let best = null, bs = 0;
      ps.forEach(p => { const s = semelhanca(x.nome, p.nome); if(s > bs){ bs = s; best = p; } });
      if(best && bs >= 0.75){ best.sal = Math.round(x.sal * 100) / 100; if(x.fn) best.funcaoPl = x.fn.toUpperCase(); best.upd = agora(); ok++; } else sem.push(x.nome);
    });
    if(ok) salvar();
    return {ok, sem};
  }

  // ---------- sincronização com a planilha ----------
  function lista(a, b){
    const m = new Map();
    (a || []).forEach(x => m.set(x.id, x));
    (b || []).forEach(x => { const y = m.get(x.id); if(!y || (x.upd || 0) > (y.upd || 0)) m.set(x.id, x); });
    return Array.from(m.values());
  }
  function juntar(a, b){
    const r = VAZIO();
    r.cfg = Object.assign(CFG0(), (b.cfg && (b.cfg.upd || 0) > ((a.cfg && a.cfg.upd) || 0)) ? b.cfg : (a.cfg || {}));
    r.pes = lista(a.pes, b.pes); r.gozos = lista(a.gozos, b.gozos);
    r.imp = [a.imp, b.imp].filter(Boolean).sort((x, y) => (y.quando || 0) - (x.quando || 0))[0] || null;
    return r;
  }
  function salvar(semRender){
    lsSet(KEY, JSON.stringify(D)); lsSet(PEND, '1');
    if(!semRender) renderTudo();
    clearTimeout(timer); timer = setTimeout(enviar, 1200);
  }
  const msgErro = e => /desconhecida/i.test(e.message) ? 'A planilha ainda não aceita o módulo RH: atualize o Apps Script (ver README). Os dados ficam neste computador até lá.' : 'Sem ligação com a planilha agora. Os dados ficam neste computador e são enviados depois.';
  function aviso(t, err){ estado = {t, err: !!err}; document.querySelectorAll('.rh-est').forEach(e => { e.textContent = t; e.classList.toggle('err', !!err); e.classList.toggle('pend', !err && !!lsGet(PEND)); }); }
  async function enviar(){
    clearTimeout(timer);
    try{
      const j = await txApi({acao: 'lerRH'});
      if(j.dados && Array.isArray(j.dados.pes)){ D = juntar(D, j.dados); lsSet(KEY, JSON.stringify(D)); }
      const vis = {}; pesAtivas().forEach(p => vis[p.id] = {o: obraDe(p), f: funcaoDe(p)}); // só para as abas legíveis
      await txApi({acao: 'gravarRH', dados: Object.assign({}, D, {vis})});
      lsDel(PEND);
      aviso('Salvo na planilha às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}));
      renderTudo();
    }catch(e){ aviso(msgErro(e), true); timer = setTimeout(enviar, 60000); }
  }
  async function receber(forcar){
    if(lsGet(PEND)) return enviar();
    if(!forcar && Date.now() - ultimaLeitura < 15000) return;
    ultimaLeitura = Date.now();
    try{
      const j = await txApi({acao: 'lerRH'});
      if(j.dados && Array.isArray(j.dados.pes)){
        const novo = juntar(D, j.dados);
        if(JSON.stringify(novo) !== JSON.stringify(D)){ D = novo; lsSet(KEY, JSON.stringify(D)); renderTudo(); }
      }
      aviso('Sincronizado com a planilha');
      acesso();
    }catch(e){ aviso(msgErro(e), true); }
  }

  // ---------- acesso (visual: esconde o módulo de quem não está na lista) ----------
  const liberado = () => !(D.cfg.acesso || []).length || (D.cfg.acesso || []).map(norm).includes(norm(usuario()));
  function acesso(){
    const ok = liberado();
    btn.style.display = ok ? '' : 'none';
    if(!ok && aba.style.display !== 'none') trocarAba('dmt');
  }

  // ---------- estilos ----------
  const css = document.createElement('style');
  css.textContent = `
  #aba-rh .rh-k{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .rh-kp{background:var(--card,#fff);border:1px solid var(--line,#e8e8ea);border-radius:10px;padding:10px 12px;text-align:left;cursor:pointer;color:var(--ink,#232323);font-weight:400;display:block;width:100%}
  .rh-kp:hover:not(:disabled){background:var(--head,#f6f6f7);filter:none}
  .rh-kp small{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3,#8e8e8e)}
  .rh-kp b{display:block;font-size:22px;line-height:1.2;font-variant-numeric:tabular-nums;margin-top:2px}
  .rh-kp span{display:block;font-size:11px;color:var(--ink3,#8e8e8e);margin-top:1px}
  .rh-kp i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;vertical-align:1px}
  #aba-rh .rh-bts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  #aba-rh .rh-bts button{flex:1 1 auto}
  #aba-rh ul{list-style:none;margin:0;padding:0}
  #aba-rh li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line2,#f2f2f3);font-size:12.5px;cursor:pointer}
  #aba-rh li:last-child{border-bottom:0}
  #aba-rh li:hover{background:var(--head,#f6f6f7)}
  #aba-rh li .nm{flex:1;min-width:0}
  #aba-rh li .nm b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #aba-rh li .nm small{display:block;font-size:11px;color:var(--ink3,#8e8e8e)}
  #aba-rh li .dt{font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--ink2,#5c5c5c);text-align:right;white-space:nowrap}
  .rh-bd{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:1px 7px;white-space:nowrap;letter-spacing:.02em;line-height:1.5}
  .rh-est{font-size:11.5px;color:var(--ink3,#8e8e8e);display:inline-flex;align-items:center;gap:6px}
  .rh-est:before{content:'';width:7px;height:7px;border-radius:50%;background:#3aa655;flex:none}
  .rh-est.pend:before{background:#e08a00} .rh-est.err{color:#b42318} .rh-est.err:before{background:#b42318}
  #aba-rh .rh-vazio{font-size:12.5px;color:var(--ink2,#5c5c5c)}
  #aba-rh .rh-vazio ol{margin:8px 0 0 18px;padding:0} #aba-rh .rh-vazio li{display:list-item;border:0;padding:2px 0;cursor:default}
  #aba-rh .rh-vazio li:hover{background:none}
  #aba-rh dl{margin:0;font-size:12px} #aba-rh dt{font-weight:700;margin-top:8px} #aba-rh dd{margin:2px 0 0;color:var(--ink2,#5c5c5c)}

  #rh-tela *,#rh-modal *{box-sizing:border-box}
  #rh-tela{position:fixed;inset:0;z-index:4000;background:#f3f4f5;color:var(--ink,#232323);display:flex;flex-direction:column;font-size:13px}
  html.tema-escuro #rh-tela{background:var(--bg)}
  #rh-tela .rt-top{display:flex;align-items:center;gap:10px;padding:10px 18px;flex-wrap:wrap;border-bottom:1px solid var(--line,#e8e8ea);background:var(--card,#fff)}
  #rh-tela .rt-top img{height:28px}
  #rh-tela .rt-top .tt{display:flex;flex-direction:column;line-height:1.1;margin-right:8px}
  #rh-tela .rt-top .tt b{font-size:16px} #rh-tela .rt-top .tt span{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3,#8e8e8e);font-weight:700}
  #rh-tela .rt-top .esp{flex:1}
  #rh-tela .sec,#rh-modal .sec{background:var(--card,#fff);color:var(--ink,#232323);border:1px solid var(--line,#e8e8ea)}
  #rh-tela .sec:hover:not(:disabled),#rh-modal .sec:hover:not(:disabled){background:var(--head,#f6f6f7);filter:none}
  #rh-tela .seg{flex:0 1 auto}
  #rh-tela .seg button{flex:0 0 auto;padding:6px 14px}
  #rh-tela .rt-corpo{flex:1;overflow:auto;padding:18px}
  #rh-tela .rt-in{max-width:1400px;margin:0 auto}
  #rh-tela .rt-fil{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
  #rh-tela .rt-fil .esp{flex:1}
  #rh-tela .rt-fil label{margin:0;display:flex;align-items:center;gap:6px}
  #rh-tela .rt-fil input[type=search]{width:240px}
  #rh-tela .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
  @media (min-width:1350px){#rh-tela .kpis{grid-template-columns:repeat(8,minmax(0,1fr))}}
  @media (max-width:700px){#rh-tela .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
  #rh-tela .kpis .rh-kp b{font-size:26px}
  #rh-tela .cd{background:var(--card,#fff);border:1px solid var(--line,#e8e8ea);border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.04);min-width:0}
  #rh-tela .cd>h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3,#8e8e8e);margin:0 0 4px;display:flex;align-items:center;gap:8px}
  #rh-tela .cd>h3 .esp{flex:1}
  #rh-tela .cd>p.sub{margin:0 0 12px;font-size:12px;color:var(--ink2,#5c5c5c)}
  #rh-tela .g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
  #rh-tela .g2>.cd{margin-bottom:0}
  #rh-tela .g2+.cd,#rh-tela .g2+.g2{margin-top:14px}
  @media (max-width:900px){#rh-tela .g2{grid-template-columns:1fr}}
  #rh-tela .tw{overflow:auto}
  #rh-tela table{width:100%;border-collapse:collapse;font-size:12.5px}
  #rh-tela th{text-align:left;padding:7px 8px;white-space:nowrap;position:sticky;top:0;z-index:1}
  #rh-tela td{padding:7px 8px;vertical-align:middle}
  #rh-tela td.n,#rh-tela th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  #rh-tela td.c,#rh-tela th.c{text-align:center}
  #rh-tela tr.clk{cursor:pointer} #rh-tela tr.clk:hover td{background:var(--head,#f6f6f7)}
  #rh-tela td .nm b{display:block;font-weight:600} #rh-tela td .nm small{display:block;color:var(--ink3,#8e8e8e);font-size:11px}
  #rh-tela .cod{display:inline-block;font-size:10.5px;font-weight:700;border:1px solid var(--line,#e8e8ea);background:var(--head,#f6f6f7);border-radius:5px;padding:0 6px;color:var(--ink,#232323)}
  #rh-tela .mut{color:var(--ink3,#8e8e8e)} #rh-tela .red{color:#b42318;font-weight:700}
  #rh-tela .chips{display:flex;gap:4px;flex-wrap:wrap}
  #rh-tela .acoes{display:flex;gap:4px;justify-content:flex-end;flex-wrap:nowrap}
  #rh-tela button.mini,#rh-modal button.mini{padding:3px 9px;font-size:11.5px;border-radius:6px}
  .rh-lg{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--ink2,#5c5c5c);margin:0 0 10px}
  .rh-lg span{display:inline-flex;align-items:center;gap:6px}
  .rh-lg i{width:12px;height:12px;border-radius:3px;display:inline-block}
  /* barra de criticidade */
  .rh-sb{display:flex;height:30px;gap:2px;border-radius:6px;overflow:hidden;margin:6px 0 12px}
  .rh-sb>div{min-width:3px;cursor:default}
  .rh-nl{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;font-size:12px}
  .rh-nl .q{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
  .rh-nl small{color:var(--ink3,#8e8e8e);display:block;font-size:11px;line-height:1.3}
  /* gráficos */
  .rh-ch svg{width:100%;height:auto;display:block;overflow:visible}
  .rh-ch text{font-family:Arial,Helvetica,sans-serif;font-size:11px;fill:var(--ink3,#8e8e8e)}
  .rh-ch .val{fill:var(--ink,#232323);font-weight:700}
  .rh-ch .hit{fill:transparent;cursor:default} .rh-ch .hit:hover{fill:rgba(0,0,0,.04)}
  /* mapa de calor */
  .rh-hm{display:grid;gap:2px;font-size:11px}
  .rh-hm .hd{font-weight:700;color:var(--ink3,#8e8e8e);text-align:center;font-size:10px;text-transform:uppercase;padding:2px 0}
  .rh-hm .ob{font-weight:700;padding:6px 8px 6px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rh-hm .ob small{display:block;font-weight:400;color:var(--ink3,#8e8e8e)}
  .rh-hm .cl{border-radius:4px;display:flex;align-items:center;justify-content:center;min-height:38px;font-weight:700;font-variant-numeric:tabular-nums}
  .rh-hm .cl.z{background:var(--line2,#f2f2f3);color:transparent}
  .rh-hm .cl.al{outline:2px solid #dc3c3d;outline-offset:-2px}
  /* cronograma */
  .rh-gt{position:relative;font-size:11.5px;min-width:900px}
  .rh-gt .gh{display:flex;position:sticky;top:0;background:var(--card,#fff);z-index:3;border-bottom:1px solid var(--line,#e8e8ea)}
  .rh-gt .gh .nmc{flex:0 0 230px}
  .rh-gt .gh .ms{flex:1;display:flex}
  .rh-gt .gh .ms div{flex:1;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink3,#8e8e8e);padding:6px 0;border-left:1px solid var(--line2,#f2f2f3)}
  .rh-gt .gh .ms div.cur{color:#C05621}
  .rh-gt .gg{display:flex;align-items:center;background:var(--head,#f6f6f7);border-bottom:1px solid var(--line,#e8e8ea);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  .rh-gt .gg .nmc{flex:0 0 230px;padding:6px 8px}
  .rh-gt .gg .ms{flex:1;display:flex}
  .rh-gt .gg .ms div{flex:1;text-align:center;font-size:10.5px;color:var(--ink2,#5c5c5c);border-left:1px solid var(--line,#e8e8ea)}
  .rh-gt .gg .ms div.al{color:#b42318}
  .rh-gt .gr{display:flex;align-items:stretch;border-bottom:1px solid var(--line2,#f2f2f3);min-height:34px}
  .rh-gt .gr:hover{background:rgba(192,86,33,.04)}
  .rh-gt .gr .nmc{flex:0 0 230px;padding:5px 8px;cursor:pointer;min-width:0}
  .rh-gt .gr .nmc b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rh-gt .gr .nmc small{display:block;color:var(--ink3,#8e8e8e);font-size:10.5px}
  .rh-gt .gr .tl{flex:1;position:relative;cursor:copy;background-image:linear-gradient(to right,var(--line2,#f2f2f3) 1px,transparent 1px);background-size:var(--mw) 100%}
  .rh-gt .cc{position:absolute;top:9px;bottom:9px;background:rgba(107,111,119,.10);border-radius:3px}
  .rh-gt .lm{position:absolute;top:4px;bottom:4px;width:2px;background:#dc3c3d;border-radius:1px}
  .rh-gt .lm:after{content:'';position:absolute;top:-3px;left:-3px;width:8px;height:8px;background:#dc3c3d;transform:rotate(45deg);border-radius:1px}
  .rh-gt .gz{position:absolute;top:7px;bottom:7px;border-radius:4px;font-size:10px;font-weight:700;display:flex;align-items:center;padding:0 5px;overflow:hidden;white-space:nowrap;cursor:pointer;border:1px solid;box-shadow:0 0 0 2px var(--card,#fff)}
  .rh-gt .hj{position:absolute;top:0;bottom:0;width:2px;background:#C05621;z-index:2;pointer-events:none}
  .rh-gt .hj span{position:absolute;top:2px;left:4px;font-size:10px;font-weight:700;color:#C05621;background:var(--card,#fff);padding:0 3px;border-radius:3px}
  /* ficha */
  .rh-per{border:1px solid var(--line,#e8e8ea);border-radius:10px;padding:12px;margin-top:10px}
  .rh-per .ph{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .rh-per .ph b{font-size:13px}
  .rh-per .nums{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:10px}
  .rh-per .nums div{background:var(--head,#f6f6f7);border-radius:8px;padding:6px 9px}
  .rh-per .nums small{display:block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8e8e8e)}
  .rh-per .nums b{font-variant-numeric:tabular-nums}
  .rh-tlp{position:relative;height:44px;margin:14px 0 4px}
  .rh-tlp .aq,.rh-tlp .co{position:absolute;top:14px;height:14px}
  .rh-tlp .aq{background:#d9dbe0;border-radius:4px 0 0 4px}
  .rh-tlp .co{background:#eef0f3;border-radius:0 4px 4px 0;border:1px dashed #c2c2c2}
  .rh-tlp .gz{position:absolute;top:11px;height:20px;border-radius:4px;border:1px solid}
  .rh-tlp .mk{position:absolute;top:6px;height:30px;width:2px}
  .rh-tlp .lb{position:absolute;top:32px;font-size:10px;color:var(--ink3,#8e8e8e);white-space:nowrap;transform:translateX(-50%)}
  .rh-tlp .lt{position:absolute;top:-2px;font-size:10px;font-weight:700;white-space:nowrap;transform:translateX(-50%)}
  .rh-msg{list-style:none;margin:8px 0 0;padding:0;font-size:12px}
  .rh-msg li{padding:6px 9px;border-radius:7px;margin-top:4px;display:flex;gap:7px}
  .rh-msg li.erro{background:#fdecec;color:#8f1c1c} .rh-msg li.alerta{background:#fff5dc;color:#7a5200} .rh-msg li.ok{background:#e7f6ea;color:#14602a}
  .rh-msg li:before{font-weight:700;flex:none}
  .rh-msg li.erro:before{content:'✕'} .rh-msg li.alerta:before{content:'!'} .rh-msg li.ok:before{content:'✓'}
  html.tema-escuro .rh-msg li.erro{background:#3a1717;color:#f3b4b4} html.tema-escuro .rh-msg li.alerta{background:#3a2f10;color:#f5d68a} html.tema-escuro .rh-msg li.ok{background:#15301c;color:#9fe0ad}
  /* janela */
  #rh-modal{position:fixed;inset:0;background:rgba(0,0,0,.34);display:flex;align-items:center;justify-content:center;z-index:5000;padding:14px}
  #rh-modal .mw{background:var(--card,#fff);color:var(--ink,#232323);border-radius:14px;width:640px;max-width:100%;max-height:92vh;overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:20px}
  #rh-modal .mw.lg{width:860px}
  #rh-modal h2{margin:0;font-size:17px} #rh-modal .mh{display:flex;align-items:flex-start;gap:10px;margin-bottom:6px}
  #rh-modal .mh .esp{flex:1} #rh-modal .x{background:none;border:0;color:var(--ink3,#8e8e8e);font-size:20px;padding:0 4px;line-height:1}
  #rh-modal .mh small{display:block;color:var(--ink3,#8e8e8e);font-size:12px;margin-top:2px}
  #rh-modal .f2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px} #rh-modal .f3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 12px}
  #rh-modal label{display:block} #rh-modal input:not([type=checkbox]),#rh-modal select,#rh-modal textarea{width:100%}
  #rh-modal textarea{font-family:inherit;font-size:12.5px;border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:8px 11px;min-height:70px;background:var(--card,#fff);color:var(--ink,#232323)}
  #rh-modal .rs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
  #rh-modal .rs div{background:var(--head,#f6f6f7);border-radius:8px;padding:7px 10px}
  #rh-modal .rs small{display:block;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3,#8e8e8e)}
  #rh-modal .rs b{font-variant-numeric:tabular-nums;font-size:13px}
  #rh-modal .qk{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  #rh-modal .mf{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
  #rh-modal .mf .esp{flex:1}
  #rh-modal .drop{border:2px dashed var(--line,#e8e8ea);border-radius:12px;padding:22px;text-align:center;color:var(--ink2,#5c5c5c);cursor:pointer}
  #rh-modal .drop.on{border-color:#C05621;background:rgba(192,86,33,.05)}
  @media (max-width:600px){#rh-modal .f2,#rh-modal .f3,#rh-modal .rs{grid-template-columns:1fr 1fr}}
  .rh-drop{border:2px dashed var(--line,#e8e8ea);border-radius:12px;padding:20px;text-align:center;color:var(--ink2,#5c5c5c);cursor:pointer;font-size:12.5px}
  .rh-drop b{display:block;font-size:14px;color:var(--ink,#232323);margin-bottom:4px}
  .rh-drop.on{border-color:#C05621;background:rgba(192,86,33,.05)}
  #rh-tip{position:fixed;z-index:6000;background:#1f1f1f;color:#fff;font-size:11.5px;line-height:1.45;padding:7px 10px;border-radius:8px;pointer-events:none;max-width:300px;white-space:pre-line;box-shadow:0 6px 18px rgba(0,0,0,.2);display:none}
  #rh-tip b{color:#fff}
  .rh-ajg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0 12px}
  .rh-ajg label{display:block}
  .rh-ajg input{width:100%}
  .rh-ler{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:12.5px;align-items:start}
  .rh-ler>b{white-space:nowrap}
  @media print{
    body.rh-imp>*:not(#rh-tela){display:none!important}
    body.rh-imp #rh-tela{position:static;background:#fff;display:block}
    body.rh-imp #rh-tela .rt-top .seg,body.rh-imp #rh-tela .rt-top button,body.rh-imp #rh-tela .rt-fil,body.rh-imp #rh-tela .acoes,body.rh-imp .rh-est{display:none!important}
    body.rh-imp #rh-tela .rt-corpo{overflow:visible;padding:0}
    body.rh-imp #rh-tela .cd{break-inside:avoid;box-shadow:none}
    body.rh-imp #rh-tela th{position:static}
  }`;
  document.head.appendChild(css);

  const tip = document.createElement('div'); tip.id = 'rh-tip'; document.body.appendChild(tip);
  document.addEventListener('mouseover', ev => {
    const el = ev.target.closest && ev.target.closest('[data-tip]');
    if(!el || !(el.closest('#rh-tela') || el.closest('#aba-rh') || el.closest('#rh-modal'))){ tip.style.display = 'none'; return; }
    tip.innerHTML = el.getAttribute('data-tip'); tip.style.display = 'block';
  });
  document.addEventListener('mousemove', ev => {
    if(tip.style.display !== 'block') return;
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if(x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if(y + hh > innerHeight - 8) y = ev.clientY - hh - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });

  // ---------- aba no painel lateral ----------
  const btn = document.createElement('button');
  btn.dataset.aba = 'rh'; btn.textContent = 'RH · Férias';
  ABAS.appendChild(btn);
  btn.addEventListener('click', () => trocarAba('rh'));
  const aba = document.createElement('div');
  aba.id = 'aba-rh'; aba.style.display = 'none';
  const ancora = document.getElementById('aba-diar') || document.getElementById('aba-cot');
  (ancora && ancora.parentNode ? ancora.parentNode : document.querySelector('aside')).appendChild(aba);

  function kpis(ref){
    const f = fila(ref), gz = vivos(D.gozos).filter(g => g.st !== 'canc' && pessoa(g.pid) && pessoa(g.pid).ativo !== false);
    const fora = gz.filter(g => situacao(g, ref) === 'gozo');
    const avisos = gz.filter(g => { const a = avisoStatus(g, ref); return a && a.k !== 'ok'; });
    const semProg = f.filter(x => x.saldo > 0 && !x.aberto && x.niv !== 'ok');
    const passivo = f.filter(x => !x.aberto).reduce((s, x) => s + x.custoSaldo + x.gs.filter(g => g.st !== 'sug' && situacao(g, ref) !== 'feito').reduce((t, g) => t + custoGozo(g), 0), 0);
    const diasConceder = f.filter(x => !x.aberto).reduce((s, x) => s + Math.max(0, x.rest - x.gs.filter(g => g.st !== 'sug' && situacao(g, ref) === 'feito').reduce((t, g) => t + (+g.dias || 0) + (+g.abono || 0), 0)), 0);
    const em90 = gz.filter(g => g.st !== 'sug' && g.ini >= ref && dif(ref, g.ini) <= 90);
    const semSal = pesAtivas().filter(p => !(+p.sal > 0)).length;
    return {
      f, fora, avisos, semProg, passivo, diasConceder, em90, semSal,
      venc: f.filter(x => x.niv === 'venc'), crit: f.filter(x => x.niv === 'crit'), alto: f.filter(x => x.niv === 'alto'),
      sug: gz.filter(g => g.st === 'sug'),
      custo90: em90.reduce((s, g) => s + custoGozo(g), 0),
      pessoas: pesAtivas().length
    };
  }
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : (p || s + 's'));

  function renderAba(){
    if(aba.style.display === 'none') return;
    const ref = hoje();
    if(!pesAtivas().length){
      aba.innerHTML = `<div class="card"><h2>Gestão de férias</h2><div class="rh-vazio">
        <p style="margin:0 0 6px">O módulo RH acompanha as férias de cada colaborador: quanto falta para o limite legal, quem precisa de aviso, quanto vai custar e se a obra fica desfalcada.</p>
        <b>Para começar:</b><ol><li>Peça à contabilidade o relatório <b>Programação de Férias</b> (PDF).</li><li>Clique em <b>Importar programação</b> e escolha o arquivo.</li><li>Se quiser ver custos, importe também a planilha com os salários.</li></ol></div>
        <div class="rh-bts"><button id="rh-a-imp">⤓ Importar programação (PDF)</button><button class="sec" id="rh-a-abr">Abrir painel</button></div>
        <div style="margin-top:10px"><span class="rh-est"></span></div></div>`;
      $('rh-a-imp').onclick = () => janelaImportar();
      $('rh-a-abr').onclick = () => abrirTela('ajustes');
      aviso(estado.t || 'Aguardando dados', estado.err);
      return;
    }
    const k = kpis(ref);
    const prox = [];
    k.venc.forEach(x => prox.push({o: 0, x, t: 'Férias vencidas: conceder já', d: x.lim ? 'limite era ' + brc(x.lim) : 'fim do concessivo ' + brc(x.fimConc), k: 'venc'}));
    k.avisos.forEach(g => { const a = avisoStatus(g, ref), p = pessoa(g.pid); prox.push({o: 1, g, p, t: 'Emitir aviso de férias', d: 'férias em ' + brc(g.ini) + ' · ' + (a.k === 'atras' ? 'fora do prazo' : 'até ' + brc(a.ate)), k: a.k === 'atras' ? 'venc' : 'crit'}); });
    k.crit.filter(x => x.saldo > 0).forEach(x => prox.push({o: 2, x, t: 'Programar férias', d: fmtN(x.saldo) + ' dias · limite ' + brc(x.lim), k: 'crit'}));
    k.alto.filter(x => x.saldo > 0).forEach(x => prox.push({o: 3, x, t: 'Programar férias', d: fmtN(x.saldo) + ' dias · limite ' + brc(x.lim), k: 'alto'}));
    const proxS = vivos(D.gozos).filter(g => g.st !== 'canc' && g.st !== 'sug' && pessoa(g.pid) && fimG(g) >= ref && dif(ref, g.ini) <= 60).sort((a, b) => a.ini.localeCompare(b.ini));
    aba.innerHTML = `
    <div class="card"><h2>Gestão de férias</h2>
      <div class="rh-k">
        <button class="rh-kp" data-go="painel"><small><i style="background:${NIV.venc.c}"></i>Vencidas</small><b>${k.venc.length}</b><span>${k.venc.length ? 'pagamento em dobro' : 'nenhuma em dobro'}</span></button>
        <button class="rh-kp" data-go="painel"><small><i style="background:${NIV.crit.c}"></i>Críticas</small><b>${k.crit.length}</b><span>até ${D.cfg.crit} dias do limite</span></button>
        <button class="rh-kp" data-go="programacao"><small>Avisos a emitir</small><b>${k.avisos.length}</b><span>${D.cfg.aviso} dias antes (art. 135)</span></button>
        <button class="rh-kp" data-go="cronograma"><small>De férias hoje</small><b>${k.fora.length}</b><span>${plural(k.pessoas, 'colaborador', 'colaboradores')} no plano</span></button>
      </div>
      <div class="rh-bts"><button id="rh-a-abr">▦ Abrir painel de férias</button><button class="sec" id="rh-a-prog">+ Programar</button><button class="sec" id="rh-a-imp">⤓ Importar</button></div>
      <div style="margin-top:10px"><span class="rh-est"></span></div>
    </div>
    <div class="card"><h2>Próximas ações</h2>
      ${prox.length ? '<ul>' + prox.sort((a, b) => a.o - b.o).slice(0, 7).map((a, i) => { const p = a.p || a.x.p; return `<li data-pid="${h(p.id)}"><div class="nm"><b>${h(titulo(p.nome))}</b><small>${h(a.t)} · ${h(obraDe(p) || 'sem obra')}</small></div><div class="dt">${badge(a.k)}<br>${h(a.d)}</div></li>`; }).join('') + '</ul>' + (prox.length > 7 ? `<div class="hint" style="margin-top:6px">+ ${prox.length - 7} no painel</div>` : '') : '<div class="hint">Nada urgente. Tudo dentro do prazo.</div>'}
    </div>
    <div class="card"><h2>De férias e próximas saídas (60 dias)</h2>
      ${proxS.length ? '<ul>' + proxS.slice(0, 8).map(g => { const p = pessoa(g.pid), s = situacao(g, ref); return `<li data-pid="${h(p.id)}"><div class="nm"><b>${h(titulo(p.nome))}</b><small>${h(funcaoDe(p).toLowerCase() || '—')} · ${h(obraDe(p) || 'sem obra')}</small></div><div class="dt">${sitBadge(s)}<br>${brc(g.ini)} a ${brc(fimG(g))}</div></li>`; }).join('') + '</ul>' : '<div class="hint">Ninguém de férias nos próximos 60 dias.</div>'}
    </div>
    <div class="card"><h2>Como funciona</h2>
      <dl><dt>Período aquisitivo</dt><dd>12 meses de trabalho que dão direito a 30 dias de férias.</dd>
      <dt>Período concessivo</dt><dd>Os 12 meses seguintes. A empresa precisa conceder as férias dentro deles; o que passar é pago em dobro.</dd>
      <dt>Limite para iniciar</dt><dd>Última data para começar e ainda terminar dentro do concessivo.</dd>
      <dt>Aviso de férias</dt><dd>Entregue com ${D.cfg.aviso} dias de antecedência, assinado pelo colaborador. O pagamento sai até 2 dias antes do início.</dd></dl>
    </div>`;
    $('rh-a-abr').onclick = () => abrirTela('painel');
    $('rh-a-prog').onclick = () => janelaProgramar({});
    $('rh-a-imp').onclick = () => janelaImportar();
    aba.querySelectorAll('[data-go]').forEach(b => b.onclick = () => abrirTela(b.dataset.go));
    aba.querySelectorAll('li[data-pid]').forEach(li => li.onclick = () => janelaFicha(li.dataset.pid));
    aviso(estado.t || 'Sincronizando…', estado.err);
  }

  // ---------- tela cheia ----------
  let tela = null, sub = lsGet(SUBK) || 'painel', filtro = {obra: '', busca: '', niv: '', sit: 'ativas'};
  const VIEWS = [['painel', 'Painel'], ['colaboradores', 'Colaboradores'], ['cronograma', 'Cronograma'], ['programacao', 'Programação'], ['ajustes', 'Importar e ajustes']];
  function abrirTela(v){
    if(v) sub = v;
    lsSet(SUBK, sub);
    if(!tela){
      tela = document.createElement('div'); tela.id = 'rh-tela';
      tela.innerHTML = `<div class="rt-top">
        <button class="sec" id="rt-volta">← Gestão 360º</button>
        <img src="logo-bkp.png" alt=""><div class="tt"><b>Gestão de Férias</b><span>RH · BKP Construtora</span></div>
        <div class="seg" id="rt-seg">${VIEWS.map(([k, t]) => `<button data-v="${k}">${t}</button>`).join('')}</div>
        <div class="esp"></div><span class="rh-est"></span>
        <button class="sec" id="rt-prog">+ Programar férias</button><button class="sec" id="rt-imp" title="Imprimir esta tela ou salvar em PDF">Imprimir</button>
      </div><div class="rt-corpo"><div class="rt-in" id="rt-in"></div></div>`;
      document.body.appendChild(tela);
      $('rt-volta').onclick = fecharTela;
      $('rt-prog').onclick = () => janelaProgramar({});
      $('rt-imp').onclick = () => { document.body.classList.add('rh-imp'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('rh-imp'), 300); }, 50); };
      tela.querySelectorAll('#rt-seg button').forEach(b => b.onclick = () => { sub = b.dataset.v; lsSet(SUBK, sub); renderTela(); });
      receber();
    }
    tela.style.display = 'flex';
    renderTela();
  }
  function fecharTela(){ if(tela) tela.style.display = 'none'; tip.style.display = 'none'; renderAba(); }
  document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && tela && tela.style.display !== 'none' && !$('rh-modal')) fecharTela(); });

  function renderTela(){
    if(!tela || tela.style.display === 'none') return;
    tela.querySelectorAll('#rt-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === sub));
    const el = $('rt-in'), ref = hoje();
    const sc = tela.querySelector('.rt-corpo').scrollTop;
    if(!pesAtivas().length && sub !== 'ajustes') sub = 'ajustes';
    ({painel: vPainel, colaboradores: vColab, cronograma: vCrono, programacao: vProg, ajustes: vAjustes})[sub](el, ref);
    tela.querySelector('.rt-corpo').scrollTop = sc;
    aviso(estado.t || '', estado.err);
  }
  const selObra = () => `<label>Obra <select id="rt-obra"><option value="">Todas</option>${locais().map(l => `<option value="${h(l.cod)}"${filtro.obra === l.cod ? ' selected' : ''}>${h(l.nome)}</option>`).join('')}<option value="-"${filtro.obra === '-' ? ' selected' : ''}>Sem alocação</option></select></label>`;
  const passaObra = p => !filtro.obra || (filtro.obra === '-' ? !obraDe(p) : obraDe(p) === filtro.obra);
  function ligarFiltroObra(){ const s = $('rt-obra'); if(s) s.onchange = () => { filtro.obra = s.value; renderTela(); }; }
  function ligarLinhas(el){
    el.querySelectorAll('[data-pid]').forEach(r => r.addEventListener('click', ev => { if(ev.target.closest('button')) return; janelaFicha(r.dataset.pid); }));
    el.querySelectorAll('[data-prog]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const [pid, per] = b.dataset.prog.split('|'); janelaProgramar({pid, per}); });
    el.querySelectorAll('[data-gz]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const g = D.gozos.find(x => x.id === b.dataset.gz); if(g) janelaProgramar(g); });
  }

  // ----- Painel -----
  function vPainel(el, ref){
    const k = kpis(ref), f = k.f.filter(x => passaObra(x.p));
    const fv = f.filter(x => x.niv === 'venc'), fc = f.filter(x => x.niv === 'crit');
    const pass = f.filter(x => !x.aberto).reduce((s, x) => s + x.custoSaldo + x.gs.filter(g => g.st !== 'sug' && situacao(g, ref) !== 'feito').reduce((t, g) => t + custoGozo(g), 0), 0);
    const gzF = vivos(D.gozos).filter(g => g.st !== 'canc' && pessoa(g.pid) && pessoa(g.pid).ativo !== false && passaObra(pessoa(g.pid)));
    const avis = gzF.filter(g => { const a = avisoStatus(g, ref); return a && a.k !== 'ok'; });
    const fora = gzF.filter(g => situacao(g, ref) === 'gozo');
    const semProg = f.filter(x => x.saldo > 0 && !x.aberto && x.niv !== 'ok');
    const dias = f.filter(x => !x.aberto).reduce((s, x) => s + x.saldo, 0);
    const pes = pesAtivas().filter(passaObra);
    const c90 = gzF.filter(g => g.st !== 'sug' && g.ini >= ref && dif(ref, g.ini) <= 90).reduce((s, g) => s + custoGozo(g), 0);
    const semSal = pes.filter(p => !(+p.sal > 0)).length;
    const imp = D.imp ? 'Programação da contabilidade de ' + br(D.imp.emissao) + (D.imp.base ? ' (data base ' + br(D.imp.base) + ')' : '') : 'Sem importação';
    el.innerHTML = `
      <div class="rt-fil">${selObra()}<span class="mut">Referência: <b>${br(ref)}</b> · ${h(imp)}</span><div class="esp"></div>
        <button class="sec" id="rt-sug">✨ Sugerir datas</button></div>
      <div class="kpis">
        ${kp('Vencidas', fv.length, fv.length ? 'pagamento em dobro (art. 137)' : 'nenhum período em dobro', NIV.venc.c, 'colaboradores', 'venc')}
        ${kp('Críticas', fc.length, 'até ' + D.cfg.crit + ' dias do limite', NIV.crit.c, 'colaboradores', 'crit')}
        ${kp('Avisos a emitir', avis.length, avis.length ? 'prazo de ' + D.cfg.aviso + ' dias chegando' : 'nenhum aviso pendente', '', 'programacao')}
        ${kp('Sem programação', semProg.length, 'períodos vencidos sem data', '', 'colaboradores')}
        ${kp('De férias hoje', fora.length, plural(pes.length, 'pessoa') + ' no plano', '', 'cronograma')}
        ${kp('Dias sem data', fmtN(dias), 'saldo adquirido ainda não programado', '', 'colaboradores')}
        ${kp('Passivo de férias', R$k(pass), semSal ? semSal + ' sem salário: valor parcial' : 'salário ÷ 30 × dias + 1/3', '', 'colaboradores')}
        ${kp('Custo em 90 dias', R$k(c90), 'férias programadas + 1/3', '', 'programacao')}
      </div>
      <div class="g2">
        <div class="cd"><h3>Situação dos períodos de férias</h3><p class="sub">Cada período aquisitivo com saldo, pelo tempo que falta para o limite legal.</p>${grafNiveis(f)}</div>
        <div class="cd"><h3>Limites de gozo nos próximos 12 meses</h3><p class="sub">Quantos períodos chegam ao limite em cada mês, e quantos já têm data.</p>${grafLimites(f, ref)}</div>
      </div>
      <div class="g2">
        <div class="cd"><h3>Cobertura das equipes <span class="esp"></span><span class="mut" style="text-transform:none;letter-spacing:0;font-weight:400">contorno vermelho = acima de ${D.cfg.maxAus}% da equipe</span></h3><p class="sub">Pessoas de férias por obra em cada mês (programadas e sugestões).</p>${mapaCalor(ref)}</div>
        <div class="cd"><h3>Custo das férias por mês</h3><p class="sub">Remuneração + 1/3 das férias programadas, no mês do pagamento.</p>${grafCusto(ref)}</div>
      </div>
      <div class="cd" style="margin-top:14px"><h3>Fila de prioridade <span class="esp"></span><button class="sec mini" data-go="colaboradores">Ver todos</button></h3>
        <p class="sub">Do prazo mais curto para o mais longo. Clique no nome para ver a ficha.</p>${tabFila(f.filter(x => x.niv !== 'ok').slice(0, 15), ref)}</div>`;
    ligarFiltroObra(); ligarLinhas(el);
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { if(b.dataset.niv) filtro.niv = b.dataset.niv; sub = b.dataset.go; renderTela(); });
    $('rt-sug').onclick = () => confirmarSugestao();
  }
  const kp = (t, v, s, cor, go, niv) => `<button class="rh-kp" data-go="${go}"${niv ? ` data-niv="${niv}"` : ''}><small>${cor ? `<i style="background:${cor}"></i>` : ''}${h(t)}</small><b>${v}</b><span>${h(s)}</span></button>`;

  function grafNiveis(f){
    const cont = ORDEM.map(k => ({k, l: f.filter(x => x.niv === k)})).filter(x => x.l.length);
    const tot = f.length || 1;
    if(!f.length) return '<div class="mut">Sem períodos.</div>';
    return `<div class="rh-sb" role="img" aria-label="Situação dos períodos">${cont.map(x => `<div style="flex:${x.l.length};background:${NIV[x.k].c}" data-tip="<b>${NIV[x.k].t}: ${x.l.length}</b>\n${h(x.l.slice(0, 8).map(y => titulo(y.p.nome)).join('\n'))}${x.l.length > 8 ? '\n…' : ''}"></div>`).join('')}</div>
      <div class="rh-nl">${ORDEM.map(k => { const n = f.filter(x => x.niv === k).length; return `<span class="rh-bd" style="background:${NIV[k].c};color:${NIV[k].tx};justify-self:start">${NIV[k].t}</span><div><small>${h(nivDesc(k))}</small></div><div class="q">${n}<span class="mut" style="font-weight:400"> · ${fmtN(n / tot * 100, 0)}%</span></div>`; }).join('')}</div>`;
  }
  function meses(ref, n, desde){
    const l = []; let m = ref.slice(0, 8) + '01'; if(desde) m = addM(m, desde);
    for(let i = 0; i < n; i++){ l.push({ini: m, fim: addD(addM(m, 1), -1)}); m = addM(m, 1); }
    return l;
  }
  function barras(cols, series, opt){
    // cols: [{rot, v:[...]}], series: [{nome, cor}]
    const W = 640, H = 230, L = opt.esq || 34, B = 26, T = 18, cw = (W - L - 4) / cols.length, bw = Math.min(30, cw * 0.62);
    const max = Math.max(opt.fmt ? 1000 : 1, ...cols.map(c => c.v.reduce((s, x) => s + x, 0)));
    const nice = opt.fmt ? (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p; })() : Math.max(4, Math.ceil(max / 2) * 2);
    const y = v => T + (H - T - B) * (1 - v / nice);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${h(opt.rot || '')}">`;
    [0, .5, 1].forEach(f => { const v = nice * f; s += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${f ? '#e7e7e7' : '#c2c2c2'}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${opt.fmt ? opt.fmt(v) : v}</text>`; });
    cols.forEach((c, i) => {
      const x = L + cw * i + (cw - bw) / 2; let acc = 0;
      const segs = c.v.map((v, j) => ({v, j})).filter(z => z.v > 0);
      segs.forEach((z, n) => {
        const y0 = y(acc), y1 = y(acc + z.v), top = n === segs.length - 1, hgt = Math.max(1, y0 - y1 - (n ? 2 : 0));
        const yy = y1 + (n ? 0 : 0);
        s += top ? `<path d="M${x},${yy + hgt} V${yy + 4} Q${x},${yy} ${x + 4},${yy} H${x + bw - 4} Q${x + bw},${yy} ${x + bw},${yy + 4} V${yy + hgt} Z" fill="${series[z.j].cor}"${series[z.j].borda ? ` stroke="${series[z.j].borda}" stroke-dasharray="3 2"` : ''}/>`
          : `<rect x="${x}" y="${yy}" width="${bw}" height="${hgt}" fill="${series[z.j].cor}"${series[z.j].borda ? ` stroke="${series[z.j].borda}" stroke-dasharray="3 2"` : ''}/>`;
        acc += z.v;
      });
      const tot = c.v.reduce((a, b) => a + b, 0);
      if(tot > 0 && opt.rotulo !== false) s += `<text class="val" x="${x + bw / 2}" y="${y(tot) - 5}" text-anchor="middle">${opt.fmtV ? opt.fmtV(tot) : tot}</text>`;
      s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle"${c.cur ? ' style="fill:#C05621;font-weight:700"' : ''}>${h(c.rot)}</text>`;
      s += `<rect class="hit" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B}" data-tip="${h(c.tip || '')}"/>`;
    });
    return `<div class="rh-lg">${series.map(z => `<span><i style="background:${z.cor};${z.borda ? 'border:1px dashed ' + z.borda : ''}"></i>${h(z.nome)}</span>`).join('')}</div><div class="rh-ch">${s}</svg></div>`;
  }
  function grafLimites(f, ref){
    const ms = meses(ref, 12), venc = f.filter(x => x.niv === 'venc' || (x.lim && x.lim < ms[0].ini)), vp = venc.filter(x => x.saldo <= 0);
    const cols = [{rot: 'Atraso', v: [vp.length, venc.length - vp.length], tip: `<b>Prazo legal estourado: ${venc.length}</b>\n${venc.map(x => titulo(x.p.nome) + (x.saldo <= 0 ? ' (já tem data)' : ' (sem data)')).join('\n')}`}];
    ms.forEach((m, i) => {
      const sem = f.filter(x => x.niv !== 'venc' && x.lim >= m.ini && x.lim <= m.fim);
      // períodos já programados: pelo limite que teriam (fim do concessivo − saldo do período + 1)
      const comp = f.filter(x => x.niv === 'ok' && x.rest > 0).filter(x => { const l = addD(x.fimConc, -x.rest + 1); return l >= m.ini && l <= m.fim; });
      cols.push({rot: mesTxt(m.ini), cur: i === 0, v: [comp.length, sem.length],
        tip: `<b>${MESL[+m.ini.slice(5, 7) - 1]} de ${m.ini.slice(0, 4)}</b>\nCom data: ${comp.length}${comp.length ? ' (' + comp.map(x => titulo(x.p.nome.split(' ')[0])).join(', ') + ')' : ''}\nSem programação: ${sem.length}${sem.length ? '\n' + sem.map(x => '• ' + titulo(x.p.nome) + ' – ' + brc(x.lim)).join('\n') : ''}`});
    });
    return barras(cols, [{nome: 'Já programado', cor: '#0aac23'}, {nome: 'Sem programação', cor: '#C05621'}], {rot: 'Limites por mês'});
  }
  function grafCusto(ref){
    const ms = meses(ref, 12), gz = vivos(D.gozos).filter(g => g.st !== 'canc' && pessoa(g.pid) && pessoa(g.pid).ativo !== false && passaObra(pessoa(g.pid)));
    const cols = ms.map((m, i) => {
      const pag = g => addD(g.ini, -2);
      const conf = gz.filter(g => g.st !== 'sug' && pag(g) >= m.ini && pag(g) <= m.fim), sug = gz.filter(g => g.st === 'sug' && pag(g) >= m.ini && pag(g) <= m.fim);
      const vc = conf.reduce((s, g) => s + custoGozo(g), 0), vs = sug.reduce((s, g) => s + custoGozo(g), 0);
      return {rot: mesTxt(m.ini), cur: i === 0, v: [vc, vs], tip: `<b>${MESL[+m.ini.slice(5, 7) - 1]} de ${m.ini.slice(0, 4)}</b>\nProgramadas: ${R$(vc)} (${conf.length})\nSugestões: ${R$(vs)} (${sug.length})${conf.concat(sug).length ? '\n' + conf.concat(sug).map(g => '• ' + titulo(pessoa(g.pid).nome.split(' ').slice(0, 2).join(' ')) + ' – ' + R$(custoGozo(g))).join('\n') : ''}`};
    });
    const semSal = pesAtivas().filter(p => !(+p.sal > 0)).length;
    if(!cols.some(c => c.v[0] + c.v[1] > 0)) return '<div class="mut" style="padding:30px 0;text-align:center">Nenhuma férias programada nos próximos 12 meses.<br>Use <b>✨ Sugerir datas</b> para montar uma proposta.</div>';
    return barras(cols, [{nome: 'Programadas', cor: '#C05621'}, {nome: 'Sugestões', cor: '#f3d2bd', borda: '#C05621'}], {rot: 'Custo por mês', esq: 50, fmt: v => v >= 1000 ? fmtN(v / 1000, 0) + ' mil' : fmtN(v, 0), fmtV: v => fmtN(v / 1000, 1) + ' mil'})
      + (semSal ? `<div class="hint" style="margin-top:6px">${semSal} colaborador(es) sem salário cadastrado ficam fora do custo. Importe os salários em <b>Importar e ajustes</b>.</div>` : '');
  }
  function mapaCalor(ref){
    const ms = meses(ref, 12), obras = locais().map(l => l.cod).filter(o => !filtro.obra || filtro.obra === o);
    const gz = vivos(D.gozos).filter(g => g.st !== 'canc' && pessoa(g.pid) && pessoa(g.pid).ativo !== false);
    if(!filtro.obra || filtro.obra === '-') obras.push('');
    const linhas = obras.map(o => {
      const tam = o ? equipe(o) : pesAtivas().filter(p => !obraDe(p)).length;
      const cel = ms.map(m => {
        const ps = []; gz.forEach(g => { const p = pessoa(g.pid); if(obraDe(p) !== o) return; if(g.ini <= m.fim && fimG(g) >= m.ini && !ps.some(x => x.p === p)) ps.push({p, g}); });
        // pico de pessoas fora ao mesmo tempo no mês
        let pico = 0; for(let d = m.ini; d <= m.fim; d = addD(d, 1)){ const n = gz.filter(g => obraDe(pessoa(g.pid)) === o && g.ini <= d && fimG(g) >= d).length; if(n > pico) pico = n; }
        return {ps, pico, pct: tam ? pico / tam * 100 : 0};
      });
      return {o, tam, cel};
    }).filter(l => l.tam || l.cel.some(c => c.ps.length));
    if(!linhas.length) return '<div class="mut">Sem dados.</div>';
    const cor = c => { if(!c.ps.length) return ''; const t = Math.min(1, c.pct / Math.max(D.cfg.maxAus * 1.5, 1)); const st = ['#cce3fd', '#9dc8f7', '#6aabf1', '#338ced', '#2370cd', '#1757ac']; return st[Math.min(st.length - 1, Math.floor(t * (st.length - 1) + 0.0001))]; };
    return `<div class="tw"><div class="rh-hm" style="grid-template-columns:110px repeat(${ms.length},minmax(34px,1fr))"><div></div>${ms.map((m, i) => `<div class="hd"${i === 0 ? ' style="color:#C05621"' : ''}>${mesTxt(m.ini)}</div>`).join('')}
      ${linhas.map(l => `<div class="ob">${h(l.o || 'Sem alocação')}<small>${l.tam} pessoa(s)</small></div>${l.cel.map((c, i) => { const bg = cor(c), escuro = bg && ['#338ced', '#2370cd', '#1757ac', '#6aabf1'].includes(bg);
        return `<div class="cl${c.ps.length ? '' : ' z'}${l.o && c.ps.length && c.pct > D.cfg.maxAus && c.pico > 1 ? ' al' : ''}" style="${bg ? 'background:' + bg + ';color:' + (escuro ? '#fff' : '#0b0b0b') : ''}" data-tip="<b>${h(l.o || 'Sem alocação')} · ${mesTxt(ms[i].ini)}</b>\n${c.ps.length ? 'Pico: ' + c.pico + ' de ' + l.tam + ' fora ao mesmo tempo (' + fmtN(c.pct, 0) + '%)\n' + c.ps.map(x => '• ' + h(titulo(x.p.nome)) + ' – ' + brc(x.g.ini) + ' a ' + brc(fimG(x.g)) + (x.g.st === 'sug' ? ' (sugestão)' : '')).join('\n') : 'Ninguém de férias'}">${c.ps.length || '·'}</div>`; }).join('')}`).join('')}
    </div></div>
    <div class="rh-lg" style="margin-top:10px"><span>Menos</span>${['#cce3fd', '#9dc8f7', '#6aabf1', '#338ced', '#2370cd', '#1757ac'].map(c => `<i style="background:${c}"></i>`).join('')}<span>Mais da equipe fora</span><span style="margin-left:auto">Número = pessoas de férias no mês</span></div>`;
  }
  function chipsGozos(p, per){
    const ref = hoje();
    const gs = gozosDe(p.id).filter(g => !per || g.per === per.ini).sort((a, b) => a.ini.localeCompare(b.ini));
    return gs.length ? '<div class="chips">' + gs.map(g => { const s = situacao(g, ref); return `<button class="mini sec" data-gz="${h(g.id)}" title="${SIT[s].t} – clique para editar" style="border:1px ${SIT[s].dash ? 'dashed' : 'solid'} ${SIT[s].b};background:${SIT[s].c};color:${SIT[s].tx}">${brc(g.ini)} · ${g.dias}d${+g.abono ? ' +' + g.abono + 'ab' : ''}</button>`; }).join('') + '</div>' : '<span class="mut">—</span>';
  }
  function tabFila(l, ref){
    if(!l.length) return '<div class="mut">Nenhum período pendente.</div>';
    return `<div class="tw"><table><thead><tr><th class="n">#</th><th>Colaborador</th><th>Obra</th><th>Período aquisitivo</th><th class="n">Saldo</th><th>Limite p/ iniciar</th><th class="n">Dias</th><th>Nível</th><th>Programação</th><th class="n">Custo (sal. + 1/3)</th><th></th></tr></thead><tbody>
      ${l.map((x, i) => `<tr class="clk" data-pid="${h(x.p.id)}"><td class="n mut">${i + 1}</td>
        <td><div class="nm"><b>${h(titulo(x.p.nome))}</b><small>${h(funcaoDe(x.p).toLowerCase() || 'função não informada')}${x.p.cod ? ' · cód. ' + h(x.p.cod) : ''}</small></div></td>
        <td>${obraDe(x.p) ? `<span class="cod">${h(obraDe(x.p))}</span>` : '<span class="mut">—</span>'}</td>
        <td class="n" style="text-align:left">${brc(x.per.ini)} a ${brc(x.per.fim)}</td>
        <td class="n">${fmtN(x.saldo)}${x.progConf ? `<div class="mut" style="font-size:10.5px">${fmtN(x.progConf)} prog.</div>` : ''}</td>
        <td class="n" style="text-align:left">${x.lim ? br(x.lim) : '—'}</td>
        <td class="n${x.dias != null && x.dias < 0 ? ' red' : ''}">${x.dias == null ? '—' : fmtN(x.dias, 0)}</td>
        <td>${badge(x.niv)}${x.perdeDireito ? ' <span class="rh-bd" style="background:#1f1f1f;color:#fff" title="Afastamento acima de 6 meses">afast.</span>' : ''}</td>
        <td>${chipsGozos(x.p, x.per)}</td>
        <td class="n">${x.p.sal ? R$(x.custoSaldo) : '<span class="mut">sem salário</span>'}</td>
        <td><div class="acoes">${x.saldo > 0 && !x.aberto ? `<button class="mini" data-prog="${h(x.p.id)}|${h(x.per.ini)}">Programar</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div>`;
  }

  // ----- Colaboradores -----
  function vColab(el, ref){
    const q = norm(filtro.busca);
    let ps = pesAtivas().filter(passaObra).filter(p => !q || norm(p.nome).includes(q) || norm(funcaoDe(p)).includes(q) || String(p.cod) === filtro.busca.trim());
    let rows = ps.map(p => ({p, x: principal(p, ref)}));
    if(filtro.niv) rows = rows.filter(r => r.x && r.x.niv === filtro.niv);
    rows.sort((a, b) => !a.x ? 1 : !b.x ? -1 : ORDEM.indexOf(a.x.niv) - ORDEM.indexOf(b.x.niv) || (a.x.lim || a.x.fimConc).localeCompare(b.x.lim || b.x.fimConc));
    const inativos = vivos(D.pes).filter(p => p.ativo === false);
    const semDados = colaboradores().filter(c => !Array.from(ligar().values()).some(v => v.id === c.id));
    el.innerHTML = `<div class="rt-fil"><input type="search" id="rt-q" placeholder="Buscar nome, função ou código" value="${h(filtro.busca)}">${selObra()}
      <label>Nível <select id="rt-niv"><option value="">Todos</option>${ORDEM.map(k => `<option value="${k}"${filtro.niv === k ? ' selected' : ''}>${NIV[k].t}</option>`).join('')}</select></label>
      <div class="esp"></div><span class="mut">${plural(rows.length, 'colaborador', 'colaboradores')}</span><button class="sec" id="rt-csv">Baixar planilha (CSV)</button></div>
      <div class="cd"><div class="tw"><table><thead><tr><th>Colaborador</th><th>Obra</th><th>Admissão</th><th class="n">Tempo de casa</th><th>Período mais urgente</th><th class="n">Saldo</th><th>Limite</th><th class="n">Dias</th><th>Nível</th><th>Programação</th><th class="n">Salário</th><th></th></tr></thead><tbody>
      ${rows.map(({p, x}) => { const tc = p.adm ? dif(p.adm, ref) : null; const outros = (p.per || []).filter(y => (+y.rest || 0) > 0).length;
        return `<tr class="clk" data-pid="${h(p.id)}"><td><div class="nm"><b>${h(titulo(p.nome))}</b><small>${h(funcaoDe(p).toLowerCase() || 'função não informada')}${p.cod ? ' · cód. ' + h(p.cod) : ''}${colabDe(p) ? '' : ' · <span style="color:#b26a00">não ligado à aba Colaboradores</span>'}</small></div></td>
        <td>${obraDe(p) ? `<span class="cod">${h(obraDe(p))}</span>` : '<span class="mut">—</span>'}</td>
        <td class="n" style="text-align:left">${brc(p.adm)}</td>
        <td class="n">${tc == null ? '—' : tc >= 365 ? fmtN(tc / 365, 1) + ' anos' : Math.max(1, Math.round(tc / 30)) + (Math.round(tc / 30) > 1 ? ' meses' : ' mês')}</td>
        <td class="n" style="text-align:left">${x ? brc(x.per.ini) + ' a ' + brc(x.per.fim) : '—'}${outros > 1 ? `<div class="mut" style="font-size:10.5px">${outros} períodos com saldo</div>` : ''}</td>
        <td class="n">${x ? fmtN(x.saldo) : '—'}</td><td class="n" style="text-align:left">${x && x.lim ? br(x.lim) : '—'}</td>
        <td class="n${x && x.dias < 0 ? ' red' : ''}">${x && x.dias != null ? fmtN(x.dias, 0) : '—'}</td>
        <td>${x ? badge(x.niv) : '—'}</td><td>${chipsGozos(p)}</td>
        <td class="n">${p.sal ? R$(p.sal) : '<span class="mut">—</span>'}</td>
        <td><div class="acoes">${x && x.saldo > 0 && !x.aberto ? `<button class="mini" data-prog="${h(p.id)}|${h(x.per.ini)}">Programar</button>` : `<button class="mini sec" data-prog="${h(p.id)}|">Programar</button>`}</div></td></tr>`; }).join('')}
      </tbody></table></div></div>
      ${semDados.length ? `<div class="cd"><h3>Na aba Colaboradores, sem dados de férias (${semDados.length})</h3><p class="sub">Não aparecem na programação da contabilidade (sem registro em carteira, admissão recente ou nome diferente). Se for nome diferente, ligue pela ficha da pessoa.</p><div class="chips">${semDados.map(c => `<span class="cod" style="font-weight:600">${h(titulo(c.nome))} · ${h(cod(c.obra))}</span>`).join('')}</div></div>` : ''}
      ${inativos.length ? `<div class="cd"><h3>Fora da última programação (${inativos.length})</h3><p class="sub">Estavam numa importação anterior e não vieram na última (desligados). Ficam guardados só para histórico.</p><div class="chips">${inativos.map(p => `<span class="cod" style="font-weight:600">${h(titulo(p.nome))}</span>`).join('')}</div></div>` : ''}`;
    const qi = $('rt-q'); qi.oninput = () => { filtro.busca = qi.value; const pos = qi.selectionStart; renderTela(); const n = $('rt-q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('rt-niv').onchange = e => { filtro.niv = e.target.value; renderTela(); };
    $('rt-csv').onclick = () => csvColab(rows, ref);
    ligarFiltroObra(); ligarLinhas(el);
  }

  // ----- Cronograma -----
  let cronoIni = 0;
  function vCrono(el, ref){
    const NM = 15, ms = meses(ref, NM, -2 + cronoIni), t0 = ms[0].ini, t1 = ms[NM - 1].fim, tot = dif(t0, t1) + 1;
    const X = d => Math.max(0, Math.min(100, dif(t0, d) / tot * 100));
    const gr = {};
    pesAtivas().filter(passaObra).forEach(p => { const o = obraDe(p) || '~'; (gr[o] = gr[o] || []).push(p); });
    const ordemO = Object.keys(gr).sort((a, b) => a === 'ADM' ? -1 : b === 'ADM' ? 1 : a === '~' ? 1 : b === '~' ? -1 : a.localeCompare(b));
    const gzAll = vivos(D.gozos).filter(g => g.st !== 'canc');
    el.innerHTML = `<div class="rt-fil">${selObra()}<button class="sec mini" id="rt-ant">◀ 3 meses</button><button class="sec mini" id="rt-hoje">Hoje</button><button class="sec mini" id="rt-prx">3 meses ▶</button>
      <div class="esp"></div><button class="sec" id="rt-sug">✨ Sugerir datas</button></div>
      <div class="cd"><div class="rh-lg">${['sug', 'prog', 'aviso', 'gozo', 'feito'].map(k => `<span><i style="background:${SIT[k].c};border:1px ${SIT[k].dash ? 'dashed' : 'solid'} ${SIT[k].b}"></i>${SIT[k].t}</span>`).join('')}
        <span><i style="background:rgba(107,111,119,.18)"></i>Período concessivo (prazo para gozar)</span><span><i style="background:#dc3c3d;width:3px"></i>Limite para iniciar</span><span style="margin-left:auto" class="mut">Clique na linha para programar naquela data · clique na barra para editar</span></div>
      <div class="tw"><div class="rh-gt" style="--mw:${100 / NM}%">
        <div class="gh"><div class="nmc"></div><div class="ms">${ms.map(m => `<div class="${m.ini.slice(0, 7) === ref.slice(0, 7) ? 'cur' : ''}">${mesTxt(m.ini)}</div>`).join('')}</div></div>
        ${ordemO.map(o => {
          const ps = gr[o].sort((a, b) => a.nome.localeCompare(b.nome)), tam = o === '~' ? ps.length : Math.max(equipe(o), ps.length);
          const cont = ms.map(m => { let pico = 0; for(let d = m.ini; d <= m.fim; d = addD(d, 3)){ const n = gzAll.filter(g => { const p = pessoa(g.pid); return p && ps.includes(p) && g.ini <= d && fimG(g) >= d; }).length; if(n > pico) pico = n; } return pico; });
          return `<div class="gg"><div class="nmc" title="${h(o === '~' ? 'Sem alocação' : nomeLocal(o))}">${h(o === '~' ? 'Sem alocação' : o === 'ADM' ? 'Sede (ADM)' : o)} · ${tam} pessoas</div><div class="ms">${cont.map(n => `<div class="${n && n / tam * 100 > D.cfg.maxAus && n > 1 ? 'al' : ''}" title="Pico de pessoas fora no mês">${n || ''}</div>`).join('')}</div></div>` +
          ps.map(p => {
            const pers = (p.per || []).filter(y => (+y.rest || 0) > 0).map(y => calcPer(p, y, ref));
            let tl = '';
            pers.forEach(c => { if(c.iniConc <= t1 && c.fimConc >= t0) tl += `<div class="cc" style="left:${X(c.iniConc)}%;width:${X(c.fimConc) - X(c.iniConc)}%" data-tip="<b>Período concessivo</b>\nAquisitivo ${br(c.per.ini)} a ${br(c.per.fim)}\nPrazo para gozar: ${br(c.iniConc)} a ${br(c.fimConc)}\nSaldo a programar: ${fmtN(c.saldo)} dias"></div>`;
              if(c.lim && c.lim >= t0 && c.lim <= t1 && c.niv !== 'ok') tl += `<div class="lm" style="left:${X(c.lim)}%" data-tip="<b>Limite para iniciar: ${br(c.lim)}</b>\n${NIV[c.niv].t}${c.dias != null ? ' · ' + (c.dias < 0 ? Math.abs(c.dias) + ' dias atrasado' : c.dias + ' dias') : ''}"></div>`; });
            gozosDe(p.id).forEach(g => { const f = fimG(g); if(g.ini > t1 || f < t0) return; const s = situacao(g, ref), l = X(g.ini), w = Math.max(0.6, X(addD(f, 1)) - l);
              tl += `<div class="gz" data-gz="${h(g.id)}" style="left:${l}%;width:${w}%;background:${SIT[s].c};color:${SIT[s].tx};border-color:${SIT[s].b};border-style:${SIT[s].dash ? 'dashed' : 'solid'}" data-tip="<b>${h(titulo(p.nome))}</b>\n${SIT[s].t}: ${br(g.ini)} a ${br(f)} (${g.dias} dias${+g.abono ? ' + ' + g.abono + ' de abono' : ''})\nRetorno: ${br(addD(f, 1))}">${g.dias}d</div>`; });
            const pr = principal(p, ref);
            return `<div class="gr"><div class="nmc" data-pid="${h(p.id)}"><b>${h(titulo(p.nome))}</b><small>${h(funcaoDe(p).toLowerCase() || '—')} ${pr ? '· ' + NIV[pr.niv].t.toLowerCase() : ''}</small></div><div class="tl" data-p="${h(p.id)}">${tl}</div></div>`;
          }).join('');
        }).join('')}
        ${ref >= t0 && ref <= t1 ? `<div class="hj" style="left:calc(230px + (100% - 230px) * ${X(ref) / 100})"><span>hoje</span></div>` : ''}
      </div></div></div>`;
    ligarFiltroObra();
    $('rt-ant').onclick = () => { cronoIni -= 3; renderTela(); };
    $('rt-prx').onclick = () => { cronoIni += 3; renderTela(); };
    $('rt-hoje').onclick = () => { cronoIni = 0; renderTela(); };
    $('rt-sug').onclick = () => confirmarSugestao();
    el.querySelectorAll('.gr .nmc').forEach(n => n.onclick = () => janelaFicha(n.dataset.pid));
    el.querySelectorAll('.gz[data-gz]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const g = D.gozos.find(x => x.id === b.dataset.gz); if(g) janelaProgramar(g); });
    el.querySelectorAll('.tl[data-p]').forEach(t => t.onclick = ev => {
      if(ev.target.closest('.gz')) return;
      const r = t.getBoundingClientRect(), d = addD(t0, Math.round((ev.clientX - r.left) / r.width * tot));
      const p = pessoa(t.dataset.p), pr = principal(p, ref);
      janelaProgramar({pid: p.id, per: pr && pr.saldo > 0 ? pr.per.ini : '', ini: proxSegunda(d)});
    });
  }

  // ----- Programação -----
  function vProg(el, ref){
    const todos = vivos(D.gozos).filter(g => pessoa(g.pid) && passaObra(pessoa(g.pid)));
    const grupos = {ativas: g => ['sug', 'prog', 'aviso', 'gozo'].includes(situacao(g, ref)), sug: g => g.st === 'sug', prog: g => situacao(g, ref) === 'prog', aviso: g => situacao(g, ref) === 'aviso', gozo: g => situacao(g, ref) === 'gozo', feito: g => situacao(g, ref) === 'feito', canc: g => g.st === 'canc', todas: () => true};
    const nomes = {ativas: 'Em aberto', sug: 'Sugestões', prog: 'Programadas', aviso: 'Aviso emitido', gozo: 'Em férias', feito: 'Gozadas', canc: 'Canceladas', todas: 'Todas'};
    const l = todos.filter(grupos[filtro.sit] || grupos.ativas).sort((a, b) => a.ini.localeCompare(b.ini));
    const nsug = todos.filter(g => g.st === 'sug').length;
    el.innerHTML = `<div class="rt-fil"><div class="seg" id="rt-sit">${Object.keys(nomes).map(k => `<button data-s="${k}" class="${filtro.sit === k ? 'on' : ''}">${nomes[k]} <span class="mut">${todos.filter(grupos[k]).length}</span></button>`).join('')}</div>${selObra()}<div class="esp"></div>
      <button class="sec" id="rt-sug">✨ Sugerir datas</button>${nsug ? `<button id="rt-ace">Aceitar ${nsug} sugest${nsug > 1 ? 'ões' : 'ão'}</button><button class="sec" id="rt-des">Descartar sugestões</button>` : ''}<button class="sec" id="rt-csv">CSV</button></div>
      ${nsug ? `<div class="cd" style="border-color:#C05621;background:rgba(192,86,33,.04)"><b>${nsug} sugestão(ões) de datas.</b> <span class="mut">A ferramenta escolheu segundas-feiras com o aviso de ${D.cfg.aviso} dias garantido, antes do limite legal e evitando desfalcar a mesma obra. Revise, ajuste e aceite: só as aceitas contam como programadas.</span></div>` : ''}
      <div class="cd"><div class="tw"><table><thead><tr><th>Colaborador</th><th>Obra</th><th>Ref. (aquisitivo)</th><th>Início</th><th>Fim</th><th>Retorno</th><th class="n">Dias</th><th class="n">Abono</th><th>Aviso</th><th>Pagamento até</th><th>Situação</th><th class="n">Custo</th><th></th></tr></thead><tbody>
      ${l.length ? l.map(g => { const p = pessoa(g.pid), s = situacao(g, ref), a = avisoStatus(g, ref), v = validar(g, ref).filter(m => m.k === 'erro');
        return `<tr class="clk" data-pid="${h(p.id)}"><td><div class="nm"><b>${h(titulo(p.nome))}</b><small>${h(funcaoDe(p).toLowerCase() || '—')}${g.obs ? ' · ' + h(g.obs) : ''}</small></div></td>
          <td>${obraDe(p) ? `<span class="cod">${h(obraDe(p))}</span>` : '—'}</td><td class="n" style="text-align:left">${brc(g.per)}</td>
          <td class="n" style="text-align:left"><b>${br(g.ini)}</b><div class="mut" style="font-size:10.5px">${SEM[P(g.ini).getDay()]}</div></td><td class="n" style="text-align:left">${br(fimG(g))}</td><td class="n" style="text-align:left">${br(addD(fimG(g), 1))}</td>
          <td class="n">${g.dias}</td><td class="n">${+g.abono || '—'}</td>
          <td>${s === 'aviso' || g.avisoEm ? `<span class="mut">emitido ${brc(g.avisoEm)}</span>` : a ? `<span style="color:${a.k === 'ok' ? 'inherit' : '#b42318'};font-weight:${a.k === 'ok' ? 400 : 700}">${h(a.t)}</span>` : s === 'sug' ? `<span class="mut">até ${brc(addD(g.ini, -D.cfg.aviso))}</span>` : '—'}</td>
          <td class="n" style="text-align:left">${brc(addD(g.ini, -2))}</td>
          <td>${sitBadge(s)}${v.length ? ` <span class="rh-bd" style="background:#fdecec;color:#8f1c1c" data-tip="${h(v.map(m => m.t).join('\n'))}">${v.length} problema${v.length > 1 ? 's' : ''}</span>` : ''}</td>
          <td class="n">${p.sal ? R$(custoGozo(g)) : '—'}</td>
          <td><div class="acoes">${s === 'sug' ? `<button class="mini" data-ace="${h(g.id)}">Aceitar</button>` : ''}${s === 'prog' || s === 'aviso' ? `<button class="mini${s === 'prog' && a && a.k !== 'ok' ? '' : ' sec'}" data-av="${h(g.id)}">${s === 'aviso' ? 'Reimprimir aviso' : 'Emitir aviso'}</button>` : ''}<button class="mini sec" data-gz="${h(g.id)}">Editar</button></div></td></tr>`; }).join('') : `<tr><td colspan="13" class="mut" style="padding:18px;text-align:center">Nada aqui. ${filtro.sit === 'ativas' ? 'Use <b>✨ Sugerir datas</b> ou <b>+ Programar férias</b>.' : ''}</td></tr>`}
      </tbody></table></div></div>`;
    el.querySelectorAll('#rt-sit button').forEach(b => b.onclick = () => { filtro.sit = b.dataset.s; renderTela(); });
    $('rt-sug').onclick = () => confirmarSugestao();
    if($('rt-ace')) $('rt-ace').onclick = () => { const ss = vivos(D.gozos).filter(g => g.st === 'sug'); let ok = 0, ruins = 0; ss.forEach(g => { if(validar(g).some(m => m.k === 'erro')) { ruins++; return; } g.st = 'prog'; g.upd = agora(); g.u = usuario(); ok++; }); salvar(); if(ruins) toast(ok + ' aceita(s). ' + ruins + ' sugestão(ões) com problema ficaram para você revisar.'); };
    if($('rt-des')) $('rt-des').onclick = () => { vivos(D.gozos).filter(g => g.st === 'sug').forEach(g => { g.del = true; g.upd = agora(); }); salvar(); };
    $('rt-csv').onclick = () => csvProg(l, ref);
    el.querySelectorAll('[data-ace]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const g = D.gozos.find(x => x.id === b.dataset.ace); const v = validar(g).filter(m => m.k === 'erro'); if(v.length){ janelaProgramar(g); return; } g.st = 'prog'; g.upd = agora(); g.u = usuario(); salvar(); });
    el.querySelectorAll('[data-av]').forEach(b => b.onclick = ev => { ev.stopPropagation(); emitirAviso(D.gozos.find(x => x.id === b.dataset.av)); });
    ligarFiltroObra(); ligarLinhas(el);
  }

  // ----- Importar e ajustes -----
  function vAjustes(el){
    const imp = D.imp, c = D.cfg;
    el.innerHTML = `<div class="g2">
      <div class="cd"><h3>1. Programação de férias da contabilidade</h3><p class="sub">Relatório "Programação de Férias" em PDF (o que a contabilidade emite todo mês). Atualiza admissão, períodos aquisitivos, dias gozados, saldo, afastamentos e faltas.</p>
        <div class="rh-drop" id="rt-dpdf"><b>⤓ Solte o PDF aqui ou clique para escolher</b>Nada é enviado para fora: o arquivo é lido aqui no navegador.</div><input type="file" id="rt-fpdf" accept="application/pdf,.pdf" hidden>
        <div class="hint" style="margin-top:10px">${imp ? `Última importação: <b>${h(imp.arquivo || 'PDF')}</b>, emitido em ${br(imp.emissao)}${imp.base ? ', data base ' + br(imp.base) : ''} · ${imp.n} colaboradores, ${imp.per} períodos · por ${h(imp.u || '—')} em ${new Date(imp.quando).toLocaleString('pt-BR')}` : 'Ainda não houve importação.'}</div></div>
      <div class="cd"><h3>2. Salários (para o custo)</h3><p class="sub">Planilha Excel com uma aba que tenha as colunas <b>NOME</b> e <b>TOTAL</b> (como a "Base salários"), ou cole duas colunas do Excel: nome e salário. O custo usa salário ÷ 30 × dias + 1/3, sem encargos.</p>
        <div class="rh-drop" id="rt-dxls"><b>⤓ Solte a planilha (.xlsx) aqui ou clique</b>Os salários ficam só na planilha da BKP, não no GitHub.</div><input type="file" id="rt-fxls" accept=".xlsx,.xls,.xlsm" hidden>
        <label>Ou cole aqui (nome ⇥ salário)</label><textarea id="rt-tsal" style="width:100%;min-height:60px;font-family:inherit;font-size:12px;border:1px solid var(--line,#e8e8ea);border-radius:8px;padding:8px" placeholder="ASSIR DE OLIVEIRA	4.462,15"></textarea>
        <div style="margin-top:8px"><button class="sec mini" id="rt-bsal">Aplicar salários colados</button> <span class="hint">${pesAtivas().filter(p => +p.sal > 0).length} de ${pesAtivas().length} com salário</span></div></div>
    </div>
    <div class="g2">
      <div class="cd"><h3>Parâmetros do plano</h3><p class="sub">Valem para todos os computadores.</p>
        <div class="rh-ajg">
          <label>Crítico: até (dias) <input type="number" id="cf-crit" min="1" value="${c.crit}"></label>
          <label>Alto: até (dias) <input type="number" id="cf-alto" min="1" value="${c.alto}"></label>
          <label>Médio: até (dias) <input type="number" id="cf-medio" min="1" value="${c.medio}"></label>
          <label>Aviso prévio (dias) <input type="number" id="cf-aviso" min="30" value="${c.aviso}"></label>
          <label>Máx. da equipe fora (%) <input type="number" id="cf-max" min="5" max="100" value="${c.maxAus}"></label>
        </div>
        <label style="margin-top:14px">Quem vê o módulo RH (usuários, separados por vírgula)</label>
        <input type="text" id="cf-ac" style="width:100%" placeholder="vazio = todos os usuários" value="${h((c.acesso || []).join(', '))}">
        <div class="hint" style="margin-top:4px">Esconde o botão RH de quem não está na lista (os salários aparecem neste módulo). É uma restrição de tela: quem tem acesso à ferramenta ainda poderia ler os dados por meios técnicos. Seu usuário: <b>${h(usuario() || '—')}</b>.</div>
        <div style="margin-top:12px"><button id="cf-ok">Salvar parâmetros</button></div></div>
      <div class="cd"><h3>Como ler este plano</h3>
        <div class="rh-ler">${ORDEM.map(k => `${badge(k)}<span>${h(nivDesc(k))}</span>`).join('')}
          <b>Período aquisitivo</b><span>12 meses de trabalho que dão direito a 30 dias de férias.</span>
          <b>Período concessivo</b><span>12 meses seguintes, dentro dos quais a empresa deve conceder as férias.</span>
          <b>Limite p/ iniciar</b><span>Última data para começar as férias e terminá-las dentro do concessivo.</span>
          <b>Aviso de férias</b><span>No mínimo ${c.aviso} dias antes (CLT art. 135). O pagamento sai até 2 dias antes do início (art. 145).</span>
          <b>Início</b><span>Não pode começar nos 2 dias antes de feriado ou do repouso semanal (art. 134 §3º). Por isso as sugestões começam às segundas.</span>
          <b>Fracionamento</b><span>Com a concordância do empregado: até 3 períodos, um com no mínimo 14 dias e os demais com no mínimo 5 (art. 134 §1º).</span>
          <b>Abono</b><span>O empregado pode vender até 1/3 das férias (10 de 30 dias, art. 143).</span>
          <b>Faltas e afastamentos</b><span>Mais de 5 faltas injustificadas reduzem o direito (art. 130); afastamento acima de 6 meses faz perder o período (art. 133).</span></div></div>
    </div>
    <div class="cd" style="margin-top:14px"><h3>Cópia de segurança</h3><p class="sub">Tudo fica na planilha automaticamente. Use isto só para levar os dados para outro lugar.</p>
      <button class="sec" id="rt-bjs">Baixar cópia (JSON)</button> <button class="sec" id="rt-rjs">Restaurar cópia</button><input type="file" id="rt-fjs" accept=".json" hidden></div>`;
    const drop = (zona, inp, fn) => {
      const z = $(zona), i = $(inp);
      z.onclick = () => i.click();
      i.onchange = () => { if(i.files[0]) fn(i.files[0]); i.value = ''; };
      z.ondragover = e => { e.preventDefault(); z.classList.add('on'); };
      z.ondragleave = () => z.classList.remove('on');
      z.ondrop = e => { e.preventDefault(); z.classList.remove('on'); if(e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]); };
    };
    drop('rt-dpdf', 'rt-fpdf', f => importarPDF(f));
    drop('rt-dxls', 'rt-fxls', async f => {
      try{ toast('Lendo a planilha…'); const r = await salariosXLSX(await f.arrayBuffer()); if(!r.l.length) return toast('Não achei colunas NOME e TOTAL (ou SALÁRIO) na planilha.', true);
        const a = aplicarSalarios(r.l); toast(a.ok + ' salário(s) atualizados (aba "' + r.aba + '").' + (a.sem.length ? ' Sem correspondência: ' + a.sem.slice(0, 6).map(titulo).join(', ') + (a.sem.length > 6 ? '…' : '') : '')); }
      catch(e){ toast('Não consegui ler a planilha: ' + e.message, true); }
    });
    $('rt-bsal').onclick = () => { const l = salariosTexto($('rt-tsal').value); if(!l.length) return toast('Cole duas colunas: nome e salário.', true); const a = aplicarSalarios(l); toast(a.ok + ' salário(s) atualizados.' + (a.sem.length ? ' Sem correspondência: ' + a.sem.map(titulo).join(', ') : '')); };
    $('cf-ok').onclick = () => {
      const v = id => Math.max(1, Math.round(num($(id).value)));
      const n = {crit: v('cf-crit'), alto: v('cf-alto'), medio: v('cf-medio'), aviso: Math.max(30, v('cf-aviso')), maxAus: Math.min(100, v('cf-max'))};
      if(!(n.crit < n.alto && n.alto < n.medio)) return toast('Os prazos precisam crescer: crítico < alto < médio.', true);
      const ac = $('cf-ac').value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      if(ac.length && !ac.map(norm).includes(norm(usuario()))) { if(!confirm('Seu usuário (' + usuario() + ') não está na lista. Você vai perder o acesso ao módulo RH. Continuar?')) return; }
      D.cfg = Object.assign(D.cfg, n, {acesso: ac, upd: agora()}); salvar(); acesso(); toast('Parâmetros salvos.');
    };
    $('rt-bjs').onclick = () => baixar('rh-ferias-' + hoje() + '.json', JSON.stringify(D, null, 1), 'application/json');
    $('rt-rjs').onclick = () => $('rt-fjs').click();
    $('rt-fjs').onchange = async () => { const f = $('rt-fjs').files[0]; if(!f) return; try{ const j = JSON.parse(await f.text()); if(!Array.isArray(j.pes)) throw new Error('arquivo não é do módulo RH'); D = juntar(D, j); salvar(); toast('Cópia restaurada.'); }catch(e){ toast('Arquivo inválido: ' + e.message, true); } };
  }

  // ---------- importação (janela) ----------
  function janelaImportar(){
    modal(`<div class="mh"><div><h2>Importar programação de férias</h2><small>PDF "Programação de Férias" emitido pela contabilidade.</small></div><div class="esp"></div><button class="x" data-x>×</button></div>
      <div class="drop" id="md-drop" style="margin-top:12px"><b style="display:block;font-size:14px;color:var(--ink,#232323)">⤓ Solte o PDF aqui ou clique para escolher</b>O arquivo é lido aqui no navegador.</div><input type="file" id="md-f" accept="application/pdf,.pdf" hidden>
      <div class="hint" style="margin-top:10px">Para salários, vá em <b>Importar e ajustes</b> no painel.</div>`);
    const z = $('md-drop'), i = $('md-f');
    z.onclick = () => i.click(); i.onchange = () => { if(i.files[0]){ fecharModal(); importarPDF(i.files[0]); } };
    z.ondragover = e => { e.preventDefault(); z.classList.add('on'); }; z.ondragleave = () => z.classList.remove('on');
    z.ondrop = e => { e.preventDefault(); if(e.dataTransfer.files[0]){ fecharModal(); importarPDF(e.dataTransfer.files[0]); } };
  }
  async function importarPDF(f){
    let r;
    try{ toast('Lendo ' + f.name + '…'); r = lerProgramacao(await linhasPDF(await f.arrayBuffer())); }
    catch(e){ return toast('Não consegui ler o PDF: ' + e.message, true); }
    if(!r.pes.length) return toast('Não encontrei a tabela da Programação de Férias neste PDF.', true);
    const ex = new Map(vivos(D.pes).filter(p => p.cod).map(p => [p.cod, p]));
    const novos = r.pes.filter(x => !ex.has(x.cod)), saem = vivos(D.pes).filter(p => p.ativo !== false && p.cod && !r.pes.some(x => x.cod === p.cod));
    const dup = {}; r.pes.forEach(x => (dup[norm(x.nome)] = dup[norm(x.nome)] || []).push(x.cod));
    const dups = Object.entries(dup).filter(([, v]) => v.length > 1);
    const pre = r.pes.map(x => ({p: {id: 'tmp', nome: x.nome, sal: 0}, per: x.per.map(y => ({ini: y.ini, fim: y.fim, rest: y.rest}))}));
    const venc = pre.filter(x => x.per.some(y => y.rest > 0 && addM(y.fim, 12) < hoje())).length;
    const totOk = r.total == null || r.total === r.pes.length;
    modal(`<div class="mh"><div><h2>Conferir importação</h2><small>${h(f.name)} · emitido em ${br(r.emissao)}${r.base ? ' · data base ' + br(r.base) : ''}</small></div><div class="esp"></div><button class="x" data-x>×</button></div>
      <div class="rs"><div><small>Colaboradores</small><b>${r.pes.length}</b></div><div><small>Períodos</small><b>${r.pes.reduce((s, x) => s + x.per.length, 0)}</b></div><div><small>Novos</small><b>${novos.length}</b></div><div><small>Saem do plano</small><b>${saem.length}</b></div></div>
      <ul class="rh-msg">
        ${totOk ? `<li class="ok">O relatório informa ${r.total == null ? r.pes.length : r.total} empregados e todos foram lidos.</li>` : `<li class="erro">O relatório informa ${r.total} empregados, mas foram lidos ${r.pes.length}. Confira antes de aplicar.</li>`}
        ${r.ignoradas.length ? `<li class="alerta">${r.ignoradas.length} linha(s) não reconhecida(s): ${h(r.ignoradas.slice(0, 3).join(' | '))}</li>` : ''}
        ${venc ? `<li class="alerta">${venc} colaborador(es) com período concessivo já encerrado e saldo (férias em dobro).</li>` : ''}
        ${dups.map(([n, c]) => `<li class="alerta">Nome repetido na programação: ${h(titulo(n))} (códigos ${c.join(' e ')}). Confira na ficha qual é qual na aba Colaboradores.</li>`).join('')}
        ${saem.length ? `<li class="alerta">Não vieram neste relatório (provavelmente desligados): ${h(saem.map(p => titulo(p.nome)).join(', '))}.</li>` : ''}
        <li class="ok">As programações feitas aqui continuam. Férias que começaram antes de ${br(r.emissao)} passam a valer pelos dias gozados da contabilidade.</li>
      </ul>
      <div class="tw" style="max-height:260px;overflow:auto;margin-top:10px"><table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:5px">Cód.</th><th style="text-align:left;padding:5px">Nome</th><th style="text-align:left;padding:5px">Admissão</th><th style="text-align:left;padding:5px">Períodos (aquisitivo · saldo)</th></tr></thead><tbody>
      ${r.pes.map(x => `<tr><td style="padding:4px 5px">${h(x.cod)}</td><td style="padding:4px 5px">${h(titulo(x.nome))}${ex.has(x.cod) ? '' : ' <span class="rh-bd" style="background:#e7f6ea;color:#14602a">novo</span>'}</td><td style="padding:4px 5px">${brc(x.adm)}</td><td style="padding:4px 5px">${x.per.map(y => brc(y.ini) + '–' + brc(y.fim) + ' · ' + fmtN(y.rest) + 'd').join('<br>')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="mf"><button class="sec" data-x>Cancelar</button><button id="md-ok">Aplicar importação</button></div>`, true);
    $('md-ok').onclick = () => { const a = aplicarProgramacao(r, f.name); fecharModal(); toast('Programação importada: ' + r.pes.length + ' colaboradores (' + a.novos + ' novos' + (a.sairam ? ', ' + a.sairam + ' saíram' : '') + ').'); if(tela && tela.style.display !== 'none'){ sub = 'painel'; } renderTudo(); };
  }

  // ---------- ficha do colaborador ----------
  function janelaFicha(pid){
    const p = pessoa(pid); if(!p) return;
    const ref = hoje(), c = colabDe(p), cs = colaboradores();
    const pers = (p.per || []).slice().sort((a, b) => b.ini.localeCompare(a.ini)).map(y => calcPer(p, y, ref));
    const tlp = x => {
      const a = x.per.ini, b = x.fimConc, tot = dif(a, b) + 1, X = d => Math.max(0, Math.min(100, dif(a, d) / tot * 100));
      let s = `<div class="aq" style="left:0;width:${X(addD(x.per.fim, 1))}%" title="Aquisitivo"></div><div class="co" style="left:${X(x.iniConc)}%;width:${100 - X(x.iniConc)}%" title="Concessivo"></div>`;
      x.gs.concat(gozosDe(p.id).filter(g => g.per === x.per.ini && !x.gs.includes(g))).forEach(g => { const st = situacao(g, ref); s += `<div class="gz" style="left:${X(g.ini)}%;width:${Math.max(0.8, X(addD(fimG(g), 1)) - X(g.ini))}%;background:${SIT[st].c};border-color:${SIT[st].b};border-style:${SIT[st].dash ? 'dashed' : 'solid'}" data-tip="${SIT[st].t}: ${br(g.ini)} a ${br(fimG(g))}"></div>`; });
      if(ref >= a && ref <= b) s += `<div class="mk" style="left:${X(ref)}%;background:#C05621"></div><div class="lt" style="left:${X(ref)}%;color:#C05621">hoje</div>`;
      if(x.lim && x.niv !== 'ok') s += `<div class="mk" style="left:${X(x.lim)}%;background:#dc3c3d"></div><div class="lt" style="left:${X(x.lim)}%;color:#dc3c3d;top:${ref >= a && ref <= b && Math.abs(X(ref) - X(x.lim)) < 12 ? 34 : -2}px">limite</div>`;
      s += `<div class="lb" style="left:0;transform:none">${brc(a)}</div><div class="lb" style="left:${X(x.iniConc)}%">${brc(x.iniConc)}</div><div class="lb" style="left:100%;transform:translateX(-100%)">${brc(b)}</div>`;
      return `<div class="rh-tlp">${s}</div>`;
    };
    modal(`<div class="mh"><div><h2>${h(titulo(p.nome))}</h2><small>${p.cod ? 'Código ' + h(p.cod) + ' · ' : ''}admissão ${br(p.adm)}${p.adm ? ' · ' + fmtN(dif(p.adm, ref) / 365, 1) + ' anos de casa' : ''}</small></div><div class="esp"></div><button class="x" data-x>×</button></div>
      <div class="f3">
        <label>Ligado a (aba Colaboradores)<select id="fi-cid"><option value="">${c && !p.cid ? 'Automático: ' + h(titulo(c.nome)) : 'Automático (pelo nome)'}</option>${cs.map(x => `<option value="${h(x.id)}"${String(p.cid) === String(x.id) ? ' selected' : ''}>${h(titulo(x.nome))} · ${h(cod(x.obra))}</option>`).join('')}<option value="nenhum"${p.cid === 'nenhum' ? ' selected' : ''}>Não está na aba Colaboradores</option></select></label>
        <label>Obra<select id="fi-obra"><option value="">${obraDe(p) && !p.obra ? 'Da aba Colaboradores: ' + h(obraDe(p)) : 'Da aba Colaboradores'}</option>${locais().map(l => `<option value="${h(l.cod)}"${p.obra === l.cod ? ' selected' : ''}>${h(l.nome)}</option>`).join('')}</select></label>
        <label>Salário mensal (R$)<input id="fi-sal" inputmode="decimal" value="${p.sal ? fmtN(p.sal, 2) : ''}" placeholder="0,00"></label>
      </div>
      <div class="hint" style="margin-top:4px">Função: <b>${h(funcaoDe(p).toLowerCase() || 'não informada')}</b>. Obra e função vêm da aba Colaboradores; escolha acima só se precisar corrigir.</div>
      ${pers.length ? pers.map(x => `<div class="rh-per"><div class="ph"><b>Aquisitivo ${br(x.per.ini)} a ${br(x.per.fim)}</b>${badge(x.niv)}${x.perdeDireito ? '<span class="rh-bd" style="background:#1f1f1f;color:#fff">afastamento &gt; 6 meses</span>' : ''}<span class="esp" style="flex:1"></span>${x.saldo > 0 && !x.aberto ? `<button class="mini" data-prog="${h(p.id)}|${h(x.per.ini)}">Programar</button>` : ''}</div>
        ${tlp(x)}
        <div class="nums"><div><small>Direito</small><b>${fmtN(x.per.dir)} d</b></div><div><small>Gozados (contab.)</small><b>${fmtN(x.per.goz)} d</b></div><div><small>Programados</small><b>${fmtN(x.progConf)} d</b></div><div><small>Saldo a programar</small><b>${fmtN(x.saldo)} d</b></div>
          <div><small>Concessivo até</small><b>${br(x.fimConc)}</b></div><div><small>Limite p/ iniciar</small><b>${x.lim ? br(x.lim) : '—'}</b></div><div><small>Faltas · afast.</small><b>${fmtN(x.per.faltas)} · ${fmtN(x.per.afast)}</b></div><div><small>Custo do saldo</small><b>${p.sal ? R$(x.custoSaldo) : '—'}</b></div></div>
        ${x.aberto ? `<div class="hint" style="margin-top:8px">Período ainda em aquisição: o direito é de 30 dias ao completar (hoje são ${fmtN(x.per.dir)} dias proporcionais${+x.per.faltas > 5 ? ', reduzido por faltas' : ''}).</div>` : ''}
        ${x.gs.length || gozosDe(p.id).some(g => g.per === x.per.ini) ? `<div style="margin-top:8px">${chipsGozos(p, x.per)}</div>` : ''}</div>`).join('') : '<div class="mut" style="margin-top:12px">Sem períodos importados.</div>'}
      <div class="mf"><button class="sec" data-x>Fechar</button><button id="fi-ok">Salvar ficha</button></div>`, true);
    $('fi-ok').onclick = () => { p.cid = $('fi-cid').value; p.obra = $('fi-obra').value; p.sal = num($('fi-sal').value); p.upd = agora(); vincCache = ''; salvar(); fecharModal(); };
    const mw = $('rh-modal');
    mw.querySelectorAll('[data-prog]').forEach(b => b.onclick = () => { const [a, per] = b.dataset.prog.split('|'); janelaProgramar({pid: a, per}); });
    mw.querySelectorAll('[data-gz]').forEach(b => b.onclick = () => { const g = D.gozos.find(x => x.id === b.dataset.gz); if(g) janelaProgramar(g); });
  }

  // ---------- programar férias (janela) ----------
  function janelaProgramar(base){
    const ref = hoje();
    const existente = base.id ? D.gozos.find(x => x.id === base.id) : null;
    const g = Object.assign({id: '', pid: '', per: '', ini: '', dias: 30, abono: 0, adi13: false, st: 'prog', obs: ''}, existente || base);
    if(g.pid && !g.per){ const pr = principal(pessoa(g.pid), ref); if(pr && pr.saldo > 0 && !pr.aberto) g.per = pr.per.ini; }
    if(!existente && g.pid && g.per){
      const c = calcPer(pessoa(g.pid), pessoa(g.pid).per.find(y => y.ini === g.per), ref);
      g.dias = Math.min(30, Math.max(5, c.saldo)) || 30;
      if(!g.ini){ let s = addD(ref, D.cfg.aviso); if(s <= c.per.fim) s = addD(c.per.fim, 1); g.ini = proxSegunda(s); while(!inicioValido(g.ini, obraDe(pessoa(g.pid)))) g.ini = addD(g.ini, 1); }
    }
    const ps = pesAtivas().slice().sort((a, b) => a.nome.localeCompare(b.nome));
    modal(`<div class="mh"><div><h2>${existente ? 'Editar férias' : 'Programar férias'}</h2><small>${existente ? SIT[situacao(existente, ref)].t + (existente.u ? ' · por ' + h(existente.u) : '') : 'A ferramenta confere as regras da CLT e a cobertura da equipe.'}</small></div><div class="esp"></div><button class="x" data-x>×</button></div>
      <div class="f2"><label>Colaborador<select id="pg-p"><option value="">Escolha…</option>${ps.map(p => `<option value="${h(p.id)}"${p.id === g.pid ? ' selected' : ''}>${h(titulo(p.nome))}${obraDe(p) ? ' · ' + h(obraDe(p)) : ''}</option>`).join('')}</select></label>
        <label>Período aquisitivo<select id="pg-per"></select></label></div>
      <div class="f3"><label>Início<input type="date" id="pg-ini" value="${h(g.ini)}"></label><label>Dias de férias<input type="number" id="pg-d" min="5" max="30" value="${g.dias}"></label><label>Abono (dias vendidos)<input type="number" id="pg-ab" min="0" max="10" value="${+g.abono || 0}"></label></div>
      <div class="qk"><button class="sec mini" data-q="30|0">30 dias</button><button class="sec mini" data-q="20|10">20 + 10 de abono</button><button class="sec mini" data-q="15|0">15 dias</button><button class="sec mini" data-q="saldo">Todo o saldo</button><button class="sec mini" id="pg-seg">Próxima segunda válida</button>
        <label class="chk" style="margin:0 0 0 auto;display:flex;align-items:center;gap:6px"><input type="checkbox" id="pg-13"${g.adi13 ? ' checked' : ''}> Adiantar 1ª parcela do 13º</label></div>
      <div class="rs" id="pg-rs"></div>
      <ul class="rh-msg" id="pg-msg"></ul>
      <label>Observação</label><input type="text" id="pg-obs" value="${h(g.obs || '')}" placeholder="Ex.: a pedido do colaborador; substituto: …" style="width:100%">
      <div class="mf">${existente ? `<button class="sec" id="pg-canc" style="color:#b42318">${existente.st === 'sug' ? 'Descartar sugestão' : 'Cancelar férias'}</button>` : ''}<span class="esp"></span><button class="sec" data-x>Fechar</button>
        ${existente && ['prog', 'aviso'].includes(situacao(existente, ref)) ? '<button class="sec" id="pg-av">Salvar e emitir aviso</button>' : ''}<button id="pg-ok">${existente && existente.st === 'sug' ? 'Aceitar sugestão' : 'Salvar'}</button></div>`);
    const lerForm = () => Object.assign({}, g, {pid: $('pg-p').value, per: $('pg-per').value, ini: $('pg-ini').value, dias: Math.round(num($('pg-d').value)), abono: Math.round(num($('pg-ab').value)), adi13: $('pg-13').checked, obs: $('pg-obs').value.trim()});
    function opcoesPer(){
      const p = pessoa($('pg-p').value), s = $('pg-per');
      if(!p){ s.innerHTML = '<option value="">—</option>'; return; }
      const l = (p.per || []).map(y => calcPer(p, y, ref, g.id));
      s.innerHTML = l.map(x => `<option value="${h(x.per.ini)}"${x.per.ini === g.per ? ' selected' : ''}>${brc(x.per.ini)} a ${brc(x.per.fim)} · saldo ${fmtN(x.rest - x.progConf)}d${x.aberto ? ' (em aquisição)' : ''}</option>`).join('') || '<option value="">Sem períodos</option>';
      if(!l.some(x => x.per.ini === g.per)){ const pr = l.filter(x => !x.aberto && x.rest - x.progConf > 0)[0] || l[0]; if(pr) s.value = pr.per.ini; }
    }
    function atualizar(){
      const f = lerForm(), p = pessoa(f.pid);
      const v = validar(f, ref);
      const fim = f.ini && f.dias > 0 ? fimG(f) : '';
      const sal = p ? +p.sal || 0 : 0;
      $('pg-rs').innerHTML = `<div><small>Termina</small><b>${fim ? br(fim) : '—'}</b></div><div><small>Retorno</small><b>${fim ? br(addD(fim, 1)) + ' (' + SEM[P(addD(fim, 1)).getDay()].slice(0, 3) + ')' : '—'}</b></div>
        <div><small>Aviso até</small><b>${f.ini ? br(addD(f.ini, -D.cfg.aviso)) : '—'}</b></div><div><small>Pagar até</small><b>${f.ini ? br(addD(f.ini, -2)) : '—'}</b></div>
        <div style="grid-column:span 2"><small>Férias + 1/3</small><b>${sal ? R$(sal / 30 * f.dias * 4 / 3) : 'informe o salário na ficha'}</b></div><div style="grid-column:span 2"><small>Abono + 1/3</small><b>${sal && f.abono ? R$(sal / 30 * f.abono * 4 / 3) : '—'}</b></div>`;
      $('pg-msg').innerHTML = v.map(m => `<li class="${m.k}">${h(m.t)}</li>`).join('');
      $('pg-ok').disabled = v.some(m => m.k === 'erro');
      if($('pg-av')) $('pg-av').disabled = $('pg-ok').disabled;
    }
    opcoesPer(); atualizar();
    $('pg-p').onchange = () => { g.per = ''; opcoesPer(); const p = pessoa($('pg-p').value); if(p && !$('pg-ini').value){ const c = calcPer(p, p.per.find(y => y.ini === $('pg-per').value), ref); $('pg-d').value = Math.min(30, Math.max(5, c.saldo)); } atualizar(); };
    ['pg-per', 'pg-ini', 'pg-d', 'pg-ab', 'pg-13'].forEach(id => { $(id).oninput = atualizar; $(id).onchange = atualizar; });
    $('rh-modal').querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      if(b.dataset.q === 'saldo'){ const p = pessoa($('pg-p').value); if(!p) return; const per = p.per.find(y => y.ini === $('pg-per').value); if(!per) return; const c = calcPer(p, per, ref, g.id); $('pg-d').value = Math.max(0, c.rest - c.progConf); $('pg-ab').value = 0; }
      else { const [d, a] = b.dataset.q.split('|'); $('pg-d').value = d; $('pg-ab').value = a; }
      atualizar();
    });
    $('pg-seg').onclick = () => { const p = pessoa($('pg-p').value); let s = $('pg-ini').value || ref; s = addD(s, 1); s = proxSegunda(s); while(!inicioValido(s, p ? obraDe(p) : '')) s = proxSegunda(addD(s, 1)); $('pg-ini').value = s; atualizar(); };
    const gravar = () => {
      const f = lerForm();
      if(validar(f, ref).some(m => m.k === 'erro')) return null;
      const alvo = existente || {id: uid(), criado: agora()};
      Object.assign(alvo, f, {id: alvo.id, st: existente && existente.st === 'aviso' ? 'aviso' : 'prog', u: usuario(), upd: agora()});
      if(existente && existente.st === 'aviso' && (existente.ini !== f.ini || +existente.dias !== f.dias)) alvo.st = 'prog'; // mudou a data: novo aviso
      if(!existente) D.gozos.push(alvo);
      salvar();
      return alvo;
    };
    $('pg-ok').onclick = () => { const a = gravar(); if(a){ fecharModal(); toast('Férias de ' + titulo(pessoa(a.pid).nome.split(' ')[0]) + ' programadas: ' + br(a.ini) + ' a ' + br(fimG(a)) + '.'); } };
    if($('pg-av')) $('pg-av').onclick = () => { const a = gravar(); if(a){ fecharModal(); emitirAviso(a); } };
    if($('pg-canc')) $('pg-canc').onclick = () => {
      if(existente.st === 'sug'){ existente.del = true; existente.upd = agora(); salvar(); fecharModal(); return; }
      if(!confirm('Cancelar as férias de ' + br(existente.ini) + ' a ' + br(fimG(existente)) + '?')) return;
      existente.st = 'canc'; existente.upd = agora(); existente.u = usuario(); salvar(); fecharModal();
    };
  }
  function confirmarSugestao(){
    const ja = vivos(D.gozos).filter(g => g.st === 'sug').length;
    modal(`<div class="mh"><div><h2>✨ Sugerir datas de férias</h2><small>Monta uma proposta para todos os períodos com saldo, do mais urgente ao menos.</small></div><div class="esp"></div><button class="x" data-x>×</button></div>
      <ul class="rh-msg"><li class="ok">Começa numa segunda-feira, nunca antes de ${D.cfg.aviso} dias (prazo do aviso), e termina antes do limite legal.</li>
        <li class="ok">Evita que mais de ${D.cfg.maxAus}% de uma obra, ou duas pessoas da mesma função na mesma obra, fiquem fora ao mesmo tempo.</li>
        <li class="ok">Usa o saldo inteiro de cada período (sem abono). Depois é só ajustar quem preferir dividir ou vender dias.</li>
        <li class="alerta">As sugestões não valem como programação até você aceitar.${ja ? ' As ' + ja + ' sugestões atuais serão refeitas.' : ''}</li></ul>
      <div class="mf"><button class="sec" data-x>Cancelar</button><button id="sg-ok">Sugerir datas</button></div>`);
    $('sg-ok').onclick = () => { const r = sugerir(); fecharModal(); sub = 'programacao'; filtro.sit = 'sug'; if(!tela || tela.style.display === 'none') abrirTela('programacao'); else renderTela(); toast(r.n + ' sugestão(ões) criada(s).' + (r.apertadas ? ' ' + r.apertadas + ' não cabem mais no prazo legal (vencidas): conceder o quanto antes.' : '')); };
  }

  // ---------- aviso de férias (impressão) ----------
  function emitirAviso(g){
    if(!g) return;
    const p = pessoa(g.pid), per = (p.per || []).find(y => y.ini === g.per) || {}, fim = fimG(g), ret = addD(fim, 1);
    const logo = new URL('logo-bkp.png', location.href).href;
    const hojeTxt = (d => d.getDate() + ' de ' + MESL[d.getMonth()] + ' de ' + d.getFullYear())(new Date());
    const via = nome => `<section><div class="cb"><img src="${logo}"><div><b>${EMPRESA.nome}</b><br>CNPJ ${EMPRESA.cnpj}<br>${h(EMPRESA.end)}</div><div class="via">${nome}</div></div>
      <h1>AVISO DE FÉRIAS</h1>
      <p>Ao(À) Sr(a). <b>${h(p.nome)}</b>${p.cod ? ', código ' + h(p.cod) : ''}${funcaoDe(p) ? ', função ' + h(funcaoDe(p)) : ''}.</p>
      <p>Nos termos do art. 135 da Consolidação das Leis do Trabalho, comunicamos que suas férias relativas ao período aquisitivo de <b>${br(per.ini)}</b> a <b>${br(per.fim)}</b> serão concedidas conforme abaixo:</p>
      <table><tr><td>Período de gozo</td><td><b>${br(g.ini)} a ${br(fim)}</b> (${g.dias} dias corridos)</td></tr>
        <tr><td>Retorno ao trabalho</td><td><b>${br(ret)}</b> (${SEM[P(ret).getDay()]})</td></tr>
        <tr><td>Abono pecuniário</td><td>${+g.abono ? '<b>' + g.abono + ' dias</b> convertidos em dinheiro (art. 143)' : 'Não'}</td></tr>
        <tr><td>Adiantamento da 1ª parcela do 13º</td><td>${g.adi13 ? 'Sim' : 'Não'}</td></tr></table>
      <p>A remuneração das férias, acrescida do terço constitucional, será paga até <b>${br(addD(g.ini, -2))}</b> (art. 145 da CLT).</p>
      <p>${EMPRESA.cidade}, ${hojeTxt}.</p>
      <div class="ass"><div>${EMPRESA.nome}<br><small>Empregador</small></div><div>${h(p.nome)}<br><small>Ciente em ____/____/________</small></div></div></section>`;
    const w = window.open('', '_blank');
    if(!w) return toast('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.', true);
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Aviso de férias – ${h(titulo(p.nome))}</title><style>
      @page{size:A4;margin:12mm} body{font-family:Arial,Helvetica,sans-serif;color:#232323;font-size:12px;margin:0}
      section{height:132mm;padding:4mm 2mm;box-sizing:border-box;position:relative} section+section{border-top:1px dashed #999;padding-top:8mm}
      .cb{display:flex;gap:12px;align-items:center;font-size:10.5px;color:#5c5c5c;border-bottom:2px solid #C05621;padding-bottom:6px} .cb img{height:34px} .cb b{color:#232323;font-size:12px} .cb .via{margin-left:auto;font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:9.5px}
      h1{font-size:16px;text-align:center;letter-spacing:.1em;margin:10px 0 8px} p{margin:6px 0;line-height:1.5}
      table{border-collapse:collapse;width:100%;margin:6px 0} td{border:1px solid #ddd;padding:5px 8px} td:first-child{width:42%;background:#f6f6f7;font-weight:700;font-size:11px}
      .ass{display:flex;gap:30px;margin-top:26px} .ass div{flex:1;border-top:1px solid #232323;padding-top:4px;text-align:center;font-size:11px} .ass small{color:#5c5c5c}
    </style></head><body>${via('Via do empregador')}${via('Via do empregado')}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
    if(g.st !== 'aviso'){ g.st = 'aviso'; g.avisoEm = hoje(); g.upd = agora(); g.u = usuario(); salvar(); }
  }

  // ---------- CSV ----------
  function baixar(nome, txt, tipo){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], {type: tipo})); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  const csvL = r => r.map(v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
  const nBR = v => (+v || 0).toFixed(2).replace('.', ',');
  function csvColab(rows, ref){
    const l = [['Código', 'Nome', 'Função', 'Obra', 'Admissão', 'Início aquisitivo', 'Fim aquisitivo', 'Fim concessivo', 'Direito', 'Gozados', 'Programados', 'Saldo', 'Limite p/ iniciar', 'Dias até o limite', 'Nível', 'Salário', 'Custo do saldo']];
    rows.forEach(({p}) => (p.per || []).forEach(y => { const x = calcPer(p, y, ref); l.push([p.cod, p.nome, funcaoDe(p), obraDe(p), br(p.adm), br(y.ini), br(y.fim), br(x.fimConc), nBR(y.dir), nBR(y.goz), nBR(x.progConf), nBR(x.saldo), x.lim ? br(x.lim) : '', x.dias == null ? '' : x.dias, NIV[x.niv].t, nBR(p.sal), nBR(x.custoSaldo)]); }));
    baixar('ferias-colaboradores-' + ref + '.csv', '﻿' + l.map(csvL).join('\n'), 'text/csv');
  }
  function csvProg(gs, ref){
    const l = [['Nome', 'Obra', 'Função', 'Aquisitivo', 'Início', 'Fim', 'Retorno', 'Dias', 'Abono', 'Adiantar 13º', 'Aviso até', 'Aviso emitido em', 'Pagar até', 'Situação', 'Custo', 'Observação']];
    gs.forEach(g => { const p = pessoa(g.pid); l.push([p.nome, obraDe(p), funcaoDe(p), br(g.per), br(g.ini), br(fimG(g)), br(addD(fimG(g), 1)), g.dias, g.abono || 0, g.adi13 ? 'Sim' : 'Não', br(addD(g.ini, -D.cfg.aviso)), g.avisoEm ? br(g.avisoEm) : '', br(addD(g.ini, -2)), SIT[situacao(g, ref)].t, nBR(custoGozo(g)), g.obs || '']); });
    baixar('ferias-programacao-' + ref + '.csv', '﻿' + l.map(csvL).join('\n'), 'text/csv');
  }

  // ---------- janela genérica e avisos rápidos ----------
  function modal(html, largo){
    fecharModal();
    const m = document.createElement('div'); m.id = 'rh-modal';
    m.innerHTML = `<div class="mw${largo ? ' lg' : ''}">${html}</div>`;
    document.body.appendChild(m);
    m.addEventListener('click', ev => { if(ev.target === m || ev.target.closest('[data-x]')) fecharModal(); });
    m.addEventListener('keydown', ev => { if(ev.key === 'Escape'){ ev.stopPropagation(); fecharModal(); } });
    const f = m.querySelector('input:not([type=hidden]):not([type=file]),select'); if(f && !largo) setTimeout(() => f.focus(), 30);
  }
  function fecharModal(){ const m = $('rh-modal'); if(m) m.remove(); tip.style.display = 'none'; }
  let tt = null;
  function toast(t, err){
    let e = $('rh-toast');
    if(!e){ e = document.createElement('div'); e.id = 'rh-toast'; e.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:7000;background:#1f1f1f;color:#fff;padding:10px 16px;border-radius:10px;font-size:12.5px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw'; document.body.appendChild(e); }
    e.textContent = t; e.style.background = err ? '#b42318' : '#1f1f1f'; e.style.display = 'block';
    clearTimeout(tt); tt = setTimeout(() => e.style.display = 'none', err ? 7000 : 4500);
  }

  function renderTudo(){ renderAba(); renderTela(); }

  // ---------- troca de aba ----------
  const trocarOrig = window.trocarAba;
  window.trocarAba = function(a){
    trocarOrig.apply(this, arguments);
    aba.style.display = a === 'rh' ? '' : 'none';
    btn.classList.toggle('on', a === 'rh');
    if(a === 'rh'){ renderAba(); receber(); }
  };
  document.addEventListener('visibilitychange', () => { if(!document.hidden && (aba.style.display !== 'none' || (tela && tela.style.display !== 'none'))) receber(); });

  acesso();
  receber();
  try{ if(ls.get('aba') === 'rh' && liberado()) trocarAba('rh'); }catch(e){}
  window.G360RH = {dados: () => D, abrir: abrirTela, receber, enviar, _lerProgramacao: lerProgramacao, _aplicar: aplicarProgramacao, _salarios: aplicarSalarios, _sugerir: sugerir, _validar: validar, _fila: fila};
})();
