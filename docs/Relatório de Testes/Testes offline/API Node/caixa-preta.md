# Caixa-preta — Funcionalidades offline com o servidor API Node

- **Aluno:** Davi Santiago de Jesus
- **Data:** 12/11/2026
- **Nível de teste:** sistema (ponta a ponta), no navegador real
- **Cenário:** o projeto usa a API Node (`server/`) como servidor
- **Evidência:** [caixa-preta.json](evidencias/caixa-preta.json) · [saída da execução](evidencias/caixa-preta-saida.txt)

## O que foi testado

Os testes usam o app do cidadão e o painel do técnico **como um usuário usaria**:

- tocam nos botões, digitam, tiram a foto e capturam o GPS;
- ligam e desligam a internet do navegador;
- conferem três coisas: o que aparece na tela, o que a API gravou e o que ficou guardado no aparelho (como no DevTools do navegador).

O servidor é a **API Node do projeto, com o código real**: rotas, validação, serviços, regras de negócio e login com o PIN conferido pelo hash. Só o MySQL foi trocado por repositórios em memória, porque o esquema definitivo do banco ainda não existe. O app recebe a mesma configuração que o build gera com `ILUMINA_API_URL=/`.

Os casos foram derivados dos casos de uso do Trabalho A3, com a regra vista em aula:

- fluxo principal: 1 caso positivo;
- cada fluxo alternativo: 1 caso;
- cada exceção: 1 caso negativo;
- cada pré-condição: 1 teste de violação;
- regras de negócio e critérios de aceitação (CA02, CA03): 1 caso cada.

Cada caso está escrito no formato **Dado / Quando / Então** no JSON de evidência.

## Cuidados para o resultado ser confiável

- **Independência:** cada caso tem servidor e navegador novos. Um caso não depende do anterior.
- **Sem tempo fixo:** o teste espera por algo que dá para observar (a fila esvaziar, o servidor receber), nunca por "esperar 2 segundos".
- **Repetição:** a suíte rodou **2 vezes**. Um caso que muda de resultado entre as rodadas é marcado como instável (ver CT-07 abaixo).
- **Resposta perdida realista:** o servidor grava e corta a resposta no meio. Assim quem decide reenviar é o app, e não o navegador.
- **Só a tela:** o teste não chama funções internas da página.

## Resultado

**31 casos: 14 aprovados, 16 reprovados e 1 erro de execução (CT-07, instável)**.

**Instabilidade do CT-07.** Na 1ª rodada, o CT-07 (fechar 10 chamados seguidos sem internet) esgotou o tempo de 15 s esperando o GPS do técnico. Na 2ª rodada, passou. Numa execução anterior completa da mesma suíte, tinha passado nas duas.

Nessa 1ª rodada, eu estava rodando outros testes pesados na mesma máquina (o teste de mutação e um envio de 8 MB). A causa mais provável é a máquina carregada, não o app.

O resultado não foi refeito até dar verde: fica registrado como **instabilidade do ambiente de teste**, não como defeito. Seguindo a aula sobre testes instáveis, a correção é rodar a caixa-preta sozinha na máquina. Se voltar a acontecer, aumentar a espera do GPS no teste e investigar.

Ambiente: Windows, Node.js 24.16.0, Google Chrome 157 e `playwright-core` 1.56.1.

O que funciona com a API Node:

- abrir os apps sem internet;
- guardar o trabalho no aparelho;
- login do técnico com o PIN conferido pela API;
- lista de chamados disponível offline.

O que **não funciona**: **nada do que é feito no aparelho chega à API**. Os dois apps ainda enviam no formato do Apps Script (DEF-01 e DEF-02).

### App do cidadão

| Caso | Requisito | O que verifiquei | Resultado | Defeito |
|---|---|---|---|---|
| CP-01 | UC01 pré-condição; RNF01 | App abre sem internet depois do primeiro acesso | Aprovado | — |
| CP-02 | UC01 pré-condição (violação) | Primeiro acesso sem internet não abre e não cria nada | Aprovado | — |
| CP-03 | UC01 fluxo principal; RF01 | Reporte com internet chega ao servidor | **Reprovado** | DEF-01 |
| CP-04 | UC01-A1 | Sem internet: protocolo, fila e aviso de pendente | Aprovado | — |
| CP-05 | UC01-A2 | Erro 500: reporte vai para a fila | Aprovado | OBS-01 |
| CP-06 | UC01-A2 (valor limite 60 s) | Servidor mudo: depois de 60 s vai para a fila | Aprovado | — |
| CP-07 | UC01-E1 | Falha ao gravar no aparelho: erro e formulário mantido | Aprovado | — |
| CP-08 | CA02 | Internet cai no meio do preenchimento | Aprovado | — |
| CP-09 | CA02 | Formulário sobrevive ao fechamento do app | **Reprovado** | DEF-06 |
| CP-10 | UC03 fluxo principal; CA03 | Pendente é enviado quando a internet volta | **Reprovado** | DEF-01 |
| CP-11 | UC03 passo 2; CA03 | 3 reportes: 1 registro de cada | **Reprovado** | DEF-01 |
| CP-12 | UC03-A1 | Falha de rede na sincronização: tenta de novo | **Reprovado** | DEF-01 |
| CP-13 | UC03-A2 | Recusa: fica na fila com motivo e cidadão avisado | **Reprovado** | DEF-05 |
| CP-14 | UC03 regra (sem descarte silencioso) | Recusa repetida não some sem aviso | **Reprovado** | DEF-03 |
| CP-15 | UC03-A3 | Fila sobrevive ao fechamento e é enviada depois | **Reprovado** | DEF-01 |
| CP-16 | UC03 regra; CA03 | Resposta perdida não gera dois registros | **Reprovado** | DEF-01 |
| CP-17 | UC03 regra; CA03 | Gatilhos simultâneos não geram registros repetidos | **Reprovado** | DEF-01, DEF-04 |
| CP-18 | RNF01; RNF04 | Indicador "Sem sinal" / "Online" | Aprovado | — |
| CP-19 | RNF01 | Link com parâmetros abre sem internet | Aprovado | — |
| CP-20 | UC02-A3 | QR do poste sem internet segue com o poste vinculado | Aprovado | — |

