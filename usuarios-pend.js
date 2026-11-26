/* Gestão 360º BKP — proteção para usuários ainda não publicados
   A tela "Usuários" só altera a lista na página aberta; para valer, o usuarios.json
   precisa ser trocado no GitHub. Este módulo:
   - ao criar, trocar senha ou remover alguém, guarda a nova lista neste aparelho e já baixa o usuarios.json;
   - mostra um aviso (no botão Usuários, na janela e numa faixa no rodapé) até o arquivo publicado
     no GitHub ficar igual à lista alterada;
   - se a página for recarregada antes de publicar, a lista alterada volta para a janela Usuários
     e dá para baixar o arquivo de novo, sem refazer o cadastro.
   Carregado por index.html depois do app. Não guarda nada secreto: o usuarios.json é público. */
(function () {
  'use strict';
  var KEY = 'g360_us_pendente';
  var $ = function (id) { return document.getElementById(id); };
  if (!$('modal-us') || !$('us-msg') || typeof us !== 'object') return;
  var SESK = (window.DMT_SESSAO || {}).k;

  var pend = null, publicado = null, nomes = {}, ultimaVerif = 0, ok = false;
  try { pend = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { pend = null; }
  function guardar() { try { pend ? localStorage.setItem(KEY, JSON.stringify(pend)) : localStorage.removeItem(KEY); } catch (e) {} }

  // A janela Usuários passa a partir da lista ainda não publicada (se houver)
  if (pend && pend.dados && !us.dados) us.dados = JSON.parse(JSON.stringify(pend.dados));

  var css = document.createElement('style');
  css.textContent =
    '#ses-users{position:relative}' +
    '#ses-users.g360-uspend::after{content:"";position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:50%;background:#d92d20;box-shadow:0 0 0 2px var(--card,#fff)}' +
    '.g360-usaviso{border:1px solid #f4b740;background:#fff8e6;color:#7a4b00;border-radius:8px;padding:9px 11px;font-size:12.5px;line-height:1.45;margin:10px 0}' +
    '.g360-usaviso b{color:#5c3800}.g360-usaviso.ok{border-color:#7fc99a;background:#ecf8f0;color:#1f6b3a}' +
    '.g360-usaviso .btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '#us-lista .g360-npub{margin-left:6px;font-size:11px;font-weight:600;color:#b54708;background:#fff1d6;border-radius:4px;padding:1px 5px}' +
    '#g360-usbarra{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:9999;max-width:min(680px,94vw);box-shadow:0 6px 24px rgba(0,0,0,.18);margin:0}' +
    '.tema-escuro .g360-usaviso{background:#3a2c0c;color:#f6d79a;border-color:#8a6418}' +
    '.tema-escuro .g360-usaviso b{color:#ffe2a8}' +
    '@media print{#g360-usbarra{display:none!important}}';
  document.head.appendChild(css);

  var canon = function (u) {
    var o = (u && u.usuarios) || {};
    return JSON.stringify(Object.keys(o).sort().map(function (k) { return [k, o[k].k, o[k].s]; }));
  };

  function baixar(dados) {
    var blob = new Blob([JSON.stringify(dados, null, 1) + '\n'], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'usuarios.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  async function nome(e) {
    try { return await DMTC.nomeUsuario(SESK, e); } catch (x) { return '?'; }
  }

  // Diferenças entre a lista guardada e a publicada
  async function diferencas() {
    var p = (pend && pend.dados && pend.dados.usuarios) || {}, g = (publicado && publicado.usuarios) || {};
    var novos = [], removidos = [];
    for (var id in p) if (!g[id] || g[id].k !== p[id].k || g[id].s !== p[id].s) {
      var n = nomes[id] || (nomes[id] = await nome(p[id]));
      novos.push({ id: id, nome: n, troca: !!g[id] });
    }
    for (var id2 in g) if (!p[id2]) removidos.push(nomes[id2] || (nomes[id2] = await nome(g[id2])));
    return { novos: novos, removidos: removidos };
  }

  async function verificar(forcar) {
    if (!pend) { render(); return; }
    if (!forcar && Date.now() - ultimaVerif < 20000) return;
    ultimaVerif = Date.now();
    try {
      var r = await fetch('usuarios.json?verif=' + Date.now(), { cache: 'no-store' });
      if (r.ok) publicado = await r.json();
    } catch (e) {}
    if (publicado && canon(publicado) === canon(pend.dados)) { pend = null; guardar(); ok = true; }
    await render();
  }

  var txt = function (d) {
    var partes = [];
    var cri = d.novos.filter(function (x) { return !x.troca; }).map(function (x) { return x.nome; });
    var tro = d.novos.filter(function (x) { return x.troca; }).map(function (x) { return x.nome; });
    if (cri.length) partes.push('criado' + (cri.length > 1 ? 's' : '') + ': <b>' + cri.join(', ') + '</b>');
    if (tro.length) partes.push('senha trocada: <b>' + tro.join(', ') + '</b>');
    if (d.removidos.length) partes.push('removido' + (d.removidos.length > 1 ? 's' : '') + ': <b>' + d.removidos.join(', ') + '</b>');
    return partes.join(' · ');
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function caixa(id, html, cls) {
    var el = $(id);
    if (!html) { if (el) el.remove(); return null; }
    if (!el) { el = document.createElement('div'); el.id = id; }
    el.className = 'g360-usaviso' + (cls ? ' ' + cls : ''); el.innerHTML = html;
    return el;
  }

  async function render() {
    var btn = $('ses-users');
    if (!pend) {
      if (btn) { btn.classList.remove('g360-uspend'); btn.title = ''; }
      caixa('g360-usbarra', null);
      marcarLista([]);
      var m = caixa('g360-usmodal', ok ? '✓ <b>Publicado.</b> O usuarios.json do GitHub já está com a lista nova; o acesso vale em todos os aparelhos.' : null, 'ok');
      if (m && !m.parentNode) $('us-msg').after(m);
      return;
    }
    var d = await diferencas();
    if (!d.novos.length && !d.removidos.length && publicado) { pend = null; guardar(); ok = true; return render(); }
    var resumo = txt(d) || 'lista de usuários alterada';
    if (btn) { btn.classList.add('g360-uspend'); btn.title = 'Há alteração de usuários ainda não publicada no GitHub'; }

    var acoes = '<div class="btns"><button type="button" class="mini" data-us="baixar">Baixar usuarios.json de novo</button>' +
      '<button type="button" class="sec mini" data-us="verif">Já publiquei — verificar</button>' +
      '<button type="button" class="sec mini" data-us="descartar">Descartar alteração</button></div>';
    var corpo = '⚠ <b>Ainda não publicado no GitHub</b> — ' + resumo + '.<br>' +
      'Enquanto o usuarios.json não for substituído no repositório, isso não vale (e some ao recarregar em outro aparelho). ' +
      'Depois de enviar, leva 1–2 minutos para valer.';
    var m2 = caixa('g360-usmodal', corpo + acoes);
    if (m2 && !m2.parentNode) $('us-msg').after(m2);
    var bar = caixa('g360-usbarra', '⚠ <b>Usuários não publicados</b> — ' + resumo + '. Substitua o usuarios.json no GitHub.' +
      '<div class="btns"><button type="button" class="mini" data-us="abrir">Ver detalhes</button>' +
      '<button type="button" class="sec mini" data-us="baixar">Baixar usuarios.json</button>' +
      '<button type="button" class="sec mini" data-us="verif">Verificar agora</button></div>');
    if (bar && !bar.parentNode) document.body.appendChild(bar);
    marcarLista(d.novos.map(function (x) { return x.nome; }));
  }

  function marcarLista(lista) {
    var ul = $('us-lista'); if (!ul) return;
    Array.prototype.forEach.call(ul.querySelectorAll('li'), function (li) {
      var sp = li.querySelector('span'); if (!sp) return;
      var t = sp.textContent.replace(/ \(você\)$/, '');
      var tag = li.querySelector('.g360-npub');
      if (lista.indexOf(t) >= 0) { if (!tag) { tag = document.createElement('span'); tag.className = 'g360-npub'; tag.textContent = 'não publicado'; sp.after(tag); } }
      else if (tag) tag.remove();
    });
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-us]'); if (!b) return;
    var a = b.getAttribute('data-us');
    if (a === 'baixar' && pend) baixar(pend.dados);
    else if (a === 'verif') { b.textContent = 'Verificando…'; ok = false; verificar(true); }
    else if (a === 'abrir') $('ses-users').click();
    else if (a === 'descartar' && confirm('Descartar a alteração de usuários que ainda não foi publicada?')) {
      pend = null; guardar(); ok = false; us.dados = null; render();
      if ($('modal-us').style.display === 'flex') $('ses-users').click();
    }
  });

  // Criou, trocou senha ou removeu: guarda a lista e já baixa o arquivo
  new MutationObserver(function () {
    var t = $('us-msg').textContent || '';
    if (!/Agora baixe o usuarios\.json|Baixe o usuarios\.json para valer/i.test(t) || !us.dados) return;
    var dados = JSON.parse(JSON.stringify(us.dados));
    if (pend && canon(pend.dados) === canon(dados)) return;
    pend = { dados: dados, quando: new Date().toISOString(), por: (window.DMT_SESSAO || {}).u || '' };
    guardar(); ok = false;
    baixar(dados);
    $('us-msg').textContent = t.replace(/\s*(Agora baixe|Baixe) o usuarios\.json.*$/i, '') +
      ' O usuarios.json já foi baixado: substitua o arquivo no GitHub para valer.';
    verificar(true);
  }).observe($('us-msg'), { childList: true, characterData: true, subtree: true });

  // O baixar do próprio app também conta como "guardar" a lista
  $('us-baixar').addEventListener('click', function () {
    if (us.dados && publicado && canon(us.dados) !== canon(publicado) && !(pend && canon(pend.dados) === canon(us.dados))) {
      pend = { dados: JSON.parse(JSON.stringify(us.dados)), quando: new Date().toISOString(), por: (window.DMT_SESSAO || {}).u || '' };
      guardar(); render();
    }
  });

  // A lista da janela é refeita pelo app: remarca os "não publicado"
  var tm = null;
  new MutationObserver(function () { clearTimeout(tm); tm = setTimeout(render, 150); }).observe($('us-lista'), { childList: true });
  $('ses-users').addEventListener('click', function () { setTimeout(function () { verificar(true); }, 300); });

  document.addEventListener('visibilitychange', function () { if (!document.hidden && pend) verificar(false); });
  setInterval(function () { if (pend) verificar(true); }, 60000);
  if (pend) verificar(true);
  else fetch('usuarios.json?verif=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { publicado = j; }).catch(function () {});
})();
