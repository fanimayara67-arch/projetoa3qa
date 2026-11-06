# Problemas e pendências — Ilumina Coruripe

Lista para consulta do que falta resolver antes de colocar a nova arquitetura em produção.

- **Última revisão:** 05/11/2026, na branch `test/funcionalidades-offline`, já com a `main` da equipe (`7b1184c`) incorporada.
- **Situação geral:** os 36 testes automáticos passam, e parte do app técnico já usa a API (login, lista de chamados, rota do dia e fechamento administrativo). O sistema ainda não funciona de ponta a ponta: o app do cidadão não está ligado à API, as tabelas não existem no MySQL e parte do servidor ainda usa SQL de PostgreSQL.

## Como ler esta lista

**Como cada item foi verificado:**

- **Executado:** o comportamento foi reproduzido rodando o código.
- **Leitura:** a conclusão vem da leitura do código ou da documentação da equipe, sem execução. Vale confirmar ao corrigir.

**Prioridade:**

- **Crítica:** impede o sistema de funcionar.
- **Alta:** risco real de segurança, perda de informação ou dado errado.
- **Média:** deve ser corrigido, mas não impede o uso.
- **Baixa:** melhoria ou limpeza.

## Resumo

| ID | Problema | Prioridade | Verificação |
|---|---|---|---|
| [P01](#p01) | App do cidadão e parte do app técnico não usam a API | Crítica | Executado |
| [P02](#p02) | Três funções da tela não têm rota no servidor | Crítica | Leitura |
| [P03](#p03) | Tabelas não existem no MySQL e não há como criar o primeiro usuário | Crítica | Leitura |
| [P05](#p05) | Fotos salvas não podem ser abertas | Crítica | Executado |
| [P07](#p07) | Publicação unificada pendente e endereço do servidor provisório | Crítica | Leitura |
| [P08](#p08) | Dados da planilha sem plano de migração | Crítica | Leitura |
| [P10](#p10) | Parte do servidor ainda usa SQL de PostgreSQL | Crítica | Leitura |
| [P09](#p09) | Reportes antigos na fila do celular são incompatíveis | Alta | Leitura |
| [S01](#s01) | Bloqueio de tentativas de PIN pode ser burlado | Alta | Executado |
| [S02](#s02) | Envio público de reportes sem limite | Alta | Leitura |
| [S03](#s03) | Upload aceita conteúdo que não é imagem e links externos | Alta | Leitura |
| [D01](#d01) | Material repetido deixa o registro diferente do estoque | Alta | Executado |
| [Q01](#q01) | Testes não cobrem o banco real nem o fluxo do cidadão | Alta | Leitura |
| [S04](#s04) | CORS liberado para qualquer site por padrão | Média | Leitura |
| [S05](#s05) | Login identifica o usuário só pelo PIN | Média | Leitura |
| [D02](#d02) | Fotos ficam órfãs quando a operação falha ou é reenviada | Média | Leitura |
| [D03](#d03) | Excluir item de estoque em uso vira "erro interno" | Média | Leitura |
| [D04](#d04) | Erros internos não ficam registrados | Média | Leitura |
| [Q02](#q02) | Testes não rodam automaticamente | Média | Leitura |
| [Q03](#q03) | Documentação desatualizada | Média | Leitura |
| [D05](#d05) | Sessões e tentativas antigas nunca são apagadas | Baixa | Leitura |

## Já resolvidos pela equipe

Estes itens da primeira versão da lista deixaram de ser problema com a `main` atual:

| ID | Problema | Como foi resolvido | Verificação |
|---|---|---|---|
| P04 | Servidor não lia o `.env` e não havia lockfile | `env.js` carrega o `.env` da raiz, e `server/package-lock.json` foi adicionado | Leitura e instalação com `npm ci` |
| P06 | Seguir o guia fazia o build falhar | Com `ILUMINA_API_URL` definida, os endpoints antigos são ignorados, e `/` seleciona a mesma origem | Executado com o `.env.example` e com `/` |

Os itens D03 e Q01 foram resolvidos em parte, como explicado em cada um.

## Funcionamento

<a id="p01"></a>
### P01 — App do cidadão e parte do app técnico não usam a API

**O que já funciona com a API (app técnico):** login, lista de chamados, rota do dia e fechamento administrativo.

**O que falta:**

- **App do cidadão:** nada mudou. O botão ainda chama `submitReport`, que envia em formato de formulário e sem o `id` exigido. O teste retornou **400: JSON inválido**.
- **Endereço do cidadão:** o envio usa o caminho relativo `/api/chamados`, sem considerar `ILUMINA_API_URL`. No ambiente local, o pedido vai para o site na porta 3000, e não para a API na 3001.
- **Demais funções do técnico:** continuam enviando `POST /api` com `action`, e essa rota retorna **404**. Isso afeta busca, histórico do poste, lista de postes, tentativa, fechamento em campo, almoxarifado, missões e relatórios.

**Onde:** `postReport` e `buildPayload` em [`public/index.html`](../public/index.html); `apiFetchTO` em [`public/tecnico/index.html`](../public/tecnico/index.html).

**O que fazer:** migrar essas funções seguindo o padrão `USA_API_NODE` que a equipe já usa no app técnico.

<a id="p02"></a>
### P02 — Três funções da tela não têm rota no servidor

| Ação na tela | Para que serve | Situação no servidor |
|---|---|---|
| `list_attempts` | Listar tentativas de atendimento | Sem rota de listagem |
| `missao_return` | Registrar o retorno de material de uma missão | Só existe a validação no domínio |
| `material_report` | Relatório de materiais | Sem rota nem serviço |

**O que fazer:** criar essas rotas antes de migrar as telas correspondentes, ou essas funções deixarão de existir.

<a id="p03"></a>
### P03 — Tabelas não existem no MySQL e não há como criar o primeiro usuário

- A conexão com o MySQL já pode ser testada com `npm run db:check`, mas a [documentação da equipe](07-SPRINT2-ROTA-E-FECHAMENTO-ADMINISTRATIVO.md) informa que o banco local segue sem tabelas da aplicação.
- [`001_inicial.sql`](../server/database/migrations/001_inicial.sql) é PostgreSQL e **não deve ser executada no MySQL**.
- O código espera tabelas como `chamados` e `usuarios`, enquanto o DER do grupo usa outros nomes, como `chamado`, `ordem_servico` e `usuario`.
- Não há comando de migração, cadastro inicial nem rota para criar usuários. Em um banco novo, ninguém consegue fazer login.

**O que fazer:** alinhar o código ao DER, criar a migração em MySQL e um comando para cadastrar o primeiro gestor com o PIN em hash.

<a id="p10"></a>
### P10 — Parte do servidor ainda usa SQL de PostgreSQL

A conexão agora é MySQL, mas estes repositórios ainda usam comandos de PostgreSQL, como `$1`, `RETURNING` e `ON CONFLICT`:

| Repositório | Ocorrências | O que depende dele |
|---|---|---|
| [`EstoqueRepository.js`](../server/src/infrastructure/repositories/EstoqueRepository.js) | 17 | Almoxarifado, missões e baixa de materiais |
| [`PosteRepository.js`](../server/src/infrastructure/repositories/PosteRepository.js) | 6 | Postes, histórico e atualização do poste no fechamento |
| [`TentativaRepository.js`](../server/src/infrastructure/repositories/TentativaRepository.js) | 3 | Registro de tentativas |

O fechamento em campo com poste ou materiais usa esses repositórios, então deve falhar no MySQL. Os testes passam porque usam repositórios simulados. A própria equipe já registrou essa pendência.

**O que fazer:** adaptar os três repositórios e testá-los em um MySQL real.

<a id="p05"></a>
### P05 — Fotos salvas não podem ser abertas

O servidor grava a foto e guarda um endereço como `/uploads/fotos/arquivo.jpg`, mas nenhuma rota entrega esse arquivo. O teste retornou **404**. O proxy do Netlify e da Vercel também só encaminha `/api/*`.

**O que fazer:** servir os arquivos com segurança ou adotar um bucket (veja a [decisão 3](#decisoes)).

<a id="p07"></a>
### P07 — Publicação unificada pendente e endereço do servidor provisório

- O [`netlify.toml`](../netlify.toml) e o [`vercel.json`](../vercel.json) apontam para `api-ilumina-coruripe.onrender.com`. O próprio `netlify.toml` indica que esse endereço deve ser trocado pela URL real.
- Não há configuração para publicar o servidor Node.js nem o banco.
- Segundo o README, os sites em produção ainda são os dois antigos.
- As plaquetas instaladas apontam para `iluminacoruripe.netlify.app`. Esse domínio não pode ser desligado sem antes ser redirecionado para o site novo.

<a id="p08"></a>
### P08 — Dados da planilha sem plano de migração

Os dados atuais estão no Google Sheets, e o repositório não tem ferramenta para importá-los ao MySQL. Sem isso, o sistema novo começaria sem chamados, postes, estoque e usuários.

**O que fazer:** depois de definir o esquema (P03), escolher o que será importado, criar o script e combinar a virada para não perder chamados abertos.

<a id="p09"></a>
### P09 — Reportes antigos na fila do celular são incompatíveis

Os dois códigos usam a mesma fila local (`ilumina_v2`), mas os reportes antigos têm número sequencial como identificador, e não UUID. O código novo usaria esse número como `id`. Esses reportes podem ficar presos, sem chegar ao servidor.

**O que fazer:** converter os registros antigos ao ligar o app do cidadão (P01) e testar com uma fila real.

## Segurança

<a id="s01"></a>
### S01 — Bloqueio de tentativas de PIN pode ser burlado

O servidor identifica quem está tentando pelo cabeçalho `X-Forwarded-For`, que pode ser inventado por quem faz o pedido. No teste do limitador, o IP repetido foi bloqueado, mas bastou trocar o valor do cabeçalho para ser liberado. O contador de falhas do [`AuthService`](../server/src/application/services/AuthService.js) recebe o mesmo IP.

Como o PIN pode ter só 4 dígitos, um atacante poderia testar as combinações sem ser barrado.

**Onde:** `extrairIp` em [`limitarTentativas.js`](../server/src/presentation/middlewares/limitarTentativas.js).

**O que fazer:** só confiar nesse cabeçalho quando vier do proxy conhecido e considerar um limite geral de falhas, além do limite por IP.

<a id="s02"></a>
### S02 — Envio público de reportes sem limite

`POST /api/chamados` não exige login, o que é esperado, mas também não tem limite de frequência. Cada pedido pode ter até 8 MB, então alguém pode encher o disco e a lista de chamados com dados falsos.

**O que fazer:** aplicar um limite por origem nessa rota.

<a id="s03"></a>
### S03 — Upload aceita conteúdo que não é imagem e links externos

Em [`FotoStorage.js`](../server/src/infrastructure/storage/FotoStorage.js):

- Conteúdo que não é reconhecido como imagem é gravado mesmo assim, com extensão `.jpg`.
- Um endereço `http(s)` é aceito como foto. Pela rota pública, alguém pode fazer um link externo aparecer como foto do chamado.

**O que fazer:** validar o conteúdo real do arquivo e não aceitar links vindos do público.

<a id="s04"></a>
### S04 — CORS liberado para qualquer site por padrão

Sem a variável `CORS_ORIGIN`, o servidor usa `*`. O [documento de cliente-servidor](03-ARQUITETURA-CLIENTE-SERVIDOR.md) determina o contrário para rotas autenticadas. Essa variável também não aparece no `.env.example`.

**O que fazer:** não permitir qualquer origem por padrão e documentar a variável.

<a id="s05"></a>
### S05 — Login identifica o usuário só pelo PIN

O login não pede nome nem matrícula: o servidor compara o PIN com o de cada usuário ativo.

- Com dois usuários usando o mesmo PIN, entra o primeiro encontrado, e o serviço pode ficar registrado no nome errado.
- Com mais usuários cadastrados, cada PIN digitado tem mais chances de acertar alguém.
- A comparação é propositalmente lenta, então cada tentativa fica mais cara para o servidor conforme a equipe cresce.

**O que fazer:** avaliar o uso de um identificador junto com o PIN (veja a [decisão 4](#decisoes)).

## Dados e operação

<a id="d01"></a>
### D01 — Material repetido deixa o registro diferente do estoque

Se o mesmo material vier duas vezes em um fechamento, as duas quantidades são descontadas, mas só a última fica registrada. No teste com banco simulado, LED 1 + LED 2 **descontou 3 e registrou 2**.

**Onde:** `baixarMateriais` em [`EstoqueRepository.js`](../server/src/infrastructure/repositories/EstoqueRepository.js).

**O que fazer:** corrigir ao adaptar esse repositório (P10), somando as quantidades ou rejeitando itens repetidos, e criar um teste para o caso.

<a id="d02"></a>
### D02 — Fotos ficam órfãs quando a operação falha ou é reenviada

A foto é gravada antes da transação do banco, em [`FechamentoService.js`](../server/src/application/services/FechamentoService.js) e [`ChamadoService.js`](../server/src/application/services/ChamadoService.js). Se a operação for desfeita, o arquivo fica no disco. Cada reenvio da fila offline também grava uma nova cópia.

**O que fazer:** verificar o reenvio antes de gravar e definir uma limpeza para arquivos sem uso.

<a id="d03"></a>
### D03 — Excluir item de estoque em uso vira "erro interno"

**Resolvido em parte:** registros duplicados, como dois reportes com o mesmo protocolo, agora retornam 409.

**O que falta:** excluir um item de estoque já usado em fechamentos ou missões viola uma regra do banco e, pela leitura do código, ainda retorna 500 sem explicação.

**O que fazer:** traduzir também esse erro em uma resposta clara, em [`tratarErros.js`](../server/src/presentation/middlewares/tratarErros.js).

<a id="d04"></a>
### D04 — Erros internos não ficam registrados

[`tratarErros.js`](../server/src/presentation/middlewares/tratarErros.js) responde ao usuário e descarta a causa, inclusive nos novos erros 503 de banco indisponível. Em produção, não haveria como investigar uma falha.

**O que fazer:** registrar o erro no log do servidor, sem incluir PIN, token ou foto.

<a id="d05"></a>
### D05 — Sessões e tentativas antigas nunca são apagadas

As tabelas `sessoes` e `tentativas_login` só crescem, e não há rota de logout para encerrar uma sessão antes de expirar.

**O que fazer:** criar uma limpeza periódica e a rota de logout.

## Qualidade e documentação

<a id="q01"></a>
### Q01 — Testes não cobrem o banco real nem o fluxo do cidadão

**Resolvido em parte:** a equipe adicionou testes de rotas HTTP, permissões e rota do dia, além de [evidências com Playwright](<Relatório de Testes/README.md>) nas telas de rota e fechamento administrativo.

**O que falta:**

- Gravações, rollback e concorrência em um MySQL real, pendência que a própria equipe também registrou.
- Teste de ponta a ponta do reporte do cidadão.
- Funcionamento offline em um navegador.

<a id="q02"></a>
### Q02 — Testes não rodam automaticamente

O repositório não tem integração contínua, então um commit pode quebrar os testes sem ninguém perceber.

**O que fazer:** rodar `npm install --prefix server` e `npm test` a cada push e em todo pull request.

<a id="q03"></a>
### Q03 — Documentação desatualizada

| Documento | O que está errado |
|---|---|
| [`README.md`](../README.md) | Descreve o backend como Apps Script com planilha, inclusive login e variáveis |
| [`ARQUITETURA.md`](ARQUITETURA.md) | Apresenta o PostgreSQL como banco do sistema |
| [`02-ARQUITETURA-EM-CAMADAS.md`](02-ARQUITETURA-EM-CAMADAS.md) | Cita PostgreSQL |
| [`03-ARQUITETURA-CLIENTE-SERVIDOR.md`](03-ARQUITETURA-CLIENTE-SERVIDOR.md) | Cita PostgreSQL, `/api/postes/:id/situacao`, que foi removida, e `/api/relatorios`, que não existe |
| [`05-GUIA-PARA-INICIANTES.md`](05-GUIA-PARA-INICIANTES.md) | Cita PostgreSQL e manda rodar `npm test` sem antes instalar as dependências. Assim, 4 arquivos de teste falham (verificado) |
| [`01-ARQUITETURA-MVC.md`](01-ARQUITETURA-MVC.md) | Cita as mesmas rotas e diz que os QR continuam válidos |
| [`04-ARQUITETURA-ORIENTADA-A-SERVICOS.md`](04-ARQUITETURA-ORIENTADA-A-SERVICOS.md) | Ainda cita QR e a rota removida. Como é uma alternativa não adotada, a correção é opcional |
| [`001_inicial.sql`](../server/database/migrations/001_inicial.sql) | Comentário ainda relaciona o id do poste ao QR Code físico |

<a id="decisoes"></a>
## Decisões a tomar

Estes pontos dependem da equipe, e não só de programação:

1. **Reportes duplicados:** junto com o QR Code, saiu o aviso de "já existe um chamado aberto para este poste". Hoje, vários moradores podem abrir chamados para o mesmo problema. Isso é aceitável, ou deve haver outra forma de detectar duplicados, por exemplo por proximidade do GPS?
2. **Vínculo com o poste:** o reporte do cidadão não informa mais o poste. O vínculo só é feito quando o técnico fecha o chamado. Isso atende ao gestor e ao histórico de cada poste?
3. **Armazenamento de fotos:** usar o disco do servidor ou um bucket? Só o disco está implementado, e é preciso confirmar se a hospedagem escolhida mantém os arquivos após reinícios.
4. **Login:** manter só o PIN ou incluir um identificador do usuário?
5. **Plaquetas instaladas:** continuam nos postes, sem função além de abrir o formulário, ou serão retiradas? Até quando o domínio antigo será mantido?
6. **Esquema do banco:** o código passa a seguir o DER do grupo, ou o DER é ajustado ao código? A resposta define o trabalho de P03, P08 e P10.

## O que ainda não foi verificado

Esta revisão **não** cobre os itens abaixo, então podem existir outros problemas:

- Consultas e gravações em um MySQL real. O efeito previsto em P10 vem da leitura do código.
- Disputa real entre dois técnicos no banco. Os testes simulam esse cenário.
- Funcionamento offline e service workers em um celular ou navegador.
- Publicação em Netlify, Vercel ou Render.
- Funcionamento dos sites antigos e do Apps Script em produção.
- As evidências com Playwright da equipe foram consideradas, mas não executadas novamente.

## Ordem sugerida

1. **Tomar a decisão sobre o esquema e as demais:** [lista acima](#decisoes), porque elas afetam o banco e as telas.
2. **Rodar o servidor com um MySQL real:** P03 e P10, já corrigindo o D01.
3. **Fechar as falhas graves de segurança:** S01, S02 e S03.
4. **Ligar o app do cidadão com teste de ponta a ponta:** P01, P09 e Q01.
5. **Ligar o restante do app técnico:** P02, P05 e o que falta do P01.
6. **Preparar a produção:** P07, P08, D03, D04, S04, S05 e Q02.
7. **Finalizar:** Q03, D02 e D05.
