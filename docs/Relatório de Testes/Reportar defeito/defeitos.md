# Registro de defeitos — UC01 Reportar defeito em poste

Defeitos encontrados pelos casos de teste do UC01. Cada um foi exposto por um teste escrito antes da correção (fase vermelha do TDD, evidência em [03-tdd-vermelho.txt](evidencias/03-tdd-vermelho.txt)) e corrigido em um commit próprio.

Classificação usada: **severidade** (crítica, alta, média, baixa), **tipo** (funcional, dados, interface, segurança, desempenho, usabilidade) e **origem** (requisito, projeto, código).

| ID | Caso de teste | Requisito | Descrição | Severidade | Tipo | Origem | Situação |
|---|---|---|---|---|---|---|---|
| D-01 | RP-02 (servidor) | RF01, UC01 passo 6 | A API aceita reporte sem foto. O app exige a foto, mas qualquer cliente que chame a API direto cria chamado sem foto. | Alta | Funcional | Código | Aberto |
| D-02 | RP-03 | RF01, UC01 passo 3 | O tipo de defeito não é validado: a lista `TIPOS_VALIDOS` existia, mas não era usada. A API aceita qualquer texto (ex.: `POSTE_CAIU`). A lista também divergia do app (faltava `queimada`, sobrava `fios_soltos`). | Média | Dados | Código | Aberto |
| D-03 | RP-06 | UC01 passo 5 | A descrição não tem limite no servidor. O limite de 500 caracteres só existe no campo da tela. | Média | Dados | Código | Aberto |
| D-04 | RP-07 | RNF02 | A API aceita foto de até 5 MB; o RNF02 limita a 2 MB. | Média | Desempenho | Código | Aberto |
| D-05 | RP-15 | CA01 | Reporte pelo QR de um poste sem coordenadas cadastradas, feito sem GPS, cria chamado sem localização. | Alta | Funcional | Projeto | Aberto |
| D-06 | RP-16 | UC01 passo 2, A3 | Precisão do GPS desconhecida (`null`) ou negativa é classificada como "Excelente". | Baixa | Interface | Código | Aberto |

## Detalhes para abrir as issues no GitHub

Cada linha acima vira uma issue com o modelo `.github/ISSUE_TEMPLATE/defeito.md`. Os passos para reproduzir são os próprios testes:

```bash
npm run test:uc01
```

| ID | Resultado esperado | Resultado obtido (antes da correção) |
|---|---|---|
| D-01 | Reporte sem foto recusado com 400 | Aceito (`valido: true`) |
| D-02 | `POSTE_CAIU`, `fios_soltos`, `Poste apagado` recusados | Aceitos |
| D-03 | Descrição de 501 caracteres recusada | Aceita (até 5.000 testados) |
| D-04 | Foto de 2 MB + 1 byte recusada | Aceita |
| D-05 | Recusado com 400 e nenhum chamado gravado | Chamado gravado com latitude e longitude nulas |
| D-06 | `null`, `NaN`, `-1` classificados como imprecisa (`poor`) | `null` e `-1` classificados como `excellent` |
