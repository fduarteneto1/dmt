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

## Obras sincronizadas pela planilha
As obras (valor total, valor medido, situação, código) ficam na aba oculta **Gestao360** da planilha "Taxa de Emulsão – Microrrevestimento (MRAF)". Toda alteração na aba Obras é enviada para lá, e cada computador busca essa versão ao abrir a ferramenta e ao voltar para a aba. Quem cuida disso é o `obras-sync.js`, usando a mesma ligação da aba Emulsão. `Exportar obras` continua servindo como cópia de segurança. Se dois computadores editarem as obras ao mesmo tempo, vale a última gravação.

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

## Equipamentos (aba Equipamentos)
Cadastro de máquinas e veículos (veio do quadro "Cadastro de Máquinas e Veículos" do Trello) e alocação de cada um numa obra (pelo **código** da obra), na sede (`ADM`) ou sem alocação, com a situação: Operando, Parado, Manutenção ou Disponível.
- Os dados ficam na aba oculta **Gestao360** da planilha, linha 2 (`A2 = equipamentos`). O código da aba está em `equipamentos.js`, carregado pelo `index.html` como o `obras-sync.js`, sem nada secreto.
- Cada mudança de local ou situação grava a data ("no local desde") e entra no histórico (últimas 300 movimentações, com o usuário).
- Ao passar o mouse sobre a obra ou a sede no mapa, aparece quantos equipamentos estão lá e quantos estão operando.
- **Baixar planilha (CSV)** exporta a lista filtrada.
- O Apps Script da planilha precisa ter as ações `lerEquipamentos` e `gravarEquipamentos` (já estão em `tools/planilha-emulsao.gs`). Depois de colar, publique em **Implantar → Gerenciar implantações → editar → Nova versão**.

## Diárias (aba Diárias)
Lançamento e fechamento das diárias de quem trabalha no fim de semana ou feriado. O código está em `diarias.js`, carregado pelo `index.html` como o `equipamentos.js`, sem nada secreto.
- **Regras:** colaborador CLT recebe pelo valor da função (encarregado R$ 250; motorista e operador R$ 200; apontador R$ 180; ajudante, rasteleiro e mesista R$ 150). Sábado só meia diária (a manhã é jornada normal). Domingo e feriado: inteira ou meia. Dia útil não gera diária para CLT. Diaristas (cadastrados à mão) podem trabalhar qualquer dia: R$ 150 a inteira e R$ 75 a meia. Os valores se alteram em **Cadastros**.
- **Lançar:** escolha data, obra e período; marque as pessoas. A ferramenta mostra o tipo do dia, bloqueia o que não pode e não deixa lançar a mesma pessoa duas vezes no mesmo dia.
- **Obra certa:** a lista mostra só quem está alocado na obra escolhida. Se marcar alguém de outra obra (com "Mostrar pessoas de outras obras"), a ferramenta pede confirmação antes de lançar. Em **Lançamentos em aberto**, o que estiver numa obra diferente da alocação da pessoa aparece com ⚠, e o botão **Corrigir obras** passa esses lançamentos para a obra do cadastro.
- **Limpar todos em aberto:** exclui de uma vez todos os lançamentos ainda não fechados (pede confirmação; fechamentos não são afetados).
- **Feriados:** os nacionais (inclusive Sexta-feira Santa e Consciência Negra) já estão incluídos. Estaduais, municipais e pontos facultativos se cadastram em **Cadastros**, para todas as obras ou só uma, com opção de repetir todo ano.
- **Fechamento:** escolha o período e a obra (ou todas), confira e preencha as chaves PIX que faltam, e clique em **Fechar período e imprimir**. O relatório sai agrupado por obra, com os dias de cada pessoa, o total e a chave PIX, e linhas para assinatura. **Imprimir prévia** imprime sem fechar.
- **Histórico:** todos os fechamentos ficam guardados para reimprimir, marcar como pago ou reabrir (os lançamentos voltam para "em aberto"). Em **Consultar lançamentos** dá para filtrar por período, obra e pessoa e baixar CSV.
- **Onde ficam os dados:** na aba oculta **G360Diarias** da planilha (JSON dividido em pedaços). A cada gravação, as abas **Diárias** e **Diárias – Fechamentos** são refeitas em formato de tabela, só para consulta. Se dois computadores lançarem ao mesmo tempo, os lançamentos dos dois são somados (vale a alteração mais recente de cada item).
- O Apps Script da planilha precisa ter as ações `lerDiarias` e `gravarDiarias` (já estão em `tools/planilha-emulsao.gs`). Depois de colar, publique em **Implantar → Gerenciar implantações → editar → Nova versão**. Até lá, os lançamentos ficam guardados no computador e são enviados assim que a planilha aceitar.

## Layout do painel (menu vertical e blocos minimizáveis)
- Os módulos (Transporte, Obras, Colaboradores, Emulsão, Equipamentos, Diárias…) ficam numa coluna à esquerda do painel. Um módulo novo que adicione seu botão em `#abas` entra automaticamente na coluna.
- Clique no título de qualquer bloco (ex.: **Obras da BKP**) para minimizar ou abrir. Fica salvo neste navegador; na impressão, tudo sai aberto.
- O código está em `layout.js`, carregado pelo `index.html` por último, sem nada secreto.

## Clima (aba Clima)
Tempo em cada obra do mapa e semáforo para aplicar microrrevestimento. O código está em `clima.js`, carregado pelo `index.html` como os outros módulos, sem nada secreto.
- **Previsão:** Open-Meteo (gratuita, sem chave), pelas coordenadas das obras. Atualiza a cada 20 minutos com a aba aberta, ou no botão **Atualizar**.
- **Semáforo:** avalia a janela de aplicação (padrão 5 h) mais as horas de cura sem chuva (padrão 3 h). 🔴 Não aplicar: temperatura ≤ 10 °C, chance de chuva ≥ 60% ou chuva ≥ 0,5 mm/h. 🟡 Atenção: chuva ≥ 30%, garoa, umidade ≥ 85%, vento ≥ 30 km/h, calor ≥ 38 °C na aplicação, temperatura perto do mínimo ou chuva nas 3 h anteriores. Os limites se alteram em **Critérios do semáforo** e valem para todos os computadores.
- **Critérios iguais para todos:** ficam na aba oculta **Gestao360** da planilha, linha 3 (`A3 = clima`, com data e usuário da última alteração). O Apps Script precisa ter as ações `lerClima` e `gravarClima` (já estão em `tools/planilha-emulsao.gs`). Depois de colar, publique em **Implantar → Gerenciar implantações → editar → Nova versão**. Até lá, a mudança vale só no computador em que foi feita e é enviada assim que a planilha aceitar.
- Ao passar o mouse sobre a obra no mapa, aparece a temperatura e o semáforo do momento.
- **Para voltar à versão sem a aba Clima:** existe o ramo `backup-antes-clima` no GitHub com a versão anterior. Também basta apagar `<script src="clima.js?v=2"><\/script>` do `index.html`.
