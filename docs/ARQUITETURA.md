# Arquitetura Oficial — Ilumina Coruripe

> **Novo no projeto?** Comece pelo [Guia para Iniciantes](05-GUIA-PARA-INICIANTES.md). Para configurar o banco local, veja [Conexão local com MySQL](06-CONEXAO-MYSQL.md).

---

## 1. Decisão: camadas em monólito modular, em cliente-servidor de 3 níveis

O Ilumina Coruripe combina duas ideias:

- **Cliente-servidor em 3 níveis (3-tier):** é a distribuição física. Os PWAs rodam no celular, a API Node.js roda num servidor e os dados ficam no MySQL. O celular nunca fala direto com o banco.
- **Arquitetura em camadas:** é a organização do código. Tanto nos PWAs quanto na API, o código se divide em Apresentação, Aplicação, Domínio e Infraestrutura. Na API, as camadas rodam num único programa Node.js (monólito modular).

O **MVC** continua presente dentro da camada de Apresentação: rotas e controllers recebem a requisição, e as views formatam o JSON de saída. No navegador, os controllers e as `*View.js` ligam a tela aos casos de uso.

Tecnologias:

| Parte | Tecnologia |
|---|---|
| PWAs (cidadão e técnico) | HTML, CSS e JavaScript puro (ES Modules), IndexedDB e service worker, sem framework |
| API | Node.js ≥ 18 com o módulo `http` nativo e um roteador próprio; dependências: `mysql2` e `dotenv` |
| Banco | MySQL 8 |
| Hospedagem | Site estático na Vercel ou na Netlify; API no Render |

### Comparativo das três abordagens avaliadas

O grupo comparou três organizações antes de escolher. Os estudos completos de cada alternativa foram retirados da pasta `docs/` e continuam no histórico do git.

| Critério | MVC dual (cliente + servidor) | Orientada a serviços (SOA) | Camadas em monólito modular *(aplicada)* |
| --- | --- | --- | --- |
| **Organização** | Separação básica entre tela, controle e dados | Divisão por capacidade de negócio (7 serviços) | Separação entre HTTP/tela, casos de uso, domínio puro e SQL/infraestrutura |
| **Transação (chamado + poste + estoque)** | Possível, mas acopla os Models ou incha os Controllers | Não há transação única (exige consistência eventual) | Nativa, controlada pela camada de Aplicação com ACID |
| **Testabilidade (QA)** | Média: o Model no servidor mistura regra e SQL | Alta por serviço, mas exige testes de contrato e E2E complexos | Alta: domínio e casos de uso testados sem banco, rede ou DOM |
| **Deploy e custo** | Baixo (1 front estático + 1 API + 1 banco) | Alto (gateway + 7 APIs + esquemas isolados + mensageria) | Baixo (1 front estático + 1 API + 1 banco) |
| **Adequação ao escopo** | Boa para começar, mas degrada nos fluxos com transação | Baixa: grande demais para a equipe e o volume do município | Alta: equilíbrio entre rigor técnico, testes e simplicidade |

---

## 2. Visão em 3 níveis (implantação) e camadas (código)

```text
NÍVEL 1: CLIENTES PWA                      NÍVEL 2: API NODE.JS (Render)                     NÍVEL 3: DADOS
(site estático na Vercel / Netlify)
┌──────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
│ Apresentação: HTML/CSS, Views, Ctrls │   │ Apresentação: rotas, middlewares, ctrls,     │
│ Aplicação: EnviarReporte,            │   │               views                          │   ┌──────────────────────┐
│            SincronizarFila,          │   │ Aplicação: ChamadoService, FechamentoService,│   │ MySQL 8              │
│            FecharChamado…            │──►│            AuthService, EstoqueService,      │──►│ 11 tabelas de negócio│
│ Domínio: Report, Ticket, Close…      │◄──│            PosteService                      │◄──│ + tabela `fotos`     │
│ Infraestrutura: ApiClient, IndexedDB,│   │ Domínio: Chamado, Poste, Fechamento…         │   └──────────────────────┘
│                 GPS, AcoesApiNode    │   │ Infraestrutura: repositórios SQL, transação, │   ┌──────────────────────┐
│ Dados locais: IndexedDB, localStorage│   │                 FotoStorage, hashPin, token  │──►│ Pasta de fotos       │
└──────────────────────────────────────┘   └──────────────────────────────────────────────┘   │ (só em disco local)  │
          HTTPS + JSON, mesma origem: o site repassa /api/* e /uploads/* para a API            └──────────────────────┘
```

