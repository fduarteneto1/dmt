// Aba "Aprovações" do Gestão 360º BKP: quem está habilitado vê as cotações aguardando aprovação
// e decide: aprovar ou reprovar (com motivo, que volta para o comprador).
// Carregado por index.html logo depois do cotacao.js, e só para quem tem o módulo liberado
// (o master "bkp" sempre; os outros pela chavinha "Aprovações" na janela Usuários, gravada no
// usuarios.json como "+apr" na lista do usuário). Não guarda nada secreto: usa as mesmas cotações
// da aba Cotações (G360Cotacoes), e a decisão fica no histórico da cotação com usuário e hora.
(function(){
  if(typeof st === 'undefined' || typeof trocarAba !== 'function' || !window.G360Cotacoes) return;
  const C = window.G360Cotacoes;
  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const f2 = v => (+v || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const R$ = v => 'R$ ' + f2(v);
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dataBR = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const vivos = () => (C.dados().cot || []).filter(c => !c.del);
  let ver = 'pen'; // 'pen' (pendentes) | 'dec' (decididas)

  const css = document.createElement('style');
  css.textContent = `
  #abas button[data-aba="apr"] .apr-n{display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;border-radius:9px;background:#e08a00;color:#fff;font-size:10.5px;font-weight:700;line-height:17px;text-align:center}
  #abas button[data-aba="apr"] .apr-n[hidden]{display:none}
  #aba-apr .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  #aba-apr .kpi{background:var(--head,#f6f6f7);border-radius:9px;padding:8px 10px}
  #aba-apr .kpi span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8e8e8e)}
  #aba-apr .kpi b{font-size:17px;font-variant-numeric:tabular-nums}
  #aba-apr .seg{margin-bottom:12px}
  #aba-apr .ap{border:1px solid var(--line,#e8e8ea);border-left:4px solid #e08a00;border-radius:10px;padding:10px 12px;margin-bottom:10px;background:var(--card,#fff)}
  #aba-apr .ap.ok{border-left-color:#6aa84f} #aba-apr .ap.no{border-left-color:#b42318}
  #aba-apr .ap .t{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
  #aba-apr .ap .t b{font-size:13px;font-weight:700}
  #aba-apr .ap .t .nr{font-size:11px;color:var(--ink3,#8e8e8e);font-weight:600;white-space:nowrap}
  #aba-apr .ap .sub{font-size:11.5px;color:var(--ink2,#5c5c5c);margin-top:2px}
  #aba-apr .ap .vl{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px}
  #aba-apr .ap .vl div span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3,#8e8e8e);font-weight:700}
  #aba-apr .ap .vl div b{font-variant-numeric:tabular-nums}
  #aba-apr .ap .vl .eco{color:#1f7a3d}
  #aba-apr .ap .al{margin-top:8px;font-size:11.5px;color:#9a5b00;background:#fff4e0;border-radius:6px;padding:5px 8px}
  #aba-apr .ap .mot{margin-top:6px;font-size:11.5px;color:#8a1c12}
  #aba-apr .ap .bt{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
  #aba-apr .ap .bt .no{color:#b42318}
  #aba-apr .vazio{padding:18px 6px;text-align:center;color:var(--ink3,#8e8e8e);font-size:12.5px}
  .tema-escuro #aba-apr .ap .al{background:#3a2c0c;color:#f6d79a}`;
  document.head.appendChild(css);

  // botão no menu, logo depois de Cotações
  const btn = document.createElement('button');
  btn.dataset.aba = 'apr'; btn.dataset.nome = 'Aprovações';
  btn.innerHTML = 'Aprovações<span class="apr-n" hidden></span>';
  const bCot = $('abas').querySelector('button[data-aba="cot"]');
  if(bCot && bCot.nextSibling) $('abas').insertBefore(btn, bCot.nextSibling); else $('abas').appendChild(btn);
  btn.addEventListener('click', () => trocarAba('apr'));

  const aba = document.createElement('div');
  aba.id = 'aba-apr'; aba.style.display = 'none';
  aba.innerHTML = `
    <div class="card">
      <h2>Aprovação de cotações</h2>
      <div class="kpis"><div class="kpi"><span>Aguardando</span><b id="apr-k1">0</b></div>
        <div class="kpi"><span>Valor aguardando</span><b id="apr-k2">R$ 0</b></div>
        <div class="kpi"><span>Aprovadas no mês</span><b id="apr-k3">0</b></div></div>
      <div class="seg" id="apr-seg"><button data-v="pen" class="on">Pendentes</button><button data-v="dec">Decididas (30 dias)</button></div>
      <div id="apr-lista"></div>
      <div class="hint" style="margin-top:6px">Abra o mapa para revisar antes de decidir. Ao reprovar, escreva o motivo: a cotação volta para o comprador ajustar e reenviar.</div>
    </div>`;
  const ref = $('aba-cot') || $('aba-rel') || $('aba-clima') || $('aba-diar') || $('aba-equip') || $('aba-taxa');
  ref.parentElement.insertBefore(aba, ref.nextSibling);
  aba.querySelectorAll('#apr-seg button').forEach(b => b.onclick = () => {
    ver = b.dataset.v; aba.querySelectorAll('#apr-seg button').forEach(x => x.classList.toggle('on', x === b)); render();
  });

  // quando e por quem foi enviada para aprovação
  function envio(c){
    if(c.env && c.env.q) return c.env;
    const e = (c.hist || []).slice().reverse().find(x => /^Aguardando aprovação/.test(x.a || ''));
    return e ? {u: e.u, q: e.q} : {u: c.u, q: ''};
  }
  function haQuanto(q){
    if(!q) return '';
    const p = q.split(/[-T:]/).map(Number), d = new Date(p[0], p[1] - 1, p[2], p[3] || 0, p[4] || 0);
    const min = Math.round((Date.now() - d) / 60000);
    if(min < 60) return 'há ' + Math.max(1, min) + ' min';
    if(min < 1440) return 'há ' + Math.round(min / 60) + ' h';
    const dd = Math.round(min / 1440); return 'há ' + dd + ' dia' + (dd === 1 ? '' : 's');
  }
  function resumo(c){
    const R = C.calc(c);
    return {tot: R.final.tot, eco: R.ecoMed, forn: R.final.usados.map(id => (c.fs.find(f => f.id === id) || {}).nome).filter(Boolean)};
  }
  const pendentes = () => vivos().filter(c => c.st === 'aprovacao');

  function badge(){
    const n = pendentes().length, b = btn.querySelector('.apr-n');
    b.textContent = n; b.hidden = !n;
    btn.title = n ? n + ' cotação(ões) aguardando aprovação' : 'Nenhuma cotação aguardando aprovação';
  }

  function cartao(c, dec){
    const r = resumo(c), e = envio(c), obra = c.o ? C.nomeLocal(c.o) : 'Sem obra';
    const prob = dec ? [] : (C.problemas(c.id) || []);
    const cls = !dec ? '' : c.st === 'reprovada' ? ' no' : ' ok';
    const sit = (C.SIT[c.st] || {}).n || c.st;
    let quem = '';
    if(dec) quem = c.st === 'reprovada' && c.rep ? 'Reprovada por ' + h(c.rep.u || '—') + ' em ' + dataBR(c.rep.d) : 'Aprovada por ' + h(c.apr || '—') + ' em ' + dataBR(c.aprd) + (c.st === 'pedido' ? ' · pedido emitido' : '');
    return '<div class="ap' + cls + '" data-id="' + h(c.id) + '">'
      + '<div class="t"><b>' + h(c.tit || '(sem título)') + '</b><span class="nr">' + h(C.numCot(c)) + '</span></div>'
      + '<div class="sub">' + [h(obra), c.u ? 'comprador: ' + h(c.u) : '', c.sol ? 'solicitante: ' + h(c.sol) : ''].filter(Boolean).join(' · ') + '</div>'
      + '<div class="sub">' + (dec ? quem : 'Enviada ' + (e.q ? haQuanto(e.q) + ' (' + dataBR(e.q) + ' ' + e.q.slice(11, 16) + ')' : '') + (e.u ? ' por ' + h(e.u) : '')) + '</div>'
      + '<div class="vl"><div><span>Compra escolhida</span><b>' + (r.tot > 0 ? R$(r.tot) : '—') + '</b></div>'
      + (r.eco > 0.005 ? '<div><span>Economia</span><b class="eco">' + R$(r.eco) + '</b></div>' : '')
      + '<div><span>Itens · fornecedores</span><b>' + c.itens.length + ' · ' + c.fs.length + '</b></div>'
      + (r.forn.length ? '<div style="flex:1 1 100%"><span>Fornecedor(es)</span>' + h(r.forn.join(' + ')) + '</div>' : '') + '</div>'
      + (c.just ? '<div class="sub" style="margin-top:6px"><b>Justificativa:</b> ' + h(c.just) + '</div>' : '')
      + (prob.length ? '<div class="al">⚠ ' + prob.map(h).join('<br>⚠ ') + '</div>' : '')
      + (dec && c.st === 'reprovada' && c.rep && c.rep.mot ? '<div class="mot">Motivo: ' + h(c.rep.mot) + '</div>' : '')
      + '<div class="bt"><button class="sec mini" data-b="ver">Ver mapa</button>'
      + (dec ? '<span class="hint" style="align-self:center">' + h(sit) + '</span>'
        : '<button class="mini" data-b="ok">✓ Aprovar</button><button class="sec mini no" data-b="no">✗ Reprovar</button>') + '</div>'
      + '</div>';
  }

  function render(){
    badge();
    if(aba.style.display === 'none') return;
    const cs = vivos(), pen = pendentes(), mes = iso(new Date()).slice(0, 7);
    const lim = iso(new Date(Date.now() - 30 * 864e5));
    $('apr-k1').textContent = pen.length;
    $('apr-k2').textContent = R$(pen.reduce((s, c) => s + Math.max(0, resumo(c).tot), 0)).replace(/,\d\d$/, '');
    $('apr-k3').textContent = cs.filter(c => (c.st === 'aprovada' || c.st === 'pedido') && String(c.aprd || '').slice(0, 7) === mes).length;
    let l;
    if(ver === 'pen') l = pen.sort((a, b) => String(envio(a).q).localeCompare(String(envio(b).q))); // mais antigas primeiro
    else l = cs.map(c => ({c, d: c.st === 'reprovada' && c.rep ? c.rep.d : (c.st === 'aprovada' || c.st === 'pedido') ? c.aprd : ''}))
      .filter(x => x.d && x.d >= lim).sort((a, b) => String(b.d).localeCompare(String(a.d))).map(x => x.c);
    $('apr-lista').innerHTML = l.map(c => cartao(c, ver === 'dec')).join('')
      || '<div class="vazio">' + (ver === 'pen' ? '✓ Nenhuma cotação aguardando aprovação.' : 'Nenhuma decisão nos últimos 30 dias.') + '</div>';
    $('apr-lista').querySelectorAll('.ap [data-b]').forEach(b => b.onclick = () => {
      const id = b.closest('.ap').dataset.id, a = b.dataset.b;
      if(a === 'ver') return C.abrirAprov(id, render);
      if(a === 'ok') return C.aprovar(id, render);
      if(a === 'no') return C.reprovar(id, render);
    });
  }

  document.addEventListener('g360-cotacoes', render);
  const trocarOrig = window.trocarAba;
  window.trocarAba = function(a){
    trocarOrig.apply(this, arguments);
    aba.style.display = a === 'apr' ? '' : 'none';
    btn.classList.toggle('on', a === 'apr');
    if(a === 'apr'){ render(); try{ C.receber(); }catch(e){} }
  };
  document.addEventListener('visibilitychange', () => { if(!document.hidden && aba.style.display !== 'none') try{ C.receber(); }catch(e){} });
  // de tempos em tempos confere se chegou cotação nova (atualiza o número no botão)
  setInterval(() => { if(!document.hidden) try{ C.receber(); }catch(e){} }, 120000);

  window.G360Aprovacoes = {render};
  badge();
  try{ if(typeof ls !== 'undefined' && ls.get('aba') === 'apr') trocarAba('apr'); }catch(e){}
})();
