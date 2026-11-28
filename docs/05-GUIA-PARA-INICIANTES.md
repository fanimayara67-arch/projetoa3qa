# Guia de Desenvolvimento para Iniciantes — Ilumina Coruripe

> **Para quem é este guia?**
> Para quem está começando na programação ou chegando agora no projeto **Ilumina Coruripe**. Ele explica do zero, sem jargão, como o sistema funciona, por que as pastas estão organizadas assim e como seguir o caminho de cada funcionalidade no código. A referência técnica completa está em [ARQUITETURA.md](ARQUITETURA.md).

---

## 1. O que é o Ilumina Coruripe?

Imagine que um poste da sua rua apagou à noite. Antes, você precisava descobrir um telefone da prefeitura ou ir até lá pessoalmente. Com o **Ilumina Coruripe**, tudo acontece pelo celular, em dois aplicativos web (**PWAs**: sites que funcionam como aplicativos de celular, inclusive quando a internet cai):

1. **App do Cidadão (`/`):** o morador marca a localização pelo GPS do celular, escolhe o tipo de defeito, tira uma foto e aperta **"Enviar reporte"**. Recebe um protocolo para acompanhar.
2. **App da Equipe Técnica (`/tecnico/`):** o eletricista entra com um PIN de 4 dígitos, vê no mapa os postes com defeito, conserta, tira a foto do serviço pronto, informa as peças usadas (ex.: 1 lâmpada LED e 1 reator) e dá baixa no chamado. No mesmo app ficam as telas do **Gestor** (rota do dia, relatórios, fechamento administrativo) e do **Almoxarife** (estoque de peças e saída de material para as equipes).

---

## 2. O problema que precisávamos resolver (antes × depois)

### Como era antes (o "quarto bagunçado")

- Todo o código do cidadão estava num único arquivo (`public/index.html`, com cerca de 1.650 linhas).
- Todo o código do técnico estava num único arquivo (`public/tecnico/index.html`, com cerca de 4.960 linhas).
- O "banco de dados" era uma **planilha do Google Sheets**, controlada por um Google Apps Script cujo código não estava no repositório.

**Por que isso dava problema?**
1. **Difícil achar e consertar erros:** visual da tela, cálculo de GPS e chamadas de internet estavam misturados.
2. **Conflito entre dois técnicos:** se dois eletricistas fechassem o mesmo chamado quase juntos, o segundo sobrescrevia o primeiro na planilha sem aviso, ou o estoque descontava as peças duas vezes.
3. **PIN fraco:** nada impedia alguém de tentar `0000`, `0001`, `0002`… até acertar.

### Como está agora (a casa em ordem)

Aplicamos a **arquitetura em camadas em monólito modular, em cliente-servidor de 3 níveis**. O nome parece difícil, mas a ideia é simples e tem duas partes: onde cada coisa **roda** (os 3 níveis) e como o código é **dividido** (as camadas).

A mudança ainda não terminou: as camadas já existem e são testadas, mas parte do código continua dentro dos arquivos HTML (veja a seção 6).

---

## 3. Parte A: os 3 níveis físicos (cliente-servidor)

Pense num restaurante bem organizado:

```text
┌──────────────────────────┐        ┌──────────────────────────┐        ┌──────────────────────────┐
│   NÍVEL 1: O CLIENTE     │        │   NÍVEL 2: O SERVIDOR    │        │    NÍVEL 3: OS DADOS     │
│  (celular do cidadão ou  │ ─────► │   (API Node.js no        │ ─────► │  (banco MySQL, com os    │
│       do técnico)        │ ◄───── │        Render)           │ ◄───── │   chamados e as fotos)   │
│                          │  JSON  │                          │  SQL   │                          │
│  "a mesa do restaurante" │        │   "o garçom e a cozinha" │        │  "a despensa trancada"   │
└──────────────────────────┘        └──────────────────────────┘        └──────────────────────────┘
```

1. **Nível 1 — Cliente (`public/`):** roda no navegador do celular. Mostra os botões, lê o GPS, tira a foto e guarda os dados num "caderninho do celular" (**IndexedDB**) quando não há internet na rua. Essas páginas ficam hospedadas na Vercel ou na Netlify.
2. **Nível 2 — Servidor (`server/`):** roda em **Node.js**. É o juiz das regras: confere se o técnico está logado e se tem permissão, verifica se os dados são válidos e conversa com o banco.
3. **Nível 3 — Dados (MySQL):** o cofre onde ficam chamados, postes, usuários, estoque e, em produção, as fotos. **O celular nunca fala direto com o banco**: tudo passa pelo servidor, por segurança.

