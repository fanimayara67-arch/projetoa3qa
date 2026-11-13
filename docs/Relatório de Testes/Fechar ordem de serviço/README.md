# Relatório de Testes — UC05 Atender e encerrar chamado (fechar OS)

- **Responsável:** João Marcos Lima Chervinski
- **RA:** 12725164145
- **Data:** 13/11/2026
- **Caso de uso:** UC05 — Atender e encerrar chamado (RF04, RF05; CA04, CA05, CA06; RNF02, RNF03, RNF05)
- **Sprint:** 2 (09/11 a 13/11) — "Preencher e fechar ordem de serviço"
- **Branch:** `test/uc05-fechar-os`

## Abordagem

O fechamento de OS já existia em duas partes: a API (`POST /api/chamados/:protocolo/fechamento`, `FechamentoService.fecharChamado`, `domain/Fechamento.js`, `EstoqueRepository.baixarMateriais`) e o formulário do painel do técnico (`fecharChamado`, `flushQueue` e `apiFetchTO` em `public/tecnico/index.html`). O código não foi reescrito; seguiu o mesmo processo do UC01:

1. **Base:** antes de qualquer teste novo, foram medidas a cobertura, a complexidade e a caixa-preta do navegador (casos CT-04 a CT-11 dos testes offline, contra a API Node).
2. **TDD:** os 32 casos (FO-01 a FO-32) foram escritos a partir do UC05, do CA04 e do projeto de banco do grupo, que define os quatro status, a foto e o GPS como obrigatórios e a precisão máxima de 100 m. 19 falharam com o código atual (fase vermelha). Depois veio uma correção por defeito (fase verde) e a refatoração.
3. **Caixa-branca:** depois da refatoração, a cobertura apontou ramos sem teste, que viraram o caso FO-33.
4. **Teste de sistema:** os casos CT-04 a CT-11 rodaram de novo no navegador.

Uma observação: antes dos testes novos, `Fechamento.js` e `FechamentoService.js` já tinham 100% de linhas cobertas, e mesmo assim havia 8 defeitos no servidor. A cobertura mostra o que foi executado, não se o resultado está certo. Os defeitos só apareceram com casos derivados dos requisitos.

Os testes usam o executor nativo do Node (`node:test`), como o resto da suíte do grupo. As funções do painel são testadas com o apoio criado nos testes offline (`extrair-funcao.js`), que recorta a função real do HTML e a executa com dublês no lugar da rede e do banco do aparelho.

## Como repetir

```bash
npm install --prefix server
npm run test:uc05          # só os testes do UC05
npm test                   # suíte completa do projeto
npm run test:coverage      # suíte completa com cobertura
```

Caixa-preta no navegador (casos do técnico, com a API Node):

```bash
npm install --no-save playwright-core
FILTRO='^CT-(0[4-9]|1[01])$' node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
```

Esse comando grava o resultado no arquivo de evidência dos testes offline (`Testes offline/API Node/evidencias/caixa-preta.json`). Os resultados deste relatório foram gravados à parte, em `evidencias/03-caixa-preta-antes.json` e `evidencias/06-caixa-preta-depois.json`.

## Especificação e resultado dos casos de teste

Os testes ficam em [server/tests/fechar-os/](../../../server/tests/fechar-os/). O nome de cada teste começa pelo ID do caso e pela técnica. "Reprovado → aprovado" significa que o caso falhou na fase vermelha e passou depois da correção.