**Mesma origem:** os PWAs chamam `/api/...` e mostram fotos de `/uploads/fotos/...` no próprio domínio do site. A Vercel (`vercel.json`) e a Netlify (`netlify.toml`) repassam esses caminhos para a API no Render. Por isso não há CORS, e o service worker não intercepta a API.

**Configuração do front:** `npm run build` (`scripts/build-config.mjs`) gera `public/shared/config.js` e `public/shared/infrastructure/config.js` a partir de `ILUMINA_API_URL`, `ILUMINA_ENDPOINT_CIDADAO` e `ILUMINA_ENDPOINT_TECNICO`. Esses arquivos não ficam no git.

### Backend antigo: Google Apps Script

Antes da API Node, o servidor era um Google Apps Script com os dados numa planilha. As telas ainda sabem falar com ele: se a configuração apontar para o Apps Script, as ações vão no formato antigo (`{ action: ... }`); se apontar para a API Node, o adaptador [`AcoesApiNode.js`](../public/tecnico/js/infrastructure/AcoesApiNode.js) leva cada ação para a rota REST. O código do Apps Script não está versionado (veja [`apps-script/README.md`](../apps-script/README.md)), por isso não tem histórico nem rollback.

---

## 3. Estrutura de diretórios

```text
projetoa3qa/
├── public/                                  # Front-end: os dois PWAs, servidos no mesmo domínio
│   ├── index.html                           # Tela do cidadão
│   ├── sw.js                                # Service worker do cidadão (não intercepta /tecnico/ nem /api/)
│   ├── js/cidadao/
│   │   ├── main.js                          # Ponto de entrada (ES Module)
│   │   ├── presentation/                    # FormView.js, GpsView.js, ReportController.js
│   │   ├── application/                     # EnviarReporte.js, SincronizarFila.js
│   │   ├── domain/                          # Report.js (validação, protocolo, estados da fila, backoff)
│   │   └── infrastructure/                  # IndexedDbReportRepository.js, GeolocationService.js
│   ├── tecnico/
│   │   ├── index.html                       # Tela do técnico, gestor e almoxarife
│   │   ├── sw.js                            # Service worker do técnico (escopo /tecnico/)
│   │   ├── print/                           # CSS de impressão dos relatórios
│   │   └── js/
│   │       ├── main.js                      # Ponto de entrada (ES Module)
│   │       ├── presentation/                # ListView, MapView, CloseFormView, StockView, Controllers
│   │       ├── application/                 # FecharChamado, SincronizarBaixas, CarregarRota, CarregarPainel,
│   │       │                                #   FecharAdministrativamente
│   │       ├── domain/                      # Ticket, Close, AdminClose, Attempt, StockItem
│   │       └── infrastructure/              # TicketCache, CloseQueue, PhotoCache, AcoesApiNode
│   └── shared/
│       └── infrastructure/                  # ApiClient.js (fetch com timeout), idb.js, config.js (gerado)
│
├── server/                                  # API Node.js em camadas
│   ├── src/
│   │   ├── app.js                           # Roteador próprio, CORS, despacho e servidor HTTP
│   │   ├── presentation/
│   │   │   ├── routes/                      # auth, chamados, postes, estoque, fotos
│   │   │   ├── middlewares/                 # autenticar (perfil), validar, limitarTentativas, tratarErros
│   │   │   ├── controllers/                 # Auth, Chamado, Fechamento, Poste, Estoque, Foto
│   │   │   └── views/                       # resposta.js, chamado.view.js, tentativa.view.js
│   │   ├── application/
│   │   │   ├── services/                    # AuthService, ChamadoService, FechamentoService, EstoqueService,
│   │   │   │                                #   PosteService
│   │   │   └── errors/                      # NaoEncontrado (404), Conflito (409), SemPermissao (403)…
│   │   ├── domain/                          # Chamado, Poste, Fechamento, Tentativa, ItemEstoque, Missao
│   │   └── infrastructure/
│   │       ├── config/                      # env.js (lê o .env da raiz)
│   │       ├── database/                    # pool.js (mysql2), transacao.js (BEGIN/COMMIT/ROLLBACK)
│   │       ├── repositories/                # Chamado, Fechamento, Poste, Estoque, Tentativa, Usuario, Sessao
│   │       ├── storage/                     # FotoStorage.js (disco ou MySQL, conforme STORAGE_DRIVER)
│   │       └── security/                    # hashPin.js (scrypt + timingSafeEqual), gerarToken.js
│   ├── database/migrations/                 # 001_inicial_mysql.sql, 002_fotos_mysql.sql
│   │                                        #   (001_inicial.sql é a versão PostgreSQL antiga)
│   ├── scripts/                             # check-db, setup-auth-mysql, cadastrar-usuario
│   └── tests/                               # Testes por caso de uso, integração e Selenium
├── scripts/                                 # build-config.mjs (gera o config.js), ci/
├── docs/                                    # Esta documentação e os relatórios de testes
├── apps-script/                             # Lugar reservado para o backend antigo (vazio)
└── vercel.json / netlify.toml               # Build, cabeçalhos e repasse de /api/* e /uploads/*
```

