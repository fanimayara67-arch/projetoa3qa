# Guia de Desenvolvimento para Iniciantes — Ilumina Coruripe

> **Conexão MySQL:** a camada de infraestrutura agora permite configurar e testar o acesso ao MySQL local. Veja [Conexão local com MySQL](06-CONEXAO-MYSQL.md). As explicações abaixo sobre SQL e tabelas PostgreSQL descrevem a implementação anterior; a migração dessas consultas e a criação de tabelas não fazem parte desta etapa.

> **Sprint 2:** os [itens 4 — Rota do dia e 6 — Fechamento administrativo](07-SPRINT2-ROTA-E-FECHAMENTO-ADMINISTRATIVO.md) já têm implementação e testes na arquitetura existente. O guia específico explica o fluxo, os testes e o alinhamento de banco ainda necessário.

> **Para quem é este guia?**
> Se você está começando na programação ou chegando agora no projeto **Ilumina Coruripe**, este documento explica **do zero**, sem jargões complicados, como o sistema funciona, por que organizamos as pastas desse jeito e como acompanhar o caminho de cada funcionalidade no código.

---

## 1. O que é o Ilumina Coruripe?

Imagine que um poste da sua rua apagou à noite. Antes, você precisava descobrir um telefone da prefeitura ou ir até lá pessoalmente. Com o **Ilumina Coruripe**, tudo acontece pelo celular em dois aplicativos web (chamados de **PWAs** — sites que funcionam como aplicativos de celular, inclusive quando a internet cai):

1. **App do Cidadão (`/`):** Qualquer morador captura a localização com o GPS do celular, tira uma foto do problema e aperta **"Enviar reporte"**.
2. **App da Equipe Técnica (`/tecnico/`):** O eletricista em campo vê a lista de postes com defeito no mapa, conserta a luminária, tira uma foto do serviço pronto, informa quais peças gastou (ex.: 1 lâmpada LED e 1 reator) e dá baixa no chamado. Lá também ficam as telas do **Gestor** (que planeja rotas e emite relatórios) e do **Almoxarife** (que controla o estoque de peças).

---

## 2. O Problema que Precisávamos Resolver (Antes × Depois)

### Como era antes (O "Quarto Bagunçado")
No início do projeto:
- Todo o código do Cidadão estava num único arquivo (`public/index.html` com **1.650 linhas**).
- Todo o código do Técnico estava num único arquivo (`public/tecnico/index.html` com **4.960 linhas**).
- O "banco de dados" era uma **planilha do Google Sheets** controlada por scripts ocultos no Google Apps Script.

**Por que isso dava problema?**
1. **Difícil de achar e consertar erros:** Visual da tela, cálculos de GPS e chamadas de internet estavam todos misturados.
2. **Conflito entre dois técnicos:** Se dois eletricistas abrissem o mesmo chamado e clicassem em "Fechar" quase juntos, o segundo sobrescrevia o primeiro na planilha sem aviso, ou o estoque descontava peças duas vezes.
3. **Senhas fracas:** O PIN de 4 dígitos não tinha proteção forte contra alguém tentando adivinhar `0000`, `0001`, `0002`...

### Como ficou agora (A Casa Organizada)
Aplicamos a **Arquitetura em Camadas em Monólito Modular (Cliente-Servidor em 3 Níveis)**. Esse nome parece difícil, mas a ideia é muito simples — vamos dividi-la em duas partes!

---

## 3. Parte A: Os 3 Níveis Físicos (Cliente-Servidor 3-Tier)

Pense num restaurante bem organizado:

```text
┌──────────────────────────┐        ┌──────────────────────────┐        ┌──────────────────────────┐
│   NÍVEL 1: O CLIENTE     │        │   NÍVEL 2: O SERVIDOR    │        │    NÍVEL 3: OS DADOS     │
│  (Celular do Cidadão ou  │ ─────► │   (Servidor Node.js da   │ ─────► │  (Banco PostgreSQL +     │
│       do Técnico)        │ ◄───── │       Prefeitura)        │ ◄───── │    Pasta de Fotos)       │
│                          │  JSON  │                          │  SQL   │                          │
│  "A Mesa do Restaurante" │        │   "O Garçom + Cozinha"   │        │  "A Despensa Trancada"   │
└──────────────────────────┘        └──────────────────────────┘        └──────────────────────────┘
```

1. **Nível 1 — Cliente (`public/`):** Roda no navegador do celular. Mostra os botões, lê o GPS, tira a foto e guarda os dados num "caderninho interno do celular" (**IndexedDB**) se não houver internet na rua.
2. **Nível 2 — Servidor (`server/`):** Roda em **Node.js**. É o guarda de trânsito e juiz das regras: confere se o técnico está logado, verifica se os dados são válidos e conversa com o banco de dados.
3. **Nível 3 — Dados (`PostgreSQL`):** O cofre onde ficam guardados os chamados, postes, usuários e estoque. **O celular nunca fala direto com o banco de dados** — tudo passa pelo Servidor Node.js por segurança.

---

## 4. Parte B: As 5 Camadas do Código (Por que dividir em pastas?)

