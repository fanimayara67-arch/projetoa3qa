# Registro de defeitos — UC05 Atender e encerrar chamado (fechar OS)

Defeitos encontrados durante os testes do UC05.

- **F-01 a F-08** foram expostos por testes escritos antes da correção (fase vermelha do TDD, evidência em [04-tdd-vermelho.txt](evidencias/04-tdd-vermelho.txt)).
- **F-09 e F-10** foram encontrados por análise estática da complexidade ([02-complexidade-antes.txt](evidencias/02-complexidade-antes.txt)).
- **DEF-02, DEF-07 e DEF-08** já estavam no [catálogo dos testes offline](../Testes%20offline/defeitos.json) e foram corrigidos aqui, porque fazem parte do fluxo do UC05. Os IDs originais foram mantidos.

Cada correção está em um commit próprio, com o ID do defeito no título (ex.: `fix(UC05): ... (F-01)`).

Classificação usada: **severidade** (crítica, alta, média, baixa), **tipo** (funcional, dados, interface, segurança, desempenho, usabilidade, manutenibilidade) e **origem** (requisito, projeto, código).

| ID | Encontrado por | Requisito | Descrição | Severidade | Tipo | Origem | Situação |
|---|---|---|---|---|---|---|---|
| F-01 | FO-03, FO-23 | Passo 6 | O servidor aceitava fechamento sem foto do reparo; só a tela conferia. | Alta | Funcional | Código | Corrigido |
| F-02 | FO-05 a FO-07, FO-23 | Passo 6, A4 | O servidor não conferia o GPS do técnico: aceitava fechamento sem coordenadas, em (0,0), fora da região ou com precisão de 250 m. | Alta | Funcional | Código | Corrigido |
| F-03 | FO-04, FO-23 | Passo 3 | O status de resolução aceitava qualquer texto (ex.: "Resolvido", "fechado"), fora dos quatro do UC05. | Média | Dados | Código | Corrigido |
| F-04 | FO-16 | CA04 | Material repetido na lista (2 m e 3 m de cabo): o estoque abatia 5 m, mas a OS registrava só 3 m. | Média | Dados | Código | Corrigido |
| F-05 | FO-09 | Passo 4 | Item nulo na lista de materiais derrubava a validação com erro interno (500). | Baixa | Funcional | Código | Corrigido |
| F-06 | FO-10, FO-24 | Passo 6 | Data do fechamento no formato da tela antiga ("13/11/2026, 10:30") gerava erro interno (500) no banco. | Média | Dados | Código | Corrigido |
| F-07 | FO-11 | Passo 3 | Referência do local acima de 255 caracteres gerava erro interno (500) no banco. | Baixa | Dados | Código | Corrigido |
| F-08 | FO-15 | Pós-condição | A mesma `operacao_id` enviada para outro chamado devolvia o fechamento do primeiro como sucesso, e o segundo chamado continuava aberto sem aviso. | Média | Funcional | Código | Corrigido |
| F-09 | Complexidade | RNF05 | `validarFechamentoCampo` (17) e o corpo da transação de `fecharChamado` (17) passavam de 10 caminhos. | Baixa | Manutenibilidade | Código | Corrigido |
| F-10 | Complexidade | RNF05 | `fecharChamado` da tela do técnico (`public/tecnico/index.html`) tem 55 caminhos. | Baixa | Manutenibilidade | Código | **Aberto** |
| DEF-02 | FO-25 a FO-28; CT-04, CT-06, CT-08, CT-09 | Passos 6 e 7, A5 | Com a API Node, o painel mandava o fechamento no formato do Apps Script para `/api`, rota que não existe. Nenhum fechamento feito pelo aparelho chegava ao servidor. Também: materiais em `{item, qtd}` (a API espera `{nome, quantidade}`), sem `operacao_id` e com a data em formato brasileiro. | Crítica | Interface | Código | Corrigido |
| DEF-07 | FO-30; CT-08 | A5 | Um fechamento recusado pelo servidor interrompia a fila do técnico, e os seguintes nunca eram enviados. | Alta | Funcional | Código | Corrigido |
| DEF-08 | FO-31 | A5 | Com resposta "ja_fechado" (ex.: reenvio depois de resposta perdida), o item ficava na fila para sempre. | Alta | Funcional | Código | Corrigido |

## Como reproduzir (antes da correção)

Todos os defeitos de F-01 a F-08 se reproduzem com `npm run test:uc05` no commit `test(UC05): especifica o fechamento de OS em testes (fase vermelha)`. Exemplos pela API:

- **F-01:** `POST /api/chamados/IC-.../fechamento` com token de técnico e o corpo sem `foto_reparo_base64` → 201 (esperado: 400).
- **F-04:** fechamento com `materiais_os: [{ nome: 'Cabo (m)', quantidade: 2 }, { nome: 'Cabo (m)', quantidade: 3 }]` → saldo do cabo cai 5, e `fechamento_materiais` guarda 3.
- **F-06:** o mesmo fechamento com `data_fechamento: '13/11/2026, 10:30'` → 500 (esperado: 400).
- **DEF-02:** com `ILUMINA_API_URL` configurada, fechar um chamado pelo painel → aviso "Falha ao registrar. [object Object]" e nada gravado (caixa-preta CT-04, [03-caixa-preta-antes.json](evidencias/03-caixa-preta-antes.json)).

## Defeitos do UC05 que continuam abertos

| ID | Descrição | Onde está registrado |
|---|---|---|
| F-10 | `fecharChamado` da tela com 55 caminhos (RNF05). A correção é migrar o formulário para a camada já existente em `public/tecnico/js` (`Close.js`, `FecharChamado.js`, `SincronizarBaixas.js`). | Este registro |
| DEF-09 | Sessão expirada com fechamento na fila: o app não pede o PIN na hora, e depois do novo login a fila não é enviada (CT-10). | Catálogo dos testes offline |
| DEF-10 | Chamado fechado sem internet continua na lista e pode ser fechado de novo (CT-11). | Catálogo dos testes offline |
