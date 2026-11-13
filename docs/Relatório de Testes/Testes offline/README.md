# Testes das funcionalidades offline

- **Aluno:** Davi Santiago de Jesus
- **Data:** 12/11/2026
- **Disciplina:** Garantia da Qualidade de Software — Projeto A3 (Ilumina Coruripe)

## Por que há dois cenários

O grupo ainda não decidiu se o servidor do projeto será o **Google Apps Script** (o que está em uso hoje) ou a **API Node** (`server/`, em construção). As telas são as mesmas nos dois casos, mas o que o servidor espera e responde muda. Por isso os testes foram feitos duas vezes, **como se o projeto fosse rodar com cada servidor**, cada um com caixa-preta e caixa-branca:

| | Caixa-preta | Caixa-branca |
|---|---|---|
| **API Node** | [Relatório](API%20Node/caixa-preta.md) · [JSON](API%20Node/evidencias/caixa-preta.json) | [Relatório](API%20Node/caixa-branca.md) · [JSON](API%20Node/evidencias/caixa-branca.json) |
| **Apps Script** | [Relatório](Apps%20Script/caixa-preta.md) · [JSON](Apps%20Script/evidencias/caixa-preta.json) | [Relatório](Apps%20Script/caixa-branca.md) · [JSON](Apps%20Script/evidencias/caixa-branca.json) |

