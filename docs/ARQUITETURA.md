# Arquitetura Oficial — Ilumina Coruripe

> **Estado atual:** o pool usa MySQL e os [itens 4 e 6 da Sprint 2](07-SPRINT2-ROTA-E-FECHAMENTO-ADMINISTRATIVO.md) reutilizam as camadas, com integração da tela à API e testes específicos. O esquema definitivo ainda precisa de alinhamento e preparação; nenhuma tabela foi criada. Parte das consultas e os exemplos PostgreSQL abaixo pertencem à implementação anterior. Consulte também [Conexão local com MySQL](06-CONEXAO-MYSQL.md).

> **Novo no projeto?** Comece pelo [**Guia de Desenvolvimento para Iniciantes (`docs/05-GUIA-PARA-INICIANTES.md`)**](05-GUIA-PARA-INICIANTES.md), que explica passo a passo como o sistema funciona com exemplos práticos.
>
> **Série detalhada de referência:**
> [1. MVC](01-ARQUITETURA-MVC.md) · [2. Camadas](02-ARQUITETURA-EM-CAMADAS.md) · [3. Cliente-Servidor](03-ARQUITETURA-CLIENTE-SERVIDOR.md) · [4. Orientada a Serviços](04-ARQUITETURA-ORIENTADA-A-SERVICOS.md) · [**5. Guia para Iniciantes**](05-GUIA-PARA-INICIANTES.md)

---

## 1. Decisão Arquitetural: Camadas em Monólito Modular (Cliente-Servidor 3-Tier)

A arquitetura aplicada ao **Ilumina Coruripe** combina a topologia física **Cliente-Servidor em 3 Níveis (3-Tier)** com a **Arquitetura em Camadas** (Apresentação, Aplicação, Domínio e Infraestrutura/Persistência), mantendo os dois PWAs em **HTML, CSS e JavaScript puro (ES Modules)** e o backend em **Node.js + PostgreSQL**.

### Comparativo das 3 Abordagens Avaliadas

| Critério | 1. MVC Dual (Cliente + Servidor) | 2. Orientada a Serviços (SOA) | 3. Camadas em Monólito Modular *(Aplicada)* |
| --- | --- | --- | --- |
| **Foco de Organização** | Separação básica entre Tela, Controle e Dados | Divisão física por capacidade de negócio (7 serviços) | Separação rigorosa entre HTTP/UI, Casos de Uso, Domínio Puro e SQL/Infra |
| **Transação (Chamado + Poste + Estoque)** | Possível, porém acopla Models ou incha Controllers | **Não há** transação única (exige consistência eventual e *Outbox*) | **Nativa e limpa** (controlada na camada de Aplicação/Services com ACID) |
| **Testabilidade Unitária (QA)** | Média (Model no servidor mistura regra e SQL) | Alta por serviço, mas exige testes de contrato e E2E complexos | **Excelente** (Domínio e Casos de Uso 100% isolados de banco, rede e DOM) |
| **Complexidade de Deploy e Custos** | Baixa (1 Front estático + 1 API Node + 1 SQL) | **Alta** (Gateway + 7 APIs Node + esquemas isolados + mensageria) | **Baixa** (1 Front estático + 1 API Node + 1 SQL) |
| **Adequação ao Escopo Atual** | Boa para início rápido, mas degrada em fluxos transacionais | Baixa (superdimensionada para a equipe e volume municipal) | **Altíssima** (equilíbrio exato entre rigor técnico, QA e simplicidade operacional) |

---

## 2. Visão em 3 Níveis (Implantação) e 5 Camadas (Código)

```text
NÍVEL 1: CLIENTES PWA (Netlify / Vercel)          NÍVEL 2: SERVIDOR NODE.JS (Render / Railway / VPS)      NÍVEL 3: DADOS
┌─────────────────────────────────────────┐       ┌──────────────────────────────────────────────────┐
│ 1. Apresentação: HTML/CSS, Views, Ctrls │       │ 1. Apresentação: Routes, Middlewares, Ctrls, View│
│ 2. Aplicação: EnviarReporte, SincFila   │ HTTPS │ 2. Aplicação: ChamadoService, FechamentoService… │    ┌───────────────┐
│ 3. Domínio: Report, Ticket, Close       │ ────► │ 3. Domínio: Chamado, Poste, Fechamento, Estoque  │───►│ PostgreSQL    │
│ 4. Infra: ApiClient, IdbRepos, GPS, Cam │ ◄──── │ 4. Infra/Persistência: SQL Repos, FotoStorage,   │    ├───────────────┤
│ 5. Dados Locais: IndexedDB, localStorage│ JSON  │                        HashPin, Token            │───►│ Bucket Fotos  │
└─────────────────────────────────────────┘       └──────────────────────────────────────────────────┘    └───────────────┘
```

---

## 3. Estrutura de Diretórios Implementada