Tanto dentro do cliente (`public/`) quanto dentro do servidor (`server/`), dividimos o código em **camadas horizontais**, como os andares de um prédio. Cada andar tem **uma única função** e só pede ajuda para o andar de baixo:

```text
┌──────────────────────────────────────────────────────────┐
│ 1. APRESENTAÇÃO (presentation/)                          │
│    Cuida do que entra e sai: Telas HTML/CSS ou Rotas HTTP│
├──────────────────────────────────────────────────────────┤
│ 2. APLICAÇÃO (application/)                              │
│    Coordena uma tarefa completa ("Fechar um chamado")    │
├──────────────────────────────────────────────────────────┤
│ 3. DOMÍNIO (domain/)                                     │
│    O cérebro puro: regras ("Chamado fechado pode fechar  │
│    de novo? Não!"). Não sabe nada de banco nem de tela.  │
├──────────────────────────────────────────────────────────┤
│ 4. INFRAESTRUTURA / PERSISTÊNCIA (infrastructure/)       │
│    Trabalho pesado: comandos SQL, salvar foto, GPS, Rede │
├──────────────────────────────────────────────────────────┤
│ 5. DADOS                                                 │
│    Tabelas do PostgreSQL (no servidor) ou IndexedDB      │
└──────────────────────────────────────────────────────────┘
```

### Mapa Rápido de Pastas para você nunca se perder

Quando você quiser mexer em algo no projeto, basta se perguntar: **"O que eu quero mudar?"**

| O que você quer fazer? | Onde procurar no Servidor (`server/src/`) | Onde procurar no Front-end (`public/`) |
| :--- | :--- | :--- |
| Mudar uma **regra de negócio** (ex.: quais status permitem fechar um chamado) | [`domain/Chamado.js`](../server/src/domain/Chamado.js) | [`js/cidadao/domain/Report.js`](../public/js/cidadao/domain/Report.js) ou [`tecnico/js/domain/Close.js`](../public/tecnico/js/domain/Close.js) |
| Mudar o **passo a passo de uma ação** (ex.: o que acontece quando fecha um chamado) | [`application/services/FechamentoService.js`](../server/src/application/services/FechamentoService.js) | [`js/cidadao/application/EnviarReporte.js`](../public/js/cidadao/application/EnviarReporte.js) |
| Mudar uma **consulta no banco de dados (SQL)** | [`infrastructure/repositories/`](../server/src/infrastructure/repositories/) | [`js/cidadao/infrastructure/IndexedDbReportRepository.js`](../public/js/cidadao/infrastructure/IndexedDbReportRepository.js) |
| Criar ou alterar uma **URL da API** (ex.: `POST /api/chamados`) | [`presentation/routes/`](../server/src/presentation/routes/) e [`presentation/controllers/`](../server/src/presentation/controllers/) | [`shared/infrastructure/ApiClient.js`](../public/shared/infrastructure/ApiClient.js) |
| Mudar **cores, botões ou mensagens na tela** | [`presentation/views/`](../server/src/presentation/views/) (formato do JSON) | [`public/index.html`](../public/index.html) e `presentation/*View.js` |

---

## 5. Acompanhando 2 Histórias Reais no Código

Para entender de verdade, vamos seguir o caminho de duas ações importantes do começo ao fim.

### História 1: Maria reporta um poste apagado (mesmo sem internet!)

1. **Maria abre o app e preenche os dados:** A camada de **Apresentação** ([`FormView.js`](../public/js/cidadao/presentation/FormView.js)) lê o tipo de defeito (`apagado`), a foto e o GPS.
2. **Validação no Domínio:** O [`ReportController.js`](../public/js/cidadao/presentation/ReportController.js) chama [`EnviarReporte.js`](../public/js/cidadao/application/EnviarReporte.js), que usa [`Report.js`](../public/js/cidadao/domain/Report.js) para criar um pacote com:
   - Um **`id` único (UUID)** gerado no celular (ex.: `6f1c2b0e-...`).
   - Um **protocolo legível** para a Maria anotar (ex.: `IC-261104-AB12C`).
   - Ele confere: *"Tem foto? Tem GPS?"* Se não tiver GPS, ele **nunca inventa coordenada zero** — pede para capturar de novo.
3. **Salva primeiro no celular (Offline-First):** Antes mesmo de tentar usar a internet, [`IndexedDbReportRepository.js`](../public/js/cidadao/infrastructure/IndexedDbReportRepository.js) grava o chamado no banco interno do celular (`IndexedDB`) com o estado `pending` (pendente). Assim, se a bateria acabar ou o 4G cair na rua, o chamado da Maria **já está salvo**.
4. **Sincronização Inteligente ([`SincronizarFila.js`](../public/js/cidadao/application/SincronizarFila.js)):**
   - Se tiver internet, envia `POST /api/chamados` para o servidor Node.js.
   - Se a internet falhar, ele usa **Backoff Exponencial** (espera 30 segundos na 1ª falha, 1 minuto na 2ª, 2 minutos na 3ª...) para não gastar a bateria do celular tentando mil vezes por segundo.
