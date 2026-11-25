// Pedágios no mapa e no custo da rota (Gestão 360º BKP).
// Carregado por index.html depois de rotas.js. Não guarda nada secreto: as tarifas são públicas.
// - Mostra as praças de pedágio de MT no mapa (botão "Pedágios" abaixo do zoom liga/desliga).
// - Na caixa "Rota até a obra", lista as praças por onde a rota passa e calcula o pedágio da viagem
//   (ida carregada + volta vazia, por número de eixos) e quanto isso dá por tonelada transportada.
// - Nas rotas alternativas (rotas.js), cada opção mostra o pedágio dela.
//
// ATUALIZAR TARIFAS: altere "auto" e "eixo" na lista PRACAS abaixo e a data em ATUALIZADO.
// "auto" = carro (categoria 1); "eixo" = valor por eixo de veículo comercial.
(function(){
  const precisa = ['rr', 'rrRender', 'map', 'L'];
  try{ if(precisa.some(n => eval('typeof ' + n) === 'undefined')) return; }catch(e){ return; }

  const ATUALIZADO = 'nov/2026';
  // Fontes: novarotadooeste.com.br (tarifas desde 27/09/2025); ANTT/Rota Agro MT-GO (desde 07/09/2026);
  // AGER-MT, tabela de concessões estaduais (dez/2025) e reajuste da MT-246 (01/09/2026).
  // Localização: OpenStreetMap; "aprox" = posição calculada pelo km da rodovia (conferir no mapa).
  const PRACAS = [
    // BR-163/364 – Nova Rota do Oeste (federal; mesmo valor por eixo)
    {id:'nro1', nome:'Itiquira',                  rod:'BR-163 km 33,6',  conc:'Nova Rota do Oeste', lat:-17.2194, lng:-54.7586, auto:6.60,  eixo:6.60},
    {id:'nro2', nome:'Rondonópolis',              rod:'BR-364 km 214,4', conc:'Nova Rota do Oeste', lat:-16.3936, lng:-54.7141, auto:7.50,  eixo:7.50},
    {id:'nro3', nome:'Campo Verde',               rod:'BR-364 km 316,5', conc:'Nova Rota do Oeste', lat:-15.8122, lng:-55.3094, auto:6.00,  eixo:6.00},
    {id:'nro4', nome:'Santo Antônio de Leverger', rod:'BR-364 km 383,1', conc:'Nova Rota do Oeste', lat:-15.7020, lng:-55.8295, auto:6.00,  eixo:6.00},
    {id:'nro5', nome:'Jangada',                   rod:'BR-364 km 479,1', conc:'Nova Rota do Oeste', lat:-15.3499, lng:-56.4156, auto:8.10,  eixo:8.10},
    {id:'nro6', nome:'Diamantino',                rod:'BR-364 km 579,1', conc:'Nova Rota do Oeste', lat:-14.5996, lng:-56.2409, auto:6.70,  eixo:6.70},
    {id:'nro7', nome:'Nova Mutum',                rod:'BR-163 km 586,9', conc:'Nova Rota do Oeste', lat:-13.9195, lng:-56.0933, auto:5.40,  eixo:5.40},
    {id:'nro8', nome:'Lucas do Rio Verde',        rod:'BR-163 km 664,4', conc:'Nova Rota do Oeste', lat:-13.2660, lng:-56.0227, auto:7.10,  eixo:7.10},
    {id:'nro9', nome:'Sorriso',                   rod:'BR-163 km 766,7', conc:'Nova Rota do Oeste', lat:-12.4417, lng:-55.6537, auto:10.40, eixo:10.40},
    // BR-364 – Rota Agro MT-GO (free flow: pórtico, sem cabine; pagar por tag ou em até 30 dias)
    {id:'ra4', nome:'Alto Garças (free flow)',    rod:'BR-364 km 51,6',  conc:'Rota Agro MT-GO', lat:-16.9940, lng:-53.5058, auto:14.20, eixo:14.20, aprox:true, freeflow:true},
    {id:'ra5', nome:'Pedra Preta (free flow)',    rod:'BR-364 km 106,1', conc:'Rota Agro MT-GO', lat:-16.8472, lng:-53.9306, auto:17.80, eixo:17.80, aprox:true, freeflow:true},
    // Rodovias estaduais concedidas (AGER-MT)
    {id:'mud1', nome:'Rodovia da Mudança',        rod:'MT-449/MT-010',   conc:'Rodovia da Mudança', lat:-12.9684, lng:-55.9754, auto:11.50, eixo:11.50},
    {id:'int1', nome:'Intervias',                 rod:'MT-242',          conc:'Intervias',          lat:-12.6142, lng:-55.6364, auto:14.70, eixo:14.70},
    {id:'apa1', nome:'APASI',                     rod:'MT-242/MT-491',   conc:'APASI',              lat:-12.4843, lng:-55.7639, auto:14.10, eixo:14.10},
    {id:'sps1', nome:'SPS',                       rod:'MT-235',          conc:'SPS',                lat:-13.8128, lng:-56.0391, auto:14.00, eixo:14.00},
    {id:'mme1', nome:'Morro da Mesa (Rondonópolis)', rod:'MT-130',       conc:'Morro da Mesa',      lat:-16.3499, lng:-54.5814, auto:11.20, eixo:11.20},
    {id:'mme2', nome:'Morro da Mesa (Primavera)', rod:'MT-130',          conc:'Morro da Mesa',      lat:-15.5841, lng:-54.3919, auto:11.20, eixo:11.20},
    {id:'rgr1', nome:'Rota dos Grãos (sul)',      rod:'MT-130',          conc:'Rota dos Grãos',     lat:-15.2247, lng:-54.1278, auto:10.90, eixo:10.90},
    {id:'rgr2', nome:'Rota dos Grãos (norte)',    rod:'MT-130',          conc:'Rota dos Grãos',     lat:-14.5937, lng:-54.0094, auto:10.90, eixo:10.90},
    {id:'mt100a', nome:'Via Brasil MT-100 (Alto Taquari)', rod:'MT-100', conc:'Via Brasil MT-100',  lat:-17.9587, lng:-53.2139, auto:11.70, eixo:11.70},
    {id:'mt100b', nome:'Via Brasil MT-100 (Alto Araguaia)', rod:'MT-100', conc:'Via Brasil MT-100', lat:-17.3800, lng:-53.2380, auto:11.70, eixo:11.70},
    {id:'mt246a', nome:'Via Brasil MT-246 (Jangada)', rod:'MT-246 km 22', conc:'Via Brasil MT-246', lat:-15.1421, lng:-56.7174, auto:11.40, eixo:11.40, aprox:true},
    {id:'mt246b', nome:'Via Brasil MT-358 (Tangará)', rod:'MT-358',      conc:'Via Brasil MT-246',  lat:-14.6642, lng:-57.3235, auto:11.40, eixo:11.40},
    {id:'mt246c', nome:'Via Brasil MT-358 (oeste de Tangará)', rod:'MT-358', conc:'Via Brasil MT-246', lat:-14.5020, lng:-57.9178, auto:11.40, eixo:11.40},
    {id:'mt320a', nome:'Via Brasil MT-320 (Nova Santa Helena)', rod:'MT-320', conc:'Via Brasil MT-320', lat:-10.8051, lng:-55.3248, auto:11.70, eixo:11.70},
    {id:'mt320b', nome:'Via Brasil MT-320 (Colíder/Carlinda)', rod:'MT-320', conc:'Via Brasil MT-320', lat:-10.4519, lng:-55.7310, auto:11.70, eixo:11.70},
    {id:'mt208a', nome:'Via Brasil MT-208 (Alta Floresta)', rod:'MT-208', conc:'Via Brasil MT-320', lat:-9.9232, lng:-55.9708, auto:11.70, eixo:11.70},
    {id:'vns1', nome:'Via Norte Sul',             rod:'MT-220',          conc:'Via Norte Sul',      lat:-11.5265, lng:-56.6523, auto:10.80, eixo:10.80}
  ];
  window.G360Pedagios = {PRACAS, ATUALIZADO};

  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const R$ = v => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const R$4 = v => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits: 4, maximumFractionDigits: 4});

  // ---------- configuração (fica salva neste navegador) ----------
  const CHAVE = 'g360-pedagio-v1';
  const PADRAO = {eixos: 6, carga: 32, volta: true, susp: 0, mapa: true};
  let CFG = Object.assign({}, PADRAO);
  try{ Object.assign(CFG, JSON.parse(localStorage.getItem(CHAVE) || '{}')); }catch(e){}
  const salvar = () => { try{ localStorage.setItem(CHAVE, JSON.stringify(CFG)); }catch(e){} };
  const VEICULOS = [[2, 'Toco (2 eixos)'], [3, 'Truck (3 eixos)'], [4, 'Carreta 4 eixos'], [5, 'Carreta 5 eixos'],
    [6, 'Carreta 6 eixos (LS)'], [7, 'Bitrem 7 eixos'], [9, 'Rodotrem 9 eixos']];

  // ---------- praças na rota ----------
  // distância (km) do ponto p até o segmento a-b, com coordenadas [lon, lat]
  function distSeg(p, a, b){
    const kx = 111.32 * Math.cos(p[1] * Math.PI / 180), ky = 110.57;
    const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + dx * t, ay + dy * t);
  }
  const LIMITE_KM = 0.35; // a rota tem que passar a menos de 350 m da praça
  const memo = new WeakMap();
  function pracasNaRota(rota){
    const c = rota && rota.geo && rota.geo.coordinates;
    if(!c || c.length < 2) return [];
    if(memo.has(rota)) return memo.get(rota);
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    c.forEach(([x, y]) => { if(x < minX) minX = x; if(x > maxX) maxX = x; if(y < minY) minY = y; if(y > maxY) maxY = y; });
    const achadas = [];
    PRACAS.forEach(pr => {
      if(pr.lng < minX - 0.01 || pr.lng > maxX + 0.01 || pr.lat < minY - 0.01 || pr.lat > maxY + 0.01) return;
      const p = [pr.lng, pr.lat];
      // praça colada na origem ou no destino (ex.: pedreira ao lado da praça): não dá para saber se passa por ela
      if(distSeg(p, c[0], c[0]) < 0.6 || distSeg(p, c[c.length - 1], c[c.length - 1]) < 0.6) return;
      let melhor = Infinity, idx = -1;
      for(let i = 1; i < c.length; i++){
        const a = c[i - 1], b = c[i];
        if(Math.abs(a[0] - p[0]) > 0.05 && Math.abs(b[0] - p[0]) > 0.05 && Math.sign(a[0] - p[0]) === Math.sign(b[0] - p[0])) continue;
        if(Math.abs(a[1] - p[1]) > 0.05 && Math.abs(b[1] - p[1]) > 0.05 && Math.sign(a[1] - p[1]) === Math.sign(b[1] - p[1])) continue;
        const d = distSeg(p, a, b);
        if(d < melhor){ melhor = d; idx = i; }
      }
      if(melhor <= LIMITE_KM) achadas.push(Object.assign({}, pr, {ordem: idx}));
    });
    achadas.sort((a, b) => a.ordem - b.ordem);
    memo.set(rota, achadas);
    return achadas;
  }

  // custo do pedágio de uma viagem com a configuração atual
  function custo(pracas){
    const eixos = +CFG.eixos || 2, susp = Math.min(+CFG.susp || 0, eixos - 2);
    const somaEixo = pracas.reduce((s, p) => s + p.eixo, 0);
    const ida = somaEixo * eixos;
    const volta = CFG.volta ? somaEixo * (eixos - susp) : 0;
    const total = ida + volta, carga = +CFG.carga || 0;
    return {ida, volta, total, porT: carga > 0 ? total / carga : null, eixos, susp};
  }
  window.G360Pedagios.naRota = pracasNaRota;
  window.G360Pedagios.custo = r => custo(pracasNaRota(r));

  // ---------- camada no mapa ----------
  const icone = pr => L.divIcon({className: '', iconSize: [18, 18], iconAnchor: [9, 9],
    html: `<div style="width:16px;height:16px;border-radius:4px;transform:rotate(45deg);background:${pr.freeflow ? '#7c3aed' : '#d97706'};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"><div style="transform:rotate(-45deg);color:#fff;font:700 10px/12px sans-serif;text-align:center">$</div></div>`});
  const dica = pr => `<b>Pedágio – ${h(pr.nome)}</b><br>${h(pr.rod)} · ${h(pr.conc)}<br>Carro: ${R$(pr.auto)} · por eixo: ${R$(pr.eixo)}` +
    (pr.freeflow ? '<br><i>Free flow (sem cabine): pagar por tag ou no site em até 30 dias</i>' : '') +
    (pr.aprox ? '<br><i>Posição aproximada (pelo km da rodovia)</i>' : '') + `<br><small>Tarifas de ${ATUALIZADO}</small>`;
  const camada = L.layerGroup(PRACAS.map(pr => L.marker([pr.lat, pr.lng], {icon: icone(pr), zIndexOffset: -200}).bindTooltip(dica(pr))));
  if(CFG.mapa) camada.addTo(map);

  const Botao = L.Control.extend({options: {position: 'topleft'}, onAdd(){
    const d = L.DomUtil.create('div', 'leaflet-bar');
    d.innerHTML = `<a href="#" id="ped-tog" title="Mostrar/ocultar praças de pedágio" style="width:auto;padding:0 7px;font:600 12px/30px sans-serif;white-space:nowrap">$ Pedágios</a>`;
    L.DomEvent.disableClickPropagation(d);
    const a = d.firstChild;
    const pinta = () => { a.style.background = CFG.mapa ? '#fde68a' : ''; };
    pinta();
    L.DomEvent.on(a, 'click', ev => { L.DomEvent.preventDefault(ev); CFG.mapa = !CFG.mapa; salvar();
      CFG.mapa ? camada.addTo(map) : camada.remove(); pinta(); });
    return d;
  }});
  new Botao().addTo(map);

  // ---------- quadro na caixa "Rota até a obra" ----------
  let aberto = false;
  function quadro(){
    const r = rr.rota;
    if(!rr.obra || !rr.ponto || rr.status !== 'ok' || !r || r.reta) return '';
    const ps = pracasNaRota(r);
    let html = '<div id="ped-box" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line,#e5e5e5);font-size:12.5px">';
    if(!ps.length){
      return html + '<div><b>Pedágio:</b> <span style="color:#1f6b45">nenhuma praça nesta rota</span></div></div>';
    }
    const k = custo(ps);
    const ops = VEICULOS.map(([n, t]) => `<option value="${n}"${n === +CFG.eixos ? ' selected' : ''}>${t}</option>`).join('');
    html += `<div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline">
      <span><b>Pedágio</b> · ${ps.length} praça${ps.length > 1 ? 's' : ''}</span>
      <b style="white-space:nowrap">${R$(k.total)}/viagem</b></div>
      <div style="font-size:11.5px;color:var(--ink3,#6b7078)">ida ${R$(k.ida)}${CFG.volta ? ' + volta ' + R$(k.volta) : ''} · ${k.eixos} eixos${k.porT != null ? ` · <b style="color:inherit">${R$(k.porT)}/t</b>` : ''}${k.porT != null && r.km ? ` (${R$4(k.porT / r.km)}/t·km)` : ''}</div>
      <div style="margin:4px 0">${ps.map(p => `<span title="${h(p.rod + ' · ' + p.conc)}" style="display:inline-block;background:${p.freeflow ? '#ede9fe' : '#fef3c7'};border-radius:4px;padding:0 5px;margin:2px 3px 0 0;font-size:11px">${h(p.nome)} ${R$(p.eixo)}/eixo</span>`).join('')}</div>
      <a href="#" id="ped-cfg" style="font-size:11.5px">${aberto ? '▾' : '▸'} Veículo e carga</a>`;
    if(aberto){
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;font-size:11.5px">
        <label style="text-transform:none;letter-spacing:0;font-weight:500;font-size:11.5px;color:inherit">Veículo<select id="ped-eixos" style="width:100%">${ops}</select></label>
        <label style="text-transform:none;letter-spacing:0;font-weight:500;font-size:11.5px;color:inherit">Carga por viagem (t)<input id="ped-carga" type="number" min="0" step="0.5" value="${h(CFG.carga)}" style="width:100%"></label>
        <label style="text-transform:none;letter-spacing:0;font-weight:500;font-size:11.5px;color:inherit;display:flex;gap:4px;align-items:center"><input id="ped-volta" style="width:auto;margin:0" type="checkbox"${CFG.volta ? ' checked' : ''}> Contar a volta</label>
        <label style="text-transform:none;letter-spacing:0;font-weight:500;font-size:11.5px;color:inherit">Eixos suspensos na volta vazia<input id="ped-susp" type="number" min="0" max="${Math.max(0, +CFG.eixos - 2)}" step="1" value="${h(CFG.susp)}" style="width:100%"${CFG.volta ? '' : ' disabled'}></label></div>
        <div class="hint" style="font-size:11px">Caminhão paga por eixo. Vazio, o eixo suspenso não paga (Lei 13.103/2015). O valor por tonelada é o pedágio da viagem (ida + volta) ÷ carga. Tarifas de ${ATUALIZADO}; praças estaduais pela tarifa básica da AGER-MT.</div>`;
    }
    return html + '</div>';
  }

  const renderOrig = window.rrRender;
  window.rrRender = function(){
    renderOrig.apply(this, arguments);
    const box = $('rr'); if(!box || box.style.display === 'none') return;
    const q = quadro();
    if(q){
      const usar = $('rr-usar'), alvo = usar ? usar.closest('.btns') : null;
      if(alvo) alvo.insertAdjacentHTML('beforebegin', q); else box.insertAdjacentHTML('beforeend', q);
      const cfg = $('ped-cfg'); if(cfg) cfg.onclick = ev => { ev.preventDefault(); aberto = !aberto; window.rrRender(); };
      const muda = (id, campo, conv) => { const el = $(id); if(el) el.onchange = () => { CFG[campo] = conv(el); salvar(); window.rrRender(); }; };
      muda('ped-eixos', 'eixos', el => +el.value);
      muda('ped-carga', 'carga', el => Math.max(0, +String(el.value).replace(',', '.') || 0));
      muda('ped-volta', 'volta', el => el.checked);
      muda('ped-susp', 'susp', el => Math.max(0, Math.round(+el.value || 0)));
    }
    // pedágio em cada rota alternativa (rotas.js)
    const A = window.G360Rotas && rr.obra && rr.ponto ? window.G360Rotas.alternativas()[`${rr.ponto.lat},${rr.ponto.lng}|${rr.obra.lat},${rr.obra.lng}`] : null;
    if(A) box.querySelectorAll('.rra-op').forEach(el => {
      const x = A.lista[+el.dataset.i]; if(!x || !x.geo) return;
      const ps = pracasNaRota(x), k = custo(ps);
      el.insertAdjacentHTML('beforeend', `<div style="font-size:11px;color:#92400e">pedágio: ${ps.length ? R$(k.total) + '/viagem (' + ps.length + ' praça' + (ps.length > 1 ? 's' : '') + ')' : 'nenhum'}</div>`);
    });
  };
  if(rr.status === 'ok') window.rrRender();
})();
