# Caixa-branca — Funcionalidades offline com o servidor API Node

- **Aluno:** Davi Santiago de Jesus
- **Data:** 12/11/2026
- **Nível de teste:** unidade (funções das telas e do servidor) e integração (telas ↔ API Node real)
- **Cenário:** o projeto usa a API Node (`server/`) como servidor
- **Evidência:** [caixa-branca.json](evidencias/caixa-branca.json) (testes, cobertura, complexidade e mutação) · [saída da execução](evidencias/caixa-branca-saida.txt) · [1ª rodada de mutação](evidencias/caixa-branca-mutacao-rodada1.json)

## O que foi testado

Com a API Node, a sincronização offline tem **dois lados com código no repositório**, e os dois foram testados por dentro.

**Aparelho:** as mesmas 10 funções das telas do [cenário Apps Script](../Apps%20Script/caixa-branca.md), agora com as respostas no formato da API Node: `{ success, ok, error: { codigo, mensagem } }`.

**Servidor:** o que a API faz quando o aparelho reenvia um reporte ou um fechamento:

| Função | Onde está | V(G) | O que faz |
|---|---|---|---|
| `criarChamado` | `server/src/application/services/ChamadoService.js:21` | **11** | Cria o chamado; o mesmo `id` não duplica |
| `fecharChamado` | `server/src/application/services/FechamentoService.js:24` | **12** | Fecha o chamado; o mesmo `operacao_id` não fecha nem baixa o estoque duas vezes |
| `validarNovoChamado` | `server/src/domain/Chamado.js:50` | 7 | Exige `id`, protocolo, tipo e GPS (ou poste do QR) |
| `coordenadasValidas` | `server/src/domain/Chamado.js:35` | 6 | Recusa GPS fora do globo, vazio ou (0,0) |
| `validarFechamentoCampo` | `server/src/domain/Fechamento.js:9` | 8 | Exige `operacao_id`, status, serviço e materiais válidos |
| `tratarErros` | `server/src/presentation/middlewares/tratarErros.js:15` | 4 | Traduz erros em 400, 409, 413, 500 e 503 |
| `middlewareValidacao` | `server/src/presentation/middlewares/validar.js:8` | 2 | Aponta os campos obrigatórios que faltam |
| `lerBodyJson` | `server/src/app.js:154` | 4 | Lê o corpo como JSON (400 se não for, 413 acima de 8 MB) |

V(G) é calculado como decisões + 1. **`criarChamado` (11), `fecharChamado` (12) e o `flushQueue` do cidadão (11) passam do limite de 10 caminhos do RNF05.**

## Como os testes funcionam

