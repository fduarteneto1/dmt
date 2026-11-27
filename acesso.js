/* Gestão 360º BKP — acesso por módulo
   - O usuário "bkp" é o master: só ele vê o botão Usuários (criar, trocar senha, remover) e
     só ele liga/desliga módulos para cada pessoa.
   - Os bloqueios ficam no usuarios.json, em "bloq": { "<id do usuário>": ["rh", ...] }.
     O index.html lê essa lista ao abrir a ferramenta e passa em DMT_SESSAO.b; quem está sem RH
     nem carrega o rh.js.
   - Para quem tem módulo bloqueado: o botão e a tela do módulo somem, e qualquer tentativa de
     abrir o módulo cai no primeiro módulo liberado.
   - Na janela Usuários, cada pessoa ganha a linha "Acesso" com uma chavinha por módulo.
     Mudou uma chave: a mensagem "Baixe o usuarios.json para valer" aciona o usuarios-pend.js,
     que baixa o arquivo e avisa até ele ser publicado no GitHub.
   Carregado por index.html depois do usuarios-pend.js. Não guarda nada secreto.
   Atenção: é uma restrição da interface. Todos os usuários abrem a ferramenta com a mesma chave. */
(function () {
  'use strict';
  var MASTER = 'bkp';
  var $ = function (id) { return document.getElementById(id); };
  var abas = $('abas');
  if (!abas || typeof DMTC !== 'object') return;
  var SES = window.DMT_SESSAO || {};
  var eu = DMTC.norm(SES.u), master = eu === MASTER;
  var bloq = master ? [] : (Array.isArray(SES.b) ? SES.b : []);
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var cssId = function (s) { return String(s).replace(/[^a-z0-9_-]/gi, ''); };

  // ---------- 1. aplica os bloqueios deste usuário ----------
  var regras = [];
  if (!master) regras.push('#ses-users{display:none!important}');
  bloq.forEach(function (a) {
    a = cssId(a);
    regras.push('#abas button[data-aba="' + a + '"],#aba-' + a + '{display:none!important}');
  });
  var css = document.createElement('style');
  css.textContent = regras.join('\n') +
    '#us-lista li{flex-wrap:wrap}' +
    '#us-lista .g360-ac{flex:1 1 100%;margin:6px 0 2px;font-size:12px}' +
    '#us-lista .g360-ac-res{display:flex;align-items:center;gap:6px;cursor:pointer;color:var(--ink2,#5c5c5c);user-select:none}' +
    '#us-lista .g360-ac-res:hover{color:var(--ink,#1f1f1f)}' +
    '#us-lista .g360-ac-res b{font-weight:600;color:var(--ink,#1f1f1f)}' +
    '#us-lista .g360-ac-res .sv{font-size:10px;transition:transform .15s}' +
    '#us-lista .g360-ac.aberto .g360-ac-res .sv{transform:rotate(90deg)}' +
    '#us-lista .g360-ac-grid{display:none;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 14px;margin-top:8px;padding:8px 10px;border:1px solid var(--line,#e4e4e7);border-radius:8px;background:var(--head,#f6f6f7)}' +
    '#us-lista .g360-ac.aberto .g360-ac-grid{display:grid}' +
    '#us-lista .g360-sw{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px;margin:0;text-transform:none;letter-spacing:0;font-weight:500;color:var(--ink,#1f1f1f)}' +
    '#us-lista .g360-sw input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}' +
    '#us-lista .g360-sw i{flex:none;position:relative;width:32px;height:18px;border-radius:9px;background:#c9c9cf;transition:background .15s}' +
    '#us-lista .g360-sw i::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}' +
    '#us-lista .g360-sw input:checked+i{background:#2e9d5b}' +
    '#us-lista .g360-sw input:checked+i::after{left:16px}' +
    '#us-lista .g360-sw input:focus-visible+i{outline:2px solid #2e9d5b;outline-offset:2px}' +
    '#us-lista .g360-sw.off span{color:var(--ink3,#8e8e8e)}' +
    '#us-lista .g360-master{flex:1 1 100%;font-size:11.5px;color:var(--ink3,#8e8e8e);margin-top:2px}' +
    '.tema-escuro #us-lista .g360-ac-grid{background:rgba(255,255,255,.04)}';
  document.head.appendChild(css);

  var botoes = function () { return Array.prototype.slice.call(abas.querySelectorAll('button[data-aba]')); };
  var primeira = function () {
    var b = botoes().filter(function (x) { return bloq.indexOf(x.dataset.aba) < 0; })[0];
    return b ? b.dataset.aba : null;
  };

  if (bloq.length) {
    try { if (bloq.indexOf('rh') >= 0) { localStorage.removeItem('dmtbkp_rh'); } } catch (e) {}
    if (typeof window.trocarAba === 'function') {
      var orig = window.trocarAba;
      window.trocarAba = function (a) {
        if (bloq.indexOf(a) >= 0) { a = primeira(); if (!a) return; }
        return orig.apply(this, [a].concat(Array.prototype.slice.call(arguments, 1)));
      };
    }
    var ativa = abas.querySelector('button.on');
    if (!ativa || bloq.indexOf(ativa.dataset.aba) >= 0) { var p = primeira(); if (p) window.trocarAba(p); }
  }

  if (!master || !$('us-lista') || typeof us !== 'object') return;

  // ---------- 2. chavinhas na janela Usuários (só o master) ----------
  var abertos = {}, tAviso = null, mudados = {};
  var modulos = function () {
    return botoes().map(function (b) { return { a: b.dataset.aba, nome: b.textContent.trim() }; });
  };

  function resumo(lista, mods) {
    var fora = mods.filter(function (m) { return lista.indexOf(m.a) >= 0; });
    if (!fora.length) return 'todos os módulos';
    if (fora.length === mods.length) return '<b>nenhum módulo</b>';
    return 'sem <b>' + fora.map(function (m) { return esc(m.nome); }).join(', ') + '</b>';
  }

  function avisar(nome) {
    mudados[nome] = 1;
    clearTimeout(tAviso);
    tAviso = setTimeout(function () {
      var n = Object.keys(mudados); mudados = {};
      $('us-msg').textContent = 'Acesso de ' + n.join(', ') + ' alterado. Baixe o usuarios.json para valer.';
    }, 1500);
  }

  function decorar() {
    var d = us.dados; if (!d || !d.usuarios) return;
    var ids = Object.keys(d.usuarios);
    var lis = Array.prototype.filter.call($('us-lista').children, function (li) { return li.tagName === 'LI' && li.querySelector('span'); });
    if (lis.length !== ids.length) return; // lista ainda sendo montada
    // remove bloqueios de quem saiu da lista
    if (d.bloq) {
      Object.keys(d.bloq).forEach(function (id) { if (!d.usuarios[id] || !(d.bloq[id] || []).length) delete d.bloq[id]; });
      if (!Object.keys(d.bloq).length) delete d.bloq;
    }
    var mods = modulos();
    lis.forEach(function (li, i) {
      var id = ids[i];
      var nome = li.querySelector('span').textContent.replace(/ \(você\)$/, '');
      var velho = li.querySelector('.g360-ac,.g360-master'); if (velho) velho.remove();
      if (nome === MASTER) {
        var m = document.createElement('div'); m.className = 'g360-master';
        m.textContent = 'Master · acesso a todos os módulos e à gestão de usuários';
        li.appendChild(m); return;
      }
      var lista = (d.bloq && d.bloq[id]) || [];
      var box = document.createElement('div');
      box.className = 'g360-ac' + (abertos[id] ? ' aberto' : '');
      box.innerHTML = '<div class="g360-ac-res" role="button" tabindex="0"><span class="sv">▶</span>Acesso: <span class="txt">' + resumo(lista, mods) + '</span></div>' +
        '<div class="g360-ac-grid">' + mods.map(function (m) {
          var on = lista.indexOf(m.a) < 0;
          return '<label class="g360-sw' + (on ? '' : ' off') + '"><input type="checkbox" role="switch" data-mod="' + esc(m.a) + '"' + (on ? ' checked' : '') + '><i></i><span>' + esc(m.nome) + '</span></label>';
        }).join('') + '</div>';
      var res = box.querySelector('.g360-ac-res');
      var alternar = function () { abertos[id] = !abertos[id]; box.classList.toggle('aberto', !!abertos[id]); };
      res.onclick = alternar;
      res.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); } };
      box.querySelectorAll('input[data-mod]').forEach(function (inp) {
        inp.onchange = function () {
          var a = inp.dataset.mod;
          d.bloq = d.bloq || {};
          var l = (d.bloq[id] || []).filter(function (x) { return x !== a; });
          if (!inp.checked) l.push(a);
          l.sort();
          if (l.length) d.bloq[id] = l; else delete d.bloq[id];
          if (!Object.keys(d.bloq).length) delete d.bloq;
          inp.parentNode.classList.toggle('off', !inp.checked);
          box.querySelector('.txt').innerHTML = resumo(l, mods);
          avisar(nome);
        };
      });
      li.appendChild(box);
    });
  }

  var tm = null;
  new MutationObserver(function () { clearTimeout(tm); tm = setTimeout(decorar, 120); }).observe($('us-lista'), { childList: true });
  decorar();
})();
