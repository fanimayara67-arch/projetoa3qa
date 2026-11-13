# RELATÓRIO DE EXECUÇÃO DE TESTES E COBERTURA DE CÓDIGO (QA)

**Projeto:** Sistema de Gestão de Chamados e Rotas de Iluminação Pública  
**Estudante / QA Responsável:** Cláudio Rocha Souza  
**RA:** 12725132433  
**Curso:** Análise e Desenvolvimento de Sistemas — UNIFACS  
**Branch de Contribuição:** `test/cobertura-api-client-fechamento`  
**Data:** 10 de novembro de 2026 (revisado em 13 de novembro de 2026)

---

## 1. Escopo da Contribuição

O objetivo desta etapa de Quality Assurance (QA) foi implementar testes automatizados de **Caixa-Branca** (_White-Box Testing_) focados no módulo de **Fechamento Administrativo e Comunicação de API**, garantindo a validação de fluxos alternativos, tratamento de erros e exceções sem duplicar testes já existentes na suíte do projeto.

---

## 2. Metodologia e Ferramental

- **Framework de Testes:** Runner nativo do Node.js (`node:test` e `node:assert/strict`).
- **Métrica de Cobertura:** Análise de instrumentação via flag `--experimental-test-coverage`.
- **Isolamento de Código:** Criação e versionamento da branch dedicada `test/cobertura-api-client-fechamento` a partir da base `feat/relatorios-pdf-e-correcoes-mysql`.

---

## 3. Cobertura de Testes Automatizados (Resultados Obtidos)

A suíte `server/tests/fechamento-cobertura.test.js` tem 12 casos (FA-CB01 a FA-CB12). Cada caso foi escolhido a partir das linhas e ramos que o relatório de cobertura apontava como não executados, e todos chamam o código real do projeto. Só o banco (repositórios injetados pelo parâmetro `deps` ou substituídos com `t.mock.method`) e a rede (`fetchImpl`) são simulados.

| ID | Arquivo | O que verifica | Linhas/ramos alvo |
| :-- | :-- | :-- | :-- |
| FA-CB01 | `FechamentoController.js` | `fechar` repassa protocolo, técnico e corpo ao serviço e responde 201 no formato padrão | 9-20 |
| FA-CB02 | `FechamentoController.js` | `fechar` entrega ao `next` o erro do serviço e não escreve resposta | ramo `catch` |
| FA-CB03 | `FechamentoController.js` | `fecharAdmin` repassa o gestor como `gestorId`; erro vai ao `next` | 22-33 |
| FA-CB04 | `FechamentoService.js` | dados nulos ou incompletos geram `DadoInvalido` (400) antes de abrir a transação | 34-35 |
| FA-CB05 | `FechamentoService.js` | reenvio da mesma `operacao_id` devolve o fechamento existente, sem inserir nem baixar estoque | 43-44 |
| FA-CB06 | `FechamentoService.js` | chamado inexistente gera 404; chamado já fechado gera 409 | 48-51 |
| FA-CB07 | `ApiClient.js` | com token envia `Authorization: Bearer`; corpo em JSON; método respeitado | 22-23 |
| FA-CB08 | `ApiClient.js` | sem token não envia `Authorization`; sem corpo não envia `body` | ramos de token e corpo |
| FA-CB09 | `ApiClient.js` | resposta que não é JSON vira `RESPOSTA_INVALIDA` com `ok=false` | 38-39 |
| FA-CB10 | `ApiClient.js` | HTTP 200 com `ok=false`/`success=false` não é sucesso; corpo vazio vira `{}` | ramos do `ok` |
| FA-CB11 | `ApiClient.js` | usa `window.ILUMINA.API_URL` como base sem barra dupla; endereço absoluto fica como está | ramos da URL |
| FA-CB12 | `ApiClient.js` | sem resposta dentro do timeout, a requisição é abortada | `AbortController` |

### Tabela de Métricas (Antes vs. Depois, medidas com `--experimental-test-coverage`)

| Arquivo | Linhas antes | Linhas depois | Ramos antes | Ramos depois |
| :-- | --: | --: | --: | --: |
| `FechamentoController.js` | 68,42% | 100,00% | 100,00% | 100,00% |
| `FechamentoService.js` | 97,24% | 100,00% | 72,73% | 80,43% |
| `ApiClient.js` | 92,16% | 100,00% | 18,18% | 100,00% |
| `Fechamento.js` (domínio) | 97,50% | 100,00% | 96,00% | 100,00% |
| Projeto (todos os arquivos) | 80,54% | 81,67% | 78,42% | 81,07% |

"Antes" é a `main` com o login por PIN (#7), os relatórios (#5) e a primeira versão deste arquivo; "depois" é a mesma base com esta versão.

---

## 4. Defeito encontrado

| ID | Defeito | Severidade | Situação |
| :-- | :-- | :-- | :-- |
| D-FA-01 | `FechamentoService.fecharChamado` com `dados = null` lançava `TypeError` (erro interno 500) em vez de `DadoInvalido` (400). O valor padrão do parâmetro em `Fechamento.validarFechamentoCampo` só vale para `undefined`. O fechamento administrativo já tratava `null`. | Baixa (pela API, o middleware `validar` já barra o corpo nulo) | Corrigido em `server/src/domain/Fechamento.js` |

Encontrado pelo FA-CB04, que falhou antes da correção e passa depois dela.

---

## 5. Resultado da Execução do Test Runner

    npm test
    ℹ tests 100
    ℹ pass 92
    ℹ fail 8

As 8 falhas são os testes CT-14, CT-18 a CT-21, CT-23, CT-24 e CT-28 do login por PIN (`suite-cts.test.js`), que precisam de MySQL configurado no `.env`. Com o banco configurado, eles passam. Os 12 testes deste relatório passam sem banco:

    node --test server/tests/fechamento-cobertura.test.js
    ℹ tests 12
    ℹ pass 12
    ℹ fail 0

---

## 6. Registro de Evidências no GitHub

- Primeira versão: `test(UC03): adiciona testes de caixa-branca para o Fechamento Administrativo` (PR #6). Os dois testes dessa versão criavam funções falsas dentro do próprio arquivo e não importavam o código do projeto, por isso a cobertura não mudava.
- Revisão: `test(UC03): liga os testes de cobertura do fechamento ao código real` e `fix(UC03): fechamento em campo com dados nulos responde 400, não erro interno`.
- Arquivos: `server/tests/fechamento-cobertura.test.js`, `server/src/domain/Fechamento.js` e `server/docs/relatorio-qa-claudio.md`.
