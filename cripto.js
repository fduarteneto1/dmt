// Criptografia da Gestão 360º BKP (AES-256-GCM + PBKDF2-SHA256).
// Usado pela página de login, pelo app e pelo script tools/cripto.mjs.
// Os arquivos *.enc só abrem com a chave do sistema, que fica guardada em
// usuarios.json protegida pela senha de cada usuário.
(function(){
  const C = globalThis.crypto.subtle;
  const ITER = 310000;
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = u => { let s = ''; const a = new Uint8Array(u); for(let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
  const norm = u => String(u || '').trim().toLowerCase();

  async function chaveAES(raw){ return C.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function cifrarBytes(key, bytes){
    const iv = rand(12), ct = new Uint8Array(await C.encrypt({name:'AES-GCM', iv}, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out);
  }
  async function decifrarBytes(key, s){
    const a = unb64(s); return new Uint8Array(await C.decrypt({name:'AES-GCM', iv:a.subarray(0, 12)}, key, a.subarray(12)));
  }
  async function chaveSenha(usuario, senha, salt, iter){
    const base = await C.importKey('raw', te.encode(norm(usuario) + '\n' + senha), 'PBKDF2', false, ['deriveKey']);
    return C.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations: iter || ITER}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  }
  async function idUsuario(usuario){ return b64(await C.digest('SHA-256', te.encode('dmt-bkp:' + norm(usuario)))); }

  const DMTC = {
    ITER, b64, unb64, norm,
    novaChave(){ return b64(rand(32)); },
    // texto <-> arquivo .enc
    async cifrar(chaveB64, texto){ return JSON.stringify({v:1, d: await cifrarBytes(await chaveAES(unb64(chaveB64)), te.encode(texto))}); },
    async decifrar(chaveB64, arquivo){ const j = typeof arquivo === 'string' ? JSON.parse(arquivo) : arquivo; return td.decode(await decifrarBytes(await chaveAES(unb64(chaveB64)), j.d)); },
    // usuários
    async entradaUsuario(chaveB64, usuario, senha){
      const salt = rand(16), k = await chaveSenha(usuario, senha, salt, ITER);
      return {id: await idUsuario(usuario), e: {s: b64(salt), i: ITER, k: await cifrarBytes(k, unb64(chaveB64)),
        n: await cifrarBytes(await chaveAES(unb64(chaveB64)), te.encode(norm(usuario)))}};
    },
    // devolve a chave do sistema (base64) ou null se usuário/senha não conferem
    async entrar(usuarios, usuario, senha){
      const e = (usuarios.usuarios || {})[await idUsuario(usuario)];
      if(!e) { await chaveSenha(usuario, senha, rand(16), ITER); return null; } // mesmo tempo de resposta
      try{ return b64(await decifrarBytes(await chaveSenha(usuario, senha, unb64(e.s), e.i), e.k)); }catch(err){ return null; }
    },
    async nomeUsuario(chaveB64, e){ try{ return td.decode(await decifrarBytes(await chaveAES(unb64(chaveB64)), e.n)); }catch(err){ return '?'; } },
    idUsuario
  };
  globalThis.DMTC = DMTC;
})();
