# Relatório de Testes de Integração com Selenium

- **Responsável:** Davi Santiago de Jesus
- **Data:** 27/11/2026
- **Versão testada:** `main` em `6dbb74a`, considerando o sistema completo
- **Ferramenta:** Selenium WebDriver 4.51 (Node.js 24.16) com Google Chrome 158
- **Disciplina:** Garantia da Qualidade de Software — Projeto A3 (Ilumina Coruripe)

## Resumo

Os testes de integração consideram o sistema **completo**: as telas do cidadão e do painel técnico, a API Node e o MySQL, todos reais, sem nenhum dublê entre a tela e o banco. Cada caso começa na tela, controlada pelo Selenium, e termina conferindo o resultado **direto no MySQL**.

| | Resultado |
|---|---|
| Casos de integração | **13** |
| Aprovados | **8** |
| Reprovados | **5**, todos por defeito do sistema (nenhum por falha do teste) |
| Execuções completas | 2, com resultados idênticos (sem instabilidade) |

**O que funciona de ponta a ponta:**
- login, sessão e bloqueio de PIN errado;
- lista de chamados vinda do MySQL;
- fechamento do técnico com e sem internet;
- regra de perfil (só o gestor fecha administrativamente);
- fechamento administrativo;
- logout.

**O que não funciona:**
- o reporte do cidadão não chega ao MySQL (DEF-01);
- o link com parâmetros não abre sem internet (DEF-14);
- o relatório de postes e o almoxarifado não estão ligados à API Node (DEF-15 e DEF-16, encontrados nesta rodada).

## 1. Escolha da ferramenta

O grupo deveria escolher **uma** destas ferramentas: JUnit, JMeter, Selenium, Cypress, PHPUnit ou Cucumber. O que pesou na escolha:

- **A linguagem do projeto:** JavaScript nas telas e no servidor (Node.js), com MySQL.
- **O que o teste de integração já existente cobre:** o INT-01 a INT-15 (`server/tests/integracao-sistema.test.js`) já testa **API ↔ MySQL**. Faltava a integração **tela → API → MySQL**.
- **O modo offline:** o app é um PWA, e o funcionamento sem internet é requisito (RNF01, UC03, UC05-A5). A ferramenta precisa conseguir desligar a internet do navegador.

| Ferramenta | Dá para usar? | Por quê |
|---|---|---|
| **Selenium** | ✅ **Sim (escolhida)** | Controla o Chrome real e tem biblioteca oficial para Node.js, a linguagem do projeto. Desliga a internet do navegador e muda o GPS pelo protocolo do Chrome. Lida com caixas de confirmação (`confirm()`), várias janelas e captura de tela. Cobre tela, API e MySQL no mesmo teste. É livre, padrão W3C (WebDriver) e funciona em Chrome, Edge e Firefox. |
| **Cypress** | ⚠️ Com limitações | É JavaScript e bom para testes de tela, mas **não tem modo offline nativo**, lida mal com *service worker* (o coração do PWA), não trabalha com mais de uma aba (o relatório de postes abre em outra janela) e exige baixar cerca de 500 MB. Os casos offline ficariam de fora ou dependentes de improviso. |
| **JMeter** | ⚠️ Só parte | Roda (o Java 17 está instalado) e é ótimo para **carga** e para testar a API por HTTP. Mas não abre as telas, e a parte API ↔ MySQL já está coberta pelo INT-01 a INT-15. Seria útil como complemento para desempenho, não para integração completa. |
| **Cucumber** | ⚠️ Só junto de outra | É uma camada para escrever casos em **Dado / Quando / Então**, mas não abre o navegador: precisaria do Selenium embaixo. Os casos deste relatório já seguem esse formato, sem a ferramenta extra. |
| **JUnit** | ❌ Não | É para código **Java**, e o projeto não tem Java. Daria para testar a API por HTTP, mas seria uma segunda linguagem só para repetir o INT-01 a INT-15, e sem as telas. |
| **PHPUnit** | ❌ Não | É para código **PHP**. O projeto não tem PHP, e o PHP nem está instalado no ambiente. |

