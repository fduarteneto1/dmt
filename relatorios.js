// Aba "Relatórios" do Gestão 360º BKP: um único botão no menu, com os relatórios escolhidos dentro dela.
// Carregado por index.html depois do app e antes dos relatórios (usinadas.js…). Não guarda nada secreto.
// Cada relatório se registra com G360Relatorios.registrar({id, nome, el, mostrar, esconder}):
//   el       = o elemento com o conteúdo do relatório (fica dentro da aba)
//   mostrar  = chamado quando o relatório fica visível (aba Relatórios aberta e ele escolhido)
//   esconder = chamado quando sai de vista (opcional)
(function(){
  if(typeof st === 'undefined' || typeof trocarAba !== 'function') return;
  const $ = id => document.getElementById(id);
  const KSUB = 'dmtbkp_rel_sub';
  const lista = [];
  let atual = '';
  try{ atual = localStorage.getItem(KSUB) || ''; }catch(e){}

  const css = document.createElement('style');
  css.textContent = `
  #aba-rel #rel-sub{margin-bottom:14px;flex-wrap:wrap}
  #aba-rel #rel-sub button{flex:1 1 auto}`;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.dataset.aba = 'rel'; btn.textContent = 'Relatórios';
  $('abas').appendChild(btn);
  btn.addEventListener('click', () => trocarAba('rel'));

  const aba = document.createElement('div');
  aba.id = 'aba-rel'; aba.style.display = 'none';
  aba.innerHTML = '<div class="seg" id="rel-sub" role="tablist" aria-label="Relatórios"></div><div id="rel-corpo"></div>';
  const ref = $('aba-clima') || $('aba-diar') || $('aba-equip') || $('aba-taxa');
  ref.parentElement.insertBefore(aba, ref.nextSibling);

  const visivel = () => aba.style.display !== 'none';
  const achar = id => lista.find(r => r.id === id);

  function abrir(id){
    const r = achar(id) || lista[0];
    if(!r) return;
    const ant = achar(atual);
    if(ant && ant !== r && ant.esconder) try{ ant.esconder(); }catch(e){}
    atual = r.id;
    try{ localStorage.setItem(KSUB, atual); }catch(e){}
    lista.forEach(x => { x.el.style.display = x === r ? '' : 'none'; x.btn.classList.toggle('on', x === r); x.btn.setAttribute('aria-selected', String(x === r)); });
    if(visivel() && r.mostrar) try{ r.mostrar(); }catch(e){ console.error(e); }
  }

  function registrar(r){
    if(!r || !r.id || !r.el || achar(r.id)) return;
    r.btn = document.createElement('button');
    r.btn.textContent = r.nome || r.id; r.btn.setAttribute('role', 'tab');
    r.btn.addEventListener('click', () => abrir(r.id));
    $('rel-sub').appendChild(r.btn);
    r.el.style.display = 'none';
    $('rel-corpo').appendChild(r.el);
    lista.push(r);
    if(!achar(atual) || atual === r.id) abrir(r.id);
  }

  const trocarOrig = window.trocarAba;
  window.trocarAba = function(a){
    if(a === 'usin') a = 'rel'; // quem ficou com a antiga aba Usinadas salva
    trocarOrig.apply(this, [a].concat([].slice.call(arguments, 1)));
    const era = visivel();
    aba.style.display = a === 'rel' ? '' : 'none';
    btn.classList.toggle('on', a === 'rel');
    if(a === 'rel') abrir(atual);
    else if(era){ const r = achar(atual); if(r && r.esconder) try{ r.esconder(); }catch(e){} }
  };

  window.G360Relatorios = {registrar, abrir, visivel: id => visivel() && (!id || id === atual), atual: () => atual};

  // reabre a aba se era a última usada (depois que os relatórios se registrarem)
  setTimeout(() => { try{ if(typeof ls !== 'undefined' && /^(rel|usin)$/.test(ls.get('aba'))) trocarAba('rel'); }catch(e){} }, 0);
})();