**Aparelho.** As funções são recortadas do HTML e rodadas num ambiente isolado com dublês (Fake, Stub, Spy, Mock e Dummy), como descrito no [relatório do Apps Script](../Apps%20Script/caixa-branca.md#como-os-testes-funcionam). Os casos de caminho (CBN-01 a CBN-47) são os mesmos, parametrizados pelo contrato da API Node.

**Integração aparelho ↔ API (CBN-50 a CBN-55).** A função real da tela faz a requisição HTTP real para a API Node real. Só o MySQL é trocado por repositórios em memória, pelo ponto de troca oficial do projeto (`pool.setPool`): o código de transação (BEGIN/COMMIT) continua rodando, e qualquer SQL que escape do Fake faz o teste falhar avisando.

**Servidor (CBN-60 a CBN-93).** Os serviços recebem os repositórios por **injeção de dependência** (parâmetro `deps`), o remédio para testabilidade visto em aula. Assim os testes usam Fakes em memória sem alterar nenhum módulo. As rotas são exercitadas por HTTP, contra a API real.

Padrão AAA, regras FIRST e testes `todo` para defeitos: igual ao cenário Apps Script.

## Resultado

**87 testes: 78 aprovados e 9 que confirmam defeitos**, sem nenhuma falha inesperada.

### O lado do servidor está correto

Os testes do servidor (CBN-60 a CBN-93) passaram. O que eles mostram:

- **Idempotência do reporte:** o mesmo reporte enviado duas vezes, com o mesmo `id`, gera um único chamado (CBN-68, CBN-78).
- **Protocolo repetido:** mesmo protocolo com outro `id` é conflito (409) e não duplica (CBN-69).
- **Idempotência do fechamento:** o mesmo fechamento reenviado, com o mesmo `operacao_id`, não fecha de novo nem baixa o estoque duas vezes, como pede o CA04 (CBN-71).
- **Validação na fronteira:**
  - GPS em ±90/±180 é aceito e um passo além é recusado; (0,0) é recusado (CBN-60 a CBN-62);
  - quantidade 0 de material é recusada e 1 é aceita (CBN-75);
  - corpo acima de 8 MB é recusado com 413 (CBN-81).
- **Erros traduzidos sem expor detalhes:** banco fora do ar vira 503 e erro inesperado vira 500 com mensagem genérica (CBN-83).

### O aparelho não segue o contrato da API

A integração mostra a causa exata dos dois defeitos críticos da caixa-preta:

- **DEF-01:**
  - a mensagem do cidadão não tem `id` (CBN-55, CBN-64);
  - ela vai como formulário (CBN-26);
  - a API responde `400 JSON_INVALIDO` antes de olhar o conteúdo (CBN-51, CBN-76);
  - o reporte fica na fila para sempre (CBN-50).
- **DEF-02:** o técnico envia `{ action: "close" }` para `/api` (CBN-42), e a API responde `404 ROTA_NAO_ENCONTRADA` (CBN-53, CBN-79). A rota certa (`/api/chamados/{protocolo}/fechamento`, com Bearer e `operacao_id`) funciona (CBN-79), mas o app não a usa (CBN-52).
- **DEF-12:** o erro da API é um objeto `{ codigo, mensagem }`, e as telas esperam texto. Ele vira "[object Object]" (CBN-54).
- **DEF-13:** a API responde sessão expirada com `401 NAO_AUTENTICADO`. O app procura o texto `'sessao_expirada'` do Apps Script, então **o ramo de sessão expirada do técnico nunca é executado com a API Node**. É o único ramo sem cobertura, e não por falta de teste: ele é inalcançável com este servidor.

### Cobertura

| Função | Linhas | Ramos |
|---|---|---|
| `buildPayload (cidadão)` | 13/13 | 2/2 |
| `flushQueue (cidadão)` | 23/23 | 28/28 |
| `generateProtocol (cidadão)` | 5/5 | 1/1 |
| `postReport (cidadão)` | 16/16 | 4/4 |
| `submitReport (cidadão)` | 26/26 | 15/15 |
| `updatePendingBanner (cidadão)` | 11/11 | 13/13 |
| `lerBodyJson` | 25/25 | 9/9 |
| `criarChamado` | 40/40 | 28/28 |
| `fecharChamado` | 41/41 | 33/33 |
| `coordenadasValidas` | 9/9 | 18/18 |
| `validarNovoChamado` | 15/15 | 12/12 |
| `validarFechamentoCampo` | 17/17 | 14/14 |
| `tratarErros` | 11/11 | 10/10 |
| `middlewareValidacao` | 10/10 | 8/8 |
| `apiFetchTO (técnico)` | 10/10 | 5/5 |
| `flushQueue (técnico)` | 20/21 | 15/16 (ramo de sessão expirada, inalcançável com a API Node: DEF-13) |
| `queueCount (técnico)` | 2/2 | 2/2 |
| `renderPendingBanner (técnico)` | 11/11 | 9/9 |

### Teste de mutação

| Rodada | Mutantes | Mortos | Escore |
|---|---|---|---|
| 1ª | 215 | 180 | 83,7% |
| 2ª (depois de novos testes) | 215 | 206 | **95,8%** |

Os 215 mutantes cobrem as 10 funções do aparelho e as 8 do servidor. Na 1ª rodada, 26 sobreviventes do servidor mostraram lacunas reais. Acrescentei os testes CBN-87 a CBN-93:

- limites de GPS dos dois lados de cada eixo;
- campos com tipo errado;
- foto, telefone, navegador, horário, data e materiais repassados pelo servidor;
- um único campo faltando;
- corpo com exatamente 8 MB, que é o valor limite.

Os 9 sobreviventes finais foram analisados um por um:

| Local | Mutação | Análise |
|---|---|---|
| `index.html:1292` e `:1297` | remove `continue;` | **Equivalente**: é a última instrução do laço |
| `index.html:1280` | `(rec.attempts \|\| 0)` → `\|\| 1` | **Equivalente**: 0 e 1 continuam abaixo de 5 |
| `index.html:1264` | remove `if (!banner) return;` | **Equivalente**: o erro que viria depois é engolido pelo `try` |
| `index.html:1281` | `&&` → `\|\|` no `console.warn` | Muda só a mensagem do console |
| `tecnico/index.html:1880` (2 mutantes) e `:1882` | condição e `break` do ramo de sessão expirada | **Inalcançáveis com a API Node** (DEF-13); o ramo também é idêntico ao de erro (DEF-09) |
| `server/src/app.js:166` | remove o `return;` depois do `reject` (413) | **Equivalente**: a requisição já foi recusada e encerrada |

Com os equivalentes descontados, **todos os mutantes que mudam o comportamento foram mortos**. A evidência da 1ª rodada está em [caixa-branca-mutacao-rodada1.json](evidencias/caixa-branca-mutacao-rodada1.json).

### Testes por grupo

| Testes | O que verificam | Resultado |
|---|---|---|
| CBN-01 a CBN-47 | Caminhos das funções do aparelho, com respostas no formato da API Node | Aprovados, exceto os `todo` abaixo |
| CBN-14, CBN-15 | Descarte silencioso; envio triplicado | ⚠ Confirmam DEF-03 e DEF-04 |
| CBN-26 | Formato do envio do reporte (JSON com `id`) | ⚠ Confirma DEF-01 |
| CBN-41 | Fila do técnico travada no primeiro erro | ⚠ Confirma DEF-07 |
| CBN-42 | Endereço e formato do fechamento | ⚠ Confirma DEF-02 |
| CBN-50, CBN-55 | Fila do cidadão contra a API real; `id` na mensagem | ⚠ Confirmam DEF-01 |
| CBN-51 | A causa da recusa é o formato (`JSON_INVALIDO`) | Aprovado |
| CBN-52 | Fila do técnico contra a API real | ⚠ Confirma DEF-02 |
| CBN-53 | A API responde 404 e a fila do técnico fica presa | Aprovado |
| CBN-54 | Motivo da recusa legível | ⚠ Confirma DEF-12 |
| CBN-60 a CBN-66, CBN-87, CBN-88 | Regras de domínio do chamado (GPS, `id`, protocolo, poste) | Aprovados |
| CBN-67 a CBN-70, CBN-84, CBN-89, CBN-90 | `criarChamado`: validação, idempotência, conflito, QR | Aprovados |
| CBN-71 a CBN-75, CBN-85, CBN-86, CBN-91 | `fecharChamado` e validação do fechamento | Aprovados |
| CBN-76 a CBN-83, CBN-92, CBN-93 | A API recebendo o que o app manda (formulário, sem `id`, rota errada, corpo vazio, 8 MB, erros) | Aprovados |

## Recomendação para o cenário API Node

O servidor está pronto para a sincronização offline. O que falta é o aparelho falar com ele. O projeto já tem uma camada modular que faz isso:

- `public/js/cidadao/domain/Report.js` gera `id` (UUID);
- `SincronizarFila.js` envia JSON pela `ApiClient`, espera mais a cada nova tentativa e marca o reporte recusado como "precisa de atenção", em vez de apagar;
- no técnico, `CloseQueue` e `SincronizarBaixas.js` usam a rota REST.

Essa camada é carregada pela página, mas **os botões ainda chamam o código antigo escrito no HTML** (OBS-05). Ligá-la à tela tende a resolver DEF-01, DEF-02, DEF-03, DEF-12 e DEF-13 de uma vez. Ela não foi testada nesta rodada, porque não é o código que roda hoje.

## Limites

- **SQL dos repositórios:** foi trocado por Fakes, então o SQL real e o comportamento do MySQL (trava de linha, índice único) não foram exercitados. Isso segue o combinado de não criar tabelas enquanto o esquema não estiver definido.
- **Mutação no servidor:** a troca é feita na memória, durante o carregamento do módulo (`--require`); nenhum arquivo em disco é alterado.

## Como repetir

Na raiz do projeto, só os testes (eles também rodam no `npm test`):

```bash
node --test "server/tests/testes-offline/api-node/caixa-branca/*.test.js"
```

Testes, cobertura, complexidade e mutação, regravando as evidências (cerca de 5 min):

```bash
node server/tests/testes-offline/apoio/executar-caixa-branca.mjs api-node
```

```bash
node server/tests/testes-offline/apoio/anotar-defeitos.mjs
```
