# Registro de defeitos — UC01 Reportar defeito em poste

Defeitos encontrados durante os testes do UC01. D-01 a D-06 foram expostos por testes escritos antes da correção (fase vermelha do TDD, evidência em [03-tdd-vermelho.txt](evidencias/03-tdd-vermelho.txt)). D-07 e D-08 foram encontrados por análise estática da complexidade ([05-complexidade.txt](evidencias/05-complexidade.txt)). Cada correção está em um commit próprio, com o ID do defeito no título (ex.: `fix(UC01): ... (D-01)`).

Classificação usada: **severidade** (crítica, alta, média, baixa), **tipo** (funcional, dados, interface, segurança, desempenho, usabilidade, manutenibilidade) e **origem** (requisito, projeto, código).

| ID | Encontrado por | Requisito | Descrição | Severidade | Tipo | Origem | Situação |
|---|---|---|---|---|---|---|---|
| D-01 | RP-02 (servidor) | RF01, UC01 passo 6 | A API aceitava reporte sem foto. O app exige a foto, mas qualquer cliente que chamasse a API direto criava chamado sem foto. | Alta | Funcional | Código | Corrigido |
| D-02 | RP-03 | RF01, UC01 passo 3 | O tipo de defeito não era validado: a lista `TIPOS_VALIDOS` existia, mas não era usada, e a API aceitava qualquer texto (ex.: `POSTE_CAIU`). A lista também divergia do app (faltava `queimada`, sobrava `fios_soltos`). | Média | Dados | Código | Corrigido |
| D-03 | RP-06 | UC01 passo 5 | A descrição não tinha limite no servidor; o limite de 500 caracteres só existia no campo da tela. | Média | Dados | Código | Corrigido |
| D-04 | RP-07 | RNF02 | A API aceitava foto de até 5 MB; o RNF02 limita a 2 MB. | Média | Desempenho | Código | Corrigido |
| D-05 | RP-15 | CA01 | Reporte pelo QR de um poste sem coordenadas cadastradas, feito sem GPS, criava chamado sem localização. | Alta | Funcional | Projeto | Corrigido |
| D-06 | RP-16 | UC01 passo 2, A3 | Precisão do GPS desconhecida (`null`) ou negativa era classificada como "Excelente". | Baixa | Interface | Código | Corrigido |
| D-07 | Análise estática | RNF05 | Funções do UC01 no servidor acima de 10 caminhos: `validarNovoChamado` (14), `coordenadasValidas` (13) e o bloco da transação de `criarChamado` (19). | Baixa | Manutenibilidade | Código | Corrigido |
| D-08 | Análise estática | RNF05 | No app do cidadão, `criarReport` (24) e `validarReport` (12) passam de 10 caminhos. | Baixa | Manutenibilidade | Código | Aberto |

## Resultado esperado e obtido

Os passos para reproduzir D-01 a D-06 são os próprios testes (`npm run test:uc01`); D-07 e D-08 são reproduzidos com o comando do arquivo [05-complexidade.txt](evidencias/05-complexidade.txt).

| ID | Resultado esperado | Resultado obtido (antes da correção) |
|---|---|---|
| D-01 | Reporte sem foto recusado com 400 | Aceito (`valido: true`) |
| D-02 | `POSTE_CAIU`, `fios_soltos`, `Poste apagado` recusados | Aceitos |
| D-03 | Descrição de 501 caracteres recusada | Aceita (até 5.000 testados) |
| D-04 | Foto de 2 MB + 1 byte recusada | Aceita |
| D-05 | Recusado com 400 e nenhum chamado gravado | Chamado gravado com latitude e longitude nulas |
| D-06 | `null`, `NaN`, `-1` classificados como imprecisa (`poor`) | `null` e `-1` classificados como `excellent` |
| D-07 | Complexidade ≤ 10 por função | 14, 13 e 19 (22 e 20 depois das correções D-01 a D-05) |
| D-08 | Complexidade ≤ 10 por função | 24 e 12 |

## Para abrir as issues no GitHub

Cada linha da primeira tabela vira uma issue com o modelo `.github/ISSUE_TEMPLATE/defeito.md` e a etiqueta `defeito`. Para os corrigidos, cite na issue o commit com o ID do defeito no título e feche-a; o D-08 fica aberto.