**Um detalhe importante:** o celular chama sempre o mesmo endereço do site (por exemplo, `/api/chamados`). A Vercel ou a Netlify repassa esse pedido para a API no Render, e faz o mesmo com as fotos (`/uploads/fotos/...`). Para o navegador, parece tudo um site só.

---

## 4. Parte B: as camadas do código (por que dividir em pastas?)

Tanto no cliente (`public/`) quanto no servidor (`server/`), o código é dividido em **camadas**, como os andares de um prédio. Cada andar tem uma função e só pede ajuda ao andar de baixo:

```text
┌──────────────────────────────────────────────────────────┐
│ 1. APRESENTAÇÃO (presentation/)                          │
│    O que entra e sai: telas HTML/CSS ou rotas HTTP       │
├──────────────────────────────────────────────────────────┤
│ 2. APLICAÇÃO (application/)                              │
│    Coordena uma tarefa completa ("fechar um chamado")    │
├──────────────────────────────────────────────────────────┤
│ 3. DOMÍNIO (domain/)                                     │
│    O cérebro: as regras ("chamado fechado pode fechar    │
│    de novo? Não!"). Não sabe nada de banco nem de tela.  │
├──────────────────────────────────────────────────────────┤
│ 4. INFRAESTRUTURA (infrastructure/)                      │
│    O trabalho pesado: SQL, salvar foto, GPS, rede        │
├──────────────────────────────────────────────────────────┤
│ 5. DADOS                                                 │
│    Tabelas do MySQL (servidor) ou IndexedDB (celular)    │
└──────────────────────────────────────────────────────────┘
```

E o **MVC**? Ele mora no andar de cima: na API, as **rotas e os controllers** recebem o pedido e as **views** montam o JSON de resposta; no navegador, os **controllers** e as **`*View.js`** ligam a tela às tarefas.

### Mapa rápido de pastas

Quando quiser mexer em algo, pergunte: **"o que eu quero mudar?"**

| O que você quer fazer? | Onde procurar no servidor (`server/src/`) | Onde procurar no front-end (`public/`) |
| :--- | :--- | :--- |
| Mudar uma **regra de negócio** (ex.: quais status permitem fechar um chamado) | [`domain/Chamado.js`](../server/src/domain/Chamado.js) | [`js/cidadao/domain/Report.js`](../public/js/cidadao/domain/Report.js) ou [`tecnico/js/domain/Close.js`](../public/tecnico/js/domain/Close.js) |
| Mudar o **passo a passo de uma ação** (ex.: o que acontece ao fechar um chamado) | [`application/services/FechamentoService.js`](../server/src/application/services/FechamentoService.js) | [`tecnico/js/application/FecharChamado.js`](../public/tecnico/js/application/FecharChamado.js) |
| Mudar uma **consulta SQL** | [`infrastructure/repositories/`](../server/src/infrastructure/repositories/) | [`js/cidadao/infrastructure/IndexedDbReportRepository.js`](../public/js/cidadao/infrastructure/IndexedDbReportRepository.js) (banco do celular) |
| Criar ou alterar uma **URL da API** (ex.: `POST /api/chamados`) | [`presentation/routes/`](../server/src/presentation/routes/) e [`presentation/controllers/`](../server/src/presentation/controllers/) | [`shared/infrastructure/ApiClient.js`](../public/shared/infrastructure/ApiClient.js) e [`tecnico/js/infrastructure/AcoesApiNode.js`](../public/tecnico/js/infrastructure/AcoesApiNode.js) |
| Mudar **onde as fotos ficam** | [`infrastructure/storage/FotoStorage.js`](../server/src/infrastructure/storage/FotoStorage.js) | — |
| Mudar **cores, botões ou mensagens na tela** | [`presentation/views/`](../server/src/presentation/views/) (formato do JSON) | [`public/index.html`](../public/index.html), [`public/tecnico/index.html`](../public/tecnico/index.html) e `presentation/*View.js` |

---

## 5. Acompanhando 2 histórias reais no código

### História 1: Maria reporta um poste apagado (mesmo sem internet!)

