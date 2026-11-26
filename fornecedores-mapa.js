// Fornecedores cadastrados (aba Cotações) no mapa do Gestão 360º BKP.
// Carregado por index.html depois de cotacao.js e pedagios.js. Não guarda nada secreto.
// - Mostra cada fornecedor cadastrado na posição do endereço (vem do Google ao cadastrar).
//   Sem posição, procura o endereço/cidade no OpenStreetMap e marca como "posição aproximada".
// - Botão "Fornecedores" abaixo do zoom liga/desliga a camada (fica salvo neste navegador).
// - Clique no fornecedor: dados, cotações, abrir o cadastro e ajustar a posição arrastando.
(function(){
  try{ if(typeof map === 'undefined' || typeof L === 'undefined' || !window.G360Cotacoes) return; }catch(e){ return; }
  const C = window.G360Cotacoes;
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const COR = '#0e7490';
  const CHAVE = 'dmtbkp_fornMapa', CACHE = 'dmtbkp_fornGeo';
  let ligado = true;
  try{ const v = localStorage.getItem(CHAVE); if(v != null) ligado = v === '1'; }catch(e){}
  let geoCache = {};
  try{ geoCache = JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; }catch(e){}

  const lerGeo = s => { const m = String(s || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); return m ? [+m[1], +m[2]] : null; };
  const icone = aprox => L.divIcon({className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    html: `<div style="width:18px;height:18px;border-radius:5px;background:${COR};border:2px ${aprox ? 'dashed' : 'solid'} #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);color:#fff;font:700 11px/14px sans-serif;text-align:center">F</div>`});

  // ---------- posição: a do cadastro; sem ela, busca no OpenStreetMap (1 por segundo) ----------
  const fila = []; let rodando = false;
  const chaveBusca = f => [f.end, f.cidade].filter(Boolean).join(' | ');
  async function geocodificar(){
    if(rodando) return; rodando = true;
    while(fila.length){
      const f = fila.shift(), k = chaveBusca(f);
      if(!k || geoCache[k] !== undefined) continue;
      const tenta = async q => { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(q));
        if(!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); return j[0] ? [+j[0].lat, +j[0].lon] : null; };
      try{
        const cid = String(f.cidade || '').replace(/-([A-Z]{2})$/, ', $1');
        let p = f.end ? await tenta(f.end + (cid ? ', ' + cid : '')) : null;
        if(!p && cid){ await espera(1100); p = await tenta(cid + ', Brasil'); }
        geoCache[k] = p; try{ localStorage.setItem(CACHE, JSON.stringify(geoCache)); }catch(e){}
        desenhar();
      }catch(e){ /* sem internet: tenta de novo na próxima vez */ }
      await espera(1100);
    }
    rodando = false;
  }
  const espera = ms => new Promise(r => setTimeout(r, ms));
  function posicao(f){
    const g = lerGeo(f.geo); if(g) return {p: g, aprox: false};
    const k = chaveBusca(f); if(!k) return null;
    if(geoCache[k]) return {p: geoCache[k], aprox: true};
    if(geoCache[k] === undefined && !fila.includes(f)){ fila.push(f); geocodificar(); }
    return null;
  }

  // ---------- camada ----------
  const camada = L.layerGroup();
  let semPos = 0, total = 0;
  function dica(f, aprox, nCot, nEsc){
    return `<b>${h(f.nome)}</b><br>` + [f.cat, f.cidade].filter(Boolean).map(h).join(' · ')
      + (f.tel || f.contato ? '<br>' + [f.contato, f.tel].filter(Boolean).map(h).join(' · ') : '')
      + `<br>${nCot} cotaç${nCot === 1 ? 'ão' : 'ões'}${nEsc ? ' · ' + nEsc + ' escolhida' + (nEsc > 1 ? 's' : '') : ''}`
      + (aprox ? '<br><i>Posição aproximada (pela cidade/endereço)</i>' : '');
  }
  function desenhar(){
    camada.clearLayers();
    const D = C.dados(), cot = (D.cot || []).filter(c => !c.del);
    const forn = (D.forn || []).filter(f => !f.del);
    total = forn.length; semPos = 0;
    const usados = {}; // fornecedores no mesmo ponto: espalha um pouco para não ficarem um em cima do outro
    forn.forEach(f => {
      const ps = posicao(f); if(!ps){ semPos++; return; }
      const kk = ps.p[0].toFixed(4) + ',' + ps.p[1].toFixed(4), n = usados[kk] = (usados[kk] || 0) + 1;
      const ll = n === 1 ? ps.p : [ps.p[0] + 0.004 * Math.cos(n * 2.1), ps.p[1] + 0.004 * Math.sin(n * 2.1)];
      const us = cot.filter(c => (c.fs || []).some(x => x.id === f.id));
      let nEsc = 0;
      try{ nEsc = us.filter(c => c.st !== 'aberta' && c.st !== 'cancelada' && C.calc(c).final.usados.includes(f.id)).length; }catch(e){}
      const mk = L.marker(ll, {icon: icone(ps.aprox), zIndexOffset: -100, draggable: false, title: f.nome});
      mk.bindTooltip(dica(f, ps.aprox, us.length, nEsc));
      const pop = document.createElement('div');
      pop.innerHTML = dica(f, ps.aprox, us.length, nEsc) + (f.end ? '<br><small>' + h(f.end) + '</small>' : '')
        + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button type="button" data-a="ed">Abrir cadastro</button><button type="button" class="sec" data-a="mv">📍 Ajustar posição</button></div>';
      pop.querySelector('[data-a=ed]').onclick = () => { map.closePopup(); C.editarForn(f.id); };
      pop.querySelector('[data-a=mv]').onclick = () => {
        map.closePopup(); mk.dragging.enable(); mk.unbindTooltip();
        mk.bindTooltip('Arraste até o local certo e solte', {permanent: true, direction: 'top'}).openTooltip();
      };
      mk.bindPopup(pop);
      mk.on('dragend', () => { const p = mk.getLatLng(); mk.dragging.disable(); C.posForn(f.id, p.lat, p.lng); });
      camada.addLayer(mk);
    });
    pintar();
  }

  // ---------- botão liga/desliga ----------
  let botao = null;
  const pintar = () => { if(!botao) return; botao.style.background = ligado ? '#a5f3fc' : '';
    botao.title = (ligado ? 'Ocultar' : 'Mostrar') + ' fornecedores cadastrados' + (total ? ' (' + total + (semPos ? ', ' + semPos + ' sem posição' : '') + ')' : ''); };
  const Botao = L.Control.extend({options: {position: 'topleft'}, onAdd(){
    const d = L.DomUtil.create('div', 'leaflet-bar');
    d.innerHTML = `<a href="#" style="width:auto;padding:0 7px;font:600 12px/30px sans-serif;white-space:nowrap"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${COR};vertical-align:-1px;margin-right:4px"></span>Fornecedores</a>`;
    L.DomEvent.disableClickPropagation(d);
    botao = d.firstChild; pintar();
    L.DomEvent.on(botao, 'click', ev => { L.DomEvent.preventDefault(ev); ligado = !ligado;
      try{ localStorage.setItem(CHAVE, ligado ? '1' : '0'); }catch(e){}
      ligado ? camada.addTo(map) : camada.remove(); pintar(); });
    return d;
  }});
  new Botao().addTo(map);

  // ---------- legenda ----------
  function legenda(){
    const lg = document.querySelector('.g360-leg') || [...document.querySelectorAll('.leaflet-control')].find(e => /Sede BKP/.test(e.textContent));
    if(!lg || lg.querySelector('[data-leg-forn]')) return;
    const it = document.createElement('div'); it.dataset.legForn = '1';
    it.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${COR};vertical-align:-1px"></span> Fornecedor (cotações)`;
    const ref = [...lg.children].find(c => /Sede BKP/.test(c.textContent));
    ref && ref.nextSibling ? lg.insertBefore(it, ref.nextSibling) : lg.appendChild(it);
  }

  desenhar();
  if(ligado) camada.addTo(map);
  legenda(); setTimeout(legenda, 1500);
  document.addEventListener('g360-cotacoes', desenhar);
  window.G360FornMapa = {desenhar, camada};
})();