### Rotas da API

| Rota | Acesso | Uso |
|---|---|---|
| `POST /api/auth/login` | Público, com limite de requisições | Login por PIN (técnico e gestor) |
| `POST /api/auth/almoxarifado` | Público, com limite de requisições | Login por PIN do almoxarife |
| `POST /api/chamados` | Público | Reporte do cidadão (idempotente pelo `id`) |
| `GET /api/chamados`, `GET /api/chamados/:protocolo` | Técnico ou gestor | Lista e busca |
| `GET /api/tentativas` | Técnico ou gestor | Tentativas sem resolução (relatório) |
| `POST /api/chamados/:protocolo/tentativas` | Técnico ou gestor | Registra tentativa sem resolução |
| `POST /api/chamados/:protocolo/fechamento` | Técnico ou gestor | Baixa da OS (transação) |
| `POST /api/chamados/:protocolo/fechamento-admin` | Gestor | Fechamento sem atendimento em campo |
| `GET /api/postes/:id/situacao` | Público | Situação pública do poste |
| `GET /api/postes`, `GET /api/postes/:id/historico` | Técnico ou gestor | Relatório e histórico de postes |
| `GET /api/estoque` | Almoxarife, técnico, gestor | Itens e saldos |
| `PUT /api/estoque/:item`, `DELETE /api/estoque/:item` | Almoxarife, gestor | Cadastro de material |
| `GET /api/missoes`, `POST /api/missoes` | Almoxarife, gestor | Saída de material para missão |
| `POST /api/missoes/:id/retorno` | Almoxarife, gestor | Retorno de material ao estoque |
| `GET /uploads/fotos/:arquivo` | Público | Entrega as fotos gravadas pela API |

### Banco de dados

Migrações em `server/database/migrations/`, para rodar nesta ordem:

1. `001_inicial_mysql.sql`: `usuarios`, `sessoes`, `tentativas_login`, `postes`, `chamados`, `tentativas`, `fechamentos`, `itens_estoque`, `fechamento_materiais`, `missoes` e `missao_itens`.
2. `002_fotos_mysql.sql`: tabela `fotos`, usada quando `STORAGE_DRIVER=mysql`.

