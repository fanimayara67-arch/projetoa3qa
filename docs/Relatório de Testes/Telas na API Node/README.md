# Relatório de Testes — Telas que faltavam na API Node (DEF-01, DEF-15 e DEF-16)

- **Responsável:** João Marcos Lima Chervinski
- **Data:** 27/11/2026
- **Branch:** `fix/telas-api-node`, sobre a `main` com os PRs #17, #18 e #19
- **Processo:** TDD. Primeiro os testes que falham (vermelho), depois uma correção por commit (verde) e por fim a refatoração.

## O problema

O técnico (login, lista e fechamento) foi ligado à API Node no UC05. As outras telas continuavam montando a mensagem no formato do Apps Script (`{ action: ... }`) e mandando para `/api`, rota que não existe na API Node.

| Tela | Com a API Node, antes | Defeito |
|---|---|---|
| Reporte do cidadão | Formulário sem `id`; a API recusava (400) e nenhum reporte chegava | DEF-01 (crítica) |
| Almoxarifado | O almoxarife nunca entrava ("PIN incorreto." com o PIN certo); estoque, missões e relatório de material não carregavam | DEF-16 (alta) |
| Histórico do poste e relatório de postes | "Erro ao carregar histórico." e "Não foi possível carregar." | DEF-15 (média) |
| Busca por protocolo fora da lista e tentativa sem resolução | Falhavam pelo mesmo motivo | DEF-15 / DEF-16 (mesma causa) |

Os testes desta correção acharam mais três defeitos:

| ID | Severidade | Defeito | Achado por |
|---|---|---|---|
| **DEF-17** (novo) | Alta | A tela tem "Registrar retorno" de material, mas a API Node não tinha a rota. O material que voltava do campo nunca era devolvido ao estoque. | RM-01 a RM-06, TN-32 |
| **DEF-18** (novo) | Baixa | `GET /api/postes` não trazia quantos atendimentos cada poste teve; o relatório de postes mostraria "undefined atendimento". | PL-01, V-10 |
| **DEF-19** (novo) | Baixa | O almoxarifado escondia o motivo das recusas da API e mostrava só "Erro ao registrar." (ex.: equipe em branco, unidade inválida, retorno maior que a saída). | TN-24, TN-27 |

## O que mudou

| Onde | Mudança |
|---|---|
| `public/index.html` (cidadão) | `buildPayload` cria o `id` (UUID v4). `postReport` envia JSON para `/api/chamados`; o Apps Script continua com formulário. Reporte que já estava na fila sem `id` ganha um no primeiro envio, guardado no próprio item: o reenvio usa o mesmo `id` e a API não duplica. |
| `public/tecnico/js/infrastructure/AcoesApiNode.js` (novo) | Adaptador: leva cada ação da tela para a rota REST e devolve a resposta no formato que a tela já mostra. Sessão vencida volta como `sessao_expirada`, que a tela já trata. |
| `public/tecnico/index.html` | `apiFetchTO`: com a API Node, toda ação que não é o fechamento vai pelo adaptador; com o Apps Script, nada muda. O almoxarifado mostra o motivo das recusas. |
| `public/tecnico/js/domain/Ticket.js` | `statusParaTela` e `registroParaTela`, usados pela lista e pela busca. |
| API Node | `POST /api/missoes/:id/retorno` (DEF-17) e `qtd`/`data_ult` em `GET /api/postes` (DEF-18). |
| Service workers | O adaptador entra no cache do técnico; os dois caches trocam de versão. |

Ações da tela e rotas da API Node:

| Ação da tela (Apps Script) | Rota na API Node |
|---|---|
| `almox_login` | `POST /api/auth/almoxarifado` |
| `estoque_list`, `estoque_upsert`, `estoque_delete` | `GET /api/estoque`, `PUT` e `DELETE /api/estoque/:item` |
| `missao_create`, `missao_list` | `POST` e `GET /api/missoes` |
| `missao_return` | `POST /api/missoes/:id/retorno` (nova) |
| `material_report` | `GET /api/estoque` + `GET /api/missoes` |
| `get_poste_history`, `list_postes` | `GET /api/postes/:id/historico`, `GET /api/postes` |
| `search` | `GET /api/chamados/:protocolo` |
| `attempt` | `POST /api/chamados/:protocolo/tentativas` |