**Alternativa fora da lista:** o **Playwright**, já usado nos testes offline do grupo, faria o mesmo trabalho do Selenium. Ele não foi usado aqui porque não está entre as ferramentas permitidas.

## 2. Como o "sistema completo" foi montado

```text
Selenium WebDriver ──► Google Chrome (sem janela, tamanho de celular, GPS em Coruripe/AL)
                            │  mesma origem, como em produção (API_URL = '/')
                            ▼
                     servidor de teste
                       ├── public/          telas do cidadão e do técnico (service workers incluídos)
                       └── /api/*  ──────►  API Node REAL (server/src/app.js)
                                                 └──► MySQL 8.0 REAL (Docker), todas as tabelas
```

- **Banco:** a cada execução, o banco `db_iluminacao_selenium` é apagado e recriado.
  - As tabelas de login vêm do script do projeto (`server/scripts/setup-auth-mysql.js`).
  - As operacionais têm a mesma estrutura do INT-01 a INT-15.
- **Massa de dados (fictícia):**
  - 1 técnico (PIN 0123), 1 gestor (0456) e 1 almoxarife (0789);
  - 3 postes;
  - 1 item de estoque com saldo 50;
  - 4 chamados abertos, criados **pela própria API** (`POST /api/chamados`), como o app faria.
- **Sem internet de verdade:** o Chrome fica offline (`navigator.onLine = false`) **e** o servidor para de responder. O segundo passo é necessário porque o Chrome pode deixar o *service worker* ir à rede mesmo com a página offline, o que gerou o falso positivo do DEF-14 na rodada offline de 12/11.
- **Conferência:** depois de cada ação na tela, o teste consulta o MySQL (`SELECT`) e compara com o esperado.

## 3. Casos de teste e resultados

