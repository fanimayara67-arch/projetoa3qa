# Arquitetura Cliente-Servidor — Ilumina Coruripe

> Documento 3 de 4 da série de arquitetura.
> [1. MVC](01-ARQUITETURA-MVC.md) · [2. Camadas](02-ARQUITETURA-EM-CAMADAS.md) ·
> [3. Cliente-servidor](03-ARQUITETURA-CLIENTE-SERVIDOR.md) ·
> [4. Orientada a serviços](04-ARQUITETURA-ORIENTADA-A-SERVICOS.md)

Stack considerada: **HTML + CSS + JavaScript** (cliente), **Node.js** (servidor)
e banco **SQL**.

## 1. O que é cliente-servidor

Dois papéis que se comunicam por rede:

- **Cliente:** pede algo (envia um reporte, pede a lista de chamados).
- **Servidor:** recebe o pedido, processa, guarda os dados e responde.

O cliente **sempre inicia** a conversa; o servidor responde. Vários clientes
falam com o mesmo servidor, e é o servidor que mantém a versão oficial dos dados.

O Ilumina já é cliente-servidor hoje (PWAs → Apps Script → Sheets). A mudança
é **quem é o servidor**: sai o Google Apps Script e entra um servidor Node.js
próprio com banco SQL.

## 2. Modelo em três níveis (3-tier)

```text
     NÍVEL 1 — CLIENTES                NÍVEL 2 — SERVIDOR DE APLICAÇÃO     NÍVEL 3 — DADOS
┌───────────────────────────┐
│ PWA Cidadão  (/)          │
│ celular da população      │──┐
│ HTML + CSS + JS           │  │
│ IndexedDB: ilumina_v2     │  │      ┌──────────────────────────┐       ┌───────────────────┐
└───────────────────────────┘  │      │ API Node.js              │       │ Banco SQL         │
                               ├─────►│ /api/chamados            │──────►│ chamados, postes, │
┌───────────────────────────┐  │HTTPS │ /api/postes              │  SQL  │ fechamentos,      │
│ PWA Técnico (/tecnico/)   │  │ JSON │ /api/auth                │◄──────│ estoque, missões, │
│ celular da equipe/gestor/ │──┘      │ /api/estoque /api/missoes│       │ usuários, sessões │
│ almoxarife                │◄────────│ /api/relatorios          │       └───────────────────┘
│ IndexedDB: ilumina_tec    │         │ autenticação + regras    │       ┌───────────────────┐
│ localStorage: sessão/cache│         └────────────┬─────────────┘──────►│ Arquivos de fotos │
└───────────────────────────┘                      │                     └───────────────────┘
                                                   │
┌───────────────────────────┐                      │
│ Hospedagem estática       │  entrega HTML/CSS/JS/ícones/service worker
│ (Netlify ou Vercel)       │  (não processa dados)
└───────────────────────────┘
```

| Nível | Responsabilidade | Onde roda |
|---|---|---|
| 1. Cliente | Telas, captura de GPS/foto, fila offline, mapa Leaflet | Navegador do celular |
| 2. Aplicação | Autenticação, validação, regras, transações, API REST | Servidor Node.js |
| 3. Dados | Persistência e integridade (chaves, `CHECK`, `UNIQUE`) | Servidor de banco SQL + armazenamento de fotos |

Por que **três** níveis e não dois: o navegador nunca fala direto com o banco.
Se falasse (2-tier), usuário e senha do banco estariam no JavaScript, que
qualquer pessoa lê no "ver código-fonte" — o próprio `README.md` já alerta
isso sobre os endpoints atuais.

## 3. Os clientes

### 3.1 Tipo de cliente: "gordo" por necessidade

Um *thin client* só mostra o que o servidor manda. Os PWAs do Ilumina são
mais "gordos" (*thick client*) porque precisam **funcionar sem sinal** na rua:

| Responsabilidade no cliente | Motivo |
|---|---|
| Validar tipo, GPS e foto antes de enviar | Feedback imediato, mesmo offline |
| Comprimir foto (`resizeImage`) | Economizar dados móveis e quota local |
| Fila no IndexedDB com `pending → syncing → synced` | Reporte não se perde sem internet |
| Cache da lista de chamados e fotos (técnico) | Técnico consulta em campo sem sinal |
| Service worker com shell em cache | App abre offline |