### Painel do técnico

| Caso | Requisito | O que verifiquei | Resultado | Defeito |
|---|---|---|---|---|
| CT-01 | UC04-A4 | Login sem internet avisa a falta de conexão | Aprovado | — |
| CT-02 | UC04 fluxo principal; RF03 | Login com PIN abre a lista (20 chamados) | Aprovado | — |
| CT-03 | UC04-A1; RNF01 | Sessão salva abre a lista offline sem PIN | Aprovado | — |
| CT-04 | UC05 fluxo principal; RF04 | Fechamento com internet é registrado | **Reprovado** | DEF-02, DEF-12 |
| CT-05 | UC05-A5 | Sem internet: "Salvo no aparelho" e 1 na fila | Aprovado | — |
| CT-06 | UC05-A5 | Pendente é enviado quando a internet volta | **Reprovado** | DEF-02 |
| CT-07 | UC05-A6 (valor limite 10/11) | 10 entram na fila; o 11º é bloqueado | Erro de execução / Aprovado (instável) | — |
| CT-08 | UC05-A5; Confiabilidade | Um fechamento recusado não trava os outros | **Reprovado** | DEF-07, DEF-02 |
| CT-09 | UC05-A5; pós-condição | Resposta perdida: reenvio sem travar nem duplicar | **Reprovado** | DEF-02 |
| CT-10 | UC04-A3; UC05-A5 | Sessão expirada: nada se perde e o app pede PIN | **Reprovado** | DEF-09, DEF-02 |
| CT-11 | UC05 pré-condição | Chamado fechado offline não é fechado de novo | **Reprovado** | DEF-10 |

## Falhas observadas

Os defeitos estão descritos no [catálogo](../README.md#defeitos) com a causa no código e uma sugestão de correção.

- **DEF-01 — nenhum reporte chega à API (CP-03, CP-10 a CP-17).** Com internet, a tela mostra "Salvo sem sinal". A API respondeu `400 JSON_INVALIDO` porque o app enviou um formulário (`application/x-www-form-urlencoded`) sem o campo `id`. O reporte fica na fila com o motivo `{"codigo":"JSON_INVALIDO"}`.
- **DEF-02 — nenhum fechamento chega à API (CT-04, CT-06, CT-08 a CT-10).** O técnico envia para `/api`, rota que não existe, e recebe 404. Com internet, a mensagem mostrada é "Falha ao registrar. [object Object]" (DEF-12). Sem internet, o fechamento entra na fila e nunca sai.
- **DEF-03 — o reporte some (CP-14).** Depois de 5 recusas, ele foi apagado do aparelho sem nenhum aviso para o cidadão.
- **DEF-04 — o mesmo reporte enviado 3 vezes (CP-17).** Com a internet voltando junto com o app indo para o primeiro plano, a API recebeu 3 envios do mesmo protocolo. Hoje isso fica escondido pelo DEF-01; com o formato corrigido, o `id` único faria a API gravar só um.
- **DEF-05 — recusa sem aviso (CP-13).** Depois da recusa, o aviso continua dizendo "será enviado quando houver sinal".
- **DEF-06 — rascunho perdido (CP-09).** Ao reabrir o app, tipo, descrição e GPS estavam em branco.
- **DEF-07 — fila do técnico travada (CT-08).** O primeiro fechamento recusado impediu o envio dos outros dois.
- **DEF-09 — sessão expirada (CT-10).** O app não pediu o PIN quando a sessão foi recusada. Depois do novo login, o fechamento continuou na fila.
- **DEF-10 — fechamento em dobro (CT-11).** O chamado fechado sem internet continuou na lista e foi fechado de novo: 2 fechamentos do mesmo chamado na fila.

## Limites deste teste

- **Banco em memória:** o MySQL foi trocado por repositórios em memória, então o SQL real não foi exercitado. Isso segue o combinado de não criar tabelas enquanto o esquema não estiver definido.
- **Primeiro plano:** "o app volta ao primeiro plano" foi simulado com o evento que o navegador dispara (`visibilitychange`). A ferramenta não consegue mandar a página para o segundo plano de verdade.
- **Armazenamento cheio:** foi simulado fazendo o navegador recusar a gravação na fila (CP-07).
- **Celular real:** um computador fazendo papel de celular (tela de 390 px, GPS fictício em Coruripe) não substitui o teste num celular de verdade.
- **HTTPS (CA06):** não está no escopo offline e não foi verificado.

## Como repetir

Na raiz do projeto:

```bash
npm install --no-save playwright-core
```

```bash
node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
```

São cerca de 10 minutos para as 2 rodadas. Para rodar uma só, use `REPETICOES=1`; para escolher casos, `FILTRO=CT-0`. O arquivo de evidência é regravado a cada execução.