1. **Maria preenche o reporte:** marca a localização pelo GPS, escolhe o tipo de defeito (`apagado`) e tira a foto. O botão **"Enviar reporte"** só libera quando os três estão prontos.
2. **O celular monta o pacote:** a tela ([`public/index.html`](../public/index.html), funções `buildPayload` e `generateProtocol`) cria:
   - um **`id` único (UUID)** gerado no próprio celular (ex.: `6f1c2b0e-...`);
   - um **protocolo legível** para a Maria anotar (ex.: `IC-261104-AB12C`).
   As mesmas regras estão na camada de domínio, em [`Report.js`](../public/js/cidadao/domain/Report.js), que também se recusa a inventar coordenada zero quando falta GPS.
3. **Tenta enviar; se não der, guarda no celular:** com internet, a tela envia `POST /api/chamados`. Se estiver sem sinal ou o envio falhar, o reporte vai para uma fila no **IndexedDB** e a Maria já recebe o protocolo. O reporte está salvo mesmo que o 4G caia na rua.
4. **A fila se esvazia sozinha:** quando a internet volta, a tela reenvia o que está na fila (`flushQueue`). Cada reporte tem até 5 tentativas. Na camada de aplicação, [`SincronizarFila.js`](../public/js/cidadao/application/SincronizarFila.js) faz o mesmo com **espera crescente** (30 segundos, 1 minuto, 2 minutos… até 30 minutos), para não gastar a bateria tentando sem parar.
5. **E se a internet cair bem na hora em que o servidor respondeu? (idempotência)**
   - O celular da Maria acha que falhou e envia o mesmo reporte de novo.
   - Como o reporte tem o mesmo `id`, o MySQL recusa a gravação repetida e o [`ChamadoRepository.js`](../server/src/infrastructure/repositories/ChamadoRepository.js) devolve o chamado que já existe. **Não nasce chamado duplicado.**
6. **E a foto?** A API grava a imagem pelo [`FotoStorage.js`](../server/src/infrastructure/storage/FotoStorage.js) (em disco, quando roda no seu computador; no MySQL, em produção) e guarda no chamado só o endereço `/uploads/fotos/<arquivo>`. É por esse endereço que o técnico vê a foto depois.

---

### História 2: o técnico João fecha um chamado e desconta peças do estoque

João trocou 1 luminária LED no poste `P-0001`. Quando o celular dele envia `POST /api/chamados/IC-261104-AB12C/fechamento`, quatro coisas precisam acontecer no servidor ([`FechamentoService.js`](../server/src/application/services/FechamentoService.js)):

1. Salvar a foto do poste consertado ([`FotoStorage.js`](../server/src/infrastructure/storage/FotoStorage.js)).
2. Registrar a baixa na tabela `fechamentos`.
3. Descontar `1 luminária LED` da tabela `itens_estoque`.
4. Atualizar a ficha do poste `P-0001` e mudar o chamado para `fechado`.

Antes de tudo isso, a API confere o token de João: só técnico ou gestor pode dar baixa.

#### O que é uma transação ACID (`emTransacao`)?

Imagine que o servidor gravou o chamado como `fechado`, mas na hora de descontar a luminária descobriu que o saldo era `0`. Se cada passo fosse solto, o chamado ficaria fechado com o estoque errado.

Por isso usamos [`transacao.js`](../server/src/infrastructure/database/transacao.js) (`BEGIN ... COMMIT / ROLLBACK`):
- **Tudo ou nada:** ou todos os passos dão certo juntos (`COMMIT`), ou o banco desfaz tudo (`ROLLBACK`) como se nada tivesse acontecido.

#### E se dois técnicos clicarem em "Fechar" no mesmo segundo? (`SELECT ... FOR UPDATE`)

No começo da transação, o [`ChamadoRepository.js`](../server/src/infrastructure/repositories/ChamadoRepository.js) faz:

```sql
SELECT * FROM chamados WHERE protocolo = ? FOR UPDATE
```

Esse `FOR UPDATE` põe um "cadeado temporário" na linha do chamado:
- **João** (que chegou um instante antes) trava a linha, desconta o estoque e muda o status para `fechado`.
- **Pedro** (que clicou junto) espera na fila do banco. Quando chega a vez dele, [`Chamado.podeFechar()`](../server/src/domain/Chamado.js) vê que o status já é `fechado`, e a API responde **`409 Conflito`** (*"Chamado já foi fechado por outro técnico."*).

E se o celular de João reenviar a mesma baixa porque a resposta se perdeu? A baixa leva um `operacao_id` único; a API reconhece a operação repetida e devolve a baixa já registrada, sem descontar o estoque de novo.

