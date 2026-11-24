// Aba "Diárias" do Gestão 360º BKP: lançamento e fechamento das diárias de fim de semana e feriado.
// Carregado por index.html depois do app (como equipamentos.js). Não guarda nada secreto:
// os dados ficam na aba oculta "G360Diarias" da planilha Google (e numa aba legível "Diárias"),
// lidos e gravados pela mesma ligação da aba Emulsão (txApi), que é criptografada no app.enc.
//
// Regras:
//  - Colaborador CLT: sábado só meia diária (a manhã é jornada normal); domingo e feriado,
//    diária inteira ou meia. Dia útil não gera diária. Valor pela função (tabela editável).
//  - Diarista: qualquer dia, inteira ou meia (padrão R$ 150 / R$ 75).
(function(){
  if(typeof txApi !== 'function' || typeof st === 'undefined' || typeof trocarAba !== 'function') return;

  const KEY = 'dmtbkp_diarias', PEND = 'dmtbkp_diariasPend';
  const $ = id => document.getElementById(id);
  const h = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const cod = v => typeof codObra === 'function' ? codObra(v) : String(v || '').trim().toUpperCase();
  const R$ = v => typeof brl === 'function' ? brl(v) : 'R$ ' + (+v || 0).toFixed(2).replace('.', ',');
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const hoje = () => iso(new Date());
  const dt = s => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const dataBR = s => /^\d{4}-\d{2}-\d{2}/.test(s || '') ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const dm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const usuario = () => (window.DMT_SESSAO && window.DMT_SESSAO.u) || '';
  const agora = () => Date.now();
  const agoraTxt = () => { const d = new Date(); return iso(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  // ---------- dados ----------
  const VAZIO = () => ({v: 1, cfg: {valores: {}, diarista: {I: 150, M: 75}, upd: 0}, pix: {}, diaristas: [], feriados: [], lanc: [], fech: []});
  let D = VAZIO();
  try{ const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if(v && Array.isArray(v.lanc)) D = Object.assign(VAZIO(), v); }catch(e){}
  let timer = null, ultimaLeitura = 0;

  const vivos = l => l.filter(x => !x.del);
  const colaboradores = () => { try{ return JSON.parse(localStorage.getItem('dmtbkp_colaboradores') || '[]') || []; }catch(e){ return []; } };
  const ativo = c => !c.situacao || /ATIV/i.test(c.situacao);

  // valor padrão da diária por função (pode ser alterado na tabela de valores)
  function valorPadrao(f){
    f = String(f || '').toUpperCase();
    if(/ENCARREGAD/.test(f)) return 250;
    if(/MOTORISTA|OPERADOR/.test(f)) return 200;
    if(/APONTADOR/.test(f)) return 180;
    if(/AJUDANTE|RASTELEIR|MESISTA/.test(f)) return 150;
    return 0;
  }
  const valorFuncao = f => { const v = D.cfg.valores[String(f || '').toUpperCase()]; return v == null || v === '' ? valorPadrao(f) : +v; };

  // pessoas: colaboradores (c<id>) e diaristas (d<id>)
  function pessoas(){
    const l = colaboradores().filter(ativo).map(c => ({p: 'c' + c.id, n: c.nome, f: String(c.funcao || '').toUpperCase(), o: cod(c.obra), tipo: 'clt'}));
    vivos(D.diaristas).filter(d => d.ativo !== false).forEach(d => l.push({p: 'd' + d.id, n: d.nome, f: d.funcao || 'DIARISTA', o: cod(d.o), tipo: 'diarista'}));
    return l.sort((a, b) => String(a.n).localeCompare(String(b.n), 'pt-BR'));
  }
  const pix = p => (D.pix[p] && D.pix[p].v) || '';
  function setPix(p, v){ v = String(v || '').trim(); if(v === pix(p)) return; D.pix[p] = {v, upd: agora()}; salvar(true); }

  // locais
  function locais(){
    const l = [{cod: 'ADM', nome: 'Sede (ADM)'}];
    (st.obras || []).forEach(o => {
      const c = cod(o.codigo); if(!c || l.some(x => x.cod === c)) return;
      if(o.status === 'concluida') return;
      l.push({cod: c, nome: c + ' – ' + (o.local || o.nome)});
    });
    return l;
  }
  const nomeLocal = c => (locais().find(x => x.cod === c) || {}).nome || c || '—';

  // ---------- feriados ----------
  function pascoa(y){
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451),
      mes = Math.floor((hh + l - 7 * m + 114) / 31), dia = ((hh + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  function nacionais(y){
    const f = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência'],
      ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'], ['12-25', 'Natal']]
      .map(([md, n]) => ({d: y + '-' + md, nome: n, nac: true}));
    const sexta = pascoa(y); sexta.setDate(sexta.getDate() - 2);
    f.push({d: iso(sexta), nome: 'Sexta-feira Santa', nac: true});
    return f.sort((a, b) => a.d.localeCompare(b.d));
  }
  // feriado na data para a obra (nacional, cadastrado para todas ou para aquela obra; "todo ano" compara dia/mês)
  function feriado(d, o){
    const n = nacionais(+d.slice(0, 4)).find(x => x.d === d);
    if(n) return n.nome;
    const m = vivos(D.feriados).find(x => (!x.o || x.o === o) && (x.anual ? x.d.slice(5) === d.slice(5) : x.d === d));
    return m ? m.nome : '';
  }
  function tipoDia(d, o){
    const fer = feriado(d, o), w = dt(d).getDay();
    if(fer) return {k: 'fer', nome: 'Feriado: ' + fer, fer};
    if(w === 0) return {k: 'dom', nome: 'Domingo'};
    if(w === 6) return {k: 'sab', nome: 'Sábado'};
    return {k: 'util', nome: 'Dia útil (' + SEM[w] + ')'};
  }
  // o que a pessoa pode receber naquele dia: null = não pode; senão {I, M} em reais (I pode ser null)
  function regra(pe, dia){
    if(pe.tipo === 'diarista') return {I: +D.cfg.diarista.I || 0, M: +D.cfg.diarista.M || 0};
    const v = valorFuncao(pe.f);
    if(!(v > 0)) return {erro: 'função sem valor de diária'};
    if(dia.k === 'util') return {erro: 'dia útil: só diaristas'};
    if(dia.k === 'sab') return {I: null, M: v / 2};
    return {I: v, M: v / 2};
  }
  const lancDe = (p, d) => vivos(D.lanc).find(x => x.p === p && x.d === d);

  // ---------- montar a aba ----------
  const css = document.createElement('style');
  css.textContent = `
  #aba-diar .seg{margin-bottom:12px}
  #aba-diar ul{list-style:none;margin:6px 0 0;padding:0}
  #aba-diar .dl{max-height:52vh;overflow:auto}
  #aba-diar .li{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line2,#f2f2f3);font-size:12.5px}
  #aba-diar .li input[type=checkbox]{width:auto;margin:0;flex:0 0 auto}
  #aba-diar .li .nm{flex:1 1 auto;min-width:0}
  #aba-diar .li .nm b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  #aba-diar .li .nm small{display:block;color:var(--ink3,#8e8e8e);font-size:11px}
  #aba-diar .li .vl{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
  #aba-diar .li.off{opacity:.5}
  #aba-diar .li .x{background:none;border:0;color:#b42318;padding:2px 6px;font-size:14px;cursor:pointer}
  #aba-diar .dia{padding:8px 10px;border-radius:8px;background:var(--head,#f6f6f7);font-size:12.5px;margin-top:8px}
  #aba-diar .dia.fer,#aba-diar .dia.dom{background:#fdf0e8;color:#8a3a12}
  #aba-diar .dia.util{background:#f2f2f3;color:#5c5c5c}
  #aba-diar .tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;font-size:12.5px}
  #aba-diar .tot b{font-size:19px}
  #aba-diar .grp{margin-top:10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3,#8e8e8e)}
  #aba-diar table{width:100%;border-collapse:collapse;margin-top:6px}
  #aba-diar th,#aba-diar td{text-align:left;padding:5px 4px;vertical-align:top}
  #aba-diar td.n,#aba-diar th.n{text-align:right;white-space:nowrap}
  #aba-diar td input{width:100%;padding:4px 6px;font-size:11.5px}
  #aba-diar .tag{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:0 6px;border:1px solid var(--line,#e8e8ea)}
  #aba-diar .tag.pago{color:#1f7a3d;border-color:#1f7a3d}
  #aba-diar .tag.sol{color:#b26a00;border-color:#b26a00}
  #aba-diar .aviso{color:#b42318;font-size:11.5px}
  #aba-diar .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 8px}
  #dia-modal{position:fixed;inset:0;background:rgba(0,0,0,.30);display:flex;align-items:center;justify-content:center;z-index:5000}
  #dia-modal form{background:#fff;border-radius:12px;padding:18px;width:420px;max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.12)}
  #dia-modal input,#dia-modal select{width:100%}
  #dia-modal h2{margin:0 0 6px;font-size:15px}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.dataset.aba = 'diar'; btn.textContent = 'Diárias';
  $('abas').appendChild(btn);
  btn.addEventListener('click', () => trocarAba('diar'));

  const aba = document.createElement('div');
  aba.id = 'aba-diar'; aba.style.display = 'none';
  aba.innerHTML = `
    <div class="seg" id="dia-sub">
      <button data-s="lan" class="on">Lançar</button><button data-s="fec">Fechamento</button>
      <button data-s="his">Histórico</button><button data-s="cad">Cadastros</button>
    </div>

    <div data-p="lan">
      <div class="card">
        <h2>Lançar diárias</h2>
        <div class="row3">
          <div><label for="dia-d">Data</label><input type="date" id="dia-d"></div>
          <div><label for="dia-o">Obra</label><select id="dia-o"></select></div>
          <div><label for="dia-t">Período</label><select id="dia-t"><option value="I">Dia inteiro</option><option value="M">Meio período</option></select></div>
        </div>
        <div class="dia" id="dia-info"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <label class="chk" style="margin:0"><input type="checkbox" id="dia-todos"> Mostrar pessoas de outras obras</label>
          <button class="sec mini" id="dia-marcar">Marcar todos</button>
        </div>
        <ul class="dl" id="dia-pess"></ul>
        <label for="dia-obs">Observação (opcional)</label>
        <input id="dia-obs" placeholder="Ex.: concretagem da passagem molhada" style="width:100%">
        <div class="tot"><span id="dia-qtd">Nenhuma pessoa marcada</span><b id="dia-soma">R$ 0,00</b></div>
        <div class="btns"><button id="dia-lancar" disabled>Lançar</button>
          <button class="sec mini" id="dia-novo-dia">Cadastrar diarista</button></div>
        <div class="hint" id="dia-estado" style="margin-top:6px"></div>
      </div>
      <div class="card">
        <h2>Lançamentos em aberto</h2>
        <div class="tot" style="margin-top:0"><span id="dia-ab-n"></span><b id="dia-ab-t"></b></div>
        <ul class="dl" id="dia-ab"></ul>
      </div>
    </div>

    <div data-p="fec" style="display:none">
      <div class="card">
        <h2>Fechamento de diárias</h2>
        <div class="row3">
          <div><label for="fec-i">De</label><input type="date" id="fec-i"></div>
          <div><label for="fec-f">Até</label><input type="date" id="fec-f"></div>
          <div><label for="fec-o">Obra</label><select id="fec-o"></select></div>
        </div>
        <div class="tot"><span id="fec-res"></span><b id="fec-tot">R$ 0,00</b></div>
        <div class="aviso" id="fec-aviso"></div>
        <div id="fec-tab"></div>
        <div class="btns"><button id="fec-ok" disabled>Fechar período e imprimir</button>
          <button class="sec mini" id="fec-previa" disabled>Imprimir prévia</button></div>
        <div class="hint" style="margin-top:6px">Ao fechar, os lançamentos do período saem da lista em aberto e o fechamento vai para o Histórico, onde dá para reimprimir, marcar como pago ou reabrir.</div>
      </div>
    </div>

    <div data-p="his" style="display:none">
      <div class="card">
        <h2>Fechamentos</h2>
        <input id="his-busca" placeholder="Buscar por nome, obra ou nº do fechamento" style="width:100%">
        <ul id="his-lista"></ul>
      </div>
      <div class="card">
        <h2>Consultar lançamentos</h2>
        <div class="row3">
          <div><label for="con-i">De</label><input type="date" id="con-i"></div>
          <div><label for="con-f">Até</label><input type="date" id="con-f"></div>
          <div><label for="con-o">Obra</label><select id="con-o"></select></div>
        </div>
        <label for="con-p">Pessoa</label><input id="con-p" placeholder="Nome (opcional)" style="width:100%">
        <div class="tot"><span id="con-res"></span><b id="con-tot"></b></div>
        <div id="con-tab"></div>
        <div class="btns"><button class="sec mini" id="con-csv">Baixar planilha (CSV)</button></div>
      </div>
    </div>

    <div data-p="cad" style="display:none">
      <div class="card">
        <h2>Diaristas</h2>
        <ul id="cad-diar"></ul>
        <div class="btns"><button id="cad-diar-add">Cadastrar diarista</button></div>
      </div>
      <div class="card">
        <h2>Chaves PIX</h2>
        <input id="cad-pix-busca" placeholder="Buscar nome" style="width:100%">
        <div id="cad-pix" style="max-height:50vh;overflow:auto"></div>
      </div>
      <div class="card">
        <h2>Valor da diária por função</h2>
        <div class="hint">Meia diária = metade do valor. Funções com R$ 0 não recebem diária.</div>
        <div id="cad-val"></div>
        <div class="row3" style="margin-top:6px">
          <div><label>Diarista – inteira</label><input type="number" min="0" step="5" id="cad-di"></div>
          <div><label>Diarista – meia</label><input type="number" min="0" step="5" id="cad-dm"></div>
        </div>
      </div>
      <div class="card">
        <h2>Feriados</h2>
        <div class="hint">Os nacionais já estão incluídos. Cadastre aqui os estaduais e municipais de cada obra (ou pontos facultativos que a empresa adote).</div>
        <ul id="cad-fer"></ul>
        <div class="btns"><button id="cad-fer-add">Cadastrar feriado</button></div>
      </div>
    </div>`;
  const ref = $('aba-equip') || $('aba-taxa');
  ref.parentElement.insertBefore(aba, ref.nextSibling);

  let sub = 'lan';
  aba.querySelectorAll('#dia-sub button').forEach(b => b.onclick = () => { sub = b.dataset.s; render(); });

  // ---------- estado dos formulários ----------
  const L = {sel: new Set()};
  $('dia-d').value = hoje();
  ['dia-d', 'dia-o', 'dia-t'].forEach(id => $(id).onchange = () => { L.sel.clear(); renderLancar(); });
  $('dia-todos').onchange = () => renderLancar();
  $('dia-marcar').onclick = () => {
    const disp = [...$('dia-pess').querySelectorAll('input[data-p]:not(:disabled)')];
    const todos = disp.every(i => i.checked);
    disp.forEach(i => todos ? L.sel.delete(i.dataset.p) : L.sel.add(i.dataset.p));
    renderLancar();
  };
  $('dia-lancar').onclick = lancar;
  $('dia-novo-dia').onclick = () => editarDiarista(null);
  ['fec-i', 'fec-f', 'fec-o'].forEach(id => $(id).onchange = renderFechamento);
  $('fec-ok').onclick = () => fechar(false);
  $('fec-previa').onclick = () => fechar(true);
  $('his-busca').oninput = renderHistorico;
  ['con-i', 'con-f', 'con-o'].forEach(id => $(id).onchange = renderConsulta);
  $('con-p').oninput = renderConsulta;
  $('con-csv').onclick = csv;
  $('cad-diar-add').onclick = () => editarDiarista(null);
  $('cad-fer-add').onclick = editarFeriado;
  $('cad-pix-busca').oninput = renderCadastros;
  $('cad-di').onchange = $('cad-dm').onchange = () => {
    D.cfg.diarista = {I: +$('cad-di').value || 0, M: +$('cad-dm').value || 0}; D.cfg.upd = agora(); salvar();
  };
  { const d = new Date(); d.setDate(1); $('con-i').value = iso(d); $('con-f').value = hoje(); }

  function opcoesObra(sel, comTodas){
    const atual = sel.value;
    sel.innerHTML = (comTodas ? '<option value="">Todas as obras</option>' : '') + locais().map(l => '<option value="' + h(l.cod) + '">' + h(l.nome) + '</option>').join('');
    if([...sel.options].some(o => o.value === atual)) sel.value = atual;
    else if(!comTodas){ const pref = locais().find(l => l.cod !== 'ADM'); if(pref) sel.value = pref.cod; }
  }

  // ---------- render ----------
  function render(){
    aba.querySelectorAll('#dia-sub button').forEach(b => b.classList.toggle('on', b.dataset.s === sub));
    aba.querySelectorAll('[data-p]').forEach(p => p.style.display = p.dataset.p === sub ? '' : 'none');
    if(sub === 'lan') renderLancar();
    if(sub === 'fec') renderFechamento();
    if(sub === 'his'){ renderHistorico(); renderConsulta(); }
    if(sub === 'cad') renderCadastros();
  }

  function renderLancar(){
    opcoesObra($('dia-o'), false);
    const d = $('dia-d').value, o = $('dia-o').value, t = $('dia-t').value;
    if(!d){ $('dia-info').textContent = 'Escolha a data.'; return; }
    const dia = tipoDia(d, o);
    $('dia-info').className = 'dia ' + dia.k;
    $('dia-info').textContent = dataBR(d) + ' · ' + dia.nome + ' — ' + ({
      sab: 'colaboradores recebem meia diária (trabalho à tarde); diaristas, conforme o período.',
      dom: 'diária inteira ou meia, conforme o período trabalhado.',
      fer: 'diária inteira ou meia, conforme o período trabalhado.',
      util: 'dia normal de trabalho: só diaristas recebem diária.'})[dia.k];
    const todos = $('dia-todos').checked;
    const ps = pessoas().filter(p => todos || p.o === o);
    let soma = 0, n = 0;
    $('dia-pess').innerHTML = ps.map(p => {
      const r = regra(p, dia), ja = lancDe(p.p, d);
      let v = null, motivo = '';
      if(ja) motivo = 'já lançado nesse dia (' + (ja.t === 'I' ? 'inteira' : 'meia') + ')';
      else if(r.erro) motivo = r.erro;
      else { v = t === 'I' && r.I != null ? r.I : r.M; if(t === 'I' && r.I == null) motivo = 'sábado: meia diária'; }
      const pode = !ja && !r.erro;
      if(!pode) L.sel.delete(p.p);
      const marc = pode && L.sel.has(p.p);
      if(marc){ soma += v; n++; }
      return '<li class="li' + (pode ? '' : ' off') + '"><input type="checkbox" data-p="' + h(p.p) + '"' + (pode ? '' : ' disabled') + (marc ? ' checked' : '') + '>'
        + '<span class="nm"><b>' + h(p.n) + '</b><small>' + h(p.f) + (p.tipo === 'diarista' ? ' · diarista' : '') + (p.o !== o ? ' · ' + h(p.o || 'sem obra') : '')
        + (motivo ? ' · ' + h(motivo) : '') + (pode && !pix(p.p) ? ' · <span style="color:#b26a00">sem PIX</span>' : '') + '</small></span>'
        + '<span class="vl">' + (v != null ? R$(v) : '') + '</span></li>';
    }).join('') || '<li class="hint" style="padding:10px 0">Ninguém alocado nessa obra. Marque "Mostrar pessoas de outras obras" ou cadastre um diarista.</li>';
    $('dia-pess').querySelectorAll('input[data-p]').forEach(i => i.onchange = () => { i.checked ? L.sel.add(i.dataset.p) : L.sel.delete(i.dataset.p); renderLancar(); });
    $('dia-qtd').textContent = n ? n + ' pessoa(s) marcada(s)' : 'Nenhuma pessoa marcada';
    $('dia-soma').textContent = R$(soma);
    $('dia-lancar').disabled = !n;
    $('dia-lancar').textContent = n ? 'Lançar ' + n + ' diária(s)' : 'Lançar';
    renderAberto();
  }

  function linhaLanc(x, comX){
    return '<li class="li"><span class="nm"><b>' + h(x.n) + '</b><small>' + dm(x.d) + ' ' + SEM[dt(x.d).getDay()] + ' · ' + h(x.o) + ' · '
      + (x.t === 'I' ? 'inteira' : 'meia') + (x.fer ? ' · ' + h(x.fer) : '') + (x.obs ? ' · ' + h(x.obs) : '') + (x.u ? ' · por ' + h(x.u) : '') + '</small></span>'
      + '<span class="vl">' + R$(x.v) + '</span>' + (comX ? '<button class="x" data-id="' + h(x.id) + '" title="Excluir lançamento">✕</button>' : '') + '</li>';
  }

  function renderAberto(){
    const ab = vivos(D.lanc).filter(x => !x.fx).sort((a, b) => b.d.localeCompare(a.d) || String(a.n).localeCompare(String(b.n), 'pt-BR'));
    $('dia-ab-n').textContent = ab.length ? ab.length + ' lançamento(s) a fechar' : 'Nada em aberto.';
    $('dia-ab-t').textContent = ab.length ? R$(ab.reduce((s, x) => s + x.v, 0)) : '';
    $('dia-ab').innerHTML = ab.map(x => linhaLanc(x, true)).join('');
    $('dia-ab').querySelectorAll('.x').forEach(b => b.onclick = () => {
      const x = D.lanc.find(l => l.id === b.dataset.id);
      if(!x || !confirm('Excluir a diária de ' + x.n + ' em ' + dataBR(x.d) + '?')) return;
      x.del = true; x.upd = agora(); salvar();
    });
  }

  function lancar(){
    const d = $('dia-d').value, o = $('dia-o').value, t = $('dia-t').value, obs = $('dia-obs').value.trim();
    const dia = tipoDia(d, o), ps = pessoas().filter(p => L.sel.has(p.p));
    let n = 0;
    ps.forEach(p => {
      const r = regra(p, dia); if(r.erro || lancDe(p.p, d)) return;
      const tt = t === 'I' && r.I != null ? 'I' : 'M';
      D.lanc.push({id: uid(), d, p: p.p, n: p.n, f: p.f, o, t: tt, k: dia.k, fer: dia.fer || '',
        v: tt === 'I' ? r.I : r.M, obs, u: usuario(), q: agoraTxt(), fx: '', upd: agora()});
      n++;
    });
    L.sel.clear(); $('dia-obs').value = '';
    salvar();
    $('dia-estado').textContent = n + ' diária(s) lançada(s) em ' + dataBR(d) + '.';
  }

  // ---------- fechamento ----------
  function abertosPeriodo(){
    const i = $('fec-i').value, f = $('fec-f').value, o = $('fec-o').value;
    return vivos(D.lanc).filter(x => !x.fx && (!i || x.d >= i) && (!f || x.d <= f) && (!o || x.o === o));
  }
  // agrupa por obra e pessoa
  function agrupar(lanc, pixDe){
    const obras = {};
    lanc.forEach(x => {
      const ob = obras[x.o] = obras[x.o] || {o: x.o, pes: {}, tot: 0};
      const pe = ob.pes[x.p] = ob.pes[x.p] || {p: x.p, n: x.n, f: x.f, dias: [], I: 0, M: 0, tot: 0, pix: pixDe(x.p)};
      pe.dias.push(x); pe[x.t]++; pe.tot += x.v; ob.tot += x.v;
    });
    return Object.values(obras).sort((a, b) => a.o.localeCompare(b.o)).map(ob => {
      ob.pes = Object.values(ob.pes).sort((a, b) => String(a.n).localeCompare(String(b.n), 'pt-BR'));
      ob.pes.forEach(p => p.dias.sort((a, b) => a.d.localeCompare(b.d)));
      return ob;
    });
  }
  const diasTxt = p => p.dias.map(x => dm(x.d) + ' ' + SEM[dt(x.d).getDay()] + (x.t === 'M' ? ' ½' : '')).join(', ');

  function renderFechamento(){
    opcoesObra($('fec-o'), true);
    const todosAb = vivos(D.lanc).filter(x => !x.fx);
    if(!$('fec-i').value) $('fec-i').value = todosAb.length ? todosAb.map(x => x.d).sort()[0] : hoje();
    if(!$('fec-f').value) $('fec-f').value = hoje();
    const l = abertosPeriodo(), g = agrupar(l, pix), tot = l.reduce((s, x) => s + x.v, 0);
    const npes = new Set(l.map(x => x.p)).size, semPix = new Set(l.filter(x => !pix(x.p)).map(x => x.p)).size;
    $('fec-res').textContent = l.length ? l.length + ' diária(s) · ' + npes + ' pessoa(s)' : 'Nenhum lançamento em aberto nesse período.';
    $('fec-tot').textContent = R$(tot);
    $('fec-aviso').textContent = semPix ? semPix + ' pessoa(s) sem chave PIX — preencha abaixo antes de fechar.' : '';
    $('fec-tab').innerHTML = g.map(ob => '<div class="grp">' + h(nomeLocal(ob.o)) + ' · ' + R$(ob.tot) + '</div><table><tr><th>Nome</th><th class="n">Dias</th><th class="n">Total</th><th style="width:38%">Chave PIX</th></tr>'
      + ob.pes.map(p => '<tr><td><b>' + h(p.n) + '</b><br><small style="color:#8e8e8e">' + h(p.f) + ' · ' + h(diasTxt(p)) + '</small></td>'
        + '<td class="n">' + (p.I + p.M / 2).toLocaleString('pt-BR') + '</td><td class="n">' + R$(p.tot) + '</td>'
        + '<td><input data-pix="' + h(p.p) + '" value="' + h(p.pix) + '" placeholder="CPF, celular, e-mail…"></td></tr>').join('') + '</table>').join('');
    $('fec-tab').querySelectorAll('input[data-pix]').forEach(i => i.onchange = () => { setPix(i.dataset.pix, i.value); renderFechamento(); });
    $('fec-ok').disabled = $('fec-previa').disabled = !l.length;
  }

  function fechar(previa){
    const l = abertosPeriodo(); if(!l.length) return;
    const i = $('fec-i').value, f = $('fec-f').value, o = $('fec-o').value;
    const pixs = {}; l.forEach(x => pixs[x.p] = pix(x.p));
    const tot = l.reduce((s, x) => s + x.v, 0);
    const fc = {id: uid(), n: vivos(D.fech).reduce((m, x) => Math.max(m, x.n || 0), 0) + 1, ini: i, fim: f, o, q: agoraTxt(),
      u: usuario(), tot, qtd: l.length, ids: l.map(x => x.id), pix: pixs, st: 'solicitado', upd: agora()};
    if(previa){ imprimir(fc, l, true); return; }
    const semPix = Object.values(pixs).filter(v => !v).length;
    if(!confirm('Fechar ' + l.length + ' diária(s), total ' + R$(tot) + '?' + (semPix ? '\n\nAtenção: há pessoa(s) sem chave PIX.' : ''))) return;
    D.fech.push(fc);
    const t = agora(); l.forEach(x => { x.fx = fc.id; x.upd = t; });
    salvar();
    imprimir(fc, l, false);
  }

  // ---------- relatório para impressão ----------
  function imprimir(fc, lanc, previa){
    const g = agrupar(lanc, p => fc.pix && p in fc.pix ? fc.pix[p] : pix(p));
    const base = location.href.replace(/[^/]*$/, '');
    const per = dataBR(fc.ini) + ' a ' + dataBR(fc.fim);
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diárias ${previa ? '(prévia)' : 'nº ' + fc.n} – ${per}</title>
<style>
 @page{size:A4;margin:14mm 12mm}
 body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#232323;margin:0}
 .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #C05621;padding-bottom:8px;margin-bottom:10px}
 .cab img{height:34px} .cab h1{font-size:16px;margin:0} .cab span{font-size:10px;color:#8e8e8e;letter-spacing:.1em;text-transform:uppercase}
 .info{display:flex;flex-wrap:wrap;gap:4px 22px;margin-bottom:10px;font-size:11px} .info b{font-weight:700}
 h2{font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 4px;color:#5c5c5c}
 table{width:100%;border-collapse:collapse;page-break-inside:auto} tr{page-break-inside:avoid}
 th{background:#f6f6f7;font-size:9px;text-transform:uppercase;text-align:left;padding:5px;border-bottom:1px solid #ddd}
 td{padding:5px;border-bottom:1px solid #eee;vertical-align:top} .n{text-align:right;white-space:nowrap}
 .sub td{font-weight:700;background:#fafafa} .dias{color:#5c5c5c;font-size:10px}
 .geral{margin-top:14px;text-align:right;font-size:14px} .geral b{font-size:16px}
 .ass{display:flex;gap:40px;margin-top:50px} .ass div{flex:1;border-top:1px solid #999;padding-top:4px;text-align:center;font-size:10px}
 .previa{color:#b42318;font-weight:700}
 .rod{margin-top:16px;font-size:9px;color:#8e8e8e}
</style></head><body>
<div class="cab"><img src="${base}logo-bkp.png" alt=""><div><h1>Solicitação de pagamento de diárias</h1><span>BKP Construtora</span></div></div>
<div class="info"><div><b>${previa ? '<span class="previa">PRÉVIA — período ainda não fechado</span>' : 'Fechamento nº ' + fc.n}</b></div>
 <div>Período: <b>${per}</b></div><div>Obra: <b>${h(fc.o ? nomeLocal(fc.o) : 'Todas')}</b></div>
 <div>Emitido em ${dataBR(fc.q.slice(0, 10))} ${fc.q.slice(11, 16)}${fc.u ? ' por ' + h(fc.u) : ''}</div></div>
${g.map(ob => `<h2>${h(nomeLocal(ob.o))}</h2><table><tr><th>Nome</th><th>Função</th><th>Dias trabalhados</th><th class="n">Diárias</th><th class="n">Valor</th><th>Chave PIX</th></tr>
${ob.pes.map(p => `<tr><td><b>${h(p.n)}</b></td><td>${h(p.f)}</td><td class="dias">${h(diasTxt(p))}</td><td class="n">${p.I ? p.I + ' int.' : ''}${p.I && p.M ? ' + ' : ''}${p.M ? p.M + ' meia' + (p.M > 1 ? 's' : '') : ''}</td><td class="n">${R$(p.tot)}</td><td>${h(p.pix) || '<i style="color:#b42318">não informada</i>'}</td></tr>`).join('')}
<tr class="sub"><td colspan="4">Subtotal ${h(ob.o)} · ${ob.pes.length} pessoa(s)</td><td class="n">${R$(ob.tot)}</td><td></td></tr></table>`).join('')}
<div class="geral">Total geral: <b>${R$(fc.tot)}</b> · ${fc.qtd} lançamento(s)</div>
<div class="ass"><div>Solicitado por</div><div>Aprovado por</div><div>Financeiro</div></div>
<div class="rod">½ = meia diária. Sábado: meia diária (tarde), por ser dia de jornada CLT até 12h. Domingo e feriado: inteira ou meia conforme o período trabalhado. Gerado pelo Gestão 360º BKP.</div>
</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const ir = () => { try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){} setTimeout(() => fr.remove(), 60000); };
    const img = doc.querySelector('img');
    if(img && !img.complete){ img.onload = img.onerror = ir; setTimeout(ir, 3000); } else setTimeout(ir, 200);
  }

  // ---------- histórico ----------
  function renderHistorico(){
    const b = $('his-busca').value.trim().toLowerCase();
    const fs = vivos(D.fech).sort((a, b2) => (b2.n || 0) - (a.n || 0)).filter(fc => {
      if(!b) return true;
      const ls = D.lanc.filter(x => x.fx === fc.id);
      return ('nº ' + fc.n + ' ' + fc.n + ' ' + (fc.o || 'todas') + ' ' + ls.map(x => x.n + ' ' + x.o).join(' ')).toLowerCase().includes(b);
    });
    $('his-lista').innerHTML = fs.map(fc => '<li class="li"><span class="nm"><b>Nº ' + fc.n + ' · ' + dataBR(fc.ini) + ' a ' + dataBR(fc.fim) + '</b><small>'
      + h(fc.o ? nomeLocal(fc.o) : 'Todas as obras') + ' · ' + fc.qtd + ' diária(s) · fechado em ' + dataBR(fc.q.slice(0, 10)) + (fc.u ? ' por ' + h(fc.u) : '')
      + ' · <span class="tag ' + (fc.st === 'pago' ? 'pago">pago' + (fc.pg ? ' em ' + dataBR(fc.pg) : '') : 'sol">pagamento solicitado') + '</span></small></span>'
      + '<span class="vl">' + R$(fc.tot) + '</span>'
      + '<span style="display:flex;flex-direction:column;gap:3px"><button class="sec mini" data-a="imp" data-id="' + fc.id + '">Imprimir</button>'
      + '<button class="sec mini" data-a="pag" data-id="' + fc.id + '">' + (fc.st === 'pago' ? 'Desmarcar pago' : 'Marcar pago') + '</button>'
      + '<button class="sec mini" data-a="rea" data-id="' + fc.id + '" style="color:#b42318">Reabrir</button></span></li>').join('')
      || '<li class="hint" style="padding:10px 0">Nenhum fechamento ainda.</li>';
    $('his-lista').querySelectorAll('button[data-a]').forEach(bt => bt.onclick = () => {
      const fc = D.fech.find(x => x.id === bt.dataset.id); if(!fc) return;
      const ls = D.lanc.filter(x => x.fx === fc.id && !x.del);
      if(bt.dataset.a === 'imp') imprimir(fc, ls, false);
      if(bt.dataset.a === 'pag'){ fc.st = fc.st === 'pago' ? 'solicitado' : 'pago'; fc.pg = fc.st === 'pago' ? hoje() : ''; fc.upd = agora(); salvar(); }
      if(bt.dataset.a === 'rea'){
        if(!confirm('Reabrir o fechamento nº ' + fc.n + '? As ' + ls.length + ' diária(s) voltam para a lista em aberto e o fechamento sai do histórico.')) return;
        const t = agora(); fc.del = true; fc.upd = t; ls.forEach(x => { x.fx = ''; x.upd = t; }); salvar();
      }
    });
  }

  function consulta(){
    const i = $('con-i').value, f = $('con-f').value, o = $('con-o').value, p = $('con-p').value.trim().toLowerCase();
    return vivos(D.lanc).filter(x => (!i || x.d >= i) && (!f || x.d <= f) && (!o || x.o === o) && (!p || String(x.n).toLowerCase().includes(p)))
      .sort((a, b) => b.d.localeCompare(a.d) || String(a.n).localeCompare(String(b.n), 'pt-BR'));
  }
  const fechNum = id => { const fc = D.fech.find(x => x.id === id && !x.del); return fc ? fc.n : ''; };
  function renderConsulta(){
    opcoesObra($('con-o'), true);
    const l = consulta();
    $('con-res').textContent = l.length + ' lançamento(s)';
    $('con-tot').textContent = R$(l.reduce((s, x) => s + x.v, 0));
    $('con-tab').innerHTML = '<ul class="dl">' + l.slice(0, 400).map(x => linhaLanc(x, false).replace('</small>', ' · ' + (x.fx ? 'fechamento nº ' + fechNum(x.fx) : '<b>em aberto</b>') + '</small>')).join('') + '</ul>'
      + (l.length > 400 ? '<div class="hint">Mostrando 400 de ' + l.length + '. Baixe o CSV para ver todos.</div>' : '');
  }
  function csv(){
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const linhas = [['Data', 'Dia', 'Nome', 'Função', 'Obra', 'Período', 'Tipo de dia', 'Valor', 'Chave PIX', 'Fechamento', 'Observação', 'Lançado por'].map(q).join(';')]
      .concat(consulta().map(x => [dataBR(x.d), SEM[dt(x.d).getDay()], x.n, x.f, x.o, x.t === 'I' ? 'Inteira' : 'Meia',
        x.fer || ({sab: 'Sábado', dom: 'Domingo', util: 'Dia útil'})[x.k] || '', String(x.v.toFixed(2)).replace('.', ','), pix(x.p),
        x.fx ? 'Nº ' + fechNum(x.fx) : 'Em aberto', x.obs, x.u].map(q).join(';')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + linhas.join('\r\n')], {type: 'text/csv;charset=utf-8'}));
    a.download = 'diarias-' + ($('con-i').value || 'inicio') + '-a-' + ($('con-f').value || hoje()) + '.csv'; a.click();
  }

  // ---------- cadastros ----------
  function renderCadastros(){
    // diaristas
    $('cad-diar').innerHTML = vivos(D.diaristas).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(d => '<li class="li' + (d.ativo === false ? ' off' : '') + '"><span class="nm"><b>' + h(d.nome) + '</b><small>'
      + h(d.funcao || 'DIARISTA') + ' · ' + h(d.o ? nomeLocal(d.o) : 'sem obra') + ' · ' + (pix('d' + d.id) ? 'PIX: ' + h(pix('d' + d.id)) : '<span style="color:#b26a00">sem PIX</span>')
      + (d.ativo === false ? ' · inativo' : '') + '</small></span><button class="sec mini" data-id="' + h(d.id) + '">Editar</button></li>').join('')
      || '<li class="hint" style="padding:8px 0">Nenhum diarista cadastrado.</li>';
    $('cad-diar').querySelectorAll('button[data-id]').forEach(b => b.onclick = () => editarDiarista(D.diaristas.find(x => x.id === b.dataset.id)));
    // pix
    const bq = $('cad-pix-busca').value.trim().toLowerCase();
    const ps = pessoas().filter(p => !bq || String(p.n).toLowerCase().includes(bq));
    $('cad-pix').innerHTML = '<table><tr><th>Nome</th><th style="width:48%">Chave PIX</th></tr>' + ps.map(p => '<tr><td><b>' + h(p.n) + '</b><br><small style="color:#8e8e8e">' + h(p.f) + ' · ' + h(p.o || '—') + '</small></td>'
      + '<td><input data-pix="' + h(p.p) + '" value="' + h(pix(p.p)) + '" placeholder="CPF, celular, e-mail…"></td></tr>').join('') + '</table>';
    $('cad-pix').querySelectorAll('input[data-pix]').forEach(i => i.onchange = () => setPix(i.dataset.pix, i.value));
    // valores
    const fun = [...new Set(colaboradores().filter(ativo).map(c => String(c.funcao || '').toUpperCase()).concat(Object.keys(D.cfg.valores)))].filter(Boolean)
      .sort((a, b) => valorFuncao(b) - valorFuncao(a) || a.localeCompare(b, 'pt-BR'));
    $('cad-val').innerHTML = '<table><tr><th>Função</th><th class="n">Inteira (R$)</th><th class="n">Meia</th></tr>' + fun.map(f => '<tr><td>' + h(f) + '</td>'
      + '<td class="n" style="width:110px"><input type="number" min="0" step="5" data-f="' + h(f) + '" value="' + valorFuncao(f) + '" style="text-align:right"></td><td class="n">' + R$(valorFuncao(f) / 2) + '</td></tr>').join('') + '</table>';
    $('cad-val').querySelectorAll('input[data-f]').forEach(i => i.onchange = () => { D.cfg.valores[i.dataset.f] = Math.max(0, +i.value || 0); D.cfg.upd = agora(); salvar(); });
    $('cad-di').value = D.cfg.diarista.I; $('cad-dm').value = D.cfg.diarista.M;
    // feriados
    const y = new Date().getFullYear();
    const lst = nacionais(y).map(f => ({d: f.d, nome: f.nome, quem: 'nacional'}))
      .concat(vivos(D.feriados).map(f => ({id: f.id, d: f.anual ? y + f.d.slice(4) : f.d, nome: f.nome, quem: (f.o ? f.o : 'todas as obras') + (f.anual ? ' · todo ano' : '')})))
      .sort((a, b) => a.d.localeCompare(b.d));
    $('cad-fer').innerHTML = lst.map(f => '<li class="li"><span class="nm"><b>' + dataBR(f.d) + ' ' + SEM[dt(f.d).getDay()] + ' – ' + h(f.nome) + '</b><small>' + h(f.quem) + '</small></span>'
      + (f.id ? '<button class="x" data-id="' + h(f.id) + '" title="Excluir">✕</button>' : '') + '</li>').join('');
    $('cad-fer').querySelectorAll('.x').forEach(b => b.onclick = () => {
      const f = D.feriados.find(x => x.id === b.dataset.id); if(!f || !confirm('Excluir o feriado "' + f.nome + '"?')) return;
      f.del = true; f.upd = agora(); salvar();
    });
  }

  function modal(titulo, corpo, ok){
    const m = document.createElement('div'); m.id = 'dia-modal';
    m.innerHTML = '<form><h2>' + h(titulo) + '</h2>' + corpo + '<div class="btns"><button type="submit">Salvar</button><button type="button" class="sec" data-x>Cancelar</button></div></form>';
    document.body.appendChild(m);
    const f = m.querySelector('form'), fechar = () => m.remove();
    m.querySelector('[data-x]').onclick = fechar;
    m.onclick = ev => { if(ev.target === m) fechar(); };
    f.onsubmit = ev => { ev.preventDefault(); if(ok(Object.fromEntries(new FormData(f).entries()), f) !== false) fechar(); };
    const pri = f.querySelector('input'); if(pri) pri.focus();
    return f;
  }
  const optLocais = (atual, vazio) => (vazio ? '<option value="">' + vazio + '</option>' : '') + locais().map(l => '<option value="' + h(l.cod) + '"' + (l.cod === atual ? ' selected' : '') + '>' + h(l.nome) + '</option>').join('');

  function editarDiarista(d){
    const novo = !d;
    d = d || {id: uid(), nome: '', funcao: 'DIARISTA', o: $('dia-o').value || '', ativo: true};
    modal(novo ? 'Cadastrar diarista' : 'Editar diarista',
      '<label>Nome completo</label><input name="nome" required value="' + h(d.nome) + '">'
      + '<label>Função / serviço</label><input name="funcao" value="' + h(d.funcao) + '" placeholder="DIARISTA">'
      + '<label>Obra</label><select name="o">' + optLocais(d.o, 'Sem obra') + '</select>'
      + '<label>Chave PIX</label><input name="pix" value="' + h(pix('d' + d.id)) + '" placeholder="CPF, celular, e-mail ou chave aleatória">'
      + '<label class="chk"><input type="checkbox" name="ativo"' + (d.ativo !== false ? ' checked' : '') + '> Ativo</label>'
      + '<div class="hint" style="margin-top:6px">Valor: ' + R$(D.cfg.diarista.I) + ' a diária e ' + R$(D.cfg.diarista.M) + ' a meia, em qualquer dia.</div>',
      v => {
        d.nome = String(v.nome || '').trim().toUpperCase(); d.funcao = String(v.funcao || '').trim().toUpperCase() || 'DIARISTA';
        d.o = v.o || ''; d.ativo = !!v.ativo; d.upd = agora();
        if(novo) D.diaristas.push(d);
        const pv = String(v.pix || '').trim(); if(pv !== pix('d' + d.id)) D.pix['d' + d.id] = {v: pv, upd: agora()};
        salvar();
      });
  }

  function editarFeriado(){
    modal('Cadastrar feriado',
      '<label>Data</label><input type="date" name="d" required>'
      + '<label>Nome</label><input name="nome" required placeholder="Ex.: Aniversário de Rio Branco">'
      + '<label>Vale para</label><select name="o">' + optLocais('', 'Todas as obras') + '</select>'
      + '<label class="chk"><input type="checkbox" name="anual" checked> Repete todo ano na mesma data</label>',
      v => {
        if(!v.d || !String(v.nome || '').trim()) return false;
        D.feriados.push({id: uid(), d: v.d, nome: String(v.nome).trim(), o: v.o || '', anual: !!v.anual, upd: agora()});
        salvar();
      });
  }

  // ---------- planilha ----------
  function aviso(t, erro){ const el = $('dia-estado'); if(el){ el.textContent = t; el.style.color = erro ? '#b42318' : ''; } }

  // junta duas versões (deste computador e da planilha): vale a alteração mais recente de cada item
  function juntar(a, b){
    const lista = (x, y) => { const m = new Map(); (x || []).concat(y || []).forEach(i => { const o = m.get(i.id); if(!o || (i.upd || 0) > (o.upd || 0)) m.set(i.id, i); }); return [...m.values()]; };
    const r = VAZIO();
    r.cfg = (b.cfg && (b.cfg.upd || 0) > ((a.cfg && a.cfg.upd) || 0)) ? b.cfg : (a.cfg || r.cfg);
    r.pix = Object.assign({}, a.pix);
    Object.entries(b.pix || {}).forEach(([k, v]) => { if(!r.pix[k] || (v.upd || 0) > (r.pix[k].upd || 0)) r.pix[k] = v; });
    ['diaristas', 'feriados', 'lanc', 'fech'].forEach(k => r[k] = lista(a[k], b[k]));
    return r;
  }

  function salvar(semRender){
    localStorage.setItem(KEY, JSON.stringify(D));
    localStorage.setItem(PEND, '1');
    if(!semRender) render();
    clearTimeout(timer); timer = setTimeout(enviar, 1000);
  }

  const msgErro = e => /desconhecida/i.test(e.message) ? 'A planilha ainda não aceita diárias: atualize o Apps Script (ver README).' : 'Sem ligação com a planilha agora. Os lançamentos ficam neste computador e são enviados depois.';

  async function enviar(){
    clearTimeout(timer);
    try{
      const j = await txApi({acao: 'lerDiarias'});
      if(j.dados && Array.isArray(j.dados.lanc)){ D = juntar(D, j.dados); localStorage.setItem(KEY, JSON.stringify(D)); }
      await txApi({acao: 'gravarDiarias', dados: D});
      localStorage.removeItem(PEND);
      aviso('Salvo na planilha às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}) + '.');
      if(aba.style.display !== 'none') render();
    }catch(e){
      aviso(msgErro(e), true);
      timer = setTimeout(enviar, 60000);
    }
  }

  async function receber(){
    if(localStorage.getItem(PEND)) return enviar();
    if(Date.now() - ultimaLeitura < 15000) return;
    ultimaLeitura = Date.now();
    try{
      const j = await txApi({acao: 'lerDiarias'});
      if(!j.dados || !Array.isArray(j.dados.lanc)) return;
      const novo = juntar(D, j.dados);
      if(JSON.stringify(novo) !== JSON.stringify(D)){ D = novo; localStorage.setItem(KEY, JSON.stringify(D)); if(aba.style.display !== 'none') render(); }
      aviso('Sincronizado com a planilha.');
    }catch(e){ aviso(msgErro(e), true); }
  }

  // ---------- troca de aba ----------
  const trocarOrig = window.trocarAba;
  window.trocarAba = function(a){
    trocarOrig.apply(this, arguments);
    aba.style.display = a === 'diar' ? '' : 'none';
    btn.classList.toggle('on', a === 'diar');
    if(a === 'diar'){ render(); receber(); }
  };
  document.addEventListener('visibilitychange', () => { if(!document.hidden && aba.style.display !== 'none') receber(); });

  receber();
  try{ if(ls.get('aba') === 'diar') trocarAba('diar'); }catch(e){}
  window.G360Diarias = {render, receber, enviar, dados: () => D};
})();
