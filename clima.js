// Aba "Clima" do Gestão 360º BKP: tempo nas obras e semáforo para aplicar microrrevestimento (MRAF).
// Carregado por index.html depois do app, como equipamentos.js e diarias.js. Não guarda nada secreto.
// Previsão: Open-Meteo (api.open-meteo.com), gratuita e sem chave. As coordenadas vêm das obras do mapa.
// Os limites do semáforo ficam na aba oculta "Gestao360" da planilha (linha 3), pela mesma ligação da aba
// Emulsão (txApi): quem altera no bloco "Critérios" altera para todos os computadores.
(function(){
  if(typeof st === 'undefined' || typeof trocarAba !== 'function') return;

  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const KCFG = 'dmtbkp_clima_cfg', KPEND = 'dmtbkp_clima_cfgPend', KSEL = 'dmtbkp_clima_sel', KCACHE = 'dmtbkp_clima_cache';
  const PADRAO = {tmin: 10, tcalor: 38, p1: 30, p2: 60, mm1: 0.1, mm2: 0.5, ur: 85, vento: 30, dur: 5, cura: 3, hIni: 6, hFim: 17};
  let CFG = Object.assign({}, PADRAO);
  try{ Object.assign(CFG, JSON.parse(localStorage.getItem(KCFG) || '{}')); }catch(e){}
  let DADOS = {}, quando = 0, carregando = false, erro = '';
  try{ const c = JSON.parse(localStorage.getItem(KCACHE) || 'null'); if(c && c.d){ DADOS = c.d; quando = c.t || 0; } }catch(e){}
  const SEL = {obra: '', dia: '', hora: ''};
  try{ Object.assign(SEL, JSON.parse(localStorage.getItem(KSEL) || '{}')); }catch(e){}

  const COR = ['#1f7a3d', '#b26a00', '#b42318'], FUNDO = ['#e8f5ec', '#fff4e0', '#fdecea'];
  const ROT = ['Liberado', 'Atenção', 'Não aplicar'], ICO = ['🟢', '🟡', '🔴'];
  const DSEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  function tempo(c){
    if(c == null) return ['', '—'];
    if(c === 0) return ['☀️', 'Céu limpo'];
    if(c <= 2) return ['🌤️', 'Poucas nuvens'];
    if(c === 3) return ['☁️', 'Nublado'];
    if(c <= 48) return ['🌫️', 'Neblina'];
    if(c <= 57) return ['🌦️', 'Garoa'];
    if(c <= 67) return ['🌧️', 'Chuva'];
    if(c <= 77) return ['🌨️', 'Neve'];
    if(c <= 82) return ['🌧️', 'Pancadas de chuva'];
    if(c <= 86) return ['🌨️', 'Neve'];
    return ['⛈️', 'Trovoada'];
  }
  const n1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('pt-BR');
  const n0 = v => v == null ? '—' : Math.round(v).toLocaleString('pt-BR');
  const diaBR = s => { const d = new Date(s.slice(0, 10) + 'T12:00:00'); return DSEM[d.getDay()] + ' ' + s.slice(8, 10) + '/' + s.slice(5, 7); };
  const hh = s => s.slice(11, 13) + 'h';

  // ---------- obras ----------
  function obras(){
    return (st.obras || []).filter(o => o.status !== 'concluida' && isFinite(o.lat) && isFinite(o.lng));
  }
  const chave = o => o.id || (o.lat + ',' + o.lng);
  const rotulo = o => (o.codigo ? o.codigo + ' – ' : '') + (o.local || o.nome);
  const SIT = {andamento: 'Em andamento', iniciar: 'A iniciar', paralisada: 'Paralisada', concluida: 'Concluída'};

  // ---------- previsão ----------
  async function buscar(forcar){
    const l = obras();
    if(!l.length || carregando) return;
    if(!forcar && Date.now() - quando < 20 * 60000 && l.every(o => DADOS[chave(o)])) return render();
    carregando = true; erro = ''; render();
    const p = new URLSearchParams({
      latitude: l.map(o => o.lat).join(','), longitude: l.map(o => o.lng).join(','),
      current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
      timezone: 'auto', forecast_days: '7', past_days: '1', wind_speed_unit: 'kmh'
    });
    try{
      const r = await fetch('https://api.open-meteo.com/v1/forecast?' + p);
      if(!r.ok) throw new Error('HTTP ' + r.status);
      let j = await r.json(); if(!Array.isArray(j)) j = [j];
      const novo = {};
      l.forEach((o, i) => { if(j[i] && j[i].hourly) novo[chave(o)] = j[i]; });
      DADOS = novo; quando = Date.now();
      try{ localStorage.setItem(KCACHE, JSON.stringify({t: quando, d: DADOS})); }catch(e){}
    }catch(e){
      erro = 'Não foi possível buscar a previsão agora' + (quando ? '; mostrando a última consulta.' : '. Verifique a internet.');
    }
    carregando = false; render(); atualizarMapa();
  }

  // ---------- regras ----------
  // nível de uma hora: 0 liberado, 1 atenção, 2 não aplicar (com os motivos)
  function avaliarHora(H, i, fase){
    const t = H.temperature_2m[i], pr = H.precipitation_probability[i], mm = H.precipitation[i];
    const ur = H.relative_humidity_2m[i], v = H.wind_speed_10m[i];
    const m = [];
    if(t != null){
      if(t <= CFG.tmin) m.push([2, 'temperatura de ' + n1(t) + ' °C (mínimo ' + CFG.tmin + ' °C)']);
      else if(t < CFG.tmin + 3) m.push([1, 'temperatura perto do mínimo (' + n1(t) + ' °C)']);
      if(t >= CFG.tcalor && fase === 'apl') m.push([1, 'calor de ' + n1(t) + ' °C: ruptura rápida, perde trabalhabilidade']);
    }
    if(pr != null){
      if(pr >= CFG.p2) m.push([2, pr + '% de chance de chuva']);
      else if(pr >= CFG.p1) m.push([1, pr + '% de chance de chuva']);
    }
    if(mm != null){
      if(mm >= CFG.mm2) m.push([2, n1(mm) + ' mm de chuva previstos']);
      else if(mm >= CFG.mm1) m.push([1, 'garoa prevista (' + n1(mm) + ' mm)']);
    }
    if(ur != null && ur >= CFG.ur) m.push([1, 'umidade de ' + ur + '%: cura mais lenta']);
    if(v != null && v >= CFG.vento && fase === 'apl') m.push([1, 'vento de ' + n0(v) + ' km/h']);
    return {n: m.reduce((a, x) => Math.max(a, x[0]), 0), m};
  }

  // janela: aplicação de CFG.dur horas a partir do índice i0, mais CFG.cura horas de cura
  function avaliarJanela(H, i0){
    const fim = i0 + CFG.dur + CFG.cura;
    if(i0 < 0 || fim > H.time.length) return null;
    const mot = new Map(); let n = 0;
    const add = (nivel, txt, quando) => {
      n = Math.max(n, nivel);
      const k = nivel + '|' + txt.replace(/[\d.,]+ ?(°C|%|mm|km\/h)/g, '$1');
      if(!mot.has(k)) mot.set(k, {n: nivel, txt, q: quando});
    };
    for(let i = i0; i < fim; i++){
      const fase = i < i0 + CFG.dur ? 'apl' : 'cura';
      const a = avaliarHora(H, i, fase);
      a.m.forEach(x => add(x[0], x[1], (fase === 'apl' ? 'na aplicação' : 'na cura') + ', ' + hh(H.time[i])));
    }
    let antes = 0;
    for(let i = Math.max(0, i0 - 3); i < i0; i++) antes += H.precipitation[i] || 0;
    if(antes >= 1) add(1, 'choveu ' + n1(antes) + ' mm nas 3 h anteriores: conferir água livre na pista', 'antes');
    const m = [...mot.values()].sort((a, b) => b.n - a.n);
    return {n, m, ini: H.time[i0], fimApl: H.time[i0 + CFG.dur - 1], fimCura: H.time[fim - 1]};
  }

  function idxAgora(d){
    const H = d.hourly, agora = (d.current && d.current.time) || '';
    let i = H.time.findIndex(t => t > agora);
    return i < 0 ? H.time.length : i; // próxima hora cheia
  }

  // próxima janela 100% liberada dentro do horário de trabalho
  function proximaJanela(d, nivelMax){
    const H = d.hourly;
    for(let i = idxAgora(d); i < H.time.length; i++){
      const hr = +H.time[i].slice(11, 13);
      if(hr < CFG.hIni || hr + CFG.dur > CFG.hFim + 1) continue;
      const j = avaliarJanela(H, i);
      if(j && j.n <= (nivelMax || 0)) return j;
    }
    return null;
  }

  // ---------- montar a aba ----------
  const css = document.createElement('style');
  css.textContent = `
  #aba-clima .cl-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
  #aba-clima .cl-ob{border:1px solid var(--line,#e4e7ec);border-radius:10px;padding:11px 12px;cursor:pointer;background:#fff;transition:.15s}
  #aba-clima .cl-ob:hover{box-shadow:0 2px 8px rgba(0,0,0,.08)}
  #aba-clima .cl-ob.on{border-color:var(--terra,#C05621);box-shadow:0 0 0 2px rgba(192,86,33,.18)}
  #aba-clima .cl-ob .tt{display:flex;justify-content:space-between;gap:6px;font-weight:700;font-size:12.5px}
  #aba-clima .cl-ob .tt small{font-weight:400;color:var(--ink3,#8E8E8E);font-size:11px;white-space:nowrap}
  #aba-clima .cl-ob .ag{display:flex;align-items:baseline;gap:8px;margin:6px 0 2px}
  #aba-clima .cl-ob .ag b{font-size:24px;line-height:1}
  #aba-clima .cl-ob .ag span{color:var(--ink2,#5C5C5C);font-size:12px}
  #aba-clima .cl-ob .mt{color:var(--ink2,#5C5C5C);font-size:11.5px}
  #aba-clima .cl-sem{display:flex;gap:8px;align-items:flex-start;border-radius:8px;padding:7px 9px;margin-top:8px;font-size:12px;line-height:1.35}
  #aba-clima .cl-sem b{display:block}
  #aba-clima .cl-big{display:flex;gap:12px;align-items:flex-start;border-radius:10px;padding:12px 14px;margin:10px 0}
  #aba-clima .cl-big .ic{font-size:28px;line-height:1}
  #aba-clima .cl-big b{font-size:15px;display:block;margin-bottom:2px}
  #aba-clima .cl-big ul{margin:6px 0 0;padding-left:16px;font-size:12px}
  #aba-clima .cl-tab{width:100%;border-collapse:collapse;font-size:11.5px}
  #aba-clima .cl-tab th,#aba-clima .cl-tab td{padding:4px 5px;text-align:center;white-space:nowrap}
  #aba-clima .cl-tab td:first-child,#aba-clima .cl-tab th:first-child{text-align:left}
  #aba-clima .cl-tab tr.jan td{font-weight:700}
  #aba-clima .cl-tab tr.jan td:first-child{box-shadow:inset 3px 0 0 var(--terra,#C05621)}
  #aba-clima .cl-tab .bol{display:inline-block;width:9px;height:9px;border-radius:50%}
  #aba-clima .cl-rol{max-height:420px;overflow:auto;border:1px solid var(--line,#e4e7ec);border-radius:8px}
  #aba-clima .cl-cfg{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
  #aba-clima .cl-cfg input{width:100%}
  #aba-clima .cl-dias{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:6px}
  #aba-clima .cl-dias div{border:1px solid var(--line,#e4e7ec);border-radius:8px;padding:6px 2px;text-align:center;font-size:11px;cursor:pointer;background:#fff}
  #aba-clima .cl-dias div.on{border-color:var(--terra,#C05621);box-shadow:0 0 0 2px rgba(192,86,33,.18)}
  #aba-clima .cl-dias div b{display:block;font-size:12px}
  #aba-clima .cl-dias .e{font-size:18px;display:block;margin:2px 0}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.dataset.aba = 'clima'; btn.textContent = 'Clima';
  $('abas').appendChild(btn);
  btn.addEventListener('click', () => trocarAba('clima'));

  const aba = document.createElement('div');
  aba.id = 'aba-clima'; aba.style.display = 'none';
  aba.innerHTML = `
    <div class="card">
      <h2>Clima nas obras agora</h2>
      <div class="cl-grade" id="cl-grade"></div>
      <div class="hint" style="margin-top:8px"><span id="cl-estado"></span>
        <button class="sec mini" id="cl-atual" style="margin-left:6px">Atualizar</button></div>
    </div>
    <div class="card">
      <h2>Posso aplicar o micro?</h2>
      <label for="cl-obra">Obra</label><select id="cl-obra"></select>
      <div class="cl-dias" id="cl-dias"></div>
      <div class="row">
        <div><label for="cl-hora">Início da aplicação</label><select id="cl-hora"></select></div>
        <div><label for="cl-dur">Aplicação (h)</label><input type="number" id="cl-dur" min="1" max="12" step="1"></div>
        <div><label for="cl-cura">Cura sem chuva (h)</label><input type="number" id="cl-cura" min="0" max="12" step="1"></div>
      </div>
      <div id="cl-res"></div>
      <div class="cl-rol"><table class="cl-tab" id="cl-horas"></table></div>
      <div class="hint" style="margin-top:6px">As linhas em negrito são a janela escolhida (aplicação + cura). Clique numa hora para começar a aplicação nela.</div>
    </div>
    <div class="card">
      <h2>Critérios do semáforo</h2>
      <div class="hint">Base: especificações de microrrevestimento (DNIT 035/2018-ES e DERs) não permitem aplicar com temperatura ambiente igual ou abaixo de 10 °C nem em dias de chuva. Os demais limites são de prudência e podem ser ajustados ao contrato e à emulsão usada.</div>
      <div class="cl-cfg">
        <div><label>Temperatura mínima (°C)</label><input type="number" data-c="tmin" step="0.5"></div>
        <div><label>Alerta de calor (°C)</label><input type="number" data-c="tcalor" step="0.5"></div>
        <div><label>Chuva: atenção a partir de (%)</label><input type="number" data-c="p1" step="5"></div>
        <div><label>Chuva: não aplicar a partir de (%)</label><input type="number" data-c="p2" step="5"></div>
        <div><label>Garoa: atenção a partir de (mm/h)</label><input type="number" data-c="mm1" step="0.1"></div>
        <div><label>Chuva: não aplicar a partir de (mm/h)</label><input type="number" data-c="mm2" step="0.1"></div>
        <div><label>Umidade: atenção a partir de (%)</label><input type="number" data-c="ur" step="1"></div>
        <div><label>Vento: atenção a partir de (km/h)</label><input type="number" data-c="vento" step="1"></div>
        <div><label>Expediente começa (h)</label><input type="number" data-c="hIni" min="0" max="23" step="1"></div>
        <div><label>Expediente termina (h)</label><input type="number" data-c="hFim" min="0" max="23" step="1"></div>
      </div>
      <div class="btns"><button class="sec mini" id="cl-padrao">Voltar aos valores padrão</button></div>
      <div class="hint" id="cl-cfg-est" style="margin-top:6px"></div>
      <div class="hint" style="margin-top:6px">Previsão do Open-Meteo (modelos meteorológicos globais), atualizada a cada 20 minutos com a aba aberta. Pancadas de verão em MT são difíceis de prever com exatidão: em caso de dúvida, confirme no céu e no radar antes de mobilizar a equipe.</div>
    </div>`;
  const ref = $('aba-diar') || $('aba-equip') || $('aba-taxa');
  ref.parentElement.insertBefore(aba, ref.nextSibling);

  // ---------- eventos ----------
  $('cl-atual').onclick = () => buscar(true);
  $('cl-obra').onchange = e => { SEL.obra = e.target.value; SEL.dia = ''; SEL.hora = ''; guardarSel(); render(); };
  $('cl-hora').onchange = e => { SEL.hora = e.target.value; guardarSel(); render(); };
  const numCfg = (k, v) => { v = parseFloat(String(v).replace(',', '.')); if(isFinite(v)){ CFG[k] = v; salvarCfg(); render(); atualizarMapa(); } };
  $('cl-dur').onchange = e => numCfg('dur', Math.max(1, Math.round(e.target.value)));
  $('cl-cura').onchange = e => numCfg('cura', Math.max(0, Math.round(e.target.value)));
  aba.querySelectorAll('[data-c]').forEach(i => i.onchange = () => numCfg(i.dataset.c, i.value));
  $('cl-padrao').onclick = () => { CFG = Object.assign({}, PADRAO); salvarCfg(); render(); atualizarMapa(); };
  function salvarCfg(){
    try{ localStorage.setItem(KCFG, JSON.stringify(CFG)); localStorage.setItem(KPEND, '1'); }catch(e){}
    avisoCfg('Salvando para todos…');
    clearTimeout(tCfg); tCfg = setTimeout(enviarCfg, 1200);
  }

  // ---------- critérios na planilha (iguais para todos) ----------
  let tCfg = null, lidoCfg = 0, infoCfg = '', erroCfg = false;
  const temApi = () => typeof txApi === 'function';
  const quem = () => { try{ return (window.DMT_SESSAO && window.DMT_SESSAO.u) || ''; }catch(e){ return ''; } };
  const quandoBR = s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + ' às ' + s.slice(11, 16) : '';
  function avisoCfg(t, erro){ infoCfg = t; erroCfg = !!erro; const el = $('cl-cfg-est'); if(el){ el.textContent = t; el.style.color = erro ? '#b42318' : ''; } }
  const msgApi = e => /desconhecida/i.test(e && e.message || '') ? 'A planilha ainda não aceita os critérios: atualize o Apps Script (ver README). Por enquanto valem só neste computador.' : '';
  async function enviarCfg(){
    clearTimeout(tCfg);
    if(!temApi()) return avisoCfg('Sem ligação com a planilha: os critérios valem só neste computador.', true);
    try{
      await txApi({acao: 'gravarClima', cfg: CFG, usuario: quem()});
      try{ localStorage.removeItem(KPEND); }catch(e){}
      avisoCfg('Critérios salvos para toda a equipe às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + (quem() ? ' (' + quem() + ')' : '') + '.');
    }catch(e){
      const m = msgApi(e);
      avisoCfg(m || 'Sem ligação com a planilha agora. Nova tentativa em 1 minuto.', true);
      if(!m) tCfg = setTimeout(enviarCfg, 60000);
    }
  }
  async function receberCfg(){
    if(!temApi()) return;
    let pend = false; try{ pend = !!localStorage.getItem(KPEND); }catch(e){}
    if(pend) return enviarCfg(); // mudança deste computador ainda não enviada
    if(Date.now() - lidoCfg < 30000) return;
    lidoCfg = Date.now();
    try{
      const j = await txApi({acao: 'lerClima'});
      if(j.cfg){
        const novo = Object.assign({}, PADRAO, j.cfg);
        if(JSON.stringify(novo) !== JSON.stringify(CFG)){
          CFG = novo; try{ localStorage.setItem(KCFG, JSON.stringify(CFG)); }catch(e){}
          render(); atualizarMapa();
        }
        avisoCfg('Critérios da equipe' + (j.quando ? ', alterados em ' + quandoBR(j.quando) : '') + (j.usuario ? ' por ' + j.usuario : '') + '. Qualquer mudança aqui vale para todos.');
      } else avisoCfg('Usando os valores padrão. Qualquer mudança aqui vale para todos.');
    }catch(e){
      avisoCfg(msgApi(e) || 'Sem ligação com a planilha agora; usando os últimos critérios deste computador.', true);
    }
  }
  function guardarSel(){ try{ localStorage.setItem(KSEL, JSON.stringify(SEL)); }catch(e){} }

  // ---------- desenhar ----------
  function caixaSem(j, grande){
    if(!j) return '<div class="cl-sem" style="background:#f6f7f9">Sem previsão suficiente para essa janela.</div>';
    const txt = j.n === 0 ? 'Sem chuva, temperatura e umidade dentro dos limites.'
      : j.m.filter(x => x.n === j.n).slice(0, grande ? 9 : 2).map(x => h(x.txt) + (grande ? ' <small>(' + h(x.q) + ')</small>' : '')).join(grande ? '</li><li>' : '; ');
    const extra = grande && j.n > 0 && j.m.some(x => x.n < j.n) ? '<div style="margin-top:4px;font-size:11.5px">Também: ' + j.m.filter(x => x.n < j.n).slice(0, 4).map(x => h(x.txt)).join('; ') + '.</div>' : '';
    if(grande) return '<div class="cl-big" style="background:' + FUNDO[j.n] + '"><span class="ic">' + ICO[j.n] + '</span><div><b style="color:' + COR[j.n] + '">' + ROT[j.n] + '</b>'
      + 'Aplicação ' + diaBR(j.ini) + ' das ' + hh(j.ini) + ' às ' + (+j.fimApl.slice(11, 13) + 1) + 'h, cura até ' + (+j.fimCura.slice(11, 13) + 1) + 'h.'
      + (j.n === 0 ? '<div style="margin-top:4px">' + txt + '</div>' : '<ul><li>' + txt + '</li></ul>') + extra + '</div></div>';
    return '<div class="cl-sem" style="background:' + FUNDO[j.n] + '"><span>' + ICO[j.n] + '</span><div><b style="color:' + COR[j.n] + '">Micro agora: ' + ROT[j.n] + '</b>' + txt + '</div></div>';
  }

  function render(){
    if(aba.style.display === 'none') return;
    const l = obras();
    if(!SEL.obra || !l.some(o => chave(o) === SEL.obra)) SEL.obra = l.length ? chave((l.find(o => o.status === 'andamento') || l[0])) : '';
    const est = carregando ? 'Buscando previsão…' : erro ? erro
      : quando ? 'Previsão consultada às ' + new Date(quando).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '.' : '';
    if($('cl-cfg-est').textContent !== infoCfg) avisoCfg(infoCfg, erroCfg);
    $('cl-estado').textContent = est; $('cl-estado').style.color = erro ? '#b42318' : '';

    // cartões das obras
    $('cl-grade').innerHTML = l.length ? l.map(o => {
      const d = DADOS[chave(o)];
      let corpo = '<div class="mt" style="margin-top:6px">' + (carregando ? 'Carregando…' : 'Sem previsão.') + '</div>';
      if(d && d.current){
        const c = d.current, [ic, ds] = tempo(c.weather_code), i0 = idxAgora(d), H = d.hourly;
        const prox = H.precipitation_probability.slice(i0, i0 + 6).filter(v => v != null);
        const pmax = prox.length ? Math.max(...prox) : null;
        const j = avaliarJanela(H, i0), pj = j && j.n ? proximaJanela(d) : null, pa = j && j.n && !pj ? proximaJanela(d, 1) : null;
        corpo = '<div class="ag"><b>' + n0(c.temperature_2m) + ' °C</b><span>' + ic + ' ' + ds + '</span></div>'
          + '<div class="mt">Chuva nas próximas 6 h: até ' + n0(pmax) + '% · Umidade ' + n0(c.relative_humidity_2m) + '% · Vento ' + n0(c.wind_speed_10m) + ' km/h</div>'
          + caixaSem(j)
          + (j && j.n ? '<div class="mt" style="margin-top:6px">Próxima janela no expediente: ' + (pj ? '🟢 <b>' + diaBR(pj.ini) + ', ' + hh(pj.ini) + '</b>'
              : pa ? '🟡 <b>' + diaBR(pa.ini) + ', ' + hh(pa.ini) + '</b> (sem 🟢 nos próximos dias)' : 'nenhuma sem 🔴 nos próximos dias') + '</div>' : '');
      }
      return '<div class="cl-ob' + (chave(o) === SEL.obra ? ' on' : '') + '" data-k="' + h(chave(o)) + '"><div class="tt">' + h(rotulo(o)) + '<small>' + h(SIT[o.status] || '') + '</small></div>' + corpo + '</div>';
    }).join('') : '<div class="hint">Nenhuma obra com localização no mapa. Cadastre as obras na aba Obras.</div>';
    $('cl-grade').querySelectorAll('.cl-ob').forEach(el => el.onclick = () => { SEL.obra = el.dataset.k; SEL.dia = ''; SEL.hora = ''; guardarSel(); render(); });

    // detalhe
    $('cl-obra').innerHTML = l.map(o => '<option value="' + h(chave(o)) + '"' + (chave(o) === SEL.obra ? ' selected' : '') + '>' + h(rotulo(o)) + '</option>').join('');
    $('cl-dur').value = CFG.dur; $('cl-cura').value = CFG.cura;
    aba.querySelectorAll('[data-c]').forEach(i => { if(document.activeElement !== i) i.value = CFG[i.dataset.c]; });
    const d = DADOS[SEL.obra];
    if(!d || !d.daily){ $('cl-dias').innerHTML = ''; $('cl-hora').innerHTML = ''; $('cl-res').innerHTML = ''; $('cl-horas').innerHTML = ''; return; }
    const D = d.daily, H = d.hourly, i0 = idxAgora(d);
    const hojeS = (d.current.time || '').slice(0, 10);
    const dias = D.time.map((t, k) => k).filter(k => D.time[k] >= hojeS);
    if(!SEL.dia || !dias.some(k => D.time[k] === SEL.dia)) SEL.dia = hojeS;

    $('cl-dias').innerHTML = dias.map(k => {
      const [ic] = tempo(D.weather_code[k]);
      return '<div data-d="' + D.time[k] + '" class="' + (D.time[k] === SEL.dia ? 'on' : '') + '" title="Máx ' + n0(D.temperature_2m_max[k]) + ' °C, mín ' + n0(D.temperature_2m_min[k]) + ' °C, ' + n1(D.precipitation_sum[k]) + ' mm">'
        + '<b>' + (D.time[k] === hojeS ? 'Hoje' : diaBR(D.time[k]).split(' ')[0]) + '</b>' + D.time[k].slice(8, 10) + '/' + D.time[k].slice(5, 7)
        + '<span class="e">' + ic + '</span>' + n0(D.temperature_2m_max[k]) + '° / ' + n0(D.temperature_2m_min[k]) + '°<br>💧 ' + n0(D.precipitation_probability_max[k]) + '%</div>';
    }).join('');
    $('cl-dias').querySelectorAll('[data-d]').forEach(el => el.onclick = () => { SEL.dia = el.dataset.d; SEL.hora = ''; guardarSel(); render(); });

    // horas possíveis para começar no dia escolhido
    const idxDia = H.time.map((t, i) => i).filter(i => H.time[i].slice(0, 10) === SEL.dia && i >= i0 && i + CFG.dur + CFG.cura <= H.time.length);
    if(!idxDia.length){ $('cl-hora').innerHTML = ''; $('cl-res').innerHTML = '<div class="hint" style="margin:10px 0">Não sobra tempo neste dia para a janela escolhida. Escolha outro dia.</div>'; $('cl-horas').innerHTML = ''; return; }
    if(!SEL.hora || !idxDia.some(i => H.time[i] === SEL.hora)){
      const exp = idxDia.find(i => +H.time[i].slice(11, 13) >= CFG.hIni);
      const livre = idxDia.find(i => { const hr = +H.time[i].slice(11, 13); if(hr < CFG.hIni || hr > CFG.hFim) return false; const j = avaliarJanela(H, i); return j && j.n === 0; });
      SEL.hora = H.time[livre != null ? livre : (exp != null ? exp : idxDia[0])];
    }
    $('cl-hora').innerHTML = idxDia.map(i => { const j = avaliarJanela(H, i); return '<option value="' + H.time[i] + '"' + (H.time[i] === SEL.hora ? ' selected' : '') + '>' + hh(H.time[i]) + '  ' + (j ? ICO[j.n] : '') + '</option>'; }).join('');
    const iSel = H.time.indexOf(SEL.hora), jSel = avaliarJanela(H, iSel);
    $('cl-res').innerHTML = caixaSem(jSel, true);

    // tabela hora a hora do dia escolhido (06h do dia até o fim da cura)
    const iFim = Math.min(H.time.length, Math.max(iSel + CFG.dur + CFG.cura, H.time.findIndex(t => t > SEL.dia + 'T23')) );
    const iIni = Math.max(i0 - 1, H.time.findIndex(t => t.slice(0, 10) === SEL.dia));
    let linhas = '<tr><th>Hora</th><th></th><th>°C</th><th>Chuva</th><th>mm</th><th>Umid.</th><th>Vento</th><th>Fase</th></tr>';
    for(let i = iIni; i < iFim; i++){
      const fase = i >= iSel && i < iSel + CFG.dur ? 'apl' : i >= iSel + CFG.dur && i < iSel + CFG.dur + CFG.cura ? 'cura' : '';
      const a = avaliarHora(H, i, fase || 'apl'), [ic] = tempo(H.weather_code[i]);
      linhas += '<tr data-i="' + i + '" class="' + (fase ? 'jan' : '') + '" style="cursor:pointer;background:' + (a.n ? FUNDO[a.n] : '') + '" title="' + h(a.m.map(x => x[1]).join('; ') || 'Dentro dos limites') + '">'
        + '<td>' + (H.time[i].slice(0, 10) !== SEL.dia ? diaBR(H.time[i]).split(' ')[0] + ' ' : '') + hh(H.time[i]) + '</td><td>' + ic + '</td>'
        + '<td>' + n0(H.temperature_2m[i]) + '</td><td>' + n0(H.precipitation_probability[i]) + '%</td><td>' + n1(H.precipitation[i]) + '</td>'
        + '<td>' + n0(H.relative_humidity_2m[i]) + '%</td><td>' + n0(H.wind_speed_10m[i]) + '</td>'
        + '<td><span class="bol" style="background:' + COR[a.n] + '"></span> ' + (fase === 'apl' ? 'aplicação' : fase === 'cura' ? 'cura' : '') + '</td></tr>';
    }
    $('cl-horas').innerHTML = linhas;
    $('cl-horas').querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => {
      const i = +tr.dataset.i;
      if(i < i0 || i + CFG.dur + CFG.cura > H.time.length) return;
      SEL.hora = H.time[i]; SEL.dia = H.time[i].slice(0, 10); guardarSel(); render();
    });
  }

  // ---------- mapa: linha de clima na dica da obra ----------
  function linhaClima(c){
    const o = (st.obras || []).find(x => x.codigo && typeof c === 'string' && String(x.codigo).toUpperCase() === c.toUpperCase());
    const d = o && DADOS[chave(o)];
    if(!d || !d.current) return '';
    const j = avaliarJanela(d.hourly, idxAgora(d)), [ic] = tempo(d.current.weather_code);
    return '<br><span style="font-weight:600">' + ic + ' ' + n0(d.current.temperature_2m) + ' °C</span> <small style="color:#66706a">· micro agora: ' + (j ? ICO[j.n] + ' ' + ROT[j.n] : '—') + '</small>';
  }
  if(typeof window.linhaEquipe === 'function'){
    const orig = window.linhaEquipe;
    window.linhaEquipe = function(c){ return orig.apply(this, arguments) + linhaClima(c); };
  }
  function atualizarMapa(){ try{ if(typeof desenharObras === 'function') desenharObras(); }catch(e){} }

  // ---------- troca de aba ----------
  const trocarOrig = window.trocarAba;
  window.trocarAba = function(a){
    trocarOrig.apply(this, arguments);
    aba.style.display = a === 'clima' ? '' : 'none';
    btn.classList.toggle('on', a === 'clima');
    if(a === 'clima'){ render(); buscar(); receberCfg(); }
  };
  document.addEventListener('visibilitychange', () => { if(!document.hidden){ buscar(); receberCfg(); } });
  setInterval(() => { if(!document.hidden) buscar(); }, 20 * 60000);

  // espera as obras carregarem e busca a previsão (serve também para a dica no mapa)
  const inicio = Date.now();
  (function esperar(){
    if((st.obras && st.obras.length) || Date.now() - inicio > 8000){ receberCfg().finally(buscar); }
    else setTimeout(esperar, 400);
  })();
  try{ if(ls.get('aba') === 'clima') trocarAba('clima'); }catch(e){}
  window.G360Clima = {buscar, render, receberCfg, enviarCfg, cfg: () => CFG, dados: () => DADOS, avaliarJanela};
})();
