# Relatório de Testes — UC01 Reportar defeito em poste

- **Responsável:** João Marcos Lima Chervinski
- **RA:** 12725164145
- **Data:** 06/11/2026
- **Caso de uso:** UC01 — Reportar defeito em poste (RF01; CA01, CA03, CA07; RNF01, RNF02, RNF04, RNF05)
- **Branch:** `test/uc01-reportar-defeito`

## Abordagem

O UC01 já estava implementado na arquitetura em camadas (rota `POST /api/chamados`, `ChamadoService.criarChamado`, `domain/Chamado.js` e, no app do cidadão, `domain/Report.js` e `application/EnviarReporte.js`), mas tinha pouca cobertura de testes. Por isso o código não foi reescrito do zero:

1. **Caracterização:** o comportamento existente foi coberto por testes, que passaram sem alteração no código.
2. **TDD nas regras ausentes:** para cada requisito do UC01 ainda não atendido, o teste foi escrito primeiro e falhou (fase vermelha). Depois veio a correção mínima (fase verde) e, por fim, a refatoração. Cada etapa está em um commit próprio.
3. **Caixa-branca:** o relatório de cobertura apontou os ramos que nenhum caso percorria, e cada um virou um caso de teste.
4. **Análise estática:** a complexidade ciclomática foi medida para verificar o RNF05.

Os testes usam o executor nativo do Node (`node:test`), como o resto da suíte do grupo.

## Como repetir

```bash
npm install --prefix server
npm run test:uc01          # só os testes do UC01
npm test                   # suíte completa do projeto
npm run test:coverage      # suíte completa com cobertura
```

## Especificação e resultado dos casos de teste

Os testes ficam em [server/tests/reportar-defeito/](../../../server/tests/reportar-defeito/). O nome de cada teste começa pelo ID do caso e pela técnica, então a saída da execução já é rastreável.

| Caso | Requisito | Técnica | Nível | O que verifica | Resultado esperado | Resultado obtido | Defeito |
|---|---|---|---|---|---|---|---|
| RP-01 | RF01 | Caixa-preta: partição válida | Unidade | Reporte completo | Aceito, sem erros | Aprovado | — |
| RP-02 (cliente) | Passo 6, A4, A5 | Caixa-preta: tabela de decisão | Unidade | 8 combinações de GPS, tipo e foto no app | Só libera com os três | Aprovado | — |
| RP-02 (servidor) | Passo 6, CA01 | Caixa-preta: tabela de decisão | Unidade | 8 combinações de GPS, tipo e foto na API | Só aceita com os três | Reprovado → aprovado após correção | D-01 |
| RP-03 | Passo 3 | Caixa-preta: partição inválida | Unidade | `POSTE_CAIU`, `fios_soltos`, `Poste apagado`, `APAGADO`, espaços | Recusados | Reprovado → aprovado após correção | D-02 |
| RP-04 | Passo 3 | Caixa-preta: partição válida | Unidade | Os 6 tipos do UC01 | Aceitos | Aprovado | — |
| RP-05 | A4, CA01 | Caixa-preta: valor-limite | Unidade | Latitude ±90 / ±90,0001; longitude ±180 / ±180,0001; (0,0); nulo; texto | Aceita nos limites, recusa fora | Aprovado | — |
| RP-06 | Passo 5 | Caixa-preta: valor-limite | Unidade | Descrição com 500 e 501 caracteres | Aceita / recusa | Reprovado → aprovado após correção | D-03 |
| RP-07 | RNF02 | Caixa-preta: valor-limite | Unidade | Foto com 2 MB e 2 MB + 1 byte | Aceita / recusa | Reprovado → aprovado após correção | D-04 |
| RP-08 | Passo 5 | Caixa-preta: partição válida | Unidade | Nome, telefone, endereço e descrição vazios ou ausentes | Aceito | Aprovado | — |
| RP-09 | CA03 | Baseada em risco: duplicidade | Serviço + repositório, banco simulado | Reenvio do mesmo reporte; outro reporte com protocolo repetido | Um único chamado; segundo recusado | Aprovado | — |
| RP-10 | — | Caixa-branca: ramo de erro | Serviço | Falha ao salvar a foto | Nenhum chamado gravado | Aprovado | — |
| RP-11 | Passo 7 | Caixa-preta | Integração (API) | `POST /api/chamados` válido, sem tipo, sem localização | 201 / 400 / 400; só o válido é gravado | Aprovado | — |
| RP-12 | Passo 7 | Caixa-preta: partição válida | Unidade (app) | Protocolo gerado 1.000 vezes com data fixa | Formato `IC-261106-XXXXX` | Aprovado | — |
| RP-13 | A1 | Baseada em risco: perda de reporte | Unidade (app) | Envio sem rede, com rede e incompleto | Grava antes de enviar; `queued` / `sent`; incompleto não entra na fila | Aprovado | — |
| RP-14 | — | Caixa-branca: cobertura de ramos | Unidade e serviço | Ramos apontados pela cobertura (id/protocolo, entrada nula, foto como URL, preenchimento do Base64, coordenadas em texto, GPS × QR × endereço) | Cada ramo com o comportamento correto | Aprovado | — |
| RP-15 | CA01, A6 | Baseada em risco / partição válida | Serviço | QR sem GPS de poste sem coordenadas; QR sem GPS de poste cadastrado | Recusa com 400; usa as coordenadas do poste | Reprovado → aprovado após correção | D-05 |
| RP-16 | Passo 2, A3 | Caixa-preta: valor-limite e suposição de erro | Unidade (app) | Precisão 0, 10, 10,01, 25, 25,01 m; nula, NaN, negativa, texto | Excelente / Boa / Imprecisa; inválidas como imprecisa | Reprovado → aprovado após correção | D-06 |
| RP-17 | Fluxo principal, CA07, RNF04 | Caixa-preta | Sistema, manual | Fluxo completo no celular | Protocolo em até 3 ações | A executar | — |
| RP-18 | A1, UC03, CA03 | Baseada em risco | Sistema, manual | Reporte em modo avião, app fechado e reaberto | Enviado uma única vez | A executar | — |

