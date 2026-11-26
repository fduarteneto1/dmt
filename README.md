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

## Rotas alternativas (Rota até a obra)
Ao clicar numa obra e depois numa pedreira ou distribuidora, a caixa **Rota até a obra** mostra a rota proposta. Embaixo dela:
- **🔀 Ver rotas alternativas:** pede ao roteador outras rotas e uma rota **evitando estrada de chão**. Cada uma mostra km total, asfalto, chão, tempo e a diferença para a proposta. As que não estão escolhidas aparecem no mapa em cinza tracejado; clique na lista ou na linha para escolher.
- **📍 Passar por um ponto:** clique no mapa num ponto da estrada por onde a rota deve passar (uma cidade, um trevo na rodovia asfaltada). Dá para marcar vários; a ferramenta encaixa cada um na ordem do caminho. Clique no número no mapa para tirar um ponto, ou em **Limpar pontos**. Esc cancela a marcação.
- A rota escolhida é a desenhada no mapa e a que vai para **Usar no cálculo de DMT**. Ela fica guardada enquanto a ferramenta estiver aberta.
- O código está em `rotas.js`, carregado pelo `index.html` como os outros módulos, sem nada secreto. Usa o mesmo roteador público (Valhalla/OpenStreetMap), que aceita 1 consulta por segundo, por isso as alternativas levam alguns segundos.

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

## Relatórios (aba Relatórios)
Um único botão no menu, com os relatórios escolhidos dentro dela (seletor no topo da aba). O código está em `relatorios.js`, carregado pelo `index.html` antes dos relatórios, sem nada secreto.
- **Para criar um relatório novo:** faça um arquivo `.js` que monte o conteúdo num `<div>` e chame `G360Relatorios.registrar({id, nome, el, mostrar, esconder})`. Carregue-o no `index.html` depois de `relatorios.js`. Ele aparece sozinho no seletor, sem criar botão novo no menu.
- A aba lembra o último relatório aberto neste navegador.

### Usinadas
Resumo das usinadas de microrrevestimento por obra, para mandar no grupo no fim do dia. O código está em `usinadas.js`.
- **Período:** Hoje, Ontem, 7 dias, Este mês ou Período (de/até), e filtro por obra.
- **Números:** quantidade de usinadas, consumo de emulsão (L), área aplicada (m²) e taxa (L/m² = litros ÷ área, com a faixa mínima e máxima).
- **Gráficos interativos:** por obra (Área, Consumo ou L/m²) e, embaixo, por usinada (quando é um dia só) ou por dia (quando é período). Passe o mouse ou toque para ver os números; clique numa obra para filtrar só ela. Na tabela, clique na obra para ver cada usinada.
- **Enviar no grupo:** **Enviar no WhatsApp** (texto pronto, formatado para o WhatsApp), **Imagem do relatório** (PNG para mandar no grupo), **Imprimir / PDF** (com os gráficos e a lista de usinadas) e **Copiar texto**.
- **Dados:** vêm da aba **Registros** da planilha, pela ação `dados` que a aba Emulsão já usa. Não precisa atualizar o Apps Script. Usinadas guardadas no aparelho sem internet só aparecem depois de enviadas.

### Cotações
Quantas cotações foram criadas, aprovadas e canceladas num período. O código está em `rel-cotacoes.js` e usa as mesmas cotações da aba Cotações (nada muda no Apps Script).
- **Período:** Hoje, 7 dias, 30 dias, Este mês, Mês passado, Este ano ou Período (de/até), e filtro por obra.
- **Como conta:** **Criadas** = abertas no período (qualquer situação hoje). **Aprovadas** = aprovadas no período, inclusive as que já viraram pedido. **Canceladas** = canceladas no período. Cotação reaberta depois de aprovada deixa de contar como aprovada.
- **Resumo:** quadros com cada número, valor aprovado (compra escolhida, com desconto e frete) e economia. Clique num quadro para ver a lista; clique numa cotação para abrir o mapa.
- **Gráfico:** por dia (até 31 dias), por semana (até 120) ou por mês. **Por obra:** criadas, aprovadas, canceladas e valor aprovado.
- **Exportar:** Imprimir / PDF, Enviar no WhatsApp, Copiar texto e Baixar planilha (CSV).