| Caso | Requisito | Dado / Quando / Então | Resultado | Evidência |
|---|---|---|---|---|
| **SEL-01** | UC01; RF01 | **Dado** o app aberto com internet, **quando** o cidadão envia um reporte completo, **então** vê "Reporte enviado" e o chamado aparece na tabela `chamados` | ❌ **Reprovado** | Tela "Salvo sem sinal"; a API recebeu `application/x-www-form-urlencoded`; protocolo **não** está no MySQL ([captura](evidencias/capturas/SEL-01-depois-de-enviar.png)) |
| **SEL-02** | UC01-A1; UC03; RF02; CA03 | **Dado** o app sem internet, **quando** o cidadão envia e depois a internet volta, **então** o reporte sai da fila e é gravado 1 vez | ❌ **Reprovado** | Fila: 1 → 1 (1 tentativa); no MySQL: 0 ([antes](evidencias/capturas/SEL-02-salvo-sem-internet.png), [depois](evidencias/capturas/SEL-02-depois-da-internet-voltar.png)) |
| **SEL-03** | RNF01 | **Dado** o app já aberto uma vez, **quando** o cidadão abre `/?utm_source=whatsapp` sem internet, **então** o formulário aparece | ❌ **Reprovado** | Página de erro do Chrome, `ERR_FAILED` ([captura](evidencias/capturas/SEL-03-link-sem-internet.png)) |
| **SEL-04** | UC04; RF03 | **Dado** um técnico com PIN 0123, **quando** digita o PIN, **então** o painel abre e uma sessão é gravada em `sessoes` | ✅ Aprovado | `sessoes`: 0 → 1 ([captura](evidencias/capturas/SEL-04-painel.png)) |
| **SEL-05** | UC05; RF04 | **Dado** 4 chamados abertos no MySQL, **quando** o técnico está no painel, **então** a lista mostra exatamente esses 4 | ✅ Aprovado | Tela = banco = SEL01 a SEL04 ([captura](evidencias/capturas/SEL-05-lista.png)) |
| **SEL-06** | UC05; RF04; CA04 | **Dado** o IC-261127-SEL01 aberto, **quando** o técnico preenche e confirma o fechamento, **então** há 1 fechamento no MySQL e o chamado fecha | ✅ Aprovado | "Chamado fechado!"; 1 fechamento "Concluído"; status `fechado` ([formulário](evidencias/capturas/SEL-06-formulario-preenchido.png), [resultado](evidencias/capturas/SEL-06-resultado.png)) |
| **SEL-07** | UC05-A5; CA03; CA04 | **Dado** o técnico sem internet, **quando** fecha o IC-261127-SEL02 e a internet volta, **então** o fechamento é gravado 1 vez | ✅ Aprovado | "Salvo no aparelho"; fila 1 → 0; MySQL 0 → 1 ([sem internet](evidencias/capturas/SEL-07-salvo-sem-internet.png), [depois](evidencias/capturas/SEL-07-depois-da-internet-voltar.png)) |
| **SEL-08** | Regra de perfil | **Dado** um técnico comum, **quando** tenta o fechamento administrativo, **então** é recusado e nada é gravado | ✅ Aprovado | "Somente o gestor pode fechar administrativamente."; administrativos 0 → 0 ([captura](evidencias/capturas/SEL-08-recusado.png)) |
| **SEL-09** | UC04; PR #14 | **Dado** o técnico logado, **quando** toca em Sair e digita o PIN de novo, **então** os pontos estão vazios e o login funciona | ✅ Aprovado | 0 pontos preenchidos; `sessoes` 1 → 2 ([captura](evidencias/capturas/SEL-09-pin-depois-do-logout.png)) |
| **SEL-10** | UC04-A2 | **Dado** a tela do PIN, **quando** alguém digita 9999, **então** vê "PIN incorreto" e a tentativa é gravada | ✅ Aprovado | "PIN incorreto."; `tentativas_login` 2 → 3 ([captura](evidencias/capturas/SEL-10-pin-incorreto.png)) |
| **SEL-11** | Fechamento administrativo | **Dado** o gestor logado, **quando** fecha o IC-261127-SEL03 administrativamente, **então** o MySQL tem 1 fechamento administrativo e o estoque não muda | ✅ Aprovado | Confirmação nativa aceita; `administrativo = 1`; saldo 50 → 50 ([formulário](evidencias/capturas/SEL-11-formulario.png), [resultado](evidencias/capturas/SEL-11-resultado.png)) |
| **SEL-12** | Relatórios do gestor | **Dado** 3 postes no MySQL, **quando** o gestor gera o relatório de postes, **então** o relatório abre com os 3 | ❌ **Reprovado** | "Não foi possível carregar."; nenhuma janela aberta ([captura](evidencias/capturas/SEL-12-sem-relatorio.png)) |
| **SEL-13** | Almoxarifado | **Dado** um almoxarife com PIN 0789, **quando** entra em Gestão de Material, **então** vê o item do MySQL | ❌ **Reprovado** | "PIN incorreto." com o PIN certo; o pedido foi para `/api` em `text/plain` ([captura](evidencias/capturas/SEL-13-almoxarifado.png)) |

**Estado do MySQL ao final** (em [resultados.json](evidencias/resultados.json), campo `bancoAoFinal`):
- SEL01 e SEL02 fechados pelo técnico, SEL03 fechado pelo gestor e SEL04 ainda aberto;
- 3 fechamentos, um deles administrativo;
- 3 sessões;
- estoque intacto (saldo 50).

### Segunda execução e prova da correção do DEF-14

