# Relatório de Testes — Funcionalidades offline

- **Aluno:** Davi Santiago de Jesus
- **Data:** 12/11/2026
- **Tipo de teste:** Teste da Caixa Preta simulada no navegador
- **Complemento:** os [testes de caixa-branca](CAIXA-BRANCA.md) verificam o código da fila offline por dentro e confirmam a causa dos defeitos D1, D2, D4, D5 e D6

## Objetivo

Verificar se o app do cidadão e o painel do técnico continuam úteis sem internet e se o que foi feito offline chega ao servidor quando a conexão volta, sem perda e sem duplicidade.

Os testes olham só o que o usuário vê na tela e o que chega no servidor. O código das telas não foi alterado para os testes.

## Como os testes funcionam

O script [caixa-preta.navegador.mjs](../../../server/tests/testes-offline/caixa-preta.navegador.mjs) abre o Google Chrome com o Playwright, simula um celular em Coruripe/AL (GPS fictício) e liga e desliga a internet do navegador durante o uso.

O [servidor de apoio](../../../server/tests/testes-offline/apoio/servidor-teste.js) serve a pasta `public/` e responde de dois jeitos:

- **Modo legado:** imita os endpoints do Google Apps Script, que são os usados hoje em produção.
- **Modo Node:** encaminha as chamadas para a API Node real (`server/src/app.js`). Só o banco MySQL é trocado por dados em memória.

O teste também pode mandar o servidor responder com erro 500, recusar o reporte ou perder a resposta. Assim dá para reproduzir falhas sem depender de uma rede instável. Nenhum banco real é acessado e todos os dados são fictícios.

## Resultado

Foram executados **23 casos: 15 aprovados, 8 reprovados e nenhum erro de execução**. O resultado completo, com o esperado e o obtido de cada caso, está em [resultado-caixa-preta.json](evidencias/resultado-caixa-preta.json).

Ambiente: Windows, Node.js 24.16.0 e Google Chrome com `playwright-core`.

### App do cidadão (modo legado - Servidor **Apps Script**)

| Caso | O que verifiquei | Técnica | Resultado |
|---|---|---|---|
| CP-01 | O app abre sem internet depois do primeiro acesso. | Partição de equivalência | Aprovado |
| CP-02 | Reporte feito offline fica salvo com protocolo e aviso de pendente. | Baseado em requisito | Aprovado |
| CP-03 | O reporte pendente é enviado sozinho quando a internet volta. | Transição de estado | Aprovado |
| CP-04 | Três reportes offline chegam ao servidor, cada um uma única vez. | Valor limite | Aprovado |
| CP-05 | A fila sobrevive ao fechamento do app e é enviada na próxima abertura. | Transição de estado | Aprovado |
| CP-06 | Erro 500 no envio com internet guarda o reporte na fila. | Baseado em requisito | Aprovado (ver observação) |
| CP-07 | Falha do servidor durante a sincronização mantém o reporte na fila. | Baseado em requisito | Aprovado |
| CP-08 | Reporte rejeitado pelo servidor não some sem avisar o cidadão. | Baseado em risco | **Reprovado** |
| CP-09 | Resposta perdida não transforma o mesmo reporte em dois registros. | Baseado em risco | **Reprovado** |
| CP-10 | Sincronizações simultâneas não enviam o mesmo reporte duas vezes. | Baseado em risco | **Reprovado** |
| CP-11 | Internet cai no meio do preenchimento e o reporte ainda é concluído. | Transição de estado | Aprovado |
| CP-12 | O rascunho é guardado se o app for fechado sem internet. | Baseado em risco | **Reprovado** |
| CP-13 | O indicador mostra "Sem sinal" e "Online" corretamente. | Partição de equivalência | Aprovado |
| CP-14 | O app abre offline com parâmetros no link (`?utm_source=...`). | Partição de equivalência | Aprovado |

### App do cidadão (API Node - Teste servidor local)

| Caso | O que verifiquei | Técnica | Resultado |
|---|---|---|---|
| CP-15 | Reporte feito com internet chega à API. | Baseado em requisito | **Reprovado** |
| CP-16 | Reporte feito offline é entregue à API quando a internet volta. | Transição de estado | **Reprovado** |