Os defeitos dos quatro relatórios estão num [catálogo único](#defeitos), também em [defeitos.json](defeitos.json).

## Resumo dos resultados

| | API Node | Apps Script |
|---|---|---|
| **Caixa-preta** (casos no navegador) | 31 casos: **14 aprovados, 16 reprovados, 1 erro de execução** | 33 casos: **24 aprovados, 9 reprovados** |
| Casos instáveis entre 2 rodadas | 1 (CT-07, instabilidade do ambiente de teste) | 0 |
| **Caixa-branca** (testes de código) | 87 testes: **78 aprovados, 9 confirmam defeitos** | 51 testes: **46 aprovados, 5 confirmam defeitos** |
| Cobertura de ramos das funções testadas | 100%, menos 1 ramo inalcançável (DEF-13) | 100% |
| Escore de mutação | 95,8% (206 de 215) | 90,4% (75 de 83) |
| Defeitos que se manifestam | 11 (2 críticos) | 9 |

O que os números dizem:

- **Com o Apps Script, o uso offline básico funciona de ponta a ponta.** As falhas ficam nas situações de erro: recusa, resposta perdida, sessão expirada, fechamento repetido. A duplicidade de reportes depende de o script descartar protocolo repetido, e isso não dá para verificar porque o script não está no repositório (DEF-11).
- **Com a API Node, o servidor está pronto e as telas não.**
  - A API faz o que promete: os testes do servidor passaram, e reenviar o mesmo reporte ou fechamento não duplica nada.
  - Mas as telas ainda enviam no formato do Apps Script, então **nenhum reporte e nenhum fechamento feito no aparelho chega à API** (DEF-01 e DEF-02).
  - O projeto já tem uma camada modular (`public/js/cidadao` e `public/tecnico/js`) que segue o contrato da API, mas ela não está ligada à tela (OBS-05).
- **Sete defeitos aparecem nos dois cenários**, porque estão no código do aparelho e não no servidor: DEF-03, DEF-04, DEF-05, DEF-06, DEF-07, DEF-09 e DEF-10. Qualquer que seja o servidor escolhido, eles precisam ser corrigidos.

Estes testes não decidem qual servidor usar. Eles mostram o que falta em cada caminho.

## Como os testes foram planejados

O planejamento seguiu o material da disciplina (aulas de Fundamentos da Qualidade, Planejamento da Qualidade, Inspeção e revisão, Teste de unidade e integração e TDD).

| Conceito da aula | Como foi aplicado |
|---|---|
| **Níveis de teste** | Caixa-preta no **nível de sistema** (navegador real, ponta a ponta). Caixa-branca no **nível de unidade** (cada função) e de **integração** (código das telas ↔ servidor de teste). |
| **Do caso de uso ao caso de teste** | Fluxo principal → caso positivo; cada fluxo alternativo → 1 caso; cada exceção → caso negativo; cada pré-condição → teste de violação; regras de negócio e critérios CA02/CA03 → 1 caso cada. |
| **Critérios Dado/Quando/Então** | Cada caso de caixa-preta está escrito assim no JSON (`dado`, `quando`, `entao`). |
| **Rastreabilidade** | Requisito → caso de uso → caso de teste → execução → defeito ([matriz](#rastreabilidade)). |
| **Erro, defeito e falha** | No catálogo, cada defeito separa o que ficou no código (defeito) do que se viu no teste (falha). |
| **Técnicas** | Partição de equivalência, análise de valor limite (60 s, 4/5 tentativas, 10/11 fechamentos, ±90/±180), transição de estado (online ↔ offline), baseado em risco (perda, duplicidade, concorrência), caminhos básicos de McCabe. |
| **AAA e FIRST** | Testes de código em Preparação → Ação → Verificação; rápidos, independentes, repetíveis (data e sorteio controlados) e autoverificáveis. |
| **Dublês** | Fake (banco em memória), Stub (rede com resposta pronta), Spy (registro de chamadas), Mock (confere o tempo-limite), Dummy (console), dublê de serviço (Apps Script). |
| **Cobertura** | Linhas e ramos, medidos pelo V8. Usada para achar o que ninguém testou, não como meta. |
| **Teste de mutação** | Cada sobrevivente foi analisado: equivalente, lacuna no teste ou achado no código. |
| **Testes instáveis** | Esperas por condição em vez de tempo fixo e 2 rodadas completas da caixa-preta para detectar instabilidade. |
| **V(G) = decisões + 1** | Calculado para cada função e comparado com o RNF05 (no máximo 10 caminhos). |
| **TDD: ver o teste falhar** | Os defeitos viraram testes `todo` que exigem o comportamento correto e falham hoje. |

**Cuidados para não "burlar" o resultado:**

- a caixa-preta usa só a tela, sem chamar funções internas da página;
- cada caso tem servidor e navegador novos;
- a resposta perdida é cortada no meio, para que o reenvio seja do app e não do navegador;
- quando o próprio teste errava (seletor errado, campo escondido no fluxo do QR), o teste foi corrigido e rodado de novo;
- resultados reprovados nunca foram ajustados;
- toda evidência saiu da versão final dos scripts.

## Defeitos

Severidade: **Crítica** — a funcionalidade não entrega o que promete; **Alta** — perda ou duplicação de dados em situação comum; **Média** — o usuário fica sem informação; **Baixa** — mensagem ruim, sem perda.

| Defeito | Severidade | API Node | Apps Script | Resumo |
|---|---|---|---|---|
| DEF-01 | Crítica | ✘ | — | O app do cidadão envia formulário sem `id`; a API só aceita JSON com `id` (400). Nenhum reporte chega. |
| DEF-02 | Crítica | ✘ | — | O técnico envia `{ action: "close" }` para `/api`, rota que não existe (404). Nenhum fechamento chega. **Corrigido em 13/11 (UC05).** |
| DEF-03 | Alta | ✘ | ✘ | Depois de 5 tentativas o reporte é apagado do aparelho sem aviso. Erros temporários do servidor também contam. |
| DEF-04 | Alta | ✘ | ✘ | A fila do cidadão não tem trava: gatilhos simultâneos enviam o mesmo reporte 3 vezes. |
| DEF-05 | Média | ✘ | ✘ | Reporte recusado continua com o aviso "será enviado quando houver sinal". |
| DEF-06 | Média | ✘ | ✘ | O formulário preenchido se perde se o app for fechado antes do envio (CA02). |
| DEF-07 | Alta | ✘ | ✘ | A fila do técnico para no primeiro fechamento recusado. **Corrigido em 13/11 (UC05).** |
| DEF-08 | Alta | — | ✘ | Fechamento reenviado que recebe `ja_fechado` fica preso na fila para sempre. **Corrigido em 13/11 (UC05).** |
| DEF-09 | Média | ✘ | ✘ | Sessão expirada não pede o PIN e o novo login não envia a fila. |
| DEF-10 | Média | ✘ | ✘ | Chamado fechado sem internet pode ser fechado de novo (2 na fila). |
| DEF-11 | Alta (condicional) | — | ✘ | Sem identificador único, o reenvio vira linha repetida se o script não descartar protocolo repetido. |
| DEF-12 | Baixa | ✘ | — | O erro da API aparece como "[object Object]". |
| DEF-13 | Média | ✘ | — | Com a API Node, o técnico não reconhece a sessão expirada (401). |

O lugar exato no código, a falha observada e uma sugestão de correção de cada defeito estão em [defeitos.json](defeitos.json).

**Observações** (não quebram requisito, mas merecem atenção):

| Id | Observação |
|---|---|
| OBS-01 | "Salvo sem sinal" aparece quando a causa foi o servidor, não a internet (CP-05, CP-06). |
| OBS-02 | Funções acima do limite de 10 caminhos do RNF05: `flushQueue` do cidadão (V(G) = 11), `criarChamado` (11) e `fecharChamado` (12). |
| OBS-03 | Se o banco do aparelho falhar, um erro escapa da sincronização do técnico ("Uncaught (in promise)"). |
| OBS-04 | Se o banco do aparelho falhar, a contagem da fila dá 0 e o limite de 10 fechamentos deixa de valer. |
| OBS-05 | A camada modular (`public/js/cidadao`, `public/tecnico/js`) é carregada, mas a tela usa o código antigo do HTML. Ela já segue o contrato da API Node e não foi testada nesta rodada. |

## Rastreabilidade

| Requisito | Casos de caixa-preta | Testes de caixa-branca |
|---|---|---|
| UC01 pré-condição; RNF01 | CP-01, CP-02, CP-19 | — |
| UC01 fluxo principal; RF01 | CP-03 | CB*-19, CB*-26, CB*-32, CBN-76 a CBN-78 |
| UC01-A1 (sem conexão) | CP-04 | CB*-23 |
| UC01-A2 (erro ou 60 s) | CP-05, CP-06 | CB*-20, CB*-21, CB*-27, CB*-30 |
| UC01-E1 (falha ao gravar) | CP-07 | CB*-22, CB*-24 |
| CA02 (estado do formulário) | CP-08, CP-09 | — (não há código de rascunho) |
| UC02-A3 (QR sem conexão) | CP-20 | CBN-66, CBN-70, CBN-84 |
| UC03 fluxo principal; RF02 | CP-10, CP-11 | CB*-05, CB*-13, CBA-51, CBN-50 |
| UC03-A1 (falha de rede) | CP-12 | CB*-08, CB*-09, CB*-12 |
| UC03-A2 (recusa) | CP-13 | CB*-06, CB*-07 |
| UC03-A3 (app fechado) | CP-15 | — |
| UC03 regra: sem descarte silencioso | CP-14 | CB*-10, CB*-14 |
| UC03 regra e CA03: sem duplicidade | CP-16, CP-17 | CB*-15, CBA-52, CBN-68, CBN-69, CBN-78 |
| RNF01; RNF04 (indicador) | CP-18 | CB*-16, CB*-17 |
| UC04 fluxo principal; RF03 | CT-02 | CBN-79 |
| UC04-A1 (sessão salva) | CT-03 | — |
| UC04-A3 (sessão expirada) | CT-10 | CB*-37 |
| UC04-A4 (login sem conexão) | CT-01 | — |
| UC05 fluxo principal; RF04 | CT-04 | CB*-42, CBN-79 |
| UC05-A5 (fila do técnico) | CT-05, CT-06, CT-08, CT-09 | CB*-33 a CB*-41, CBA-50, CBA-53, CBN-52, CBN-53 |
| UC05-A6 (limite de 10) | CT-07 | CB*-45 |
| UC05 pós-condição e CA04 (baixa única) | CT-09, CT-11 | CBN-71 a CBN-75, CBN-85, CBN-86, CBN-91 |
| RNF05 (até 10 caminhos por função) | — | V(G) no JSON de caixa-branca |

`CB*` vale para os dois cenários: `CBN` (API Node) e `CBA` (Apps Script).

## Organização dos arquivos

```text
docs/Relatório de Testes/Testes offline/
├── README.md                    ← este índice
├── defeitos.json                ← catálogo único de defeitos e observações
├── API Node/
│   ├── caixa-preta.md · caixa-branca.md
│   └── evidencias/              ← caixa-preta.json, caixa-branca.json e as saídas em texto
├── Apps Script/
│   ├── caixa-preta.md · caixa-branca.md
│   └── evidencias/              ← idem + 1ª rodada de mutação
└── Rodada anterior/             ← primeira rodada, substituída (mantida para consulta)

server/tests/testes-offline/
├── api-node/
│   ├── caixa-preta.navegador.mjs
│   └── caixa-branca/            ← cliente.test.js, servidor.test.js
├── apps-script/
│   ├── caixa-preta.navegador.mjs
│   └── caixa-branca/            ← cliente.test.js
└── apoio/                       ← servidor de teste, casos, dublês, executor, mutação
```

## Como executar

Na raiz do projeto. Os testes de caixa-branca já entram no `npm test`:

```bash
npm --prefix server test
```

Caixa-preta, que precisa do Google Chrome instalado:

```bash
npm install --no-save playwright-core
```

```bash
node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
```

```bash
node server/tests/testes-offline/apps-script/caixa-preta.navegador.mjs
```

Caixa-branca completa (testes, cobertura, complexidade e mutação):

```bash
node server/tests/testes-offline/apoio/executar-caixa-branca.mjs api-node
```

```bash
node server/tests/testes-offline/apoio/executar-caixa-branca.mjs apps-script
```

Ao final, ligar os defeitos às evidências:

```bash
node server/tests/testes-offline/apoio/anotar-defeitos.mjs
```

Os testes não alteram nenhum arquivo do app, não acessam banco real e usam só dados fictícios.

## Rodada anterior

A primeira rodada (antes desta separação por servidor) está em [Rodada anterior](Rodada%20anterior/README.md), junto com o motivo de ter sido refeita.