## Pedágios (mapa e Rota até a obra)
As praças de pedágio de MT aparecem no mapa (losango laranja; roxo = free flow, sem cabine). O botão **$ Pedágios**, abaixo do zoom, mostra ou esconde as praças. O código está em `pedagios.js`, carregado pelo `index.html` depois do `rotas.js`, sem nada secreto.
- **Na caixa Rota até a obra:** lista as praças por onde a rota passa e calcula o pedágio da viagem: ida carregada + volta vazia, valor por eixo × número de eixos. Mostra também quanto isso dá por tonelada (pedágio da viagem ÷ carga) e por t·km. Em **Veículo e carga** se escolhe o caminhão (toco a rodotrem), a carga por viagem, se conta a volta e quantos eixos vão suspensos na volta vazia (eixo suspenso não paga, Lei 13.103/2015). Fica salvo neste navegador.
- **Rotas alternativas:** cada opção mostra o pedágio dela, para comparar com km e chão.
- **Como a praça entra na conta:** a rota precisa passar a menos de 350 m da praça. Praça colada na origem ou no destino (até 600 m) não entra, porque não dá para saber se o caminhão passa por ela.
- **Tarifas:** ficam na lista `PRACAS` no começo do `pedagios.js` (`auto` = carro, `eixo` = por eixo comercial). Para um reajuste, altere os valores e a data em `ATUALIZADO`. Fontes: Nova Rota do Oeste (BR-163/364), ANTT/Rota Agro MT-GO (BR-364, free flow) e AGER-MT (rodovias estaduais, tarifa básica).
- **Limites:** praças marcadas como "posição aproximada" foram localizadas pelo km da rodovia. Ainda faltam no mapa praças cuja localização não foi confirmada (MT-343 da Via Brasil MT-246, outras praças da MT-220 e da MT-020/326 Paranatinga–Canarana). O pedágio aparece na caixa da rota; ele não é somado automaticamente ao resultado do DMT.

## Cotações (aba Cotações)
Mapa de cotação para o comprador: compara as propostas dos fornecedores, mostra a compra mais barata e gera o mapa impresso para aprovação. O código está em `cotacao.js`, carregado pelo `index.html` depois do `diarias.js`, sem nada secreto.
- **Visual:** **▦ Abrir mapas de cotação** abre a lista em tela cheia (Nº · Mapa · Data · Compra escolhida · Status · Opções), com busca e filtro (ícone do funil) por situação e obra; nas Opções, duplicar e excluir. Clique na linha para abrir o mapa, que tem formato de documento: logo da BKP, nº, data, comprador, centro de custo, solicitante e prazo no topo, e a tabela com cabeçalho verde-petróleo (um valor por fornecedor). **Mostrar Unitário/Total** troca o que aparece nas células (o outro valor fica embaixo, em cinza). No topo: situação (clique para mudar), pedir cotação, 📷 copiar imagem do mapa (cola no WhatsApp; se o navegador não deixar, baixa o PNG), imprimir, duplicar e excluir. **← Mapas** (ou Esc) volta para a lista; **← Gestão 360º** volta para o painel. O indicador "● Salvo na planilha" mostra se ainda há algo para enviar.
- **Nova cotação:** numeração automática por ano (`COT-2026-001`). Informe título, obra (centro de custo), solicitante e o prazo para os fornecedores responderem. O mapa abre em tela cheia.
- **Itens:** **+ Item** ou **📋 Colar itens do Excel** (colunas Descrição · Unidade · Quantidade). Embaixo da descrição aparece o último preço comprado do mesmo item, se houver.
- **Estrutura do mapa (igual ao "Mapa de Cotação" BKP):** passe o mouse no item para ver os botões à direita da descrição:
  - **Outra marca** (etiqueta com +): cria mais uma linha de preço para o mesmo item. Cada fornecedor lança a marca dele (clique na etiqueta pequena da célula para escrever a marca). Todas as marcas disputam o mesmo item e só uma entra na conta. Linha de marca que ficar vazia some sozinha.
  - **Opção alternativa** (ícone de ramificação): outro produto no lugar deste (ex.: pneu 1000x20 borrachudo × liso), logo abaixo, com a mesma unidade e quantidade. Fica cinza e fora da conta até você escolher uma célula dela pelo lápis.
  - **×** remove o item (as alternativas passam a ser o item principal).
