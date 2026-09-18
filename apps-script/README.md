# Backend (Google Apps Script)

O código que atende os dois endpoints **ainda vive só dentro do editor do
Google Apps Script** — não está versionado aqui.

Para trazer pra cá:

```bash
npm i -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>       # um por deploy (cidadão e técnico)
```

Os IDs de deploy em uso estão em `public/shared/config.js`.
Enquanto este diretório estiver vazio, uma alteração no backend não tem
histórico nem rollback.