```text
ilumina-coruripe/
├── public/                                  # Front-end unificado (mesma origem para preservar QRs)
│   ├── index.html                           # Shell HTML do Cidadão
│   ├── sw.js                                # Service Worker Cidadão (ignora /tecnico/* e /api/*)
│   ├── js/cidadao/
│   │   ├── main.js                          # Ponto de entrada ES Module do Cidadão
│   │   ├── presentation/                    # FormView.js, GpsView.js, ReportController.js
│   │   ├── application/                     # EnviarReporte.js, SincronizarFila.js
│   │   ├── domain/                          # Report.js (validação pura, estados da fila, backoff)
│   │   └── infrastructure/                  # IndexedDbReportRepository.js, GeolocationService.js
│   ├── tecnico/
│   │   ├── index.html                       # Shell HTML do Técnico/Gestor/Almoxarife
│   │   ├── sw.js                            # Service Worker Técnico (escopo /tecnico/)
│   │   └── js/
│   │       ├── main.js                      # Ponto de entrada ES Module do Técnico
│   │       ├── presentation/                # ListView.js, MapView.js, CloseFormView.js, StockView.js, Controllers.js
│   │       ├── application/                 # FecharChamado.js, SincronizarBaixas.js, CarregarRota.js
│   │       ├── domain/                      # Ticket.js, Close.js, Attempt.js, StockItem.js
│   │       └── infrastructure/              # TicketCache.js, CloseQueue.js, PhotoCache.js
│   └── shared/
│       └── infrastructure/                  # ApiClient.js (fetch único com AbortController), idb.js, config.js
│
├── server/                                  # Back-end Node.js em Camadas
│   ├── src/
│   │   ├── presentation/
│   │   │   ├── routes/                      # chamados.routes.js, postes.routes.js, auth.routes.js, estoque.routes.js
│   │   │   ├── middlewares/                 # autenticar.js, validar.js, limitarTentativas.js, tratarErros.js
│   │   │   ├── controllers/                 # ChamadoController.js, FechamentoController.js, PosteController.js, AuthController.js, EstoqueController.js
│   │   │   └── views/                       # resposta.js, chamado.view.js (sanitiza JSON de saída)
│   │   ├── application/
│   │   │   ├── services/                    # ChamadoService.js, FechamentoService.js, AuthService.js, EstoqueService.js, PosteService.js
│   │   │   └── errors/                      # NaoEncontrado.js (404), Conflito.js (409), SemPermissao.js (403), index.js
│   │   ├── domain/                          # Entidades e regras puras (Chamado.js, Poste.js, Fechamento.js, Tentativa.js, ItemEstoque.js, Missao.js)
│   │   ├── infrastructure/
│   │   │   ├── database/                    # pool.js, transacao.js (wrapper de BEGIN/COMMIT/ROLLBACK)
│   │   │   ├── repositories/                # ChamadoRepository.js, FechamentoRepository.js, PosteRepository.js, EstoqueRepository.js, TentativaRepository.js, UsuarioRepository.js, SessaoRepository.js
│   │   │   ├── storage/                     # FotoStorage.js (salva foto em disco/bucket e retorna URL)
│   │   │   └── security/                    # hashPin.js (scrypt + timingSafeEqual), gerarToken.js
│   │   └── app.js
│   ├── database/migrations/                 # 001_inicial.sql (tabelas com UUID, UNIQUE, CHECK saldo >= 0)
│   └── tests/                               # Testes unitários e de aplicação (domain.test.js, services.test.js)
├── docs/                                    # Documentação de Arquitetura + Guia para Iniciantes
└── netlify.toml / vercel.json               # Redirects (/p/:id -> /?poste=:id e proxy /api/*)
```

---

## 4. Garantias Técnicas e de Qualidade (QA)

1. **Transações ACID e Fim de Conflitos em Campo:** [`FechamentoService.fecharChamado()`](../server/src/application/services/FechamentoService.js) executa dentro de [`emTransacao()`](../server/src/infrastructure/database/transacao.js) (`BEGIN ... COMMIT / ROLLBACK`). O uso de `SELECT ... FOR UPDATE` trava o registro do chamado no PostgreSQL durante a operação: se dois técnicos enviarem a baixa simultaneamente, o segundo aguarda a transação do primeiro e recebe `409 Conflict`, impedindo sobrescritas silenciosas e garantindo que o estoque nunca fique dessincronizado.
2. **Offline-First com Idempotência e Backoff Exponencial:** Tanto o Cidadão ([`SincronizarFila.js`](../public/js/cidadao/application/SincronizarFila.js)) quanto o Técnico ([`SincronizarBaixas.js`](../public/tecnico/js/application/SincronizarBaixas.js)) gravam primeiro no `IndexedDB` local e sincronizam enviando UUIDs únicos (`chamados.id` e `fechamentos.operacao_id`). Reenvios após *timeout* de rede batem em `ON CONFLICT DO UPDATE` e retornam sucesso sem duplicar registros.
3. **Segurança de Autenticação:** PINs nunca são salvos em texto puro ([`hashPin.js`](../server/src/infrastructure/security/hashPin.js) aplica `scrypt` com *salt* aleatório e comparação em tempo constante), sessões usam tokens de 256 bits no header `Authorization: Bearer <token>` e tentativas incorretas por IP são bloqueadas com HTTP `429` ([`AuthService.js`](../server/src/application/services/AuthService.js)).
4. **Links de plaquetas antigas:** A funcionalidade de QR Code foi removida. As rotas `/?poste=P-0001` e `/p/:id` continuam respondendo apenas para que as plaquetas já instaladas abram o formulário comum, que exige GPS.
