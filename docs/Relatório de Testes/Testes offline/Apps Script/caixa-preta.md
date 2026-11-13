# Caixa-preta — Funcionalidades offline com o servidor Google Apps Script

- **Aluno:** Davi Santiago de Jesus
- **Data:** 12/11/2026
- **Nível de teste:** sistema (ponta a ponta), no navegador real
- **Cenário:** o projeto continua usando o Google Apps Script como servidor
- **Evidência:** [caixa-preta.json](evidencias/caixa-preta.json) · [saída da execução](evidencias/caixa-preta-saida.txt)

## O que foi testado

Os mesmos casos do [cenário API Node](../API%20Node/caixa-preta.md), derivados dos casos de uso do Trabalho A3. O resultado esperado é igual nos dois cenários, porque vem dos requisitos e não do servidor.

O teste usa o app do cidadão e o painel do técnico só pela tela, liga e desliga a internet e confere três coisas: a tela, o que chegou ao servidor e a fila do aparelho.

O script real do Apps Script **não está no repositório**: o código existe só no editor do Google. Por isso o servidor é um **dublê do Apps Script**, com uma planilha em memória que segue o contrato que as telas esperam:

| Pedido | Resposta do dublê |
|---|---|
| Reporte do cidadão (formulário com o campo `payload`) | `{ ok: true, protocolo }` ou `{ ok: false, error }` |
| Login do técnico (`action: "login"`, PIN 1234) | `{ success: true, token, expiry }` ou `{ success: false, error: "pin_invalido" }` |
| Lista (`action: "list"`) | `{ success: true, records, total, abertos, atendidos }` |
| Fechamento (`action: "close"`) | `{ success: true }`; `error: "sessao_expirada"` se o token venceu; `error: "ja_fechado"` se o chamado já foi fechado |

Esses formatos foram tirados do próprio código das telas, que trata cada uma dessas respostas.

**Planilha com e sem verificação de duplicidade.** Não se sabe se o script real descarta protocolo repetido. Por isso, nos dois casos de duplicidade, o dublê roda das duas formas:

- **CP-16a e CP-17a:** planilha que aceita protocolo repetido;
- **CP-16b e CP-17b:** planilha que descarta protocolo repetido.

Os mesmos cuidados do cenário API Node valem aqui:

- servidor e navegador novos em cada caso;
- espera por condição observável, nunca por tempo fixo;
- 2 rodadas completas, para detectar caso instável;
- resposta perdida cortada no meio, para que quem reenvia seja o app e não o navegador.

## Resultado

**33 casos: 24 aprovados e 9 reprovados**, sem erro de execução e sem caso instável entre as 2 rodadas.

Ambiente: Windows, Node.js 24.16.0, Google Chrome 157 e `playwright-core` 1.56.1.

Com o Apps Script, o uso offline básico funciona de ponta a ponta:

- os dois apps abrem sem internet;
- reportes e fechamentos ficam na fila e chegam ao servidor quando a conexão volta;
- o limite de 10 fechamentos funciona.

As falhas aparecem nas situações de erro: recusa, resposta perdida, sessão expirada, gatilhos simultâneos e fechamento repetido.

### App do cidadão

| Caso | Requisito | O que verifiquei | Resultado | Defeito |
|---|---|---|---|---|
| CP-01 | UC01 pré-condição; RNF01 | App abre sem internet depois do primeiro acesso | Aprovado | — |
| CP-02 | UC01 pré-condição (violação) | Primeiro acesso sem internet não abre e não cria nada | Aprovado | — |
| CP-03 | UC01 fluxo principal; RF01 | Reporte com internet chega ao servidor | Aprovado | — |
| CP-04 | UC01-A1 | Sem internet: protocolo, fila e aviso de pendente | Aprovado | — |
| CP-05 | UC01-A2 | Erro 500: reporte vai para a fila | Aprovado | OBS-01 |
| CP-06 | UC01-A2 (valor limite 60 s) | Servidor mudo: depois de 60 s vai para a fila | Aprovado | — |
| CP-07 | UC01-E1 | Falha ao gravar no aparelho: erro e formulário mantido | Aprovado | — |
| CP-08 | CA02 | Internet cai no meio do preenchimento | Aprovado | — |
| CP-09 | CA02 | Formulário sobrevive ao fechamento do app | **Reprovado** | DEF-06 |
| CP-10 | UC03 fluxo principal; CA03 | Pendente é enviado quando a internet volta | Aprovado | — |
| CP-11 | UC03 passo 2; CA03 | 3 reportes: 1 registro de cada | Aprovado | — |
| CP-12 | UC03-A1 | Falha de rede na sincronização: tenta de novo | Aprovado | — |
| CP-13 | UC03-A2 | Recusa: fica na fila com motivo e cidadão avisado | **Reprovado** | DEF-05 |
| CP-14 | UC03 regra (sem descarte silencioso) | Recusa repetida não some sem aviso | **Reprovado** | DEF-03 |
| CP-15 | UC03-A3 | Fila sobrevive ao fechamento e é enviada depois | Aprovado | — |
| CP-16a | UC03 regra; CA03 | Resposta perdida não gera dois registros (planilha aceita repetido) | **Reprovado** | DEF-11 |
| CP-16b | UC03 regra; CA03 | Resposta perdida não gera dois registros (planilha descarta repetido) | Aprovado | — |
| CP-17a | UC03 regra; CA03 | Gatilhos simultâneos (planilha aceita repetido) | **Reprovado** | DEF-04, DEF-11 |
| CP-17b | UC03 regra; CA03 | Gatilhos simultâneos (planilha descarta repetido) | Aprovado | — |
| CP-18 | RNF01; RNF04 | Indicador "Sem sinal" / "Online" | Aprovado | — |
| CP-19 | RNF01 | Link com parâmetros abre sem internet | Aprovado | — |
| CP-20 | UC02-A3 | QR do poste sem internet segue com o poste vinculado | Aprovado | — |