- **Segunda execução completa:** os mesmos 8 aprovados e 5 reprovados, pelos mesmos motivos ([saída](evidencias/saida-execucao-2.txt), [resultados](evidencias/execucao-2/resultados.json)). Nenhum caso instável.
- **SEL-03 com a correção do DEF-14** (branch `refactor/remove-qr-code`): ✅ **aprovado**, o app abre sem internet ([captura](evidencias/correcao-def14/SEL-03-link-sem-internet.png), [resultado](evidencias/correcao-def14/resultados.json)). O mesmo teste de integração confirma a correção.

## 4. Defeitos

| Defeito | Severidade | Casos | O que acontece | Onde | Situação |
|---|---|---|---|---|---|
| **DEF-01** | Crítica | SEL-01, SEL-02 | O app do cidadão envia o reporte em `form-urlencoded` e sem `id`; a API responde 400 e o reporte fica na fila para sempre. Com internet, a tela mostra "Salvo sem sinal". | `public/index.html`, `postReport` e `buildPayload` | Já conhecido (testes offline). **Corrigido em 27/11** ([telas na API Node](<../Telas na API Node/README.md>)); falta repetir SEL-01 e SEL-02 |
| **DEF-14** | Média | SEL-03 | Sem internet, um link com parâmetros abre a página de erro do navegador. | `public/sw.js`, `caches.match(req)` | Corrigido no PR `refactor/remove-qr-code` (comprovado acima) |
| **DEF-15** (novo) | Média | SEL-12 | O relatório de postes (e o histórico do poste) pede a ação `list_postes`/`get_poste_history` do Apps Script. A API Node oferece `GET /api/postes` e `GET /api/postes/:id/historico`. | `public/tecnico/index.html`, `gerarRelatorioPostes` e `abrirHistoricoPoste` | **Corrigido em 27/11** ([telas na API Node](<../Telas na API Node/README.md>)); falta repetir SEL-12 |
| **DEF-16** (novo) | Alta | SEL-13 | O login do almoxarifado envia `{ action: 'almox_login' }` para `/api` (formato do Apps Script). A API Node espera `POST /api/auth/almoxarifado`, então o almoxarife **nunca** consegue entrar, e a mensagem engana ("PIN incorreto."). | `public/tecnico/index.html`, `loginAlmox` | **Corrigido em 27/11** ([telas na API Node](<../Telas na API Node/README.md>)); falta repetir SEL-13 |

O DEF-01, o DEF-15 e o DEF-16 têm a mesma raiz: **telas que ainda falam no formato do Apps Script**. O técnico (login, lista e fechamento) já foi migrado para a API Node no UC05, e é justamente a parte que passa nos testes.

## 5. Códigos e scripts usados

Os arquivos ficam em [`server/tests/integracao-selenium/`](../../../server/tests/integracao-selenium/).

| Arquivo | Para quê |
|---|---|
| `ambiente.js` | Recria o banco, grava a massa de dados e sobe o servidor (telas + API Node na mesma origem) |
| `navegador.js` | Utilitários do Selenium: abrir o Chrome, GPS, internet ligada/desligada, capturas, leitura da fila (IndexedDB) |
| `integracao.selenium.js` | Os 13 casos, executados com `node:test` |

**Abrir o Chrome com GPS em Coruripe/AL** (`navegador.js`):

```js
const opcoes = new chrome.Options()
  .addArguments('--headless=new', '--window-size=420,900', '--lang=pt-BR')
  .setUserPreferences({ 'profile.default_content_setting_values.geolocation': 1 });
const driver = await new Builder().forBrowser('chrome').setChromeOptions(opcoes).build();
await driver.sendDevToolsCommand('Emulation.setGeolocationOverride', { latitude: -10.1253, longitude: -36.1756, accuracy: 6 });
```

**"Sem internet" de verdade** (Chrome offline **e** servidor mudo):

```js
async function semInternet(driver, srv) {
  srv.estado.semInternet = true;   // o servidor derruba a conexão sem responder
  await driver.setNetworkConditions({ offline: true, latency: 0, download_throughput: 0, upload_throughput: 0 });
}
```