5. **E se a internet cair bem na hora que o servidor respondeu? (Idempotência):**
   - O celular da Maria acha que falhou e envia o mesmo chamado de novo depois.
   - Como o chamado tem o mesmo `id` (UUID), o [`ChamadoRepository.js`](../server/src/infrastructure/repositories/ChamadoRepository.js) no servidor usa `ON CONFLICT (id) DO UPDATE`: o PostgreSQL reconhece que aquele `id` já existe e **não cria chamado duplicado**!

---

### História 2: O Técnico João fecha um chamado e desconta peças do estoque

Imagine que o técnico João trocou 1 luminária LED no poste `P-0001`. Quando o celular dele envia `POST /api/chamados/IC-261104-AB12C/fechamento`, quatro coisas precisam acontecer no servidor ([`FechamentoService.js`](../server/src/application/services/FechamentoService.js)):

1. Salvar a foto do poste consertado ([`FotoStorage.js`](../server/src/infrastructure/storage/FotoStorage.js)).
2. Registrar os dados da baixa na tabela `fechamentos`.
3. Descontar `1 luminária LED` da tabela `itens_estoque`.
4. Atualizar a ficha do poste `P-0001` e mudar o chamado para `fechado`.

#### O que é uma Transação ACID (`emTransacao`)?
Imagine que o servidor gravou que o chamado está `fechado`, mas na hora de descontar a luminária do estoque descobriu que o saldo era `0`! Se cada passo fosse solto, o chamado ficaria fechado com o estoque errado.

Por isso usamos [`transacao.js`](../server/src/infrastructure/database/transacao.js) (`BEGIN ... COMMIT / ROLLBACK`):
- **Tudo ou Nada:** Ou os passos no banco dão todos certo juntos (`COMMIT`), ou o banco desfaz tudo automaticamente (`ROLLBACK`) como se nada tivesse acontecido.

#### E se dois técnicos clicarem em "Fechar" no mesmo segundo? (`SELECT ... FOR UPDATE`)
No passo 1 da transação, o [`ChamadoRepository.js`](../server/src/infrastructure/repositories/ChamadoRepository.js) faz:
```sql
SELECT * FROM chamados WHERE protocolo = $1 FOR UPDATE
```
Esse `FOR UPDATE` coloca um "cadeado temporário" na linha daquele chamado:
- O técnico **João** (que chegou 1 milésimo de segundo antes) trava a linha, desconta o estoque e muda o status para `fechado`.
- O técnico **Pedro** (que clicou junto) fica esperando na fila do banco por 1 milésimo de segundo. Quando a vez dele chega, o [`Chamado.podeFechar()`](../server/src/domain/Chamado.js) vê que o status já virou `fechado` e devolve o erro **`409 Conflito`** (*"Chamado já foi fechado por outro técnico"*). Zero bagunça!

---

## 6. Glossário Rápido (Traduzindo o "Economês" da Engenharia de Software)

- **PWA (Progressive Web App):** Um site construído com HTML, CSS e JS que pode ser "instalado" na tela inicial do celular e funciona mesmo sem internet graças ao `sw.js` (Service Worker) e ao `IndexedDB`.
- **Offline-First:** Filosofia onde o aplicativo salva tudo primeiro na memória do próprio celular e sincroniza com o servidor em segundo plano quando houver sinal.
- **Idempotência:** Garantia de que enviar a mesma requisição 1 vez ou 5 vezes seguidas produz exatamente o mesmo resultado (evita duplicar chamados ou cobrar estoque duas vezes).
- **Monólito Modular:** Todos os módulos do servidor (Chamados, Postes, Estoque, Autenticação) rodam juntos num único programa Node.js (barato e simples de colocar no ar), mas com pastas tão bem separadas que não viram uma bagunça.
- **Mock (Objeto Falso para Teste):** Quando testamos o código no computador com `npm test`, não precisamos de um banco PostgreSQL real ligado. Criamos um "banco de mentirinha" na memória só para verificar se as regras funcionam rápido.

---

## 7. Como Rodar e Testar o Projeto no seu Computador

### 1. Rodar os testes automatizados (Garantia de Qualidade / QA)
Para verificar se todas as camadas, regras de domínio, transações e limites de segurança estão funcionando:
```bash
npm install --prefix server  # na primeira execução após clonar/atualizar
npm test
```
O Node.js vai executar os testes dentro de [`server/tests/`](../server/tests/) em menos de 1 segundo e mostrar um `✔` verde para cada regra validada!

### 2. Rodar o Front-end (PWAs Cidadão e Técnico)
1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
2. Suba o servidor local de desenvolvimento:
   ```bash
   npm run dev
   ```
   - Abra `http://localhost:3000/` para ver o **App do Cidadão**.
   - Abra `http://localhost:3000/tecnico/` para ver o **Painel Técnico / Gestor / Almoxarifado**.

### 3. Subir o Servidor Node.js (API REST)
```bash
npm run start:server
```
O servidor iniciará na porta `3001` (`http://localhost:3001`) com todas as rotas `/api/chamados`, `/api/postes`, `/api/auth` e `/api/estoque`.