Usuários com PIN são criados com `npm run usuario:cadastrar -- --nome "..." --perfil tecnico|gestor|almoxarife --pin 1234`.

---

## 4. Garantias técnicas e de qualidade

1. **Transação ACID e fim dos conflitos em campo.** [`FechamentoService`](../server/src/application/services/FechamentoService.js) executa a baixa dentro de [`emTransacao()`](../server/src/infrastructure/database/transacao.js): fecha o chamado, grava a baixa, debita o estoque e atualiza o poste, ou desfaz tudo. O [`ChamadoRepository`](../server/src/infrastructure/repositories/ChamadoRepository.js) trava a linha do chamado com `SELECT ... FOR UPDATE`. Se dois técnicos enviarem a baixa ao mesmo tempo, o segundo espera o primeiro terminar e recebe `409 Conflito`.
2. **Offline primeiro, com idempotência.** Os PWAs guardam o reporte e a baixa no IndexedDB e reenviam quando a conexão volta. Cada envio leva um UUID (`chamados.id` e `fechamentos.operacao_id`). Se o mesmo reporte chegar de novo, o MySQL recusa a chave repetida (`ER_DUP_ENTRY`) e a API devolve o chamado que já existe, sem duplicar. Na baixa, a mesma `operacao_id` devolve a baixa já registrada.
3. **Autenticação.**
   - O PIN nunca é salvo em texto: [`hashPin.js`](../server/src/infrastructure/security/hashPin.js) usa `scrypt` com salt aleatório e comparação em tempo constante.
   - A sessão é um token de 256 bits, enviado em `Authorization: Bearer <token>` e guardado na tabela `sessoes`.
   - Cada rota exige o perfil certo (técnico, gestor ou almoxarife); toda rota do técnico também aceita o gestor.
   - Bloqueio em duas camadas: 5 PINs errados em 15 minutos bloqueiam o login no banco ([`AuthService`](../server/src/application/services/AuthService.js)); mais de 8 requisições por minuto ao login recebem `429` ([`limitarTentativas`](../server/src/presentation/middlewares/limitarTentativas.js)).
4. **Fotos fora das tabelas de negócio.** O chamado guarda só o endereço `/uploads/fotos/<arquivo>`. [`FotoStorage`](../server/src/infrastructure/storage/FotoStorage.js) grava a imagem em disco (`STORAGE_DRIVER=disco`, padrão para rodar local) ou na tabela `fotos` (`STORAGE_DRIVER=mysql`, usado no Render, cujo disco é apagado a cada deploy). A rota de fotos só aceita nomes gerados pela própria API, o que bloqueia `../`.
5. **Testes sem infraestrutura.** Os serviços recebem os repositórios por injeção. Por isso os testes rodam com banco simulado ou em memória (`npm test`), e só a suíte de integração e o Selenium precisam de MySQL real.

---

## 5. Limitações conhecidas

- **Migração das telas incompleta.** As camadas de `public/js/` existem e são testadas, mas boa parte do fluxo ainda está em `<script>` dentro de `public/index.html` e `public/tecnico/index.html` (cerca de 4 mil linhas no técnico). O técnico usa os módulos no login, na lista, no fechamento e nos relatórios; o envio do reporte do cidadão ainda é feito pelo script da página. Por isso alguns testes recortam funções direto do HTML.
- **Dois backends.** As telas ainda funcionam com o Apps Script, cujo código não está no repositório.
- **Coluna da data da missão.** A migração usa `missoes.data`; os esquemas dos testes de integração e do Selenium usam `data_missao`. O grupo precisa escolher uma.
- **Fotos no MySQL.** Resolvem a perda no Render, mas o banco cresce até 5 MB por foto. Um armazenamento de objetos (S3, R2) entraria como mais um driver no `FotoStorage`.
