# Roteiro dos testes manuais — UC01 Reportar defeito em poste

Os casos RP-17 e RP-18 dependem do celular real (câmera, GPS e modo avião) e por isso são executados manualmente. Preencha uma tabela de resultado por execução e salve as capturas em `evidencias/`.

**Pré-condições comuns**

- App do cidadão e API Node rodando no mesmo endereço, acessível pelo celular (mesma rede Wi-Fi), com `ILUMINA_API_URL` configurada.
- Banco do grupo preparado com as tabelas que o backend espera (`chamados`, `postes`). Enquanto o esquema não estiver alinhado, o RP-17 pode ser executado até o passo 6 e o RP-18 até o passo 4.
- Permissões de câmera e localização concedidas ao navegador.
- **Não** use os endereços de produção do Apps Script: os reportes de teste iriam para a planilha real da prefeitura.

---

## RP-17 — Fluxo completo no celular (caixa-preta, sistema)

**Requisitos:** UC01 fluxo principal, CA07, RNF02, RNF04
**Objetivo:** confirmar que o cidadão abre um chamado em até 3 passos e recebe o protocolo.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | Abrir o app do cidadão | Formulário de reporte visível |
| 2 | Aguardar a captura do GPS | Coordenadas e precisão exibidas (Excelente ≤ 10 m, Boa ≤ 25 m, Imprecisa > 25 m) |
| 3 | Escolher o tipo "Apagado" | Tipo marcado; botão de envio ainda desabilitado |
| 4 | Tirar a foto do poste | Pré-visualização exibida; botão de envio habilitado (se a tela mostrar o tamanho da foto, anote-o) |
| 5 | (opcional) Escrever uma descrição | Campo para de aceitar texto aos 500 caracteres |
| 6 | Tocar em "Enviar reporte" | Tela de sucesso com protocolo no formato `IC-AAMMDD-XXXXX` |
| 7 | Conferir no painel técnico (ou no banco) | Chamado com o mesmo protocolo, status `aberto`, foto e coordenadas |

**Critério de aprovação:** protocolo exibido e chamado registrado; ações obrigatórias do cidadão (tipo, foto, enviar) em até 3 passos; a interface não trava durante o envio da foto.

| Data | Aparelho / navegador | Ações obrigatórias contadas | Protocolo | Resultado | Evidência | Observações |
|---|---|---|---|---|---|---|
| | | | | Aprovado / Reprovado | | |

---

## RP-18 — Reporte sem internet (baseado em risco, sistema)

**Requisitos:** UC01 A1, UC03, RF02, CA03, RNF01
**Objetivo:** confirmar que nenhum reporte é perdido sem conexão e que ele é enviado uma única vez quando o sinal volta.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | Abrir o app com internet, para carregá-lo | App carregado |
| 2 | Ativar o modo avião | Indicação de "sem conexão" |
| 3 | Preencher tipo e foto (GPS funciona sem internet) e enviar | Protocolo exibido como **pendente** |
| 4 | Fechar o navegador por completo e abri-lo de novo, ainda em modo avião | O reporte continua na fila (aviso de pendentes) |
| 5 | Desativar o modo avião | O reporte é enviado sozinho; aviso de pendentes desaparece |
| 6 | Conferir no painel técnico (ou no banco) | Exatamente **um** chamado com aquele protocolo |

**Critério de aprovação:** o reporte sobrevive ao fechamento do app e chega ao servidor uma única vez.

| Data | Aparelho / navegador | Pendente após passo 4? | Enviado após passo 5? | Chamados com o protocolo | Resultado | Evidência |
|---|---|---|---|---|---|---|
| | | | | | Aprovado / Reprovado | |