## Ciclo TDD (commits)

| Fase | Commit | Testes |
|---|---|---|
| Vermelho | `test(telas-api-node): casos que reproduzem DEF-01, DEF-15 e DEF-16` | 93 testes, **41 falhas** ([01-vermelho.txt](evidencias/01-vermelho.txt)) |
| Verde | `fix(DEF-01): reporte do cidadão chega à API Node` | CBN-26, CBN-50, CBN-51, CBN-55 e CBN-56 |
| Verde | `feat(UC07): rota de retorno de material da missão e contagem de atendimentos dos postes` | RM-01 a RM-06 e PL-01 |
| Verde | `fix(DEF-15, DEF-16): almoxarifado, postes, busca e tentativa funcionam com a API Node` | TN-01 a TN-35 |
| Refatoração | `refactor(tecnico): lista e busca usam a mesma conversão do domínio` | Suíte igual |
| Refatoração | `test(telas-api-node): API Node com banco em memória vira apoio reutilizável` | Suíte igual |
| Vermelho | `test(UC07): almoxarifado deve mostrar o motivo da recusa da API` | TN-27 falha |
| Verde | `fix(UC07): almoxarifado mostra o motivo da recusa da API` | TN-27 passa |
| Final | — | 94 testes, **0 falhas**, 3 pendentes de outros defeitos ([02-verde.txt](evidencias/02-verde.txt)) |

## Casos de teste

### Adaptador (unidade, `server/tests/telas-api-node/acoes-api-node.test.js`)

A rede é um dublê com a mesma saída do `ApiClient` real.

| Caso | Técnica | O que verifica |
|---|---|---|
| TN-01 | Partição | O adaptador atende as 12 ações das telas que faltavam; login, lista, fechamento e fechamento administrativo ficam com a tela |
| TN-02 | Fluxo principal | `almox_login` vai para `POST /api/auth/almoxarifado` e devolve o token |
| TN-03 | Fluxo alternativo | Login recusado devolve o motivo da API (PIN errado ou bloqueio) |
| TN-04 | Fluxo principal | `estoque_list` converte saldo e mínimo para número e mostra sugestões que ainda não estão cadastradas |
| TN-05 | Fluxo principal | `estoque_upsert` e `estoque_delete` usam a rota do item, com o nome codificado |
| TN-06 | Exceção | Item recusado devolve a mensagem de validação |
| TN-07 | Valor limite | `missao_create` converte `dd/mm/aaaa` para `AAAA-MM-DD`; sem data usa hoje |
| TN-08 | Fluxo principal | `missao_list` mostra situação (Aberta/Fechada), saída, retorno e consumo |
| TN-09 | Fluxo principal | `missao_return` envia o retorno de cada item |
| TN-10 | Fluxo principal | `material_report` junta estoque e missões e marca o que precisa repor |
| TN-11 | Fluxo principal | Histórico do poste: ficha e chamados abertos/atendidos no formato da tela |
| TN-12 | Fluxo alternativo | Poste sem cadastro (404) mostra "Poste não cadastrado" |
| TN-13 | Fluxo principal | Relatório de postes: coordenadas, foto e contagem de atendimentos |
| TN-14 | Fluxo principal | Busca por protocolo devolve o registro no formato da lista |
| TN-15 | Fluxo alternativo | Protocolo inexistente dá registro nulo; sessão vencida avisa a tela |
| TN-16 | Risco: reenvio | Tentativa com `operacao_id` que se mantém no reenvio |
| TN-17 | Exceção | Tentativa com sessão vencida ou chamado já fechado |
| TN-18 | Risco: rede | Sem conexão, o erro chega à tela ("Sem conexão") |
| TN-19 | Partição inválida | Ação desconhecida não chama a rede |
| TN-20 | Caixa-branca | O tempo limite da tela chega ao `ApiClient` |

### Telas (unidade, `server/tests/telas-api-node/tela-tecnico.test.js`)

As funções são recortadas do `tecnico/index.html` real (apoio dos testes offline).

