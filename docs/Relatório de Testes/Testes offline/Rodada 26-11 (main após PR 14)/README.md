# Testes das funcionalidades offline — rodada de 26/11/2026

- **Responsável:** Davi Santiago de Jesus
- **Data:** 26/11/2026
- **Versão testada:** `main` em `7265579` (merge do PR #14)
- **Rodada anterior, para comparação:** 12/11/2026 ([índice dos testes offline](../README.md))
- **Disciplina:** Garantia da Qualidade de Software — Projeto A3 (Ilumina Coruripe)

## Resumo

Rodei de novo toda a bateria de testes offline, nos dois cenários de servidor (API Node e Apps Script), sobre a `main` depois dos merges de 13/11 a 26/11 (UC01, UC05, integração e PR #14).

| | 12/11 | **26/11** |
|---|---|---|
| Caixa-preta API Node (navegador) | 14 de 31 aprovados | **17 de 31** |
| Caixa-preta Apps Script (navegador) | 24 de 33 aprovados | **24 de 33** |
| Caixa-branca API Node (código) | 78 de 87 aprovados, 9 defeitos confirmados | **81 de 87, 6 defeitos confirmados** |
| Caixa-branca Apps Script (código) | 46 de 51 aprovados | **48 de 51** |
| Escore de mutação API Node / Apps Script | 95,8% / 90,4% | **94,2% / 91,8%** |

O que esses números mostram:

1. **Do lado do técnico, o modo offline com a API Node agora funciona.** Os casos CT-04, CT-06, CT-07, CT-08 e CT-09 passaram a ser aprovados, porque os defeitos DEF-02, DEF-07, DEF-08 e DEF-13 foram corrigidos no UC05.
2. **Achei um defeito novo, o DEF-14.** Sem internet, o app do cidadão não abre por **link com parâmetros**, como os compartilhados no WhatsApp (`?utm_source=whatsapp`). Ele já existia em 12/11, mas a versão antiga da ferramenta de teste escondia a falha. Mostro abaixo como isso foi comprovado e a correção de uma linha. O mesmo defeito afetava a abertura pelo QR Code do poste, mas **em 26/11 a equipe decidiu não usar mais o QR Code**, e esse caso (CP-20) saiu do escopo.
3. **Do lado do cidadão, nada mudou.** Nenhum reporte chega à API Node, porque o DEF-01 continua aberto. Também seguem abertos o DEF-03, DEF-04, DEF-05, DEF-06, DEF-09, DEF-10, DEF-11 e DEF-12.
4. **Encontrei duas lacunas nos próprios testes**, descritas em [Lacunas nos testes](#lacunas-nos-testes).

## O que mudou no código desde 12/11

| Data | Mudança | Efeito esperado no offline |
|---|---|---|
| 13/11 | UC01: validações do reporte no servidor e refatoração de `criarChamado` | Nenhum: o app ainda envia no formato antigo (DEF-01) |
| 13/11 | UC05: fechamento vai para a rota REST da API Node; fila do técnico não trava; sessão expirada (401) reconhecida | Corrige DEF-02, DEF-07, DEF-08 e DEF-13 |
| 14 e 15/11 | CI no GitHub Actions; teste de integração HTTP + MySQL | Nenhum |
| 26/11 | PR #14: o logout limpa o PIN | Nenhum caso offline depende disso |

## Como os testes foram feitos

Usei os mesmos scripts e casos da rodada de 12/11, sem alterar nenhum, numa **cópia isolada da `main`**. Os scripts regravam as evidências dentro de `docs/`, e a cópia evita sobrescrever os arquivos da rodada anterior.

| Nível | O que roda | Como |
|---|---|---|
| **Sistema (caixa-preta)** | 31 casos com a API Node e 33 com o Apps Script, cada um repetido 2 vezes | Chrome sem janela, controlado pelo Playwright: liga e desliga a internet, preenche a tela e confere o que chegou ao servidor e o que ficou na fila do aparelho |
| **Integração** | Tela ↔ API Node real | A função real da tela faz a requisição HTTP para a API Node real; só o MySQL é trocado por repositórios em memória |
| **Unidade (caixa-branca)** | 87 testes (API Node) e 51 (Apps Script) | Funções recortadas do HTML e rodadas com dublês; serviços do servidor com repositórios Fake |
| **Cobertura e mutação** | 18 funções (API Node) e 10 (Apps Script) | Cobertura de linhas e ramos pelo V8; 156 e 85 mutantes |

**Ambiente:** Windows 10, Node.js 24.16.0, Google Chrome 158, `playwright-core` 1.65.1. Nenhum banco real foi usado e todos os dados são fictícios.

## Resultados

### Caixa-preta — o que mudou caso a caso

| Caso | O que verifica | API Node 12/11 → 26/11 | Apps Script 12/11 → 26/11 | Motivo |
|---|---|---|---|---|
| CT-04 | Fechamento com internet chega ao servidor | Reprovado → ✅ **Aprovado** | Aprovado (igual) | DEF-02 corrigido |
| CT-06 | Fechamento pendente é enviado quando a internet volta | Reprovado → ✅ **Aprovado** | Aprovado (igual) | DEF-02 corrigido |
| CT-07 | Com 10 fechamentos na fila, o 11º é bloqueado | Erro → ✅ **Aprovado** | Aprovado (igual) | A instabilidade do ambiente registrada em 12/11 não se repetiu |
| CT-08 | Fechamento recusado não trava os outros | Reprovado → ✅ **Aprovado** | Reprovado → ✅ **Aprovado** | DEF-07 corrigido |
| CT-09 | Resposta perdida no fechamento não fecha duas vezes | Reprovado → ✅ **Aprovado** | Reprovado → ✅ **Aprovado** | DEF-08 corrigido |
| CP-19 | Link com parâmetros abre sem internet | Aprovado → ❌ **Reprovado** | Aprovado → ❌ **Reprovado** | **DEF-14** (falso positivo em 12/11) |
| CP-20 | QR Code do poste lido sem internet | Aprovado → ❌ **Erro** | Aprovado → ❌ **Erro** | DEF-14: a página nem abre. **Fora do escopo:** o QR Code deixou de ser usado (decisão de 26/11) |
| CT-10 | Sessão expirada com fechamento na fila | Reprovado → ⚠ Erro | Reprovado (igual) | Instabilidade do teste; rodando só ele, reprova 6 de 6 vezes (DEF-09) |
| CT-11 | Chamado fechado sem internet não pode ser fechado de novo | Reprovado (igual, instável) | Reprovado (igual) | DEF-10; 1 tempo-limite em 6 execuções |

Os outros casos tiveram o mesmo resultado de 12/11. No cenário API Node, CP-03 e CP-10 a CP-17 continuam reprovados pelo DEF-01: a API responde `400 JSON_INVALIDO` ao reporte do cidadão e ele fica na fila para sempre.

**Contagem corrigida.** Os "erros de execução" da rodada completa foram investigados:
- CP-20 é uma falha real do app (DEF-14), mas o caso saiu do escopo com o fim do QR Code;
- CT-10 reprovou em todas as 6 execuções isoladas (DEF-09).

Sem o CP-20 e sem nenhum erro que dependa só do teste:

| | Casos no escopo | Aprovados | Reprovados |
|---|---|---|---|
| API Node | 30 | **17** | 13 |
| Apps Script | 32 | **24** | 8 |

### Caixa-branca

| | API Node | Apps Script |
|---|---|---|
| Testes | 87: 81 aprovados, 6 confirmam defeitos | 51: 48 aprovados, 3 confirmam defeitos |
| Defeitos confirmados | DEF-01 (CBN-26, CBN-50, CBN-55), DEF-03 (CBN-14), DEF-04 (CBN-15), DEF-12 (CBN-54) | DEF-03 (CBA-14), DEF-04 (CBA-15), DEF-11 (CBA-52) |
| Mutação | 147 de 156 mortos (94,2%) | 78 de 85 mortos (91,8%) |

O DEF-13 saiu da lista. O ramo de sessão expirada do `flushQueue` do técnico, que antes era inalcançável com a API Node, agora é coberto: 16 de 16 ramos.

**Sobreviventes da mutação.** Sete dos 9 sobreviventes da API Node são **equivalentes**: não mudam o comportamento. São eles:
- os 2 `continue;` no fim do laço do `flushQueue`;
- `|| 0` virando `|| 1` na contagem de tentativas;
- o `&&` dentro do `console.warn`;
- o `if (!banner) return;`;
- o `return;` depois do 413 em `lerBodyJson`;
- o `||` → `&&` em `coordenadasValidas`. Com `NaN` ou `Infinity`, o `Math.abs(...) <= 90` da linha seguinte já devolve `false`.

Os 2 restantes estão em `apiFetchTO` e são uma lacuna real, descrita abaixo.

**Complexidade (RNF05, até 10 caminhos).** `criarChamado` caiu de V(G) 11 para 2 e `fecharChamado` de 12 para 6, por causa da refatoração do UC01 e do UC05. O único acima do limite continua sendo o `flushQueue` do cidadão (V(G) = 11).

## DEF-14 (novo): app do cidadão não abre por link com parâmetros sem internet

| | |
|---|---|
| **Severidade** | **Média.** O cidadão que abre sem internet um link compartilhado (por exemplo, no WhatsApp) vê uma página de erro. Abrir pelo endereço sem parâmetros continua funcionando (CP-01). O defeito seria **alto** se o QR Code do poste continuasse no projeto: ele abre o app por `/?poste=...`, o caminho principal do UC02. Mas a equipe decidiu em 26/11 não usar mais o QR Code. |
| **Requisitos** | RNF01 (UC02-A3 saiu do escopo com o QR Code) |
| **Defeito (no código)** | O service worker do cidadão procura no cache o endereço exato, com os parâmetros: `caches.match(req)` em [public/sw.js](../../../../public/sw.js). O cache guarda `/` e `/index.html`, não `/?poste=P-0007`. Sem internet, a busca falha e o `respondWith` recebe `undefined`. |
| **Falha (o que o cidadão vê)** | A página de erro do navegador (`net::ERR_FAILED`) no lugar do app |
| **Sugestão de correção** | Ignorar os parâmetros nas navegações: `caches.match(req, { ignoreSearch: req.mode === 'navigate' })` |

### Por que o teste de 12/11 não pegou isso

Nem o código do app nem o teste mudaram entre as rodadas. O que mudou foi a ferramenta: o Playwright foi de 1.56 para 1.65 e o Chrome de 157 para 158. Para separar as causas, fiz dois experimentos.

**Experimento 1: mesma `main`, só muda a versão do Playwright** ([evidência](evidencias/06-experimento-versao-playwright.txt))

| `playwright-core` | CP-19 | CP-20 |
|---|---|---|
| 1.56.1 (o da rodada de 12/11) | ✅ Aprovado | ✅ Aprovado |
| 1.65.1 (o atual) | ❌ `net::ERR_FAILED` | ❌ `net::ERR_FAILED` |

O código e o Chrome são os mesmos nas duas linhas; só a versão do Playwright muda o resultado. A explicação mais provável: na versão antiga, o modo offline do Playwright não valia para as requisições feitas pelo próprio service worker. Ele "ia à rede" mesmo com o teste offline, e o caso passava: era um **falso positivo**. A versão nova simula o offline como um celular de verdade, e o experimento 2 confirma que a falha está no service worker.

**Experimento 2: Playwright 1.65.1, `main` com a correção de uma linha no service worker** ([evidência](evidencias/07-experimento-correcao-sw.txt))

```diff
-    caches.match(req).then(cached => {
+    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(cached => {
```

| Caso | Resultado |
|---|---|
| CP-01 (abrir offline sem parâmetros; confere que nada quebrou) | ✅ Aprovado |
| CP-19 | ✅ Aprovado |
| CP-20 | ✅ Aprovado |

A correção foi aplicada só numa cópia descartável, para comprovar a causa. **Ela não está neste PR** e precisa de um PR próprio.

**Lição para o projeto:** um caso que passava pode virar falso positivo quando a ferramenta muda. Vale registrar a versão do Playwright em toda evidência (os JSON já registram) e repetir a caixa-preta depois de atualizar a ferramenta.

## Lacunas nos testes

1. **O ramo novo de `apiFetchTO` (DEF-02) tem teste fraco no cenário API Node.** Na linha 968 do `tecnico/index.html`, trocar `&&` por `||` não faz nenhum teste falhar. Os casos só enviam a ação `close` com a API Node. Falta um caso com outra ação (ou sem `payload`) apontando para `/api`.
2. **O executor de caixa-branca não acompanhou a refatoração.** Ele mede cobertura e mutação de `criarChamado`, `fecharChamado`, `validarNovoChamado` e `validarFechamentoCampo`, mas a lógica dessas funções foi para funções auxiliares (as regras `REGRAS_NOVO_CHAMADO` e `REGRAS_FECHAMENTO_CAMPO`, e as etapas do fechamento). Por isso o total de mutantes da API Node caiu de 215 para 156 e os V(G) despencaram. **O código não ficou menos testado**: os testes do UC01 e do UC05 cobrem essas funções. Mas este relatório deixou de medi-las. Para voltar a medir, basta acrescentar as funções auxiliares em `alvosServidor` de `executar-caixa-branca.mjs`.

## Situação dos defeitos offline

| Defeito | Severidade | Situação em 26/11 |
|---|---|---|
| DEF-01 | Crítica | ❌ Aberto: reporte do cidadão não chega à API Node |
| DEF-02 | Crítica | ✅ Corrigido (UC05) |
| DEF-03 | Alta | ❌ Aberto: reporte apagado após 5 tentativas sem avisar |
| DEF-04 | Alta | ❌ Aberto: sincronizações simultâneas enviam o mesmo reporte |
| DEF-05 | Média | ❌ Aberto |
| DEF-06 | Média | ❌ Aberto |
| DEF-07 | Alta | ✅ Corrigido (UC05) |
| DEF-08 | Alta | ✅ Corrigido (UC05) |
| DEF-09 | Média | ❌ Aberto: depois do novo login, a fila do técnico não é enviada |
| DEF-10 | Média | ❌ Aberto |
| DEF-11 | Alta (condicional) | ❌ Aberto (só Apps Script) |
| DEF-12 | Baixa | ❌ Aberto |
| DEF-13 | Média | ✅ Corrigido (UC05) |
| **DEF-14** | **Média** | ❌ **Novo**: links com parâmetros não abrem sem internet (a parte do QR Code saiu do escopo) |

Os detalhes de cada defeito estão no [catálogo](../defeitos.json), onde o DEF-14 foi acrescentado.

## Códigos e scripts usados nos testes

Estes são os trechos principais da estrutura de teste, todos em `server/tests/testes-offline/`.

### 1. Testar a função real do HTML, sem copiar o código

A lógica offline das telas está dentro dos arquivos HTML. O apoio [`extrair-funcao.js`](../../../../server/tests/testes-offline/apoio/extrair-funcao.js) recorta o texto da função pelo nome e o roda num contexto isolado (`node:vm`). Os dublês entram como variáveis globais. Se alguém mudar a função no HTML, o teste passa a exercitar a versão nova.

```js
function carregar(app, nomes, globais = {}, declaracoes = []) {
  const contexto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, ...globais });
  if (declaracoes.length) vm.runInContext(declaracoes.join('\n'), contexto, { filename: `${app}:__declaracoes` });
  // Cada função roda como um script próprio: a medição de cobertura fica por função.
  for (const nome of nomes) {
    const codigo = aplicarMutante(app, nome, extrairFuncao(app, nome).codigo);
    vm.runInContext(codigo, contexto, { filename: `${app}:${nome}` });
  }
  return contexto;
}
```

### 2. Dublês no lugar do navegador

Em [`dubles-cliente.js`](../../../../server/tests/testes-offline/apoio/dubles-cliente.js), a fila do cidadão roda com um **Fake** do banco do aparelho (um `Map` que devolve cópias, como o IndexedDB) e um **Spy** (`registro`) que anota envios, exclusões e avisos:

```js
function montarFilaCidadao({ itens = [], online = true, endpoint = ENDPOINT_APPS_SCRIPT, enviar, ... } = {}) {
  const banco = new Map(itens.map((it, i) => [i + 1, { id: i + 1, attempts: 0, ...it }]));
  const registro = { envios: [], apagados: [], tentativas: [], avisosAtualizados: 0, alertas: [] };
  const globais = {
    navigator: { onLine: online },
    dbGetAll: async () => [...banco.values()].map((r) => ({ ...r })),
    dbDelete: async (id) => { registro.apagados.push(id); banco.delete(id); },
    // ...
  };
```

### 3. Defeito registrado como teste que exige o comportamento certo (TDD)

Os defeitos viram testes `todo`. Eles descrevem o comportamento correto, falham hoje e passam a contar como aprovados quando o defeito for corrigido. Este é o que confirma o DEF-04 (`casos-cliente.js`):

```js
test(`${id(15)} flushQueue (cidadão): três sincronizações ao mesmo tempo enviam o reporte uma única vez`,
  { todo: 'Defeito DEF-04 — falta trava contra execução simultânea' }, async () => {
  const { ctx, registro } = filaC({ itens: [item('IC-1')] });
  await Promise.all([ctx.flushQueue(), ctx.flushQueue(), ctx.flushQueue()]);
  assert.equal(registro.envios.length, 1, `o mesmo protocolo foi enviado ${registro.envios.length} vezes`);
});
```

### 4. Idempotência no servidor: reenviar não duplica

O aparelho reenvia quando não sabe se o servidor recebeu. Por isso a API precisa aceitar o mesmo envio duas vezes sem duplicar. Os serviços recebem os repositórios por injeção de dependência (`f.deps`), o que permite usar Fakes ([`servidor.test.js`](../../../../server/tests/testes-offline/api-node/caixa-branca/servidor.test.js)):

```js
test('CBN-71 fecharChamado: reenvio com o mesmo operacao_id não fecha de novo nem baixa o estoque duas vezes (CA04)', async () => {
  const f = fakes([aberto()]);
  const dados = fechamento({ materiais_os: [{ nome: 'Lâmpada', quantidade: 1 }] });
  const a = await FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados }, f.deps);
  const b = await FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados }, f.deps);
  assert.equal(b, a);
  assert.equal(f.fechamentos.length, 1);
  assert.equal(f.baixas.length, 1);
});
```

### 5. API Node real com o MySQL trocado, e resposta "perdida" no meio

O [`servidor-teste.js`](../../../../server/tests/testes-offline/apoio/servidor-teste.js) sobe a API Node **real** e troca só a conexão do banco, pelo ponto oficial do projeto (`pool.setPool`). Qualquer SQL que escape do Fake faz o teste falhar avisando:

```js
const conexao = {
  async query(sql) {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
    return falhaSql(); // "SQL inesperado no teste: um repositório não foi substituído pelo Fake."
  },
  release() {}
};
pool.setPool({ query: conexao.query, connect: async () => conexao, end: async () => {} });
```

Para o caso mais traiçoeiro do offline (o servidor gravou, mas a resposta não chegou ao aparelho), a resposta é cortada depois dos primeiros bytes. Assim é o app que decide reenviar, e não o navegador:

```js
function cortarResposta(res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': '200' });
  res.write('{"');
  setImmediate(() => res.socket && res.socket.destroy());
}
```

### 6. Caixa-preta: ligar e desligar a internet no navegador

Os casos de [`caixa-preta.mjs`](../../../../server/tests/testes-offline/apoio/caixa-preta.mjs) seguem o formato **Dado / Quando / Então** e usam só a tela. Este verifica a transição offline → online (UC03):

```js
caso({
  id: 'CP-10', titulo: 'Reporte pendente é enviado sozinho quando a internet volta',
  dado: 'há 1 reporte na fila do aparelho', quando: 'a internet volta',
  entao: 'o servidor passa a ter 1 registro do protocolo, a fila esvazia e o aviso de pendente some',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    const { protocolo } = await salvarOffline(ctx, page);   // usa ctx.setOffline(true)
    await ctx.setOffline(false);
    await aguardar(async () => (await filaCidadao(page)).length === 0, { timeout: 20000 });
    // ... confere registros no servidor, fila e aviso na tela
  }
});
```

Com a API Node, este caso reprova hoje: o servidor recebe o envio, mas responde `JSON_INVALIDO` (DEF-01).

### 7. Teste de mutação

O executor altera o código antes de rodar os testes. Por exemplo, troca `>=` por `>` ou `&&` por `||`, e confere se algum teste falha. A troca é feita no texto recortado do HTML, sem tocar no arquivo:

```js
function aplicarMutante(app, nome, codigo) {
  if (!process.env.MUTANTE) return codigo;
  const m = JSON.parse(process.env.MUTANTE);
  if (m.alvo !== 'cliente' || m.app !== app || m.funcao !== nome) return codigo;
  // ... confere que o trecho `m.de` está mesmo na posição informada
  return codigo.slice(0, m.indice) + m.para + codigo.slice(m.indice + m.de.length);
}
```

## Como repetir

Na raiz do projeto:

```bash
npm install --prefix server
npm install --no-save playwright-core

# caixa-branca (rápido; já entra no npm test)
node --test "server/tests/testes-offline/**/*.test.js"

# caixa-branca completa: testes + cobertura + complexidade + mutação
node server/tests/testes-offline/apoio/executar-caixa-branca.mjs api-node
node server/tests/testes-offline/apoio/executar-caixa-branca.mjs apps-script

# caixa-preta no Chrome (cerca de 10 minutos cada)
node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
node server/tests/testes-offline/apps-script/caixa-preta.navegador.mjs

# experimentos desta rodada
FILTRO='^CP-(19|20)$' REPETICOES=1 node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
FILTRO='^CT-1[01]$'   REPETICOES=3 node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
```

**Atenção:** esses scripts regravam as evidências em `Testes offline/API Node/evidencias/` e `Apps Script/evidencias/`. Para não perder a rodada de 12/11, rode numa cópia do projeto (por exemplo, `git worktree add ../copia main`). Uma variável `PLAYWRIGHT_CORE=<caminho>` permite escolher a versão do Playwright, como no experimento 1.

## Limites

- Os testes rodaram em Windows com Chrome. Não foram feitos em celular físico nem em outros navegadores (Safari no iPhone, por exemplo).
- O MySQL foi trocado por repositórios em memória e o Apps Script por um dublê. O script real do Apps Script não está no repositório.
- A correção do DEF-14 foi comprovada só numa cópia descartável; ela precisa de um PR próprio e de uma nova rodada de CP-01 e CP-19.
- O CP-20 (QR Code) continua no script de caixa-preta e foi executado, mas não conta no resultado: o QR Code saiu do escopo em 26/11. O código do QR ainda existe no app (`?poste=`, `link_poste`, `jsQR.js` no painel do técnico, redirecionamento `/p/:id` no `vercel.json`); removê-lo é uma tarefa separada.

## Evidências

| Arquivo | Conteúdo |
|---|---|
| [01-suite-offline.txt](evidencias/01-suite-offline.txt) | Saída de `node --test` dos testes offline (138 testes, 129 aprovados, 9 confirmam defeitos) |
| [api-node-caixa-branca.json](evidencias/api-node-caixa-branca.json) · [saída](evidencias/api-node-caixa-branca-saida.txt) | Caixa-branca API Node: testes, cobertura, complexidade e mutação |
| [apps-script-caixa-branca.json](evidencias/apps-script-caixa-branca.json) · [saída](evidencias/apps-script-caixa-branca-saida.txt) | Caixa-branca Apps Script |
| [api-node-caixa-preta.json](evidencias/api-node-caixa-preta.json) · [saída](evidencias/04-caixa-preta-api-node.txt) | Caixa-preta API Node (2 rodadas) |
| [apps-script-caixa-preta.json](evidencias/apps-script-caixa-preta.json) · [saída](evidencias/05-caixa-preta-apps-script.txt) | Caixa-preta Apps Script (2 rodadas) |
| [06-experimento-versao-playwright.txt](evidencias/06-experimento-versao-playwright.txt) | Experimento 1: CP-19 e CP-20 com Playwright 1.56.1 e 1.65.1 |
| [07-experimento-correcao-sw.txt](evidencias/07-experimento-correcao-sw.txt) | Experimento 2: CP-01, CP-19 e CP-20 com a correção do service worker |
| [08-experimento-ct10-ct11.txt](evidencias/08-experimento-ct10-ct11.txt) | CT-10 e CT-11 isolados, 3 repetições em cada versão do Playwright |