Mesmo assim, **a validação do cliente é só conveniência**: o servidor valida de
novo tudo, porque qualquer pessoa pode mandar uma requisição direto para a API
sem passar pelo app.

### 3.2 Dois clientes, um servidor

| | Cidadão | Técnico |
|---|---|---|
| Rota | `/` | `/tecnico/` |
| Autenticação | nenhuma | PIN → token; PIN separado do almoxarifado |
| Principal escrita | `POST /api/chamados` | tentativas, fechamentos, estoque, missões |
| Principal leitura | `GET /api/postes/:id/situacao` | chamados, postes, histórico, relatórios |
| Dados offline | fila de reportes | fila de fechamentos (máx. 10), cache de lista e fotos |

Os dois clientes continuam no mesmo deploy estático (mesma origem), como o
`README.md` já define.

## 4. O servidor

Servidor Node.js organizado como no documento 1 (MVC) e 2 (camadas). Do ponto
de vista cliente-servidor, ele precisa garantir:

1. **Sem estado entre requisições (stateless):** cada requisição traz o token
   no cabeçalho; o servidor consulta a tabela `sessoes`. Assim é possível
   reiniciar ou ter mais de uma instância do Node sem "deslogar" ninguém.
2. **Fonte única da verdade:** dados no IndexedDB pertencem ao aparelho; o
   técnico só enxerga um reporte depois que o servidor confirma o registro.
3. **Concorrência:** vários técnicos ao mesmo tempo. Transações e
   `SELECT … FOR UPDATE` evitam dois fechamentos do mesmo chamado
   (resposta `409 Conflict` para o segundo).
4. **Idempotência:** o cliente pode repetir um envio após timeout. `chamados.id`
   (UUID do aparelho) e `operacao_id` (fechamentos e tentativas) são `UNIQUE`;
   o reenvio devolve o registro já existente em vez de duplicar.

## 5. Protocolo de comunicação

| Item | Definição |
|---|---|
| Transporte | HTTPS (obrigatório: GPS e câmera só funcionam em contexto seguro) |
| Formato | JSON (`Content-Type: application/json`) |
| Estilo | REST: recurso na URL, ação no método (`GET`, `POST`, `PUT`, `DELETE`) |
| Autenticação | `Authorization: Bearer <token>` |
| Resposta | `{ "success": true, "data": … }` ou `{ "success": false, "error": { "codigo", "mensagem" } }` |
| Tempo limite no cliente | 30–60 s com `AbortController` (como hoje) |

### 5.1 Códigos HTTP usados

| Código | Quando | O que o cliente faz |
|---|---|---|
| `200` / `201` | sucesso | marca `synced`, remove da fila |
| `400` | dado inválido (ex.: sem tipo) | `needs_attention`, mostra ao usuário |
| `401` | token ausente ou expirado | volta para a tela de PIN |
| `403` | perfil errado (técnico tentando usar almoxarifado) | mostra "sem permissão" |
| `404` | chamado/poste não existe | mostra mensagem |
| `409` | conflito (chamado já fechado) | mostra para revisão; não reenviar |
| `413` | foto grande demais | recomprimir e tentar de novo |
| `429` | muitas tentativas de PIN | bloqueia o botão por alguns minutos |
| `5xx` ou sem rede | falha transitória | mantém `pending`, backoff exponencial |

### 5.2 Exemplo de troca

```http
POST /api/chamados HTTP/1.1
Host: api.iluminacoruripe.exemplo
Content-Type: application/json

{
  "id": "6f1c2b0e-8d6a-4a57-9e0b-3c1f8a2d7e44",
  "protocolo": "CRP-20261103-0042",
  "timestamp": "2026-11-03T21:14:05.000Z",
  "tipo": "apagado",
  "lat": -10.125431, "lng": -36.175902, "acc": 12,
  "descricao": "Poste em frente à praça",
  "poste_id": "P-0001",
  "foto_base64": "data:image/jpeg;base64,/9j/4AAQ…"
}
```

```http
HTTP/1.1 201 Created
Content-Type: application/json

{ "success": true, "data": { "protocolo": "CRP-20261103-0042", "status": "aberto", "posteId": "P-0001" } }
```

## 6. Sequência com e sem rede