| Caso | O que verifica |
|---|---|
| TN-21 | Com a API Node, as 12 ações vão pelo adaptador, com o tempo limite da tela |
| TN-22 | Com o Apps Script, as mesmas ações continuam no formato antigo (regressão) |
| TN-23 | Com a API Node, o fechamento continua indo direto para a rota REST (regressão do UC05) |
| TN-24 | Login do almoxarifado recusado mostra o motivo da API |
| TN-25 | Login do almoxarifado aceito guarda o token e abre o estoque |
| TN-26 | O adaptador está no cache do service worker do técnico |
| TN-27 | Salvar item, excluir, registrar saída e retorno mostram o motivo da recusa |

### Integração (`server/tests/telas-api-node/integracao.test.js`)

Adaptador real → `ApiClient` real → rotas, PIN, perfis, serviços e transações reais da API Node. Só o banco é em memória ([apoio/api-em-memoria.js](../../../server/tests/telas-api-node/apoio/api-em-memoria.js)).

| Caso | O que verifica |
|---|---|
| TN-30 | O almoxarife entra com o próprio PIN; o PIN do técnico não abre o almoxarifado |
| TN-31 | Cadastrar, listar, editar e excluir item; unidade inválida é recusada com o motivo |
| TN-32 | A saída debita (8 → 5), o retorno devolve (5 → 6), o relatório mostra consumo 2; retorno maior que a saída é recusado |
| TN-33 | O técnico não usa as rotas do almoxarifado |
| TN-34 | Histórico do poste, poste não cadastrado e relatório de postes |
| TN-35 | Busca por protocolo (achado, inexistente, sessão vencida) e tentativa com reenvio sem duplicar |

### Retorno de material e relatório de postes (unidade)

| Caso | Técnica | O que verifica |
|---|---|---|
| RM-01 | Fluxo principal | O retorno credita o que voltou e registra o retorno de cada item |
| RM-02 | Valor limite | Retorno igual à saída é aceito; um a mais é recusado sem mexer no estoque |
| RM-03 | Risco: reenvio | Corrigir um retorno credita só a diferença; o mesmo retorno enviado de novo não credita outra vez |
| RM-04 | Exceção | Missão inexistente (404) e item que não saiu na missão |
| RM-05 | Partição inválida | Sem itens ou quantidade negativa/não numérica, recusa antes da transação |
| RM-06 | Caixa-branca | SQL do MySQL: trava missão e itens (`FOR UPDATE`), credita o saldo e grava o retorno |
| PL-01 | Caixa-branca | `listarTodos` traz `qtd` e `data_ult`, com e sem filtro de bairro |

### Reporte do cidadão (DEF-01, testes offline do Davi)

| Caso | Antes | Agora |
|---|---|---|
| CBN-26 | `todo` (DEF-01) | Aprovado: JSON com `id` para a API Node; formulário para o Apps Script |
| CBN-50 | `todo` (DEF-01) | Aprovado: a fila esvazia com a API Node real |
| CBN-51 | Comprovava a recusa (400 JSON_INVALIDO) | Revisado: a mensagem vai em JSON e a API grava um chamado |
| CBN-55 | `todo` (DEF-01) | Aprovado: a mensagem leva o `id` |
| CBN-56 | — (novo) | Reporte antigo da fila ganha `id`, que se mantém no reenvio |

O CBN-43 foi revisado: com a API Node, só o fechamento passa pelo `fetch` da tela. As outras ações vão pelo adaptador, que leva o tempo limite ao `ApiClient` (TN-20).

### Verificação no navegador (sistema, Chromium)

O script [verificar-telas.navegador.mjs](scripts/verificar-telas.navegador.mjs) serve a pasta `public/` e a API Node na mesma origem, com a configuração que o build gera para a API Node. Tudo é feito pela tela.

