# Calculadora de DMT – BKP Construtora

Ferramenta web para calcular a DMT e o custo de transporte de **brita** (a partir das pedreiras) e de **emulsão asfáltica** (a partir das distribuidoras) até a obra, em Mato Grosso.

## Como usar
1. **Local da obra**: busque a cidade ou marque o ponto no mapa.
2. **Material**: escolha brita ou emulsão, informe a quantidade e a referência (SICRO ou SINAPI).
3. **Preços de transporte**: preencha o R$ por t·km (ou m³·km) em rodovia pavimentada e não pavimentada, conforme o mês de referência. Os valores ficam salvos no navegador.
4. **Calcular rotas**: a ferramenta traça a rota até as 8 origens mais próximas e ordena pelo menor custo.
5. Em cada origem, informe os **km de chão** e corrija o total se precisar. Clique em uma origem para ver a rota e a memória de cálculo.

## Pedreiras e distribuidoras
A lista oficial fica em `pontos.json`. Para atualizar a lista da equipe:
1. Adicione ou edite os pontos pelo mapa.
2. Clique em **Exportar pontos**.
3. Substitua o `pontos.json` neste repositório pelo arquivo baixado.

## Limitações
- As rotas vêm do OpenStreetMap (serviço público OSRM). A separação entre trecho pavimentado e não pavimentado **não é automática**.
- Se a rota não for encontrada, a ferramenta usa a distância em linha reta × 1,3 e mostra um aviso.

## Publicação
Para publicar: **Settings → Pages → Branch `main` / root**. O site fica em `https://<usuario>.github.io/<repositorio>/`.