| Caso | Requisito | Técnica | Nível | O que verifica | Resultado esperado | Resultado obtido | Defeito |
|---|---|---|---|---|---|---|---|
| FO-01 | Passo 6 | Caixa-preta: partição válida | Unidade | Fechamento completo | Aceito, sem erros | Aprovado | — |
| FO-02 | Passos 3 e 6 | Caixa-preta: partição inválida | Unidade | Sem `operacao_id`, status ou serviço; corpo nulo | Recusado | Aprovado | — |
| FO-03 | Passo 6 | Caixa-preta: partição inválida | Unidade | Sem foto; foto vazia; foto já enviada (URL) | Recusa as duas primeiras, aceita a URL | Reprovado → aprovado | F-01 |
| FO-04 | Passo 3 | Caixa-preta: tabela de decisão | Unidade | Os 4 status do UC05; "Resolvido", "concluido", "Concluído ", "fechado", "Cancelado" | Aceita os 4, recusa os outros | Reprovado → aprovado | F-03 |
| FO-05 | Passo 6, A4 | Caixa-preta: partição inválida | Unidade | Sem GPS, (0,0), texto, só latitude; latitude/longitude em texto | Recusa os inválidos, aceita o texto numérico | Reprovado → aprovado | F-02 |
| FO-06 | A4 | Caixa-preta: valor-limite | Unidade | Bordas da região (lat -2 e -20, lng -33 e -50) e 0,01 fora de cada uma; São Paulo | Aceita as bordas, recusa fora | Reprovado → aprovado | F-02 |
| FO-07 | Passo 6, A4 | Caixa-preta: valor-limite | Unidade | Precisão 0, 100, 100,01, 250, -1, texto, ausente | Aceita de 0 a 100 | Reprovado → aprovado | F-02 |
| FO-08 | Passo 4, CA04 | Caixa-preta: tabela de decisão | Unidade | Materiais: sem, por id, fracionado, sem item, quantidade 0, negativa, texto | Aceita os válidos | Aprovado | — |
| FO-09 | Passo 4 | Suposição de erro | Unidade | Item nulo na lista de materiais | Recusa sem erro interno | Reprovado → aprovado | F-05 |
| FO-10 | Passo 6 | Suposição de erro / valor-limite | Unidade | Data ISO, ausente, "13/11/2026, 10:30", "ontem" | Aceita ISO e ausente | Reprovado → aprovado | F-06 |
| FO-11 | Passo 3 | Caixa-preta: valor-limite | Unidade | Referência com 255 e 256 caracteres | Aceita / recusa | Reprovado → aprovado | F-07 |
| FO-12 | Passo 7, CA04 | Caixa-preta: partição válida | Serviço + repositórios, banco simulado | Fechamento válido | Grava, fecha o chamado, baixa o estoque, registra a OS e o poste | Aprovado | — |
| FO-13 | CA04 | Baseada em risco: duplicidade | Serviço + repositórios | Reenvio da mesma operação | Mesmo fechamento; estoque baixado uma vez | Aprovado | — |
| FO-14 | Pré-condição | Baseada em risco: concorrência | Serviço + repositórios | Chamado já fechado; chamado inexistente | 409 sem baixar estoque; 404 | Aprovado | — |
| FO-15 | Pós-condição | Baseada em risco: idempotência | Serviço + repositórios | Mesma `operacao_id` em outro chamado | 409; o outro continua aberto | Reprovado → aprovado | F-08 |
| FO-16 | CA04 | Baseada em risco | Serviço + repositórios | Mesmo material duas vezes (por nome; por id e nome) | Estoque e OS com o mesmo total | Reprovado → aprovado | F-04 |
| FO-17 | CA04 | Baseada em risco: atomicidade | Serviço + repositórios | Saldo insuficiente | 409 e nada gravado (rollback) | Aprovado | — |
| FO-18 | CA04 | Baseada em risco: atomicidade | Serviço + repositórios | Material inexistente depois de um válido | 404 e o saldo do primeiro volta | Aprovado | — |
| FO-19 | Passo 4 | Caixa-branca: cobertura de ramos | Serviço + repositórios | Poste informado, do chamado ou nenhum | Ficha do poste certa em cada caso | Aprovado | — |
| FO-20 | Passo 6 | Caixa-branca: cobertura de ramos | Serviço | Dados inválidos | Não abre transação nem grava foto | Aprovado | — |
| FO-21 | RNF03, CA05 | Caixa-preta | Integração (API) | Sem token, token vencido, perfil almoxarife | 401, 401, 403 | Aprovado | — |
| FO-22 | Passos 6 e 7 | Caixa-preta | Integração (API) | Fechamento válido e reenvio | 201; reenvio devolve o mesmo registro | Aprovado | — |
| FO-23 | Passo 6 | Caixa-preta | Integração (API) | Sem foto, sem GPS, status "Resolvido", precisão 300 | 400 e nada gravado | Reprovado → aprovado | F-01 a F-03 |
| FO-24 | Passo 6 | Suposição de erro | Integração (API) | Data no formato da tela antiga | 400 (não 500) | Reprovado → aprovado | F-06 |
| FO-25 | Passos 6 e 7 | Caixa-branca | Unidade (painel) | Rota, método, JSON e token no envio para a API Node | `POST /api/chamados/:protocolo/fechamento` com Bearer | Reprovado → aprovado | DEF-02 |
| FO-26 | Passos 4 e 6 | Caixa-branca | Unidade (painel) | Contrato do corpo | `operacao_id` da tela, materiais `{nome, quantidade}`, data ISO, poste, precisão | Reprovado → aprovado | DEF-02 |
| FO-27 | A5 | Suposição de erro | Unidade (painel) | Item antigo da fila sem `operacao_id` nem data ISO | Enviado com operação gerada e data válida | Reprovado → aprovado | DEF-02 |
| FO-28 | A5 | Caixa-branca | Unidade (painel) | Respostas `ok`, `CONFLITO` (já fechado), `NAO_AUTENTICADO`, `DADO_INVALIDO` | `success`, "ja_fechado", "sessao_expirada", mensagem legível | Reprovado → aprovado | DEF-02 |
| FO-29 | — | Caixa-preta: regressão | Unidade (painel) | Envio para o Apps Script | Igual ao de antes | Reprovado → aprovado ¹ | — |
| FO-30 | A5 | Baseada em risco | Unidade (painel) | Fila com um fechamento recusado no meio | Envia todos; só o recusado fica | Reprovado → aprovado | DEF-07 |
| FO-31 | A5 | Baseada em risco | Unidade (painel) | Resposta "ja_fechado" | Sai da fila; os outros seguem | Reprovado → aprovado | DEF-08 |
| FO-32 | A5 | Caixa-branca: cobertura de ramos | Unidade (painel) | Sessão expirada; sem rede | Interrompe sem apagar nada | Aprovado | — |
| FO-33 | Passos 4 e 6 | Caixa-branca: cobertura de ramos | Serviço + repositórios | `latitude`/`longitude`, sem config, sem materiais, sem data | Grava com os valores alternativos e a hora do servidor | Aprovado | — |
| FO-34 | Fluxo principal | Caixa-preta | Sistema, manual | Fechamento completo no celular | Ver [roteiro](roteiro-testes-manuais.md) | A executar | — |
| FO-35 | A5 | Caixa-preta | Sistema, manual | Fechamento sem sinal e envio quando o sinal volta | Ver [roteiro](roteiro-testes-manuais.md) | A executar | — |

