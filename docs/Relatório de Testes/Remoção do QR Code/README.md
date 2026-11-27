# Relatório de Testes — Remoção do QR Code e correção do DEF-14

- **Responsável:** Davi Santiago de Jesus
- **Data:** 26/11/2026
- **Branch:** `refactor/remove-qr-code` (commit `5303d89`, sobre a `main` em `6dbb74a`)
- **Motivo:** em 26/11/2026 a equipe decidiu não usar mais o QR Code do poste.

## O que foi alterado

| Onde | Antes | Depois |
|---|---|---|
| App do cidadão | `/?poste=P-0007` verificava o poste, abria a tela "poste identificado", escondia o GPS e avisava o Apps Script (`check_poste`, `link_poste`) | O endereço abre o formulário normal; nada disso é chamado |
| Painel do técnico | Botão "📷 Ler QR" (câmera + `jsQR.js`) e o ID digitado dentro do modal | Botão "🔎 Buscar poste": o técnico digita o ID e abre o histórico do poste |
| Painel do técnico | "Folha de QR codes" para imprimir e coluna de QR no relatório de postes, com as imagens pedidas a `api.qrserver.com` | Removidas; nenhum dado de poste vai para o serviço externo |
| Configuração | Atalho `/p/:id` (Vercel e Netlify) e `qrPoste` no `config.js` | Removidos |
| Service worker do cidadão | `caches.match(req)` procurava o endereço exato, com os parâmetros | `caches.match(req, { ignoreSearch: req.mode === 'navigate' })` (**correção do DEF-14**) |

O **servidor não foi alterado**. As regras de `poste_id` do UC01 e a rota pública `GET /api/postes/:id/situacao` continuam lá, para a equipe decidir.

## Casos de teste

### Busca de poste por ID (unidade, `server/tests/busca-poste.test.js`)

A busca substitui o leitor de QR. Os testes rodam as funções **reais** do `tecnico/index.html` com o `prompt`, o aviso e o histórico trocados por dublês.

| Caso | Técnica | O que verifica | Resultado |
|---|---|---|---|
| BP-01 | Partição válida | `P-0001`, `P0001`, `p0001` e `  p-0001  ` viram `P-0001` | ✅ Aprovado |
| BP-02 | Partição inválida | Vazio, `P-`, `PX-0001`, `0001`, `P-00A1`, uma URL, `null` e `undefined` são recusados | ✅ Aprovado |
| BP-03 | Fluxo principal | Digitar `p0007` abre o histórico de `P-0007` | ✅ Aprovado |
| BP-04 | Fluxo alternativo | ID inválido mostra aviso de erro e não abre nada | ✅ Aprovado |
| BP-05 | Fluxo alternativo | Cancelar a busca não abre nada nem mostra erro | ✅ Aprovado |

### Verificação no navegador (sistema, Chrome + API Node real)

O script [verificar-sem-qr.navegador.mjs](scripts/verificar-sem-qr.navegador.mjs) usa o servidor de teste dos testes offline: a API Node real, com o banco trocado por repositórios em memória.

| Caso | O que verifica | Resultado |
|---|---|---|
| Q-01 | O endereço antigo do QR (`/?poste=P-0007`) abre o formulário normal | ✅ |
| Q-02 | A tela "poste identificado" não existe mais | ✅ |
| Q-03 | A seção de GPS continua visível | ✅ |
| Q-04 | **DEF-14:** sem internet, link com parâmetros (`?utm_source=whatsapp`) abre o app | ✅ |
| Q-05 | **DEF-14:** sem internet, o endereço antigo do QR também abre o formulário | ✅ |
| Q-06 | O cidadão não chama `check_poste` nem `link_poste` | ✅ |
| Q-07 | O cidadão não tem erros de JavaScript | ✅ |
| Q-08 | O botão "Ler QR" não existe mais | ✅ |
| Q-09 | O botão "Buscar poste" aparece | ✅ |
| Q-10 | O modal do leitor de QR não existe | ✅ |
| Q-11 | O card "Folha de QR codes" não existe | ✅ |
| Q-12 | "Buscar poste" com `p0007` abre a tela de histórico do poste | ✅ |
| Q-13 | Nenhuma tela pede `jsQR.js`, `qr.css` ou o gerador externo de QR | ✅ |
| Q-14 | O técnico não tem erros de JavaScript | ✅ |

