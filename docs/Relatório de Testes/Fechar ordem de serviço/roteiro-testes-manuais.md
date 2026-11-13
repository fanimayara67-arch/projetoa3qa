# Roteiro dos testes manuais — UC05 Atender e encerrar chamado (fechar OS)

Os casos FO-34 e FO-35 dependem do celular real (câmera, GPS e modo avião) e do banco do grupo. Por isso são executados manualmente. Preencha uma tabela de resultado por execução e salve as capturas em `evidencias/`.

**Pré-condições comuns**

- Painel do técnico e API Node rodando no mesmo endereço, acessível pelo celular (mesma rede Wi-Fi), com `ILUMINA_API_URL` configurada.
- Banco MySQL do grupo com um técnico cadastrado (PIN conhecido), pelo menos um chamado `aberto` e os materiais da tela cadastrados no almoxarifado com os mesmos nomes ("Reator", "Cabo (m)"…).
- Permissões de câmera e localização concedidas ao navegador.
- **Não** use os endereços de produção do Apps Script: os fechamentos de teste iriam para a planilha real da prefeitura.

---

## FO-34 — Fechamento completo no celular (caixa-preta, sistema)

**Requisitos:** UC05 fluxo principal (passos 1 a 7), CA04
**Objetivo:** confirmar que o fechamento feito pelo aparelho chega ao servidor, fecha o chamado e baixa o estoque.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | Entrar com o PIN do técnico | Lista de chamados pendentes |
| 2 | Anotar o saldo de "Reator" no almoxarifado | — |
| 3 | Abrir um chamado da lista | Dados do reporte, foto do cidadão e mapa |
| 4 | Escolher "Concluído", descrever o serviço e informar a referência | Campos preenchidos |
| 5 | Preencher a configuração do poste e marcar 1 "Reator" nos materiais | — |
| 6 | Capturar o GPS em área aberta | Precisão de até 100 m (ponto verde) |
| 7 | Tirar a foto do reparo e confirmar o fechamento | Tela "Chamado fechado!" |
| 8 | Voltar à lista | O chamado não aparece mais |
| 9 | Conferir no banco: `fechamentos`, `fechamento_materiais` e `itens_estoque` | 1 fechamento; 1 reator na OS; saldo de "Reator" 1 a menos que no passo 2 |

| Data | Aparelho / navegador | Resultado | Observações | Captura |
|---|---|---|---|---|
| | | | | |

---

## FO-35 — Fechamento sem sinal e envio quando o sinal volta (caixa-preta, sistema)

**Requisitos:** UC05-A5, A6
**Objetivo:** confirmar que o fechamento feito sem internet fica no aparelho e é enviado uma única vez quando a internet volta.

| Passo | Ação | Resultado esperado |
|---|---|---|
| 1 | Com internet, entrar com o PIN e abrir um chamado | — |
| 2 | Capturar o GPS e tirar a foto do reparo | — |
| 3 | Ativar o modo avião | — |
| 4 | Preencher o formulário e confirmar o fechamento | Tela "Salvo no aparelho"; aviso de 1 fechamento pendente |
| 5 | Desativar o modo avião e esperar o aviso sumir | Aviso de pendentes some |
| 6 | Conferir no banco | 1 fechamento para o chamado (não 2) e estoque abatido uma vez |

| Data | Aparelho / navegador | Resultado | Observações | Captura |
|---|---|---|---|---|
| | | | | |