¹ O FO-29 falhou na fase vermelha só porque carrega as funções novas do envio, que ainda não existiam; o comportamento do Apps Script não mudou.

### Caixa-preta no navegador (testes offline, API Node)

| Caso | Requisito | Antes | Depois |
|---|---|---|---|
| CT-04 | Fluxo principal | Reprovado | Aprovado (5 de 6 rodadas; 1 erro por tempo esgotado no ambiente) |
| CT-05 | A5 | Aprovado | Aprovado |
| CT-06 | A5 | Reprovado | Aprovado |
| CT-07 | A6 (10/11) | Aprovado | Aprovado |
| CT-08 | A5 | Reprovado | Aprovado |
| CT-09 | A5 | Reprovado | Aprovado |
| CT-10 | UC04-A3, A5 | Reprovado | Reprovado (DEF-09, aberto) |
| CT-11 | Pré-condição | Reprovado | Reprovado (DEF-10, aberto) |
| **Total** | | **2 de 8** | **6 de 8** |

O CT-04 deu erro por tempo esgotado em 1 de 6 execuções, esperando a tela do navegador. Rodou mais 4 vezes e passou em todas ([07-caixa-preta-ct04-repeticoes.json](evidencias/07-caixa-preta-ct04-repeticoes.json)); o relatório dos testes offline registra a mesma instabilidade no CT-07.