### Painel do técnico

| Caso | O que verifiquei | Técnica | Resultado |
|---|---|---|---|
| CP-17 | Login sem internet avisa que não há conexão. | Baseado em requisito | Aprovado |
| CP-18 | A lista de chamados continua disponível offline. | Transição de estado | Aprovado |
| CP-19 | Fechamento sem internet vai para a fila do aparelho. | Baseado em requisito | Aprovado |
| CP-20 | Fechamento pendente é enviado quando a internet volta. | Transição de estado | Aprovado |
| CP-21 | Com 10 fechamentos na fila, o 11º é bloqueado com aviso. | Valor limite (10 e 11) | Aprovado |
| CP-22 | Um fechamento com erro não trava o envio dos outros. | Baseado em risco | **Reprovado** |
| CP-23 | Com a API Node, o fechamento offline é entregue quando a internet volta. | Transição de estado | **Reprovado** |

## Defeitos encontrados

Os defeitos abaixo foram conferidos no código depois da execução.

1. **Reporte apagado sem aviso (CP-08, CP-16).** Depois de 5 tentativas recusadas, a fila do cidadão apaga o reporte em silêncio ([public/index.html:1277](../../../public/index.html)). Isso contraria a regra de que nenhum reporte pode ser descartado sem informar o cidadão. Na API Node o efeito é perda total: o reporte é recusado (ver item 4) e depois apagado do aparelho.
2. **Envio repetido do mesmo reporte (CP-09, CP-10).** A fila do cidadão não tem trava contra sincronizações simultâneas e o app não manda um identificador único. Com três gatilhos ao mesmo tempo, o mesmo protocolo foi enviado 4 vezes; com a resposta perdida, 8 vezes. Se o Apps Script não descartar protocolos repetidos, haverá chamados duplicados. O painel do técnico já tem essa trava (`flushInFlight`).
3. **Rascunho perdido ao fechar o app (CP-12).** Enquanto a página fica aberta nada se perde (CP-11). Se o app for fechado ou recarregado antes do envio, tipo, descrição e localização são perdidos.
4. **App do cidadão incompatível com a API Node (CP-15, CP-16).** A tela envia o reporte como formulário (`payload=...`) e sem o campo `id`. A API só aceita JSON com `id` e responde 400. Por isso a tela mostra "Salvo sem sinal" mesmo com internet.
5. **Fila do técnico travada por um item (CP-22).** Se o servidor recusar o primeiro fechamento, a sincronização para ([public/tecnico/index.html:1884](../../../public/tecnico/index.html)) e os demais nunca são enviados.
6. **Painel do técnico incompatível com a API Node (CP-23).** O fechamento offline é reenviado no formato do Apps Script (`action: "close"`) para `/api`, rota que não existe na API Node. O certo seria `POST /api/chamados/{protocolo}/fechamento`.

### Observação de usabilidade

No CP-06, o título "Salvo sem sinal" aparece mesmo quando há sinal e o erro foi do servidor. O comportamento está correto, mas a mensagem pode confundir o cidadão.

## Como repetir

Na raiz do projeto:

```bash
npm install --no-save playwright-core
```

```bash
node server/tests/testes-offline/caixa-preta.navegador.mjs
```

O script usa o Google Chrome instalado. Para usar o Edge, defina `NAVEGADOR=msedge`. A execução leva alguns minutos e regrava o arquivo de evidências.

Esse script não entra no `npm test`, porque precisa de um navegador instalado. Os testes de caixa-branca entram: a suíte automatizada do servidor tem 80 testes, sendo 75 aprovados e 5 que confirmam defeitos (ver [caixa-branca](CAIXA-BRANCA.md)).

## Conclusão e limite

O uso offline básico funciona: os dois apps abrem sem internet, guardam o trabalho na fila e enviam quando a conexão volta. As falhas estão nas situações de erro (recusa do servidor, resposta perdida, gatilhos simultâneos) e na ligação das telas com a API Node, que ainda não está pronta para substituir o Apps Script.

O script do Apps Script não está no repositório. Por isso os testes do modo legado usam um servidor que imita esse script, e o resultado real da deduplicação em produção não foi verificado.