| Caso | O que verifica | Resultado |
|---|---|---|
| V-01 | O almoxarifado recusa o PIN do técnico e continua fechado | ✅ |
| V-02 | O almoxarife entra e vê o estoque da API Node ([captura](evidencias/navegador/V-02-estoque.png)) | ✅ |
| V-03 | Item cadastrado pela tela aparece na lista | ✅ |
| V-04 | Saída para a missão aparece como ABERTA e debita o estoque (8 → 5) ([captura](evidencias/navegador/V-04-missao-aberta.png)) | ✅ |
| V-05 | O retorno fecha a missão: "saiu 3, voltou 1 → usou 2" | ✅ |
| V-06 | O retorno volta ao estoque (5 → 6) | ✅ |
| V-07 | O relatório de material abre com estoque e missão ([captura](evidencias/navegador/V-07-relatorio-material.png)) | ✅ |
| V-08 | Histórico do poste P-0007: ficha, 1 chamado aberto e 1 atendido ([captura](evidencias/navegador/V-08-historico-poste.png)) | ✅ |
| V-09 | Poste sem cadastro mostra "Poste não cadastrado" | ✅ |
| V-10 | O relatório de postes lista o P-0007 com 2 atendimentos ([captura](evidencias/navegador/V-10-relatorio-postes.png)) | ✅ |
| V-11 | Busca de chamado já fechado (fora da lista local) acha no servidor | ✅ |
| V-12 | Nenhum erro de JavaScript | ✅ |

Nenhum pedido no formato do Apps Script (`POST /api`) chegou ao servidor ([verificacao-telas.txt](evidencias/navegador/verificacao-telas.txt)).

## Resultados

| Teste | Antes (main + #17, #18, #19) | Depois |
|---|---|---|
| Suíte completa (`npm test`, sem MySQL) | 316 testes; 8 falhas por falta de MySQL; 10 pendentes | **357 testes**; as mesmas 8 falhas por falta de MySQL; **7 pendentes** (saem os 3 do DEF-01) ([05-suite-completa.txt](evidencias/05-suite-completa.txt)) |
| Caixa-preta offline no navegador, API Node | 18 de 30 (#17) | **25 de 30** ([03-caixa-preta-api-node.txt](evidencias/03-caixa-preta-api-node.txt)) |
| Caixa-preta offline no navegador, Apps Script | 25 de 32 (#17) | **25 de 32**, sem regressão ([04-caixa-preta-apps-script.txt](evidencias/04-caixa-preta-apps-script.txt)) |
| Verificação das telas no navegador | — | **12 de 12** |
| Cobertura do código do app (sem os arquivos de teste) | linhas 82,3%, ramos 86,3%, funções 77,8% | linhas 90,3%, ramos 83,4%, funções 89,6% |

Na caixa-preta da API Node passaram a ser aprovados CP-03, CP-10, CP-11, CP-12, CP-15, CP-16 e CP-17, todos do DEF-01. Continuam reprovados CP-09 (DEF-06), CP-13 (DEF-05), CP-14 (DEF-03), CT-10 (DEF-09) e CT-11 (DEF-10). Na rodada completa, CT-10 e CT-11 deram erro de execução; rodados isolados, reprovam como antes ([03b](evidencias/03b-ct10-ct11-isolados-api-node.txt)).

A cobertura de ramos caiu porque o adaptador novo tem 73% dos ramos cobertos, abaixo da média do projeto. As linhas e as funções do adaptador estão 100% cobertas.

## Pendências

1. **Repetir a integração com Selenium** (`npm run test:selenium`, precisa de Chrome e MySQL). O SEL-01, o SEL-02, o SEL-12 e o SEL-13 devem passar a ser aprovados. Não foi possível rodar aqui por falta de MySQL.
2. **Coluna da data da missão.** A migração oficial (`001_inicial_mysql.sql`) cria `missoes.data`, e o repositório usa `data`. Os esquemas dos testes de integração (Cláudio) e do Selenium (Davi) criam `data_missao`. O INT-13 está como `todo` por isso. A equipe precisa decidir qual é o esquema do banco real.
3. Continuam abertos, fora deste PR: DEF-03, DEF-04, DEF-05, DEF-06, DEF-09, DEF-10, DEF-11 e DEF-12.

## Como repetir

```bash
npm run build                      # gera o config.js
npm test                           # suíte completa
node --test server/tests/telas-api-node/*.test.js server/tests/almoxarifado/retorno-missao.test.js server/tests/postes/listar-postes.test.js

# Navegador (precisa do Playwright e do Chrome)
npm install --no-save playwright-core
node "docs/Relatório de Testes/Telas na API Node/scripts/verificar-telas.navegador.mjs" . "docs/Relatório de Testes/Telas na API Node/evidencias/navegador"
node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
```
