// Sincroniza as obras (valores, situação, código…) entre os computadores pela planilha Google.
// Carregado por index.html depois do app. Usa a mesma ligação da aba Emulsão (txApi),
// cujo endereço e chave ficam criptografados no app.enc — este arquivo não tem nada secreto.
(function(){
  if(typeof txApi !== 'function' || typeof st === 'undefined' || typeof desenharObras !== 'function') return;
  const KEY = 'dmtbkp_obras', PEND = 'dmtbkp_obrasPend';
  const setOrig = Storage.prototype.setItem;
  let pronto = false, aplicando = false, timer = null, ultimaLeitura = 0;

  // toda gravação das obras feita pelo app (salvarObras) vira envio para a planilha
  Storage.prototype.setItem = function(k, v){
    setOrig.apply(this, arguments);
    if(pronto && !aplicando && this === localStorage && k === KEY){
      setOrig.call(localStorage, PEND, '1');
      clearTimeout(timer); timer = setTimeout(enviar, 1200);
    }
  };

  function aviso(txt, erro){
    let el = document.getElementById('obras-sync');
    const alvo = document.querySelector('#aba-obras .card');
    if(!alvo) return;
    if(!el){ el = document.createElement('div'); el.id = 'obras-sync'; el.className = 'hint'; el.style.marginTop = '6px'; alvo.appendChild(el); }
    el.textContent = txt; el.style.color = erro ? '#b42318' : '';
  }

  async function enviar(){
    clearTimeout(timer);
    const v = localStorage.getItem(KEY);
    if(!v) return;
    try{
      await txApi({acao: 'gravarObras', obras: JSON.parse(v)});
      localStorage.removeItem(PEND);
      aviso('Obras sincronizadas com a planilha às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) + '.');
    }catch(e){
      aviso('Não foi possível enviar as obras para a planilha agora. Nova tentativa em 1 minuto.', true);
      timer = setTimeout(enviar, 60000);
    }
  }

  async function receber(){
    if(localStorage.getItem(PEND)) return enviar(); // há mudança deste computador ainda não enviada
    ultimaLeitura = Date.now();
    try{
      const j = await txApi({acao: 'lerObras'});
      if(!Array.isArray(j.obras)) return;
      const txt = JSON.stringify(j.obras);
      if(txt === localStorage.getItem(KEY)) return;
      aplicando = true;
      st.obras = j.obras;
      localStorage.setItem(KEY, txt);
      aplicando = false;
      desenharObras();
      aviso('Obras atualizadas pela planilha.');
    }catch(e){ aplicando = false; }
  }

  // espera o app terminar de carregar as obras antes da primeira leitura
  const inicio = Date.now();
  (function esperar(){
    if((st.obras && st.obras.length) || Date.now() - inicio > 8000){
      receber().finally(() => { pronto = true; });
    } else setTimeout(esperar, 300);
  })();

  // ao voltar para a aba, busca de novo (no máximo a cada 30 s)
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && pronto && Date.now() - ultimaLeitura > 30000) receber();
  });

  // o aviso antigo dizia que as mudanças ficavam só neste navegador
  const dica = [...document.querySelectorAll('#aba-obras .hint')].find(h => /ficam só neste navegador/.test(h.textContent));
  if(dica) dica.textContent = 'As mudanças nas obras (valores, situação, código) vão para a planilha Google e aparecem em todos os computadores. Exportar obras serve só como cópia de segurança.';

  window.G360ObrasSync = {enviar, receber};
})();