### Regressão

| Teste | `main` (26/11) | Esta branch |
|---|---|---|
| Suíte completa (mesma sequência do CI, com MySQL 8.0) | 311 testes, 0 falhas | **316 testes** (+5 da busca), **0 falhas**, 10 pendentes (os mesmos) |
| Caixa-preta offline, API Node | 17 de 30 aprovados | **18 de 30**: o CP-19 passou |
| Caixa-preta offline, Apps Script | 24 de 32 aprovados | **25 de 32**: o CP-19 passou |

Todos os outros casos da caixa-preta tiveram o mesmo resultado da [rodada de 26/11 na `main`](<../Testes offline/README.md>), com uma exceção: o CT-10 com a API Node deu erro de execução. É a mesma instabilidade do teste registrada naquela rodada, em que o caso, rodado isolado, reprova sempre pelo DEF-09. O CP-20 (QR Code lido sem internet) saiu do script de caixa-preta, porque a funcionalidade saiu do projeto.

Os testes de regressão rodaram sobre a cópia de trabalho da branch, já com todas as alterações deste PR, antes do commit. O cabeçalho da evidência 01 mostra o último commit da `main`, sobre o qual a branch foi criada.

## Pendência encontrada (já existia na `main`)

Com a API Node, o **histórico do poste** e o **relatório de postes** mostram "Erro ao carregar" ([captura](evidencias/05-busca-poste-historico.png)). As telas pedem as ações do Apps Script (`get_poste_history`, `list_postes`), mas a API Node oferece `GET /api/postes/:id/historico` e `GET /api/postes`. O problema já existia antes, quando o histórico era aberto pelo modal do QR. Ele não é causado por este PR, mas fica mais visível agora que o histórico tem um botão próprio. É o mesmo tipo de defeito do DEF-01, uma tela não ligada à API Node, e precisa de um PR próprio.

## Como repetir

Na raiz do projeto:

```bash
npm install --prefix server
node --test server/tests/busca-poste.test.js          # BP-01 a BP-05
npm test                                             # suíte completa (precisa do MySQL, ver .env.example)

npm install --no-save playwright-core                # precisa do Google Chrome
node "docs/Relatório de Testes/Remoção do QR Code/scripts/verificar-sem-qr.navegador.mjs" . ./saida
REPETICOES=1 node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
REPETICOES=1 node server/tests/testes-offline/apps-script/caixa-preta.navegador.mjs
```

Os dois últimos comandos regravam as evidências dos testes offline em `docs/`; rode numa cópia do projeto.

**Ambiente:** Windows 10, Node.js 24.16.0, MySQL 8.0 (Docker), Google Chrome 158, `playwright-core` 1.65.1.

## Evidências

| Arquivo | Conteúdo |
|---|---|
| [01-suite-completa.txt](evidencias/01-suite-completa.txt) | Suíte completa: 316 testes, 306 aprovados, 0 falhas |
| [02-caixa-preta-api-node.txt](evidencias/02-caixa-preta-api-node.txt) | Caixa-preta offline com a API Node (1 rodada) |
| [03-caixa-preta-apps-script.txt](evidencias/03-caixa-preta-apps-script.txt) | Caixa-preta offline com o Apps Script (1 rodada) |
| [04-verificacao-sem-qr.txt](evidencias/04-verificacao-sem-qr.txt) · [JSON](evidencias/04-verificacao-sem-qr.json) | Q-01 a Q-14 |
| [05-busca-poste-historico.png](evidencias/05-busca-poste-historico.png) | Tela do histórico aberta pela busca (com o erro da pendência acima) |
| [06-busca-poste.txt](evidencias/06-busca-poste.txt) | BP-01 a BP-05 |
