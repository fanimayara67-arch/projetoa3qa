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

Os QR já impressos e colados nos postes apontam para `iluminacoruripe.netlify.app`.
Antes de desligar esse domínio, aponte-o para o deploy novo — senão todo QR na rua morre.


## Por que monorepo

Antes eram dois sites Netlify separados com URL do outro escrita na mão dentro do código.
Isso quebrava sempre que um domínio mudava: o QR impresso no poste apontava pro lugar errado
e não tinha como descobrir sem o cidadão reclamar.

Agora os dois compartilham origem. O QR do poste é montado em runtime a partir de
`location.origin` — trocar o domínio do site não exige reimprimir QR nem editar código.

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
    jsQR.js             leitor de QR pela câmera
netlify.toml            publish=public, redirects, headers de cache
docs/ARQUITETURA.md     fluxo de dados e contrato da API
```

## Trocar um endpoint do Apps Script

Edite **só** `public/shared/config.js`. Os dois apps leem de lá.
`netlify.toml` já serve esse arquivo com `no-cache`, então a troca vale no próximo load.

## Rodar local

Precisa de servidor HTTP — `file://` quebra service worker, câmera e geolocalização.

```bash
npx serve public          # http://localhost:3000
# ou
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
