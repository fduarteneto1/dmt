// Rotas alternativas na "Rota até a obra" (clique na obra + na pedreira/distribuidora) do Gestão 360º BKP.
// Carregado por index.html depois do app, como clima.js e equipamentos.js. Não guarda nada secreto.
// - "Ver rotas alternativas": pede ao roteador (Valhalla/OpenStreetMap) outras rotas e uma rota que
//   evita estrada de chão, e mostra km, asfalto, chão e tempo de cada uma para escolher.
// - "Passar por um ponto": clique no mapa num lugar por onde a rota deve passar (ex.: uma cidade ou
//   um trevo numa rodovia asfaltada). Dá para marcar mais de um ponto.
// A rota escolhida é a que aparece no mapa e a que vai para "Usar no cálculo de DMT".
(function(){
  const precisa = ['rr', 'rrRender', 'rrCalcular', 'rrLimparLinha', 'camadaRota', 'decodificar', 'buscar', 'classe', 'distReta', 'map', 'L'];
  try{ if(precisa.some(n => eval('typeof ' + n) === 'undefined')) return; }catch(e){ return; }

  const V = 'https://valhalla1.openstreetmap.de';
  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const f1 = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const dur = sg => { const m = Math.round(sg / 60), hh = Math.floor(m / 60); return hh ? `${hh} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
  const sinal = (v, un) => (v > 0 ? '+' : v < 0 ? '−' : '±') + f1(Math.abs(v)) + (un || '');

  // ALT[chave] = {lista:[rotas], sel: índice, via:[{lat,lng}], status:'busca'|'ok'|'erro', msg}
  const ALT = {};
  let camadaAlt = null, marcasVia = null, marcando = false;
  const chave = () => rr.obra && rr.ponto ? `${rr.ponto.lat},${rr.ponto.lng}|${rr.obra.lat},${rr.obra.lng}` : null;

  // ---------- consultas (o servidor público aceita 1 por segundo) ----------
  let ultima = 0;
  async function vez(){ const esp = ultima + 1150 - Date.now(); if(esp > 0) await new Promise(r => setTimeout(r, esp)); ultima = Date.now(); }
  async function valhalla(servico, corpo){ await vez(); return buscar(V + '/' + servico, {method:'POST', body: JSON.stringify(corpo)}, 25000); }

  // junta os trechos (um por ponto de passagem) num traçado só; base = onde cada trecho começa no traçado
  function trajeto(trip){
    const coords = [], legs = [];
    trip.legs.forEach((l, i) => {
      const c = decodificar(l.shape);
      legs.push({enc: l.shape, base: i ? coords.length - 1 : 0});
      coords.push(...(i ? c.slice(1) : c));
    });
    return {km: trip.summary.length, tempo: trip.summary.time, coords, legs};
  }

  // mesma separação asfalto/chão do app (etiquetas do OpenStreetMap; sem elas, a estimativa do roteador)
  async function superficie(t){
    const edges = [];
    for(const l of t.legs){
      const ta = await valhalla('trace_attributes', {encoded_polyline: l.enc, costing:'auto', shape_match:'edge_walk',
        filters:{attributes:['edge.surface','edge.length','edge.way_id','edge.begin_shape_index','edge.end_shape_index'], action:'include'}});
      ta.edges.forEach(e => edges.push(Object.assign({}, e, {begin_shape_index: e.begin_shape_index + l.base, end_shape_index: e.end_shape_index + l.base})));
    }
    let tags = new Map();
    try{
      const ids = [...new Set(edges.map(e => e.way_id))];
      for(let i = 0; i < ids.length; i += 1500){
        const j = await buscar('https://overpass-api.de/api/interpreter', {method:'POST',
          body: 'data=' + encodeURIComponent(`[out:json][timeout:25];way(id:${ids.slice(i, i + 1500).join(',')});out tags;`)}, 25000);
        j.elements.forEach(w => tags.set(w.id, w.tags));
      }
    }catch(e){ tags = null; }
    const tot = {pav: 0, chao: 0, inc: 0}, trechos = [];
    edges.forEach(e => {
      const c = classe(tags ? (tags.get(e.way_id) || {}) : null, e);
      tot[c] += e.length;
      trechos.push({c, i0: e.begin_shape_index, i1: e.end_shape_index});
    });
    return {pav: tot.pav, chao: tot.chao, inc: tot.inc, trechos, fonte: tags ? 'osm' : 'roteador'};
  }

  async function completar(t, nome){
    let sup = null;
    try{ sup = await superficie(t); }catch(e){}
    return {km: t.km, tempo: t.tempo, geo: {type:'LineString', coordinates: t.coords}, sup, nome};
  }

  // duas rotas são "a mesma" se a distância e o tempo praticamente coincidem
  const igual = (a, b) => Math.abs(a.km - b.km) < Math.max(0.3, a.km * 0.004) && Math.abs((a.tempo || 0) - (b.tempo || 0)) < Math.max(60, (a.tempo || 0) * 0.01);

  // ---------- buscar alternativas ----------
  async function buscarAlternativas(){
    const k = chave(), p = rr.ponto, o = rr.obra, base = rr.rota;
    if(!k || !base || base.reta) return;
    const A = ALT[k] = ALT[k] || {lista: [Object.assign({}, base, {nome: base.nome || 'Rota proposta'})], sel: 0, via: []};
    A.status = 'busca'; A.buscou = true; A.msg = 'Pedindo rotas ao OpenStreetMap…'; rrRender();
    const locs = [{lat: p.lat, lon: p.lng}, {lat: o.lat, lon: o.lng}];
    const novas = [];
    try{
      const r1 = await valhalla('route', {locations: locs, costing: 'auto', alternates: 2});
      [r1.trip, ...(r1.alternates || []).map(x => x.trip)].forEach(tr => novas.push({t: trajeto(tr), nome: 'Alternativa'}));
    }catch(e){}
    try{
      const r2 = await valhalla('route', {locations: locs, costing: 'auto', costing_options: {auto: {exclude_unpaved: true}}});
      novas.push({t: trajeto(r2.trip), nome: 'Evitando estrada de chão'});
    }catch(e){}
    if(ALT[k] !== A) return;
    const faltam = [];
    novas.forEach(n => {
      const ja = A.lista.find(x => igual(x, n.t)) || faltam.find(x => igual(x.t, n.t));
      if(!ja) faltam.push(n);
      else if(n.nome !== 'Alternativa' && ja.nome && !/chão/.test(ja.nome)) ja.obs = 'já evita o chão que dá para evitar';
    });
    for(let i = 0; i < faltam.length; i++){
      if(ALT[k] !== A) return;
      A.msg = `Lendo o tipo de pavimento da rota ${i + 1} de ${faltam.length}…`; if(chave() === k) rrRender();
      A.lista.push(await completar(faltam[i].t, faltam[i].nome));
    }
    let n = 1; A.lista.forEach((x, i) => { if(i && x.nome === 'Alternativa') x.nome = 'Alternativa ' + (n++); });
    A.status = 'ok';
    A.msg = faltam.length ? '' : 'O roteador não encontrou outra rota diferente. Use "Passar por um ponto" para indicar o caminho.';
    if(chave() === k) desenhar(true);
  }

  async function rotaPorPontos(){
    const k = chave(), p = rr.ponto, o = rr.obra, A = ALT[k];
    if(!A || !A.via.length) return;
    A.status = 'busca'; A.msg = 'Calculando a rota pelos pontos marcados…'; rrRender();
    try{
      const locs = [{lat: p.lat, lon: p.lng}, ...A.via.map(v => ({lat: v.lat, lon: v.lng})), {lat: o.lat, lon: o.lng}];
      const r = await valhalla('route', {locations: locs, costing: 'auto'});
      if(ALT[k] !== A) return;
      A.msg = 'Lendo o tipo de pavimento…'; rrRender();
      const nova = await completar(trajeto(r.trip), 'Pelo(s) ponto(s) marcado(s)');
      nova.via = true;
      A.lista = A.lista.filter(x => !x.via);
      A.lista.push(nova); A.sel = A.lista.length - 1; A.status = 'ok'; A.msg = '';
    }catch(e){
      A.status = 'ok'; A.msg = 'Não foi possível passar por esse ponto. Marque um lugar em cima de uma estrada.';
    }
    if(chave() === k) escolher(A.sel);
  }

  // ---------- escolher e desenhar ----------
  function escolher(i){
    const k = chave(), A = ALT[k]; if(!A || !A.lista[i]) return;
    A.sel = i; rr.rota = A.lista[i]; rr.cache[k] = A.lista[i]; // vale também se fechar e abrir de novo
    desenhar(true);
  }

  function desenhar(enquadrar){
    const k = chave(), A = k && ALT[k];
    if(rr.linha){ rr.linha.remove(); rr.linha = null; }
    tirarCamadas();
    if(A && rr.rota && rr.status === 'ok'){
      camadaAlt = L.featureGroup(A.lista.map((x, i) => i === A.sel || !x.geo ? null :
        L.polyline(x.geo.coordinates.map(c => [c[1], c[0]]), {color: '#6b7078', weight: 6, opacity: .45, dashArray: '8 6'})
          .bindTooltip(`${h(x.nome)}: ${f1(x.km)} km${x.sup ? ' · chão ' + f1(x.sup.chao) + ' km' : ''} — clique para escolher`, {sticky: true})
          .on('click', ev => { L.DomEvent.stop(ev); escolher(i); })).filter(Boolean)).addTo(map);
      rr.linha = camadaRota(rr.rota, rr.ponto, rr.obra).addTo(map);
      if(enquadrar) enquadra(camadaAlt.getLayers().length ? camadaAlt.getBounds().extend(rr.linha.getBounds()) : rr.linha.getBounds());
    }else if(rr.rota && rr.status === 'ok'){
      rr.linha = camadaRota(rr.rota, rr.ponto, rr.obra).addTo(map);
    }
    if(A && A.via.length){
      marcasVia = L.featureGroup(A.via.map((v, i) => L.marker([v.lat, v.lng], {icon: L.divIcon({className: '', iconSize: [20, 20], iconAnchor: [10, 10],
        html: `<div style="width:20px;height:20px;border-radius:50%;background:#1F1F1F;color:#fff;border:2px solid #facc15;font:700 11px/16px sans-serif;text-align:center">${i + 1}</div>`})})
        .bindTooltip('Ponto de passagem ' + (i + 1) + ' — clique para remover')
        .on('click', ev => { L.DomEvent.stop(ev); A.via.splice(i, 1); A.via.length ? rotaPorPontos() : limparPontos(); }))).addTo(map);
    }
    rrRender();
  }

  // enquadra a rota sem deixá-la atrás da caixa "Rota até a obra" (canto superior direito do mapa)
  function enquadra(b){
    const box = $('rr'), W = map.getSize().x, w = box && box.offsetWidth ? Math.min(box.offsetWidth + 30, W * 0.5) : 40;
    map.fitBounds(b, {paddingTopLeft: [40, 40], paddingBottomRight: [w, 40]});
  }

  function tirarCamadas(){
    if(camadaAlt){ camadaAlt.remove(); camadaAlt = null; }
    if(marcasVia){ marcasVia.remove(); marcasVia = null; }
  }

  function limparPontos(){
    const k = chave(), A = ALT[k]; if(!A) return;
    A.via = []; A.lista = A.lista.filter(x => !x.via);
    if(A.sel >= A.lista.length) A.sel = 0;
    escolher(A.sel);
  }

  // ---------- marcar ponto de passagem no mapa ----------
  function marcar(liga){
    marcando = liga;
    map.getContainer().style.cursor = liga ? 'crosshair' : '';
    rrRender();
  }
  map.on('click', e => {
    if(!marcando) return;
    const k = chave(); if(!k){ marcar(false); return; }
    const A = ALT[k] = ALT[k] || {lista: [Object.assign({}, rr.rota, {nome: rr.rota.nome || 'Rota proposta'})], sel: 0, via: [], status: 'ok'};
    const v = {lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5)};
    // encaixa o ponto onde ele menos alonga o caminho (origem → pontos → obra)
    const seq = [rr.ponto, ...A.via, rr.obra];
    let melhor = 0, menor = Infinity;
    for(let i = 0; i < seq.length - 1; i++){
      const extra = distReta(seq[i], v) + distReta(v, seq[i + 1]) - distReta(seq[i], seq[i + 1]);
      if(extra < menor){ menor = extra; melhor = i; }
    }
    A.via.splice(melhor, 0, v);
    marcar(false);
    rotaPorPontos();
  });
  window.addEventListener('keydown', e => { if(e.key === 'Escape' && marcando){ e.stopImmediatePropagation(); e.preventDefault(); marcar(false); } }, true);

  // ---------- quadro na caixa "Rota até a obra" ----------
  function quadro(){
    const k = chave(), r = rr.rota;
    if(!k || rr.status !== 'ok' || !r || r.reta) return '';
    const A = ALT[k];
    const bt = (id, txt, tit) => `<button class="mini" id="${id}" title="${h(tit || '')}">${txt}</button>`;
    let html = '<div id="rr-alt" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line,#e5e5e5)">';
    if(!A || (A.lista.length < 2 && A.status !== 'busca' && !A.msg && !A.via.length)){
      html += `<div class="btns" style="flex-wrap:wrap;gap:6px">${bt('rra-ver', '🔀 Ver rotas alternativas', 'Outras rotas e uma que evita estrada de chão')}${bt('rra-via', '📍 Passar por um ponto', 'Clique no mapa por onde a rota deve passar')}</div>`;
    }else{
      const prop = A.lista[0];
      html += '<div style="font-weight:600;font-size:12.5px;margin-bottom:4px">Rotas — clique para escolher</div>';
      const minChao = Math.min(...A.lista.map(x => x.sup ? x.sup.chao : Infinity)), minKm = Math.min(...A.lista.map(x => x.km));
      A.lista.forEach((x, i) => {
        const sel = i === A.sel, ch = x.sup ? x.sup.chao : null;
        const tags = [];
        if(A.lista.length > 1 && x.km === minKm) tags.push('mais curta');
        if(A.lista.length > 1 && ch != null && ch === minChao && minChao < (prop.sup ? prop.sup.chao : Infinity) - 0.5) tags.push('menos chão');
        const dif = i && prop ? `<div style="font-size:11px;color:var(--ink3,#6b7078)">vs. proposta: ${sinal(x.km - prop.km, ' km')}${ch != null && prop.sup ? ' · chão ' + sinal(ch - prop.sup.chao, ' km') : ''}${x.tempo && prop.tempo ? ' · ' + (x.tempo >= prop.tempo ? '+' : '−') + dur(Math.abs(x.tempo - prop.tempo)) : ''}</div>` : '';
        html += `<div class="rra-op" data-i="${i}" style="cursor:pointer;border:1px solid ${sel ? '#1F1F1F' : 'var(--line,#e5e5e5)'};background:${sel ? '#f4f4f2' : '#fff'};border-radius:8px;padding:6px 8px;margin:4px 0">
          <div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline"><span>${sel ? '●' : '○'} <b>${h(x.nome)}</b>${tags.map(t => ` <small style="background:#e8f5ec;color:#1f6b45;border-radius:4px;padding:0 4px">${t}</small>`).join('')}</span><b style="white-space:nowrap">${f1(x.km)} km</b></div>
          <div style="font-size:11.5px"><span style="color:#1f6b45">asfalto ${x.sup ? f1(x.sup.pav) : '—'}</span> · <span style="color:#a0522d">chão ${ch != null ? f1(ch) : '—'}</span>${x.sup && x.sup.inc > 0.05 ? ` · <span style="color:#6b7078">s/ info ${f1(x.sup.inc)}</span>` : ''}${x.tempo ? ' · ' + dur(x.tempo) : ''}</div>
          ${x.obs ? `<div style="font-size:11px;color:var(--ink3,#6b7078)">${h(x.obs)}</div>` : ''}${dif}</div>`;
      });
      if(A.status === 'busca') html += `<div class="hint">${h(A.msg)}</div>`;
      else if(A.msg) html += `<div class="hint" style="color:#9a5b00">${h(A.msg)}</div>`;
      html += `<div class="btns" style="flex-wrap:wrap;gap:6px;margin-top:4px">${A.status !== 'busca' && !A.buscou ? bt('rra-ver', '🔀 Buscar mais rotas') : ''}${bt('rra-via', A.via.length ? '📍 Marcar outro ponto' : '📍 Passar por um ponto', 'Clique no mapa por onde a rota deve passar')}${A.via.length ? bt('rra-limpa', 'Limpar pontos') : ''}</div>`;
    }
    if(marcando) html += '<div class="hint" style="color:#9a5b00;font-weight:600">Clique no mapa num ponto da estrada por onde a rota deve passar (Esc cancela).</div>';
    else if(A && A.via.length) html += '<div class="hint" style="font-size:11px">Clique no número no mapa para tirar um ponto.</div>';
    return html + '</div>';
  }

  const renderOrig = window.rrRender;
  window.rrRender = function(){
    renderOrig.apply(this, arguments);
    const box = $('rr'); if(!box || box.style.display === 'none') return;
    const q = quadro(); if(!q) return;
    const usar = $('rr-usar'), alvo = usar ? usar.closest('.btns') : null;
    if(alvo) alvo.insertAdjacentHTML('beforebegin', q); else box.insertAdjacentHTML('beforeend', q);
    const ver = $('rra-ver'); if(ver) ver.onclick = () => buscarAlternativas();
    const via = $('rra-via'); if(via) via.onclick = () => marcar(!marcando);
    const lp = $('rra-limpa'); if(lp) lp.onclick = limparPontos;
    box.querySelectorAll('.rra-op').forEach(el => el.onclick = () => escolher(+el.dataset.i));
  };

  // ao recalcular, fechar ou trocar de obra/origem, some com as linhas alternativas e o modo de marcar
  const limparOrig = window.rrLimparLinha;
  window.rrLimparLinha = function(){ tirarCamadas(); if(marcando){ marcando = false; map.getContainer().style.cursor = ''; } return limparOrig.apply(this, arguments); };

  // ao voltar para um par obra/origem já visto, redesenha as alternativas
  const calcOrig = window.rrCalcular;
  window.rrCalcular = async function(){
    await calcOrig.apply(this, arguments);
    const k = chave(); if(k && ALT[k] && rr.status === 'ok') desenhar();
  };

  window.G360Rotas = {buscarAlternativas, escolher, alternativas: () => ALT};
})();
