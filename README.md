# Gestão 360º BKP – BKP Construtora

Ferramenta interna de acesso restrito. Para entrar, você precisa de um usuário e uma senha.

## Como funciona o acesso
- O app (`app.enc`) e os dados (`pontos.enc`, `obras.enc`, `colaboradores.enc`) ficam no repositório **criptografados** (AES-256-GCM). Sem uma senha válida, não dá para ler o conteúdo.
- `usuarios.json` guarda, para cada usuário, a chave do sistema protegida pela senha dele (PBKDF2-SHA256, 310 mil iterações). Os nomes de usuário também ficam cifrados.
- "Manter conectado" guarda a sessão no navegador até a pessoa clicar em **Sair**.

## Usuários
Dentro da ferramenta, clique em **Usuários** para criar um usuário, trocar a senha ou remover alguém. Depois clique em **Baixar usuarios.json** e substitua o arquivo no GitHub.

Use senhas com pelo menos 10 caracteres. Como `usuarios.json` é público, uma senha fraca pode ser descoberta por tentativa.

Remover um usuário impede que ele entre de novo. Quem já usou "Manter conectado" continua com a chave salva naquele navegador. Se for preciso cortar o acesso de vez, gere uma chave nova (`node tools/cripto.mjs iniciar`) e recadastre os usuários.

## Atualizar pedreiras, distribuidoras, obras e colaboradores
1. Edite pelo mapa ou pela aba **Colaboradores**.
2. Clique em **Exportar pontos**, **Exportar obras** ou **Exportar colaboradores**. O arquivo baixado (`pontos.enc` / `obras.enc` / `colaboradores.enc`) já vem criptografado.
3. Substitua o arquivo no GitHub.

## Editar o código
```
DMT_USUARIO=seu.usuario DMT_SENHA='...' node tools/cripto.mjs abrir    # decifra para src/ (fora do Git)
# edite src/app.html, src/pontos.json, src/obras.json, src/colaboradores.json
DMT_USUARIO=seu.usuario DMT_SENHA='...' node tools/cripto.mjs fechar   # criptografa de volta
```
A pasta `src/` está no `.gitignore` e nunca vai para o GitHub.

## Colaboradores
Cada colaborador fica alocado em `ADM` (sede) ou no **código** de uma obra (ex.: `RBR01`). O código se define ao cadastrar ou editar a obra na aba Obras. Ao passar o mouse sobre a obra ou a sede no mapa, aparece quantos colaboradores ativos estão lá.

## Taxa de emulsão (aba Emulsão)
Calcula a taxa de emulsão do microrrevestimento por usinada e grava na planilha Google "Taxa de Emulsão – Microrrevestimento (MRAF)", a mesma usada pelo artefato do Claude (abas Registros, Obras e Usinas).
- A ponte com a planilha é um Apps Script dentro dela ("Ponte Gestão 360º BKP"), publicado como App da Web. O código está em `tools/planilha-emulsao.gs`, sem o token; o token real fica só no Apps Script e, criptografado, no `app.enc`.
- Se publicar uma nova versão do script, use **Implantar → Gerenciar implantações → editar → Nova versão**, para manter o mesmo endereço.
- Sem internet, a usinada fica guardada no aparelho e é reenviada depois. O script recusa lançamento duplicado.

## Limitações
- As rotas vêm do OpenStreetMap (serviço público OSRM). A separação entre trecho pavimentado e não pavimentado não é automática.
- Se a rota não for encontrada, a ferramenta usa a distância em linha reta × 1,3 e mostra um aviso.
