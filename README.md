# Ilumina Coruripe

Sistema de iluminação pública de Coruripe/AL. Dois PWAs, um backend, **um deploy só**.

| App | Rota | Quem usa |
|---|---|---|
| Cidadão | `/` | população — reporta poste apagado/piscando, com GPS e foto |
| Técnico | `/tecnico/` | equipe de campo, gestor e almoxarife |

Backend: Google Apps Script sobre planilha Google Sheets (dois deploys — ver `public/shared/config.js`).

## Produção

| Ambiente | URL | Estado |
|---|---|---|
| Cidadão (no ar hoje) | https://iluminacoruripe.netlify.app | ativo — deploy antigo, separado |
| Técnico (no ar hoje) | https://iluminacoruripe-tecnico.netlify.app | ativo — deploy antigo, separado |
| HUB Central | https://hubcentralcrp.netlify.app | ativo — portal que aponta para os dois |
| **Deploy unificado (este repo)** | _ainda não publicado_ | pendente |

Atenção: o que está no ar agora **ainda são os dois sites antigos**, cada um com a URL
do outro escrita na mão. O código deste repositório só passa a valer depois que o deploy
unificado subir — enquanto isso, mudança aqui não muda o que o cidadão vê.

Quando o deploy unificado subir, os dois viram rotas do mesmo domínio
(`/` e `/tecnico/`) e este bloco deve ser atualizado com a URL final.

A leitura de QR Code foi removida do sistema. As plaquetas já instaladas apontam para
`iluminacoruripe.netlify.app` e passam a abrir o formulário comum. Antes de desligar esse
domínio, aponte-o para o deploy novo, ou esses links deixam de abrir.


## Por que monorepo

Antes eram dois sites Netlify separados com URL do outro escrita na mão dentro do código.
Isso quebrava sempre que um domínio mudava.

Agora os dois compartilham origem, e trocar o domínio do site não exige editar código.

## Estrutura

```
public/
  index.html            app do cidadão
  manifest.json  sw.js  PWA do cidadão (escopo "/", ignora /tecnico/)
  shared/config.js      ÚNICO lugar com os endpoints do Apps Script
  tecnico/
    index.html          app técnico/gestor/almoxarifado
    manifest.json sw.js PWA do técnico (escopo "/tecnico/")
    leaflet.js/.css     mapa (vendorizado, sem CDN)
netlify.toml            publish=public, redirects, headers de cache
docs/ARQUITETURA.md     fluxo de dados e contrato da API
```

## Conexão MySQL local

A conexão da API Node.js com MySQL está configurada na camada de infraestrutura. Instale as dependências com `npm install --prefix server`, preencha `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD` no `.env` e rode `npm run db:check`.

O comando verifica somente o acesso ao banco, sem criar tabelas. Os itens **4 — Rota do dia** e **6 — Fechamento administrativo** foram ligados à arquitetura em camadas e à API Node, com testes específicos. A persistência real ainda depende de preparar e alinhar o esquema MySQL do grupo; nenhuma tabela foi criada. Consulte o [guia dos itens 4 e 6](docs/07-SPRINT2-ROTA-E-FECHAMENTO-ADMINISTRATIVO.md) e o [guia de conexão](docs/06-CONEXAO-MYSQL.md).

Os [relatórios de testes de Orlando Henrique](<docs/Relatório de Testes/README.md>) estão organizados por funcionalidade, com cenários, resultados e evidências de execução.

## Variáveis de ambiente

Os endpoints do Apps Script saíram do código e viraram variáveis:

| Variável | Para que serve |
|---|---|
| `ILUMINA_ENDPOINT_CIDADAO` | deploy do Apps Script que recebe os reportes |
| `ILUMINA_ENDPOINT_TECNICO` | deploy do painel técnico (login, chamados, almoxarifado) |
| `ILUMINA_HUB_URL` | portal do botão "voltar ao HUB" (opcional) |

O site é estático, sem servidor — então não existe leitura de `process.env` em runtime.
`scripts/build-config.mjs` roda no **build** e gera `public/shared/config.js` com os
valores materializados dentro. Esse arquivo é gerado, não versionado.

Se faltar variável obrigatória, o build **falha** em vez de publicar um site que
só quebra quando o cidadão aperta enviar.

**Isto não torna os endpoints secretos.** Eles vão para o JavaScript que roda no
navegador e qualquer pessoa lê no "ver código-fonte". A variável de ambiente só
mantém o valor fora do repositório. Proteção de verdade tem que estar no lado do
Apps Script: validação de PIN, limite de tentativas e checagem de origem.

### Local

```bash
cp .env.example .env      # preencha os valores
npm run dev               # gera o config e sobe em http://localhost:3000
```

### Produção

Cadastre as mesmas chaves no painel do host e refaça o deploy:

- **Vercel** — Settings › Environment Variables
- **Netlify** — Site configuration › Environment variables

O build command (`node scripts/build-config.mjs`) já está no `vercel.json` e no
`netlify.toml`. Não precisa de `npm install`: o script usa só a biblioteca padrão do Node.

## Rodar local

Precisa de servidor HTTP — `file://` quebra service worker, câmera e geolocalização.

```bash
npm run dev               # build do config + servidor na porta 3000
```

Sem npm, gere o config e sirva à mão:

```bash
node scripts/build-config.mjs
python -m http.server 8080 -d public
```

Cidadão em `/`, técnico em `/tecnico/`.

## Acesso

- Técnico: PIN de 4 dígitos na tela de entrada, validado no servidor (`action: login`).
- Almoxarifado: PIN separado dentro do app (`action: almox_login`).

Os PINs ficam na planilha, não no código. Sessão do técnico é um token com expiração
guardado em `localStorage` (`ilu_tech_session`).

## Offline

Ambos funcionam sem sinal:
- Cidadão: reporte vai pra fila no IndexedDB (`ilumina_v2`) e sobe quando voltar a internet.
- Técnico: fechamentos ficam em fila (`ilumina_tec` / `close_queue`, máx. 10) + cache de fotos.