RP-17 e RP-18 seguem o [roteiro dos testes manuais](roteiro-testes-manuais.md).

## Ciclo TDD registrado nos commits

| Etapa | Commit (título) | O que aconteceu |
|---|---|---|
| Preparação | `chore(testes): prepara a estrutura de testes do UC01` | Scripts, modelo de issue, dados de apoio e cobertura de base |
| Caracterização | `test(UC01): testes de caracterização do reporte de defeito` | 12 testes do comportamento existente; todos passam |
| Vermelho | `test(UC01): testes que expõem seis defeitos (fase vermelha)` | 6 testes novos falham: D-01 a D-06 |
| Verde | `fix(UC01): ... (D-01)` até `fix(UC01): ... (D-06)` | Uma correção por defeito; a suíte inteira roda a cada passo (6 → 0 falhas) |
| Refatoração | `refactor(UC01): divide a validação e a criação do chamado em funções menores (D-07)` | Funções divididas para cumprir o RNF05, sem mudar o comportamento |
| Caixa-branca | `test(UC01): casos de caixa-branca a partir do relatório de cobertura (RP-14)` | Casos RP-14 a partir do relatório de cobertura |

Durante a correção do D-01, um teste antigo do grupo (`Domínio Chamado: rejeita coordenada (0,0)...`) passou a falhar porque usava um reporte sem foto. Ele verifica só a regra de localização; recebeu a foto nos dados de entrada, sem mudar o que verifica.

## Defeitos

Foram encontrados **8 defeitos** e corrigidos **7**. Detalhes, classificação e passos para reproduzir estão no [registro de defeitos](defeitos.md).

| Severidade | Quantidade | IDs |
|---|---|---|
| Alta | 2 | D-01, D-05 |
| Média | 3 | D-02, D-03, D-04 |
| Baixa | 3 | D-06, D-07, D-08 (aberto) |

## Métricas

| Métrica | Antes | Depois |
|---|---|---|
| Testes automatizados na suíte do projeto | 35 | 59 |
| Testes do UC01 | 0 | 24 (casos RP-01 a RP-16) |
| `Chamado.js` — linhas / ramos | 92,77% / 76,00% | 100% / 100% |
| `ChamadoService.js` — linhas / ramos | 22,22% / — | 67,52% / 86,67% |
| `Report.js` (app) — linhas / ramos | 34,45% / 66,67% | 90,76% / 83,33% |
| `EnviarReporte.js` (app) — linhas | não exercitado | 100% |
| Projeto inteiro — linhas / ramos | 69,53% / 80,07% | 76,77% / 85,43% |
| Maior complexidade em uma função do UC01 no servidor | 19 | 9 |
| Defeitos encontrados / corrigidos | — | 8 / 7 (87,5%) |
| Densidade de defeitos no UC01 | — | 8 defeitos por caso de uso |

As linhas não cobertas que restam em `ChamadoService.js` (98 a 150) pertencem a outros casos de uso: listagem, busca e tentativa de atendimento. A ferramenta de cobertura do Node só mede arquivos carregados por algum teste, por isso `EnviarReporte.js` não aparecia na medição de base.

Evidências: [cobertura antes](evidencias/01-cobertura-antes.txt), [caracterização](evidencias/02-caracterizacao.txt), [TDD vermelho](evidencias/03-tdd-vermelho.txt), [TDD verde](evidencias/04-tdd-verde.txt), [complexidade](evidencias/05-complexidade.txt), [cobertura depois](evidencias/06-cobertura-depois.txt).

## Limites e pendências

- **Banco real.** Os testes de serviço e de API usam um banco simulado que reproduz as restrições de `id` e `protocolo` da tabela `chamados`. A gravação no MySQL real continua dependente do alinhamento do esquema do grupo (nomes de tabelas). Além disso, `PosteRepository.garantirExistencia` ainda usa sintaxe PostgreSQL, então o reporte pelo QR (UC02) não funciona no MySQL até esse repositório ser migrado.
- **D-08** (complexidade de `criarReport` e `validarReport` no app do cidadão) continua aberto.
- **Validação no app.** O servidor agora recusa foto acima de 2 MB e descrição acima de 500 caracteres. O app limita a descrição na tela, mas não confere o tamanho da foto antes de guardá-la na fila. Uma foto grande seria recusada só no envio e o reporte iria para "precisa de atenção". Vale acrescentar essa verificação em `validarReport`.
- **Testes manuais.** RP-17 e RP-18 ainda precisam ser executados no celular.

## Ajustes necessários no documento de requisitos

- **UC01, pós-condição:** trocar o status "Aguardando atendimento" por `aberto`, que é o que o sistema grava.
- **CA01:** a regra aplicada é "localização válida pelo GPS do aparelho ou pelas coordenadas do poste lido pelo QR Code". O texto atual exige sempre o GPS.
- **Lista de tipos:** registrar os códigos aceitos (`apagado`, `queimada`, `piscando`, `aceso_dia`, `quebrado`, `outro`).
