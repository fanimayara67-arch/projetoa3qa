# Relatório de Testes — Fotos entregues e persistentes; cadastro de usuários (DEF-20, DEF-21 e DEF-22)

- **Responsável:** João Marcos Lima Chervinski
- **Data:** 27/11/2026
- **Branch:** `feat/fotos-e-usuarios`, sobre a `fix/telas-api-node` (PR #20)
- **Processo:** TDD. Primeiro os testes que falham (vermelho), depois uma correção por commit (verde).

## O problema

Com o PR #20 as telas passam a falar com a API Node, mas faltavam três peças para o sistema funcionar de ponta a ponta:

| ID | Severidade | Defeito | Achado por |
|---|---|---|---|
| **DEF-20** (novo) | Alta | A API gravava a foto e guardava `foto_url = /uploads/fotos/<arquivo>`, mas nenhuma rota entregava esse endereço, e a Vercel e a Netlify não repassavam `/uploads/*` para a API. Toda foto do cidadão e do reparo chegava quebrada; as telas escondem imagem quebrada (`onerror`), por isso ninguém via. | FT-07, FT-08, FT-09, F-03, F-04 |
| **DEF-21** (novo) | Alta | A foto só podia ir para o disco do servidor. No Render o disco é apagado a cada deploy ou reinício, então as fotos se perderiam mesmo com a rota. | FT-04, FT-05, FT-06, F-06 |
| **DEF-22** (novo) | Média | Não havia como criar gestor e almoxarife (nem trocar o PIN de um técnico) sem escrever SQL e calcular o hash scrypt na mão. Como o login entra com o primeiro usuário cujo PIN bate, dois usuários com o mesmo PIN fariam um técnico entrar como gestor. | CU-01 a CU-06 |

## O que mudou

| Onde | Mudança |
|---|---|
| `server/src/infrastructure/storage/FotoStorage.js` | `STORAGE_DRIVER` escolhe onde a foto fica: `disco` (padrão, pasta `UPLOAD_DIR`), `mysql` (tabela `fotos`) ou `memory` (testes). Nova função `ler(nome)`, que só aceita o nome que a própria API gera (`<timestamp>-<8 hex>.jpg/png/webp`) e recusa `../` e qualquer outro caminho. |
| `GET /uploads/fotos/:arquivo` (novo) | `FotoController` + `fotos.routes.js`. Rota pública (o `<img>` não manda token), com `Content-Type` certo, `X-Content-Type-Options: nosniff` e cache de um ano (o nome nunca se repete). Foto inexistente ou nome inválido: 404. |
| `server/database/migrations/002_fotos_mysql.sql` (novo) | Tabela `fotos (nome PK, tipo, dados MEDIUMBLOB, criado_em)`. |
| `vercel.json`, `netlify.toml` | `/uploads/*` é repassado para a API, como `/api/*`. |
| `server/scripts/cadastrar-usuario.js` (novo) | `npm run usuario:cadastrar -- --nome "..." --perfil gestor --pin 0456`. Perfis `tecnico`, `gestor`, `almoxarife`; PIN de 4 dígitos guardado só como hash; mesmo nome e perfil troca o PIN e reativa; PIN já usado por outro usuário ativo é recusado; `--desativar` tira o acesso. |
| `.env.example` | Documenta `STORAGE_DRIVER`. |
| `server/tests/telas-api-node/apoio/api-em-memoria.js` | A API em memória guarda a tabela `fotos` e cria chamados, para a verificação no navegador usar o `FotoStorage` real. |

## Ciclo TDD (commits)

| Fase | Commit | Testes |
|---|---|---|
| Vermelho | `test(fotos, usuarios): fotos servidas e persistentes; cadastro de usuários por perfil (vermelho)` | 8 dos 9 testes de fotos falham; o arquivo de usuários nem carrega ([01-vermelho.txt](evidencias/01-vermelho.txt)) |
| Verde | `fix(fotos): fotos passam a ser entregues e podem ficar no MySQL (DEF-20, DEF-21)` | FT-01 a FT-09 |
| Verde | `feat(usuarios): script para cadastrar técnico, gestor e almoxarife com PIN (DEF-22)` | CU-01 a CU-06 |
| Evidências | `docs(fotos, usuarios): verificação no navegador, relatório e evidências` | 15/15 ([02-verde.txt](evidencias/02-verde.txt)) |

## Casos de teste

| ID | Técnica | Caso |
|---|---|---|
| FT-01 | Caixa preta, fluxo principal | Foto salva em disco é lida de volta com os mesmos bytes e o tipo certo |
| FT-02 | Caixa preta, risco de segurança | Nome com caminho (`../`) ou extensão estranha é recusado sem ler o disco |
| FT-03 | Caixa preta, fluxo alternativo | Foto que não existe devolve nulo |
| FT-04 | Caixa preta, fluxo principal | No modo MySQL a foto vai para a tabela `fotos`, não para o disco |
| FT-05 | Caixa branca | O modo vem de `STORAGE_DRIVER`; sem a variável grava em disco; valor inválido é recusado |
| FT-06 | Caixa branca | A migração 002 cria a tabela `fotos` |
| FT-07 | Integração, fluxo principal | `GET /uploads/fotos/:arquivo` entrega a foto, sem login, com cache longo |
| FT-08 | Integração, fluxo alternativo e segurança | Foto inexistente e caminho com `../` respondem 404 sem vazar arquivo |
| FT-09 | Caixa branca | Vercel e Netlify repassam `/uploads/*` para a API |
| CU-01 | Caixa preta, fluxo principal | Cadastra um gestor com o PIN guardado só como hash, que o login reconhece |
| CU-02 | Caixa preta, fluxo alternativo | Mesmo nome e perfil troca o PIN e reativa, sem duplicar |
| CU-03 | Caixa preta, partição inválida e valor limite | Perfil, PIN (3 e 5 dígitos, letras) e nome (vazio, 121 caracteres) inválidos são recusados antes de tocar no banco |
| CU-04 | Caixa preta, risco | PIN já usado por outro usuário ativo é recusado |
| CU-05 | Caixa preta, fluxo principal e exceção | Desativar tira o acesso; usuário inexistente é avisado |
| CU-06 | Caixa preta, partição | Argumentos da linha de comando; o PIN mantém o zero à esquerda |

### Verificação no navegador (Chromium, fluxo real)

Script: [`scripts/verificar-fotos.navegador.mjs`](scripts/verificar-fotos.navegador.mjs). Sobe `public/` e a API Node na mesma origem, como em produção, e roda o fluxo duas vezes: com `STORAGE_DRIVER=disco` e com `STORAGE_DRIVER=mysql`. O cidadão envia um reporte com foto pela tela; o técnico entra com PIN, abre o chamado e a foto precisa aparecer.

| ID | Caso | Resultado |
|---|---|---|
| F-01 / F-05 | Cidadão envia reporte com foto; o chamado guarda `/uploads/fotos/...` | Aprovado nos dois modos |
| F-02 / F-06 | A foto fica na pasta (disco) ou só na tabela `fotos` (mysql) | Aprovado nos dois modos |
| F-03 / F-07 | `GET /uploads/fotos/<arquivo>` pela origem do site entrega a imagem | Aprovado nos dois modos |
| F-04 / F-08 | O técnico vê a foto do cidadão na tela do chamado | Aprovado nos dois modos |
| F-09 | Nenhum erro de JavaScript | Aprovado |

Saída: [03-navegador-fotos.txt](evidencias/03-navegador-fotos.txt). Tela do técnico com a foto vinda do MySQL: [03-foto-no-tecnico-mysql.png](evidencias/03-foto-no-tecnico-mysql.png).

## Resultados

| Execução | Resultado |
|---|---|
| Testes novos (FT e CU) | 15/15 aprovados ([02-verde.txt](evidencias/02-verde.txt)) |
| Telas na API Node (TN, PR #20) depois da mudança no apoio | 33/33 aprovados |
| Navegador (F-01 a F-09) | 9/9 aprovados |
| Suíte completa (`npm test`) | 372 testes: 343 aprovados, 7 *todo*, 8 falhas que só passam com MySQL real (CT-14, CT-18 a CT-21, CT-23, CT-24, CT-28 e a suíte ponta a ponta), as mesmas de antes ([04-suite-completa.txt](evidencias/04-suite-completa.txt)) |
| Cobertura | Todos os arquivos: linhas 89,64%, ramos 86,88%, funções 91,36%. `FotoController.js` e `fotos.routes.js` 100%; `FotoStorage.js` 91,2% das linhas; `cadastrar-usuario.js` 84,8% (o que falta é o `main`, que precisa do MySQL) |

## Como colocar no ar (Render)

1. Rodar a migração no MySQL de produção: `server/database/migrations/002_fotos_mysql.sql`.
2. No serviço da API, definir `STORAGE_DRIVER=mysql` e fazer o deploy.
3. Criar os usuários (no Shell do Render ou numa máquina com o `.env` de produção):

   ```
   npm run usuario:cadastrar -- --nome "Nome do gestor" --perfil gestor --pin 0456
   npm run usuario:cadastrar -- --nome "Nome do almoxarife" --perfil almoxarife --pin 0789
   ```

4. Conferir: abrir um chamado com foto no técnico; a imagem deve aparecer. `curl -I https://<site>/uploads/fotos/<arquivo>` deve responder 200 com `Content-Type: image/...`.

As fotos gravadas antes deste PR no disco do Render já se perderam; os chamados continuam, só sem imagem.

## Fica para depois

- A tabela `fotos` cresce com o uso (até 5 MB por foto). Para muitos chamados, trocar por um armazenamento de objetos (S3, R2) é só um novo driver no `FotoStorage`.
- A rota de fotos é pública: quem souber o nome do arquivo vê a foto. O nome tem 8 caracteres aleatórios e não é listado em lugar nenhum público, mas não é um controle de acesso.