## Ciclo TDD registrado nos commits

| Etapa | Commit (título) | O que aconteceu |
|---|---|---|
| Vermelho | `test(UC05): especifica o fechamento de OS em testes (fase vermelha)` | 32 casos; 19 falham. Evidências de base: cobertura, complexidade e caixa-preta |
| Verde (servidor) | `fix(UC05): ... (F-01)` até `fix(UC05): ... (F-04)` | Oito commits, um por defeito (F-01 a F-08); a suíte inteira roda a cada passo |
| Verde (painel) | `fix(UC05): o painel do técnico envia o fechamento para a API Node (DEF-02)` e `fix(UC05): a fila do técnico não trava ... (DEF-07, DEF-08)` | Envio pela rota certa e fila sem travar |
| Refatoração | `refactor(UC05): divide as funções do fechamento para ficarem com até 10 caminhos (F-09)` | Mesma saída dos testes, funções com até 9 caminhos |
| Caixa-branca | `test(UC05): cobre os ramos de campos alternativos e opcionais do fechamento (FO-33)` | Ramos apontados pela cobertura depois da refatoração |

**Testes de outras pessoas que foram ajustados.** O UC05 passou a exigir foto, GPS com precisão e status da lista. Os fechamentos de exemplo de testes antigos não tinham esses campos e passaram a tê-los, sem mudar o que cada teste verifica: `domain.test.js`, `services.test.js`, `fechamento-cobertura.test.js` e os testes offline. Três casos mudaram de verdade, e cada um tem um comentário no código:

- **CBN-85:** conferia que, sem GPS no fechamento, o poste recebia as coordenadas do chamado. Com o GPS obrigatório, esse caminho não existe mais.
- **CBN-53:** registrava o DEF-02 (404 em `/api` e fila presa). Agora verifica a rota nova.
- **FA-CB05:** esperava a consulta da operação antes da trava do chamado. Pelo F-08, a ordem se inverteu.

Os casos CBN-41, CBN-42, CBN-52, CBA-41 e CBA-50, que estavam marcados como pendentes (`todo`) por causa do DEF-02, do DEF-07 e do DEF-08, passaram a ser verificados normalmente.

## Defeitos

Foram encontrados **10 defeitos novos** (F-01 a F-10) e corrigidos **12**: os 9 primeiros novos e os 3 do catálogo dos testes offline que fazem parte do UC05 (DEF-02, DEF-07 e DEF-08). Detalhes no [registro de defeitos](defeitos.md).

| Severidade | Quantidade | IDs |
|---|---|---|
| Crítica | 1 | DEF-02 |
| Alta | 4 | F-01, F-02, DEF-07, DEF-08 |
| Média | 4 | F-03, F-04, F-06, F-08 |
| Baixa | 4 | F-05, F-07, F-09, F-10 (aberto) |

## Métricas

| Métrica | Antes | Depois |
|---|---|---|
| Testes automatizados na suíte do projeto | 262 (240 aprovados, 8 falhas, 14 pendentes) | 295 (278 aprovados, 8 falhas, 9 pendentes) |
| Testes do UC05 | 0 dedicados | 33 (FO-01 a FO-33) + 2 manuais |
| Caixa-preta do técnico no navegador (CT-04 a CT-11, API Node) | 2 de 8 | 6 de 8 |
| `Fechamento.js` — linhas / ramos | 100% / 100% | 100% / 100% |
| `FechamentoService.js` — linhas / ramos | 100% / 98,28% | 100% / 95,45% |
| `EstoqueRepository.js` — linhas / ramos | 98,74% / 78,79% | 98,82% / 85,00% |
| `FechamentoRepository.js` — linhas / ramos | 81,25% / 40,00% | 100% / 80,00% |
| Projeto inteiro — linhas / ramos | 88,92% / 87,12% | 90,25% / 88,17% |
| Maior complexidade em uma função do UC05 no servidor | 17 | 9 |
| `flushQueue` (painel) | 10 | 9 |
| Defeitos encontrados / corrigidos nesta etapa | — | 10 novos / 12 corrigidos (9 novos + 3 do catálogo) |
| Densidade de defeitos no UC05 | — | 15 defeitos no caso de uso (10 novos + DEF-02, DEF-07, DEF-08, DEF-09, DEF-10) |