#### E o PIN de 4 dígitos?

- O PIN nunca é guardado como foi digitado: [`hashPin.js`](../server/src/infrastructure/security/hashPin.js) guarda só um "resumo" (hash `scrypt`).
- Depois de 5 PINs errados em 15 minutos, o login fica bloqueado ([`AuthService.js`](../server/src/application/services/AuthService.js)).
- Mais de 8 tentativas de login por minuto recebem `429` ([`limitarTentativas.js`](../server/src/presentation/middlewares/limitarTentativas.js)).

---

## 6. O que ainda está em obra

- **Código dentro do HTML:** as camadas de `public/js/` estão prontas e testadas, mas boa parte do fluxo das telas ainda está em `<script>` dentro de `public/index.html` e `public/tecnico/index.html`. O técnico já usa as camadas no login, na lista, no fechamento e nos relatórios; o envio do reporte do cidadão ainda é feito pelo script da página. Se você mudar uma regra, confira os dois lugares.
- **Backend antigo:** as telas ainda funcionam com o Google Apps Script, conforme a configuração. O código dele não está no repositório.
- **Data da missão:** a migração usa a coluna `missoes.data`, mas os testes de integração e o Selenium usam `data_missao`. O grupo precisa escolher uma.

---

## 7. Glossário rápido

- **PWA (Progressive Web App):** site em HTML, CSS e JS que pode ser "instalado" na tela inicial do celular e funciona sem internet graças ao `sw.js` (service worker) e ao `IndexedDB`.
- **Offline primeiro:** o app guarda os dados no próprio celular quando não há sinal e sincroniza com o servidor quando a internet volta.
- **Idempotência:** enviar a mesma requisição 1 ou 5 vezes produz o mesmo resultado (não duplica chamados nem desconta o estoque duas vezes).
- **Monólito modular:** todos os módulos do servidor (chamados, postes, estoque, autenticação, fotos) rodam num único programa Node.js, barato e simples de pôr no ar, mas com as pastas bem separadas.
- **Mock (objeto falso para teste):** com `npm test`, a maior parte dos testes não precisa de MySQL ligado: usamos um "banco de mentirinha" na memória para verificar as regras rápido.

---

## 8. Como rodar e testar no seu computador

### 1. Rodar os testes automatizados

```bash
npm install --prefix server   # na primeira vez, depois de clonar ou atualizar
npm run build                 # gera public/shared/config.js (alguns testes leem esse arquivo)
npm test
```

O Node.js roda os testes de [`server/tests/`](../server/tests/) em poucos segundos e mostra um `✔` verde para cada caso aprovado, com a cobertura no final. Sem MySQL, falham só a suíte de integração ponta a ponta e os testes CT que se conectam ao banco de verdade (CT-14, CT-18 a CT-21, CT-23, CT-24 e CT-28).

### 2. Preparar o banco e a API

1. Copie `.env.example` para `.env` e preencha a conexão MySQL (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). Detalhes em [Conexão local com MySQL](06-CONEXAO-MYSQL.md).
2. Crie as tabelas rodando, nesta ordem, `server/database/migrations/001_inicial_mysql.sql` e `002_fotos_mysql.sql`.
3. Confira a conexão: `npm run db:check`.
4. Crie um usuário para entrar no app do técnico:

   ```bash
   npm run usuario:cadastrar -- --nome "Seu Nome" --perfil tecnico --pin 1234
   ```

5. Suba a API:

   ```bash
   npm run start:server
   ```

   Ela roda em `http://localhost:3001`, com as rotas `/api/auth`, `/api/chamados`, `/api/postes`, `/api/estoque`, `/api/missoes` e `/uploads/fotos`.

### 3. Abrir as telas

```bash
npm run dev
```

- `http://localhost:3000/`: **app do cidadão**.
- `http://localhost:3000/tecnico/`: **painel do técnico, gestor e almoxarifado**.

Em produção, o site e a API ficam no mesmo endereço, e algumas telas chamam `/api/...` sem informar o servidor. Para ver o fluxo completo no seu computador com tudo no mesmo endereço, use os scripts de verificação no navegador dos relatórios de testes (por exemplo, [`docs/Relatório de Testes/Fotos e usuários/scripts/`](Relatório%20de%20Testes/Fotos%20e%20usuários/scripts/)), que sobem o site e a API juntos.