```text
COM REDE
  Cliente: salva no IndexedDB → POST /api/chamados → 201 → marca synced → "Registrado no sistema"

SEM REDE
  Cliente: salva no IndexedDB → fetch falha → mantém pending → "Salvo neste aparelho, aguardando envio"
  … evento "online" / app reaberto / temporizador de backoff …
  Cliente: POST /api/chamados (mesmo id) → 201 → marca synced

TIMEOUT (servidor gravou, resposta se perdeu)
  Cliente: POST → sem resposta → mantém pending
  Cliente: POST de novo (mesmo id) → servidor encontra o id → 200 com o registro existente → synced
  Resultado: um único chamado no banco.
```

## 7. Implantação (deploy)

```text
                 ┌────────────── Internet ──────────────┐
                 │                                      │
     ┌───────────▼───────────┐              ┌───────────▼────────────┐
     │ Netlify / Vercel      │              │ Render / Railway /     │
     │ public/ (estático)    │              │ Fly.io / VPS           │
     │ /, /tecnico/, sw.js,  │              │ Node.js (server/)      │
     │ shared/config.js      │              │ porta $PORT, HTTPS     │
     └───────────────────────┘              └───────────┬────────────┘
                                                        │ rede privada
                                            ┌───────────▼────────────┐
                                            │ PostgreSQL / MySQL     │
                                            │ gerenciado             │
                                            └────────────────────────┘
```

Pontos de configuração:

- `scripts/build-config.mjs` passa a gerar `ILUMINA.API_URL` a partir de uma
  variável `ILUMINA_API_URL`.
- **Mesma origem (recomendado):** redirect/proxy `/api/*` → servidor Node no
  `netlify.toml` ou `vercel.json`. Sem CORS e o front continua chamando `/api/...`.
- **Origens diferentes:** o Node responde com `Access-Control-Allow-Origin`
  só para o domínio do front (nunca `*` nas rotas autenticadas).
- Variáveis do servidor (`DATABASE_URL`, segredo de token, pasta de fotos) ficam
  **só no servidor** — ao contrário do `config.js`, elas nunca vão para o navegador.

## 8. Segurança no modelo cliente-servidor

| Ameaça | Onde tratar | Como |
|---|---|---|
| Força bruta no PIN de 4 dígitos | Servidor | tabela `tentativas_login`, bloqueio por IP, `429` |
| Leitura de dados por quem não é técnico | Servidor | middleware `autenticar(perfil)` em toda rota protegida |
| SQL injection | Servidor | consultas parametrizadas |
| Foto enorme derrubando o servidor | Servidor | limite de tamanho do corpo (`413`) |
| Token roubado | Cliente + servidor | HTTPS, expiração curta, revogação na tabela `sessoes` |
| Dado adulterado no cliente | Servidor | validar de novo tudo que chega |

## 9. Vantagens e desvantagens para o Ilumina

**Vantagens**

- Dados centralizados com integridade real (chaves estrangeiras, `UNIQUE`,
  transações) — coisa que a planilha não garante.
- Controle total do backend: código versionado no repositório, com histórico e
  rollback (hoje o Apps Script só existe no editor do Google).
- Vários clientes (cidadão, técnico e, no futuro, um painel web do gestor)
  sobre a mesma API.
- O cliente pode evoluir (novas telas) sem mexer no banco, e vice-versa.

**Desvantagens**

- O servidor é um **ponto único de falha**: se o Node cair, ninguém sincroniza.
  A fila offline reduz o impacto, mas não o elimina.
- Custo e manutenção de hospedagem para o Node e o banco (antes, Google
  hospedava de graça).
- Sincronização offline exige cuidado extra (idempotência, conflitos), que
  não aparece em um cliente-servidor "sempre online".

## 10. Resumo

Cliente-servidor descreve **onde** cada parte roda e **como** elas conversam.
MVC (doc. 1) e camadas (doc. 2) descrevem **como o código é organizado dentro**
do cliente e do servidor. As três visões se complementam no Ilumina:

```text
Cliente-servidor  →  PWA (navegador)  ⇄  API Node.js  ⇄  Banco SQL
Camadas           →  cada lado dividido em apresentação / aplicação / domínio / infra
MVC               →  a camada de apresentação de cada lado
```