As 8 falhas da suíte são os testes do login por PIN que precisam de MySQL configurado (CT-14, CT-18 a CT-21, CT-23, CT-24, CT-28); eram as mesmas antes. A cobertura de ramos do `FechamentoService` ficou um pouco abaixo da inicial porque o arquivo ganhou caminhos novos (conferência da operação e funções separadas na refatoração); o FO-33 recuperou parte deles.

Evidências:

1. [cobertura antes](evidencias/01-cobertura-antes.txt)
2. [complexidade antes](evidencias/02-complexidade-antes.txt)
3. [caixa-preta antes](evidencias/03-caixa-preta-antes.json)
4. [TDD vermelho](evidencias/04-tdd-vermelho.txt)
5. [complexidade depois](evidencias/05-complexidade-depois.txt)
6. [caixa-preta depois](evidencias/06-caixa-preta-depois.json)
7. [repetições do CT-04](evidencias/07-caixa-preta-ct04-repeticoes.json)
8. [TDD verde](evidencias/08-tdd-verde.txt)
9. [cobertura depois](evidencias/09-cobertura-depois.txt)

## Limites e pendências

- **Formulário do técnico.** O envio foi corrigido dentro do script da tela (`apiFetchTO`), que é o código que roda hoje. A camada em `public/tecnico/js` (`Close.js`, `FecharChamado.js`, `SincronizarBaixas.js`, `CloseQueue.js`) continua sem estar ligada ao formulário. Ligar o formulário a ela resolve o F-10 (complexidade 55).
- **DEF-09 e DEF-10** (sessão expirada e fechar duas vezes) continuam abertos. Os casos CT-10 e CT-11 seguem reprovados.
- **Fechamento recusado na fila.** Ele não trava mais os outros, mas fica na fila sem mostrar ao técnico o motivo da recusa.
- **Nomes dos materiais.** A tela oferece uma lista fixa (`MATERIAIS_OS_DEF`: "Luminária", "Reator", "Cabo (m)"…). A API procura o material no almoxarifado pelo nome. Um nome que não exista no almoxarifado faz a API recusar o fechamento com 404. Os nomes precisam ser os mesmos nos dois lugares.
- **Banco real.** Os testes de serviço e de API usam um banco simulado que reproduz as consultas e restrições do MySQL. Falta rodar o fluxo com o banco do grupo (FO-34 e FO-35).
- **Precisão do GPS.** É conferida, mas não é gravada: a tabela `fechamentos` do backend não tem a coluna que o projeto de banco do grupo prevê (`precisao_gps`).
- **Poste novo.** A tela envia `poste_force_new` (fluxo A3 de reincidência), mas a API Node não trata esse campo.
- **Fechamento administrativo (UC10).** O corpo da transação tem 11 caminhos. Não faz parte deste caso de uso; fica registrado para quem cuida do UC10.

## Ajustes necessários no documento de requisitos

- **Pré-condição:** o sistema grava o status do chamado como `aberto` ou `em_atendimento`, não "Aguardando atendimento" (mesmo ajuste do UC01).
- **Passo 3:** o técnico é identificado pela sessão do PIN (UC04). A API não usa o nome digitado no formulário.
- **Status que fecham o chamado:** hoje, os quatro status ("Requer material", "Parcialmente resolvido" e "Ponto não localizado" também) mudam o chamado para `fechado`, e ele sai da lista. O grupo precisa confirmar se é isso ou se alguns devem manter o chamado aberto.
- **A4:** registrar a região aceita (latitude de -20 a -2 e longitude de -50 a -33) e a precisão máxima (100 m), que agora são conferidas também no servidor.
