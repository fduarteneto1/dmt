// Abre e fecha (criptografa) os arquivos da Gestão 360º BKP.
//
//   DMT_USUARIO=francisco DMT_SENHA='...' node tools/cripto.mjs abrir
//       decifra app.enc, pontos.enc e obras.enc para a pasta src/ (fora do Git)
//   DMT_USUARIO=francisco DMT_SENHA='...' node tools/cripto.mjs fechar
//       criptografa src/app.html, src/pontos.json e src/obras.json de volta para *.enc
//   DMT_USUARIO=... DMT_SENHA=... NOVO_USUARIO=joao NOVA_SENHA='...' node tools/cripto.mjs usuario
//       cria o usuário (ou troca a senha dele) em usuarios.json
//   DMT_USUARIO=... DMT_SENHA=... NOVO_USUARIO=joao node tools/cripto.mjs remover
//   NOVO_USUARIO=francisco NOVA_SENHA='...' node tools/cripto.mjs iniciar
//       gera uma chave nova e o primeiro usuário (apaga os demais)
//
// A pasta src/ está no .gitignore: o conteúdo aberto nunca vai para o GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(path.join(raiz, 'cripto.js'));
const D = globalThis.DMTC;
const arq = n => path.join(raiz, n);
const ARQS = [['app.html', 'app.enc'], ['pontos.json', 'pontos.enc'], ['obras.json', 'obras.enc']];
const env = k => { const v = process.env[k]; if(!v) { console.error('Faltou a variável ' + k); process.exit(1); } return v; };
const lerUsuarios = () => JSON.parse(fs.readFileSync(arq('usuarios.json'), 'utf8'));
const gravarUsuarios = u => fs.writeFileSync(arq('usuarios.json'), JSON.stringify(u, null, 1) + '\n');

async function chave(){
  const k = await D.entrar(lerUsuarios(), env('DMT_USUARIO'), env('DMT_SENHA'));
  if(!k) { console.error('Usuário ou senha inválidos.'); process.exit(1); }
  return k;
}
async function fechar(k){
  for(const [src, enc] of ARQS){
    const p = arq('src/' + src);
    if(!fs.existsSync(p)) { console.log('pulado (não existe): src/' + src); continue; }
    fs.writeFileSync(arq(enc), await D.cifrar(k, fs.readFileSync(p, 'utf8')) + '\n');
    console.log('src/' + src + ' → ' + enc);
  }
}
function senhaForte(s){ if(s.length < 10) { console.error('A senha precisa ter pelo menos 10 caracteres.'); process.exit(1); } }

const cmd = process.argv[2];
if(cmd === 'abrir'){
  const k = await chave();
  fs.mkdirSync(arq('src'), {recursive: true});
  for(const [src, enc] of ARQS){
    if(!fs.existsSync(arq(enc))) continue;
    fs.writeFileSync(arq('src/' + src), await D.decifrar(k, fs.readFileSync(arq(enc), 'utf8')));
    console.log(enc + ' → src/' + src);
  }
} else if(cmd === 'fechar'){
  await fechar(await chave());
} else if(cmd === 'usuario'){
  const k = await chave(), s = env('NOVA_SENHA'); senhaForte(s);
  const u = lerUsuarios(), {id, e} = await D.entradaUsuario(k, env('NOVO_USUARIO'), s);
  console.log((u.usuarios[id] ? 'Senha trocada: ' : 'Usuário criado: ') + D.norm(process.env.NOVO_USUARIO));
  u.usuarios[id] = e; gravarUsuarios(u);
} else if(cmd === 'remover'){
  const k = await chave(), u = lerUsuarios(), id = await D.idUsuario(env('NOVO_USUARIO'));
  if(!u.usuarios[id]) { console.error('Usuário não encontrado.'); process.exit(1); }
  delete u.usuarios[id]; gravarUsuarios(u); console.log('Removido.');
} else if(cmd === 'listar'){
  const k = await chave(), u = lerUsuarios();
  for(const e of Object.values(u.usuarios)) console.log(await D.nomeUsuario(k, e));
} else if(cmd === 'iniciar'){
  const s = env('NOVA_SENHA'); senhaForte(s);
  const k = D.novaChave(), {id, e} = await D.entradaUsuario(k, env('NOVO_USUARIO'), s);
  gravarUsuarios({v: 1, usuarios: {[id]: e}});
  await fechar(k);
  console.log('Chave nova gerada. Usuário: ' + D.norm(process.env.NOVO_USUARIO));
} else {
  console.log('Uso: node tools/cripto.mjs abrir | fechar | usuario | remover | listar | iniciar');
}