### Painel do técnico

| Caso | Requisito | O que verifiquei | Resultado | Defeito |
|---|---|---|---|---|
| CT-01 | UC04-A4 | Login sem internet avisa a falta de conexão | Aprovado | — |
| CT-02 | UC04 fluxo principal; RF03 | Login com PIN abre a lista (20 chamados) | Aprovado | — |
| CT-03 | UC04-A1; RNF01 | Sessão salva abre a lista offline sem PIN | Aprovado | — |
| CT-04 | UC05 fluxo principal; RF04 | Fechamento com internet é registrado | Aprovado | — |
| CT-05 | UC05-A5 | Sem internet: "Salvo no aparelho" e 1 na fila | Aprovado | — |
| CT-06 | UC05-A5 | Pendente é enviado quando a internet volta | Aprovado | — |
| CT-07 | UC05-A6 (valor limite 10/11) | 10 entram na fila; o 11º é bloqueado | Aprovado | — |
| CT-08 | UC05-A5; Confiabilidade | Um fechamento recusado não trava os outros | **Reprovado** | DEF-07 |
| CT-09 | UC05-A5; pós-condição | Resposta perdida: reenvio sem travar nem duplicar | **Reprovado** | DEF-08 |
| CT-10 | UC04-A3; UC05-A5 | Sessão expirada: nada se perde e o app pede PIN | **Reprovado** | DEF-09 |
| CT-11 | UC05 pré-condição | Chamado fechado offline não é fechado de novo | **Reprovado** | DEF-10 |

## Falhas observadas

Os defeitos estão descritos no [catálogo](../README.md#defeitos) com a causa no código e uma sugestão de correção.

- **DEF-11 — duplicidade depende do script (CP-16a/b, CP-17a/b).** A planilha recebeu o mesmo protocolo 2 vezes depois de uma resposta perdida e 3 vezes com gatilhos simultâneos.
  - Se a planilha aceita protocolo repetido, ela fica com 2 e 3 linhas.
  - Se ela descarta protocolo repetido, fica com 1.
  - **Antes de decidir pelo Apps Script, alguém precisa abrir o script no editor do Google e conferir isso.**
- **DEF-04 — o mesmo reporte enviado 3 vezes (CP-17).** Mesmo com a planilha descartando repetidos, o aparelho fez 3 envios, gastando dados móveis à toa.
- **DEF-08 — fechamento preso para sempre (CT-09).** A planilha registrou o fechamento, mas a resposta se perdeu. No reenvio, o script respondeu `ja_fechado`, o app tratou isso como erro e o item ficou na fila. O aviso de pendente nunca some.
- **DEF-10 — fechamento em dobro (CT-11).** O chamado fechado sem internet continuou na lista e foi fechado de novo. No Apps Script, o segundo envio recebe `ja_fechado` e trava a fila (DEF-08).
- **DEF-03, DEF-05, DEF-06, DEF-07 e DEF-09** se comportaram igual ao cenário API Node: descarte silencioso, recusa sem aviso, rascunho perdido, fila do técnico travada e sessão expirada sem pedir o PIN.

## Limites deste teste

- **Dublê, não o script real:** a planilha é um dublê que segue o contrato esperado pelas telas, não o script em si. Como visto em aula, um dublê de serviço só vale enquanto espelha o serviço real. Se o grupo escolher o Apps Script, os casos CP-03, CP-10, CP-16, CP-17, CT-04, CT-06 e CT-09 devem ser repetidos contra um deploy de teste do script.
- **Comportamentos do Google que o dublê não simula:** limite de execução, cotas diárias e redirecionamento de resposta.
- **Primeiro plano e armazenamento cheio:** foram simulados, como no cenário API Node.
- **Celular real e HTTPS (CA06):** não foram verificados.

## Como repetir

Na raiz do projeto:

```bash
npm install --no-save playwright-core
```

```bash
node server/tests/testes-offline/apps-script/caixa-preta.navegador.mjs
```

São cerca de 12 minutos para as 2 rodadas. As opções `REPETICOES` e `FILTRO` funcionam como no cenário API Node.
