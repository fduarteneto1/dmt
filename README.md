# Gestão 360º BKP – BKP Construtora

Ferramenta interna de acesso restrito. Para entrar, você precisa de um usuário e uma senha.

## Como funciona o acesso
- O app (`app.enc`) e os dados (`pontos.enc`, `obras.enc`) ficam no repositório **criptografados** (AES-256-GCM). Sem uma senha válida, não dá para ler o conteúdo.
- `usuarios.json` guarda, para cada usuário, a chave do sistema protegida pela senha dele (PBKDF2-SHA256, 310 mil iterações). Os nomes de usuário também ficam cifrados.
- "Manter conectado" guarda a sessão no navegador até a pessoa clicar em **Sair**.

## Usuários
Dentro da ferramenta, clique em **Usuários** para criar um usuário, trocar a senha ou remover alguém. Depois clique em **Baixar usuarios.json** e substitua o arquivo no GitHub.

Use senhas com pelo menos 10 caracteres. Como `usuarios.json` é público, uma senha fraca pode ser descoberta por tentativa.

Remover um usuário impede que ele entre de novo. Quem já usou "Manter conectado" continua com a chave salva naquele navegador. Se for preciso cortar o acesso de vez, gere uma chave nova (`node tools/cripto.mjs iniciar`) e recadastre os usuários.

## Atualizar pedreiras, distribuidoras e obras
1. Edite pelo mapa.
2. Clique em **Exportar pontos** ou **Exportar obras**. O arquivo baixado (`pontos.enc` / `obras.enc`) já vem criptografado.
3. Substitua o arquivo no GitHub.

## Editar o código
```
DMT_USUARIO=seu.usuario DMT_SENHA='...' node tools/cripto.mjs abrir    # decifra para src/ (fora do Git)
# edite src/app.html, src/pontos.json, src/obras.json
DMT_USUARIO=seu.usuario DMT_SENHA='...' node tools/cripto.mjs fechar   # criptografa de volta
```
A pasta `src/` está no `.gitignore` e nunca vai para o GitHub.

## Limitações
- As rotas vêm do OpenStreetMap (serviço público OSRM). A separação entre trecho pavimentado e não pavimentado não é automática.
- Se a rota não for encontrada, a ferramenta usa a distância em linha reta × 1,3 e mostra um aviso.