**Um caso completo: tela → fila do aparelho → API → MySQL** (SEL-07, resumido):

```js
await nav.semInternet(tec, srv);
const r = await fecharPelaTela(tec, 'IC-261127-SEL02', ev);              // usa só a tela
const filaOffline = await nav.lerFila(tec, 'ilumina_tec', 'close_queue'); // IndexedDB do aparelho
await nav.comInternet(tec, srv);
await nav.aguardar(tec, async () => (await nav.lerFila(tec, 'ilumina_tec', 'close_queue')).length === 0, 25000);
const noBanco = await contar('fechamentos f JOIN chamados c ON c.id = f.chamado_id', "c.protocolo = 'IC-261127-SEL02'");
assert.equal(filaOffline.length, 1, 'sem internet o fechamento deveria ficar na fila');
assert.equal(noBanco, 1, `com a internet de volta deveria haver 1 fechamento (há ${noBanco})`);
```

**Caixa de confirmação do navegador** (SEL-11):

```js
await nav.clicar(ges, '#adm-submit-btn');
await ges.wait(until.alertIsPresent(), 5000, 'a confirmação não apareceu');
await (await ges.switchTo().alert()).accept();
```

**Evidência de cada caso:** a função `caso()` registra o Dado/Quando/Então, o que a tela mostrou, as consultas ao MySQL e as capturas. Tudo vai para `evidencias/resultados.json`, mesmo quando o caso reprova.

## 6. Como repetir

Pré-requisitos: Node.js 18 ou mais novo, Google Chrome e um MySQL 8 de teste (por exemplo, `docker run -d --name sel-mysql -e MYSQL_ROOT_PASSWORD=123456 -p 3307:3306 mysql:8.0`).

```bash
npm install --prefix server          # instala o selenium-webdriver (dependência de desenvolvimento)
DB_PORT=3307 npm run test:selenium   # apaga e recria o banco db_iluminacao_selenium
```

O próprio Selenium baixa o `chromedriver` compatível com o Chrome instalado, pelo *Selenium Manager*. As capturas e o `resultados.json` são gravados nesta pasta; para gravar em outro lugar, use `EVIDENCIAS=<pasta>`.

O arquivo se chama `integracao.selenium.js` e **não** `*.test.js` de propósito: assim ele não entra no `npm test` do CI, que não tem Chrome nem o banco completo.

## 7. Limites

- Só o **Chrome** (sem janela, em tamanho de celular) foi testado. Não foram testados Edge, Firefox, Safari no iPhone nem aparelho físico.
- O MySQL é de teste (Docker), com a mesma estrutura do INT-01 a INT-15, e a massa de dados é fictícia. A estrutura definitiva do banco do grupo ainda pode mudar.
- A foto usada nos envios é o ícone do app (192×192), não uma foto real de câmera.
- O teste de carga (quantos usuários ao mesmo tempo) não faz parte desta rodada. Para isso, o JMeter seria o complemento indicado.

## 8. Evidências

| Arquivo | Conteúdo |
|---|---|
| [resultados.json](evidencias/resultados.json) | Os 13 casos: Dado/Quando/Então, o que a tela mostrou, consultas ao MySQL, capturas, erro e duração; estado final do banco e todos os pedidos à API |
| [capturas/](evidencias/capturas/) | 19 capturas de tela, nomeadas pelo caso (`SEL-07-salvo-sem-internet.png` etc.) |
| [saida-execucao-1.txt](evidencias/saida-execucao-1.txt) | Saída da execução oficial |
| [saida-execucao-2.txt](evidencias/saida-execucao-2.txt) · [execucao-2/](evidencias/execucao-2/) | Segunda execução completa (mesmos resultados) |
| [correcao-def14/](evidencias/correcao-def14/) | SEL-03 rodado na branch `refactor/remove-qr-code`: aprovado |
