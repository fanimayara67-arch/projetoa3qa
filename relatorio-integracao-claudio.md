# Relatório de QA — Testes de Integração Ponta a Ponta (Sistema Ilumina Coruripe)

* **Responsável (QA):** Cláudio Rocha Souza
* **Repositório / Branch:** `projetoa3qa` (`test/integracao-sistema`)
* **Artefato Produzido:** `server/tests/integracao-sistema.test.js` (`INT-01` a `INT-15`)
* **Resultado Consolidado:** 310 testes executados | 300 aprovados | 0 falhas | 10 defeitos catalogados (`todo`)

---

### Etapa 1: Sincronização do Ambiente, Integração de CI e Diagnóstico da Suíte Base

**Atividades Realizadas:**
* **Integração da Infraestrutura de Testes (PR #12):** Revisão e mesclagem (*merge*) do Pull Request `#12` (`ci/github-actions-testes`) para a branch `main`, incorporando o fluxo de execução automática no GitHub Actions com instância MySQL 8 real e as atualizações consolidadas da equipe.
* **Atualização Local e Criação de Branch:** Sincronização do repositório local (`projetoa3qa`) com os 67 *commits* mais recentes da `main` e criação da branch dedicada `test/integracao-sistema` para o desenvolvimento dos testes de integração ponta a ponta do sistema.
* **Execução da Linha de Base (*Baseline*):** Execução da suíte atual via `npm test` (`node --test`) no diretório `server/` para verificar a estabilidade do ambiente antes da criação dos novos casos de teste.

**Resultados Obtidos:**
* De um total de **295 testes** executados em 3 suítes, **282 foram aprovados**, **9 permanecem marcados como `todo`** (defeitos conhecidos já mapeados pela equipe, como DEF-01, DEF-03, DEF-04, DEF-11 e DEF-12) e **4 apresentaram falha** (`CT-14`, `CT-20`, `CT-21` e `CT-24`).
* **Diagnóstico das Falhas:** Os testes estruturais confirmaram que a conexão com o banco MySQL local está ativa e com o esquema criado (`CT-18` e `CT-19` aprovados). As 4 falhas ocorreram exclusivamente pela falta de carga inicial de dados de autenticação (nenhum técnico ativo com PIN `"0123"` cadastrado na tabela `usuarios`), etapa prevista pelo script `scripts/setup-auth-mysql.js`.

---

### Etapa 2: Provisionamento de Dados de Autenticação e Estabilização da Linha de Base

**Atividades Realizadas:**
* **Carga Inicial no MySQL Local:** Execução do script `node scripts/setup-auth-mysql.js` no diretório `server/` para assegurar a estrutura das tabelas de autenticação (`usuarios`, `sessoes` e `tentativas_login`) e cadastrar o usuário técnico ativo padrão (PIN `"0123"` armazenado com hash `scrypt`).
* **Reexecução da Suíte de Testes:** Nova execução completa via `npm test` (`node --test`) para verificar a resolução das falhas identificadas no diagnóstico inicial.

**Resultados Obtidos:**
* O script de configuração foi concluído com êxito (`OK: Tabelas criadas e tecnico ativo cadastrado com PIN 0123.`).
* No total de **295 testes** executados, as **4 falhas anteriores foram completamente sanadas** (`CT-14`, `CT-20`, `CT-21` e `CT-24` aprovados), estabilizando a linha de base em **286 testes aprovados, 0 falhas e 9 itens marcados como `todo`** (defeitos previamente catalogados pela equipe).
* Com o ambiente local 100% validado e sem regressões, a branch `test/integracao-sistema` ficou apta para o mapeamento da estrutura do servidor e o desenvolvimento dos testes de integração ponta a ponta.

---

### Etapa 3: Mapeamento Arquitetural e Implementação da Suíte de Integração Ponta a Ponta

**Atividades Realizadas:**
* **Mapeamento de Contratos e Camadas:** Inspeção completa da estrutura do servidor (`src/app.js`, rotas, *controllers*, *services*, *repositories* e *middlewares*) e do *workflow* de integração contínua (`.github/workflows/testes.yml`). Foram mapeados **17 endpoints REST** distribuídos em cinco domínios funcionais: Autenticação e Controle de Acesso (RBAC), Chamados e Tentativas, Postes (QR Code público e histórico), Almoxarifado (estoque e missões) e Fechamentos (campo transacional ACID e administrativo).
* **Compatibilidade com Ambiente de CI/CD:** Identificou-se que o banco `mysql:8.0` provisionado no GitHub Actions inicia apenas com as tabelas de autenticação (`setup-auth-mysql.js`). Para garantir portabilidade total entre o ambiente local e o *pipeline* de Pull Request, a suíte foi estruturada para assegurar de forma idempotente (`CREATE TABLE IF NOT EXISTS`) as 8 tabelas operacionais (`postes`, `chamados`, `fechamentos`, `tentativas`, `itens_estoque`, `fechamento_materiais`, `missoes` e `missao_itens`) antes da execução.
* **Criação de `server/tests/integracao-sistema.test.js`:** Implementação de **15 casos de teste de integração real (`INT-01` a `INT-15`)** exercitando requisições HTTP reais contra uma instância efêmera do servidor conectada ao MySQL (`db_iluminacao`), com massa de dados dedicada e rotina automática de limpeza (`limparDadosDeTeste`) antes e após os testes.

---

### Etapa 4: Execução Inicial da Nova Suíte e Diagnóstico de Falhas

**Resultados Obtidos (`npm test`):**
* A suíte total passou de 295 para **310 testes** (4 suítes), registrando **296 aprovados, 5 falhas e 9 itens `todo`**.
* Dos 15 novos testes ponta a ponta, **10 foram aprovados imediatamente** (`INT-01` a `INT-05`, `INT-07`, `INT-08`, `INT-10`, `INT-11` e `INT-15`), validando login com hash `scrypt` e geração de sessão no MySQL, bloqueio de acesso por perfil (HTTP `401`/`403`), abertura pública de chamado, idempotência por UUID, registro de tentativas de atendimento, CRUD de estoque, *rollback* transacional por saldo insuficiente e tratamento controlado de erros HTTP (`400`/`404`).

**Diagnóstico das 5 Falhas Identificadas:**
1. **Formato do Identificador de Poste (`INT-06`, `INT-09` e `INT-12`):** O identificador utilizado na massa de teste (`P-INT-9901`) não atendeu à regra de normalização de placa/QR Code da camada de domínio, gerando HTTP `400` na consulta pública (`/api/postes/:id/situacao`) e impedindo o vínculo da ficha técnica do poste no fechamento em campo.
2. **Contrato de Persistência de Missões (`INT-13` e efeito cascata no `INT-14`):** A requisição `POST /api/missoes` retornou HTTP `503` (divergência entre o *schema* criado no setup do teste e a consulta/validação do módulo de missões), impedindo o débito de 6 unidades no estoque. Consequentemente, o teste `INT-14` leu o saldo anterior (`8` em vez de `2`), embora tenha confirmado que o fechamento administrativo não altera o saldo do almoxarifado.

---

### Etapa 5: Triagem de Falhas e Identificação de Defeito Real de Integração

**Atividades Realizadas:**
* **Inspeção das Regras de Domínio (`Poste.js` e `Missao.js`):** Análise das validações puras e do mapeamento de exceções SQL para códigos HTTP no middleware `tratarErros.js`.
* **Auditoria do Esquema Físico no MySQL (`SHOW COLUMNS`):** Confronto direto entre a estrutura real das tabelas `missoes` e `missao_itens` no banco `db_iluminacao` e as queries parametrizadas em `EstoqueRepository.js`.

**Classificação Técnica das Falhas (Triagem QA):**
1. **Erro de Massa de Dados no Script de Teste (`INT-06`, `INT-09` e `INT-12`):**
   * **Causa-Raiz:** A função `normalizarPosteId` em `src/domain/Poste.js` valida identificadores estritamente pelo padrão `^P-\d{1,6}$`. O código `P-INT-9901` utilizado na massa de teste continha letras no segmento numérico, sendo descartado pelo normalizador e gerando HTTP `400` na consulta pública (`/api/postes/:id/situacao`) e omissão no vínculo técnico do fechamento.
   * **Ação Corretiva:** Substituir o identificador na suíte de integração por um código válido no padrão numérico (`P-9901`).

2. **Defeito Real de Integração no Módulo de Almoxarifado (`INT-13` — Novo Defeito Catalogado):**
   * **Causa-Raiz:** Divergência de contrato entre a camada de persistência e o esquema físico do MySQL. A tabela oficial `missoes` define a coluna `data_missao` (`DATE NOT NULL`), enquanto `src/infrastructure/repositories/EstoqueRepository.js` executa `INSERT INTO missoes (data, ...)` e `ORDER BY m.data DESC`.
   * **Por que escapou aos testes anteriores:** Os testes existentes do módulo (`tests/almoxarifado/estoque-mysql.test.js`) validam o repositório utilizando dublês simulados em memória, sem submeter as consultas ao motor MySQL real.
   * **Impacto Sistêmico:** Em ambiente real, as rotas `POST /api/missoes` e `GET /api/missoes` disparam `ER_BAD_FIELD_ERROR` (*Unknown column 'data' in 'field list'*), que é interceptado por `tratarErros.js` e devolvido ao cliente como HTTP `503` (`SERVICO_INDISPONIVEL`).

3. **Falha em Cascata na Asserção de Saldo (`INT-14`):**
   * **Causa-Raiz:** O fechamento administrativo (`POST /api/chamados/:protocolo/fechamento-admin`) foi concluído corretamente e preservou o saldo do estoque sem movimentação, mas falhou na asserção de quantidade (`8 !== 2`) em decorrência direta da falha anterior (`INT-13`), que não debitou as 6 unidades da saída de missão.

---

### Etapa 6: Refatoração da Massa de Dados, Catalogação de Defeito e Validação Final

**Atividades Realizadas:**
* **Adequação ao Domínio de Postes (`INT-06`, `INT-09` e `INT-12`):** Substituição do identificador `P-INT-9901` por `P-9901` em `tests/integracao-sistema.test.js`, alinhando a massa de teste ao padrão `^P-\d{1,6}$` exigido por `Poste.normalizarPosteId`.
* **Isolamento de Estado (`INT-14`):** Ajuste na asserção de saldo do fechamento administrativo para capturar o saldo imediatamente anterior à operação (`saldoAntes`), eliminando dependência sequencial em relação ao caso de teste `INT-13`.
* **Catalogação Formal do Defeito `DEF-13` (`INT-13`):** Marcação do cenário `INT-13` com `{ todo: 'Defeito DEF-13 - EstoqueRepository usa coluna data em vez de data_missao na tabela missoes' }`, seguindo o padrão adotado nos demais defeitos mapeados no projeto (`DEF-01` a `DEF-12`). O teste continua executando e evidenciando o retorno HTTP `503` sem bloquear o *check* de integração contínua.

**Resultado Final da Execução (`npm test`):**
* **Total de Testes:** 310 (distribuídos em 4 suítes)
* **Aprovados (`pass`):** 300 (incluindo 14 fluxos ponta a ponta da nova suíte de integração)
* **Falhas (`fail`):** 0
* **Defeitos Catalogados (`todo`):** 10 (9 pré-existentes + 1 novo defeito de integração `DEF-13`)
* **Tempo Total de Execução:** ~3,6 s

---

### Síntese de Cobertura e Recomendações para a Equipe

A nova suíte (`server/tests/integracao-sistema.test.js`) validou de forma integrada as camadas **HTTP (Express) $\rightarrow$ Middlewares (Auth/RBAC/Validação) $\rightarrow$ Services $\rightarrow$ Repositories $\rightarrow$ MySQL (`db_iluminacao`)**:

1. **Fluxos Validados com Sucesso (14 cenários):**
   * Autenticação com hash `scrypt` e persistência de sessão Bearer (`INT-01`, `INT-02`).
   * Controle de acesso por perfil (`tecnico`, `gestor`, `almoxarife`) retornando HTTP `401` e `403` (`INT-03`).
   * Abertura pública de chamados pelo cidadão, listagem, busca por protocolo e idempotência por UUID (`INT-04`, `INT-05`).
   * Consulta pública de situação de poste via QR Code e vínculo de chamado aberto (`INT-06`).
   * Registro de tentativas frustradas em campo e consolidação no relatório gerencial (`INT-07`).
   * CRUD completo de materiais no almoxarifado (`INT-08`).
   * Fechamento em campo em transação ACID única: encerramento do chamado, baixa de saldo no estoque e atualização da ficha técnica do poste (`INT-09`).
   * Idempotência de fechamento por `operacao_id`, bloqueio de concorrência com HTTP `409` e *rollback* atômico em caso de saldo insuficiente (`INT-10`, `INT-11`).
   * Relatórios de chamados fechados, listagem de postes e histórico técnico por poste (`INT-12`).
   * Fechamento administrativo pelo gestor sem movimentação de estoque (`INT-14`) e tratamento controlado de erros HTTP `400`/`404` (`INT-15`).

2. **Ação Corretiva Recomendada ao Time de Desenvolvimento (`DEF-13`):**
   * **Arquivo:** `server/src/infrastructure/repositories/EstoqueRepository.js` (funções `criarMissaoComItens` e `listarMissoes`).
   * **Correção:** Substituir as referências à coluna `data` por `data_missao` nas instruções SQL sobre a tabela `missoes`, alinhando o repositório ao esquema físico do banco MySQL e removendo a flag `todo` do teste `INT-13` após o ajuste.