- **Fornecedores:** digite o nome na coluna **+ Fornecedor**, no cabeçalho do mapa (ou cadastre ali mesmo). O cadastro completo (CNPJ, contato, WhatsApp, e-mail, cidade, categoria) fica na sub-aba **Fornecedores**.
- **Pedir cotação:** texto pronto com os itens, para copiar ou mandar direto no WhatsApp/e-mail de cada fornecedor.
- **Preços:** digite o preço unitário (aceita `1.234,56`); em branco = não cotou. Enter desce na mesma coluna; dá para colar uma coluna (ou um bloco) de preços do Excel a partir de uma célula. **Mostrar Total** mostra o total de cada célula; clicar numa célula volta para o unitário.
- **Linhas da tabela** (no Resultado): escolha quais linhas aparecem embaixo dos preços: desconto (%), frete (CIF/FOB + valor), impostos (só entram quando a compra é toda com aquele fornecedor), outro valor com nome livre, condição de pagamento (mostra também o total a valor presente, a 1,5% a.m.), prazo de entrega, validade, cobertura (quantos itens cada um cotou) e observação. Linha com valor preenchido nunca some. **Subtotal das escolhas** mostra quanto vai para cada fornecedor.
- **Destaques:** verde = menor preço do item (já com desconto); vermelho = o mais caro; fundo verde-petróleo = compra escolhida (com contorno quando foi escolhida à mão).
- **Resultado:** o card mostra a compra. Sem nada marcado vale a **Recomendação automática**: a combinação de fornecedores mais barata já com o frete (testa todas, inclusive comprar tudo de um só). Ao lado, dois **comparativos** à escolha (economia vs. média, vs. maior proposta, vs. melhor fornecedor único, vs. última compra, dispersão de preços, valor presente, peso do frete, concentração, competitividade, prazo para receber tudo). Embaixo, os avisos (menos de 3 propostas, item sem preço, quantidade zerada, proposta vencida, pagamento que a ferramenta não entendeu).
- **Escolher à mão (lápis):** no lápis do card (ou no do topo, modo **Editar**), clique no preço que vai fechar em cada item: pode ser outra marca ou uma opção alternativa. Os itens sem célula marcada continuam otimizados, mas o card mostra "Escolha pendente" até todos estarem marcados. Clique de novo para desfazer; **Voltar à recomendação** limpa as escolhas.
- **Predefinições** (ícone dos controles deslizantes, no card): recomendação automática, melhor fornecedor único, menor preço em cada item, melhor a valor presente e entrega mais rápida.
- **Desaprovar:** no topo, lápis → **Desaprovar**, e clique nos itens que não serão comprados. Eles ficam apagados, fora das contas, do pedido e do mapa impresso (que lista "Não serão comprados").
- **Pedido por fornecedor:** o que comprar de cada um (com a marca), com texto do pedido para WhatsApp ou para copiar.
- **Imagem (câmera):** gera a **Solicitação de orçamento** (PNG com logo, CNPJ, itens, unidade e quantidade, sem preços; com muitos itens, em colunas) para copiar, baixar ou compartilhar no WhatsApp. No mesmo quadro, **Copiar imagem do mapa** copia o mapa inteiro com os preços.
- **Planilha:** a aba **Cotações – Preços** traz uma linha por item × fornecedor × marca, com a coluna **Marca**, e marca na coluna Escolhido a linha que entrou na compra (ou "não será comprado"). Para isso, cole o `tools/planilha-emulsao.gs` atualizado no Apps Script e publique em **Implantar → Gerenciar implantações → editar → Nova versão**.
- **Cotações antigas:** abrem normalmente. A bolinha da opção, "Um fornecedor só" e "Escolher item a item" viram escolhas pelo lápis na primeira alteração.
- **Aprovação:** Em cotação → Aguardando aprovação → Aprovada → Pedido emitido (ou Cancelada). Ao enviar/aprovar, a ferramenta avisa se há menos de 3 fornecedores, item sem preço ou escolha que não é a mais barata sem justificativa. Aprovada em diante, o mapa trava (botão **Reabrir para edição**). Tudo fica no histórico da cotação, com usuário e hora.
- **Imprimir mapa:** A4 paisagem com logo, todas as propostas (com a marca), as linhas escolhidas do rodapé, a compra escolhida, a recomendação automática (quando a escolha foi à mão), os dois comparativos, justificativa e linhas de assinatura (comprador, solicitante, aprovação). Dá para salvar em PDF pela janela de impressão.
- **Histórico de preços:** busca por item em todas as cotações (último preço escolhido, menor já cotado). **Baixar planilha (CSV)** exporta todos os preços.
- **Onde ficam os dados:** na aba oculta **G360Cotacoes** da planilha (JSON em pedaços, como as diárias). A cada gravação, as abas **Cotações** (uma linha por cotação) e **Cotações – Preços** (uma linha por item × fornecedor) são refeitas só para consulta. Se dois computadores mexerem ao mesmo tempo, vale a alteração mais recente de cada cotação.
- O Apps Script da planilha precisa ter as ações `lerCotacoes` e `gravarCotacoes` (já estão em `tools/planilha-emulsao.gs`). Depois de colar, publique em **Implantar → Gerenciar implantações → editar → Nova versão**. Até lá, as cotações ficam guardadas no computador e são enviadas assim que a planilha aceitar.

