/* Gestão 360º BKP — enfeites da barra de sessão
   - ícone de usuário no botão "Usuários" e no nome logado
   - ícone de saída no botão "Sair"
   - botão "Atualizar tudo" (limpa cache e recarrega lendo a planilha de novo)
   - chave liga/desliga do modo escuro (lembrada no aparelho)            */
(function () {
  'use strict';

  var ICON = {
    user: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1.7 3.5 2.8 3.5 5.7"/></svg>',
    sair: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    atualizar: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    sol: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    lua: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };

  var CHAVE = 'bkp360_tema';

  function lerTema() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function gravarTema(v) { try { localStorage.setItem(CHAVE, v); } catch (e) {} }

  /* Aplica o tema o quanto antes, para não piscar claro ao abrir */
  if (lerTema() === 'escuro') document.documentElement.classList.add('tema-escuro');

  var css = '' +
    '.sessao{display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
    '.sessao .ico-b{display:inline-flex;align-items:center;gap:5px}' +
    '.sessao .ico-b svg{flex:none}' +
    '#ses-user{display:inline-flex;align-items:center;gap:5px;font-weight:600}' +
    '#ses-atualizar.girando svg{animation:bkpgira .8s linear infinite}' +
    '@keyframes bkpgira{to{transform:rotate(360deg)}}' +
    '#ses-sair:hover{color:#b42318;border-color:#b42318}' +
    /* chave liga/desliga */
    '.chave-tema{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:12px;color:var(--mut);margin-left:4px}' +
    '.chave-tema input{position:absolute;opacity:0;width:0;height:0}' +
    '.chave-tema .trilho{position:relative;width:40px;height:22px;border-radius:11px;background:var(--line);transition:background .2s;flex:none}' +
    '.chave-tema .bola{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#C05621;transition:transform .2s}' +
    '.chave-tema input:checked + .trilho{background:var(--acc)}' +
    '.chave-tema input:checked + .trilho .bola{transform:translateX(18px);color:#2b3440}' +
    '.chave-tema input:focus-visible + .trilho{outline:2px solid var(--acc);outline-offset:2px}' +
    /* ===== MODO ESCURO ===== */
    'html.tema-escuro{color-scheme:dark;--bg:#14171c;--card:#1d2128;--ink:#e6e8eb;--ink2:#b4b9c1;--ink3:#8a909a;--mut:#a3a9b2;' +
      '--line:#30353e;--line2:#262a32;--head:#232830;--acc2:#262a32;--prim:#f0f1f3}' +
    'html.tema-escuro body{background:var(--bg);color:var(--ink)}' +
    'html.tema-escuro input,html.tema-escuro select,html.tema-escuro textarea{background:#171a20;color:var(--ink);border-color:var(--line)}' +
    'html.tema-escuro button{color:var(--ink)}' +
    'html.tema-escuro button.mini,html.tema-escuro .sessao-b{background:var(--card);border-color:var(--line)}' +
    'html.tema-escuro table,html.tema-escuro th,html.tema-escuro td{border-color:var(--line)}' +
    'html.tema-escuro th{background:var(--head)}' +
    /* logo tem letras pretas: ganha um fundo claro no modo escuro */
    'html.tema-escuro img.logo-bkp{background:#f3f3f1;border-radius:6px;padding:3px 5px}' +
    /* mapa: escurece os blocos do OpenStreetMap sem mexer nos marcadores */
    'html.tema-escuro .leaflet-container{background:#1b1f25}' +
    'html.tema-escuro .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.9)}' +
    'html.tema-escuro .leaflet-popup-content-wrapper,html.tema-escuro .leaflet-popup-tip,html.tema-escuro .leaflet-tooltip{background:var(--card);color:var(--ink);border-color:var(--line)}' +
    'html.tema-escuro .leaflet-control-zoom a,html.tema-escuro .leaflet-bar a{background:var(--card);color:var(--ink);border-color:var(--line)}' +
    'html.tema-escuro .leaflet-control-attribution{background:rgba(29,33,40,.8);color:var(--mut)}' +
    'html.tema-escuro .leaflet-control-attribution a{color:var(--ink2)}' +
    /* impressão sempre clara */
    '@media print{html.tema-escuro{color-scheme:light;--bg:#fff;--card:#fff;--ink:#232323;--ink2:#5C5C5C;--mut:#5C5C5C;--line:#E8E8EA;--head:#F6F6F7}' +
      'html.tema-escuro .leaflet-tile-pane{filter:none}}';

  function injetarCss() {
    if (document.getElementById('bkp-visual-css')) return;
    var s = document.createElement('style');
    s.id = 'bkp-visual-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* Lê as folhas de estilo da ferramenta e gera versões escuras das cores
     claras/escuras que estão fixas no código (não usam as variáveis). */
  function luz(c) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c || '');
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.5) return null;
    var r = +m[1], g = +m[2], b = +m[3];
    var sat = Math.max(r, g, b) - Math.min(r, g, b);
    return { l: (0.299 * r + 0.587 * g + 0.114 * b) / 255, sat: sat };
  }
  var tela = null;
  function corRgb(v) {
    if (!tela) { tela = document.createElement('canvas').getContext('2d'); }
    tela.fillStyle = '#010203';
    tela.fillStyle = v;
    var h = tela.fillStyle;
    if (h === '#010203' && v.replace(/\s/g, '') !== '#010203') return '';
    if (h.charAt(0) === '#') {
      return 'rgb(' + parseInt(h.substr(1, 2), 16) + ', ' + parseInt(h.substr(3, 2), 16) + ', ' + parseInt(h.substr(5, 2), 16) + ')';
    }
    return h;
  }

  function gerarCssEscuro() {
    if (document.getElementById('bkp-escuro-auto')) return;
    var regras = [];
    var visto = {};
    function varrer(lista) {
      for (var i = 0; i < lista.length; i++) {
        var r = lista[i];
        if (r.cssRules && !r.selectorText) { if (!r.media || !/print/.test(r.media.mediaText)) varrer(r.cssRules); continue; }
        if (!r.selectorText || !r.style) continue;
        var sel = r.selectorText;
        if (/leaflet|tema-escuro|chave-tema|:root|^html$|^body$/.test(sel)) continue;
        var dec = [];
        var bg = r.style.backgroundColor || '';
        var lb = luz(bg);
        if (lb && lb.sat < 40) {
          if (lb.l > 0.93) dec.push('background-color:var(--card)');
          else if (lb.l > 0.82) dec.push('background-color:var(--head)');
        }
        if (/^#?fff|white|rgb\(255, 255, 255\)/.test(r.style.background || '') && !dec.length) dec.push('background-color:var(--card)');
        var lc = luz(r.style.color);
        if (lc && lc.sat < 40 && lc.l < 0.35) dec.push('color:var(--ink)');
        else if (lc && lc.sat < 40 && lc.l < 0.6) dec.push('color:var(--mut)');
        var lbo = luz(r.style.borderColor || r.style.borderBottomColor || r.style.borderTopColor);
        if (lbo && lbo.sat < 40 && lbo.l > 0.8) dec.push('border-color:var(--line)');
        if (!dec.length) continue;
        var novo = sel.split(',').map(function (p) { return 'html.tema-escuro ' + p.trim(); }).join(',');
        var linha = novo + '{' + dec.join(';') + '}';
        if (!visto[linha]) { visto[linha] = 1; regras.push(linha); }
      }
    }
    for (var i = 0; i < document.styleSheets.length; i++) {
      var ss = document.styleSheets[i];
      if (ss.ownerNode && ss.ownerNode.id && ss.ownerNode.id.indexOf('bkp-') === 0) continue;
      try { varrer(ss.cssRules); } catch (e) { /* folha externa sem acesso */ }
    }
    var el = document.createElement('style');
    el.id = 'bkp-escuro-auto';
    el.textContent = '@media screen{' + regras.join('\n') + '}';
    document.head.appendChild(el);
  }

  /* Corrige elementos com fundo branco fixo no código (style="background:#fff") */
  function ajustarFundosFixos() {
    var escuro = document.documentElement.classList.contains('tema-escuro');
    if (escuro) gerarCssEscuro();
    var els = document.querySelectorAll('[style]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('.leaflet-marker-pane,.leaflet-tile-pane,.sessao')) continue;
      if (escuro) {
        if (el.dataset.bgOrig === undefined) {
          var lb = luz(el.style.backgroundColor);
          if (lb && lb.sat < 40 && lb.l > 0.82) {
            el.dataset.bgOrig = el.style.backgroundColor;
            el.style.backgroundColor = lb.l > 0.93 ? 'var(--card)' : 'var(--head)';
          }
        }
        if (el.dataset.corOrig === undefined) {
          var lc = luz(el.style.color);
          if (lc && lc.sat < 40 && lc.l < 0.45) {
            el.dataset.corOrig = el.style.color;
            el.style.color = 'var(--ink)';
          }
        }
      } else {
        if (el.dataset.bgOrig !== undefined) { el.style.backgroundColor = el.dataset.bgOrig; delete el.dataset.bgOrig; }
        if (el.dataset.corOrig !== undefined) { el.style.color = el.dataset.corOrig; delete el.dataset.corOrig; }
      }
    }
    /* textos e linhas de eixo dos gráficos em SVG */
    var svgs = document.querySelectorAll('svg text, svg line, svg path[stroke]');
    for (var j = 0; j < svgs.length; j++) {
      var t = svgs[j];
      if (t.closest('.sessao,.leaflet-marker-pane')) continue;
      var attr = t.tagName === 'text' ? 'fill' : 'stroke';
      if (escuro) {
        if (t.dataset.svgOrig !== undefined) continue;
        var v = t.getAttribute(attr);
        var cor = v && luz(corRgb(v));
        if (!cor || cor.sat >= 40) continue;
        if (attr === 'fill' && cor.l < 0.6) { t.dataset.svgOrig = v; t.setAttribute(attr, '#b4b9c1'); }
        else if (attr === 'stroke' && cor.l > 0.75) { t.dataset.svgOrig = v; t.setAttribute(attr, '#3a404a'); }
      } else if (t.dataset.svgOrig !== undefined) {
        t.setAttribute(attr, t.dataset.svgOrig); delete t.dataset.svgOrig;
      }
    }
  }

  function aplicarTema(escuro) {
    document.documentElement.classList.toggle('tema-escuro', escuro);
    gravarTema(escuro ? 'escuro' : 'claro');
    ajustarFundosFixos();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      if (!meta.dataset.orig) meta.dataset.orig = meta.getAttribute('content') || '';
      meta.setAttribute('content', escuro ? '#14171c' : meta.dataset.orig);
    }
  }

  function colocarIcone(btn, svg) {
    if (!btn || btn.dataset.icone) return;
    btn.dataset.icone = '1';
    btn.classList.add('ico-b');
    btn.insertAdjacentHTML('afterbegin', svg);
  }

  async function atualizarTudo(btn) {
    btn.classList.add('girando');
    btn.disabled = true;
    try {
      /* sem internet, mantém o cache para a ferramenta continuar abrindo */
      if (navigator.onLine && window.caches && caches.keys) {
        var nomes = await caches.keys();
        await Promise.all(nomes.map(function (n) { return caches.delete(n); }));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        var regs = await navigator.serviceWorker.getRegistrations();
        regs.forEach(function (r) { r.update(); });
      }
    } catch (e) { /* segue para o recarregamento mesmo assim */ }
    var url = new URL(location.href);
    url.searchParams.set('atualizar', '1');
    url.searchParams.set('t', Date.now());
    location.replace(url.toString());
  }

  function montar() {
    var barra = document.querySelector('.sessao');
    if (!barra) return false;
    if (barra.dataset.enfeitada) return true;
    barra.dataset.enfeitada = '1';

    var nome = document.getElementById('ses-user');
    if (nome && !nome.dataset.icone) { nome.dataset.icone = '1'; nome.insertAdjacentHTML('afterbegin', ICON.user); }

    var bUsers = document.getElementById('ses-users');
    var bSair = document.getElementById('ses-sair');
    colocarIcone(bUsers, ICON.users);
    colocarIcone(bSair, ICON.sair);
    if (bSair) bSair.title = 'Sair da ferramenta';

    /* Botão Atualizar tudo, logo depois do botão de usuário */
    var bAtu = document.createElement('button');
    bAtu.className = 'mini sessao-b ico-b';
    bAtu.id = 'ses-atualizar';
    bAtu.type = 'button';
    bAtu.title = 'Recarrega todas as informações (planilha, obras, cache)';
    bAtu.innerHTML = ICON.atualizar + 'Atualizar tudo';
    bAtu.addEventListener('click', function () { atualizarTudo(bAtu); });
    var ref = bUsers || nome;
    if (ref) ref.insertAdjacentElement('afterend', bAtu); else barra.appendChild(bAtu);

    /* Chave do modo escuro */
    var escuro = document.documentElement.classList.contains('tema-escuro');
    var chave = document.createElement('label');
    chave.className = 'chave-tema';
    chave.title = 'Modo escuro';
    chave.innerHTML = '<input type="checkbox" id="ses-tema"' + (escuro ? ' checked' : '') + ' aria-label="Modo escuro">' +
      '<span class="trilho"><span class="bola">' + (escuro ? ICON.lua : ICON.sol) + '</span></span><span>Escuro</span>';
    var input = chave.querySelector('input');
    var bola = chave.querySelector('.bola');
    input.addEventListener('change', function () {
      aplicarTema(input.checked);
      bola.innerHTML = input.checked ? ICON.lua : ICON.sol;
    });
    barra.appendChild(chave);

    ajustarFundosFixos();
    return true;
  }

  function iniciar() {
    injetarCss();
    if (montar()) return;
    /* A barra só aparece depois do login: observa até ela surgir */
    var obs = new MutationObserver(function () { if (montar()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* Reaplica o ajuste de fundos quando novas telas são desenhadas */
  var pend = null;
  new MutationObserver(function () {
    if (!document.documentElement.classList.contains('tema-escuro')) return;
    clearTimeout(pend); pend = setTimeout(ajustarFundosFixos, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