## Busca de fornecedor (aba Cotações)
Ao digitar o nome no cadastro de fornecedor, aparece uma lista suspensa com:
- **Já cadastrados:** evita duplicar. Escolher um abre o cadastro dele (ou, dentro de uma cotação, inclui ele no mapa).
- **No Google:** empresas do Google Maps, com Mato Grosso primeiro. Ao escolher, preenche nome, endereço, cidade, telefone e, quando dá, a categoria.
- **CNPJ:** digitando o CNPJ (no campo CNPJ ou no nome), busca na Receita (BrasilAPI; reserva publica.cnpj.ws) e preenche razão social, endereço, telefone e e-mail. Mostra se o CNPJ não está ativo.

No mapa de cotação, "+ Adicionar fornecedor" virou uma caixa de busca: digite parte do nome e escolha, ou cadastre um novo ali mesmo.

**Chave do Google:** Fornecedores › ⚙ Busca no Google. A chave fica na planilha (aba G360Cotacoes) e vale para todos. No Google Cloud: ative **Places API (New)**, crie a chave e restrinja a `https://fduarteneto1.github.io/*` e à Places API (New). Sem chave, funcionam só os cadastrados e o CNPJ.

## Fornecedores no mapa
Os fornecedores cadastrados em **Cotações › Fornecedores** aparecem no mapa como um quadrado verde-petróleo com "F". O código está em `fornecedores-mapa.js`, carregado pelo `index.html` depois do `pedagios.js`, sem nada secreto.
- **Liga/desliga:** botão **Fornecedores** abaixo do zoom (fica salvo em cada navegador). Desligue quando quiser o mapa mais limpo.
- **Posição:** a que veio do Google ao cadastrar. Sem ela, a ferramenta procura o endereço ou a cidade no OpenStreetMap e mostra a borda tracejada ("posição aproximada").
- **Clique no fornecedor:** categoria, contato, quantas cotações e quantas vezes foi escolhido; **Abrir cadastro** e **📍 Ajustar posição** (arraste e solte; a posição vai para o cadastro e sincroniza pela planilha).
