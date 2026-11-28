/**
 * TESTES DE INTEGRAÇÃO COM SELENIUM — ILUMINA CORURIPE
 *
 * Cada caso começa na TELA (Chrome controlado pelo Selenium WebDriver), passa
 * pela API Node REAL e termina conferindo o MySQL REAL:
 *
 *     tela ──► service worker / IndexedDB ──► API Node ──► MySQL
 *
 * Como rodar (na raiz do projeto, com Google Chrome e um MySQL de teste):
 *   npm install --prefix server
 *   npm run test:selenium
 *
 * Variáveis: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (padrão: banco
 * "db_iluminacao_selenium", que é APAGADO e recriado a cada execução),
 * EVIDENCIAS (pasta das capturas e do JSON de resultados), CHROME_PATH.
 */
const path = require('node:path');
const fs = require('node:fs');

process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PORT ??= '3306';
process.env.DB_USER ??= 'root';
process.env.DB_PASSWORD ??= '123456';
process.env.DB_NAME ??= 'db_iluminacao_selenium';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const amb = require('./ambiente');
const nav = require('./navegador');
const { By, until } = nav;

const EVID = path.resolve(process.env.EVIDENCIAS || path.join(amb.RAIZ, 'docs/Relatório de Testes/Integração com Selenium/evidencias'));
const FOTOS = path.join(EVID, 'capturas');

let srv;
let pool;
let fotoPoste;
const resultados = [];
const ambiente = {};

/* ───────────── Registro de cada caso (evidência) ───────────── */

function caso(id, meta, corpo) {
  test(`${id} ${meta.titulo}`, async () => {
    const ev = { id, ...meta, obtido: {}, banco: {}, capturas: [], resultado: 'Aprovado', erro: null };
    const inicio = Date.now();
    try {
      await corpo(ev);
    } catch (e) {
      ev.resultado = 'Reprovado';
      ev.erro = String(e.message || e).split('\n')[0];
      throw e;
    } finally {
      // Um caso que falhou no meio não pode deixar o servidor "sem internet" para os próximos.
      srv.estado.semInternet = false;
      ev.duracaoMs = Date.now() - inicio;
      resultados.push(ev);
    }
  });
}

const linhas = async (sql, params = []) => (await pool.query(sql, params)).rows;
const um = async (sql, params = []) => (await linhas(sql, params))[0];
const contar = async (tabela, where = '1=1', params = []) => Number((await um(`SELECT COUNT(*) AS n FROM ${tabela} WHERE ${where}`, params)).n);
const foto = async (driver, ev, nome) => ev.capturas.push(await nav.foto(driver, FOTOS, `${ev.id}-${nome}`));

/* ───────────── Ações na tela ───────────── */

async function novoChrome() {
  const driver = await nav.abrirChrome(amb.CORURIPE);
  await nav.liberarGps(driver, srv.url);
  return driver;
}

/** Envia um arquivo pelo campo de foto (o campo fica escondido atrás de um botão, como em celular). */
async function enviarArquivo(driver, css, arquivo) {
  const el = await nav.esperarCss(driver, css);
  await driver.executeScript('arguments[0].style.display = "block"; arguments[0].style.opacity = 1;', el);
  await el.sendKeys(arquivo);
}

async function preencherReporte(driver, descricao) {
  await nav.clicar(driver, '#gps-btn');
  await nav.esperarVisivel(driver, '#gps-result.show');
  await nav.clicar(driver, '#type-chips .chip[data-value="apagado"]');
  await enviarArquivo(driver, '#photo-input', fotoPoste);
  await nav.esperarVisivel(driver, '#photo-preview-wrap.show');
  await (await driver.findElement(By.id('descricao'))).sendKeys(descricao);
  await nav.aguardar(driver, async () => (await driver.findElement(By.id('submit-btn')).isEnabled()), 10000, 'botão Enviar não habilitou');
}

async function enviarReporte(driver) {
  await nav.clicar(driver, '#submit-btn');
  await nav.esperarVisivel(driver, '#screen-success.active', 80000);
  return {
    titulo: await nav.texto(driver, '#success-title'),
    protocolo: (await nav.texto(driver, '#success-protocol')).replace(/^Protocolo:\s*/, '')
  };
}

async function digitarPin(driver, pin) {
  for (const d of pin) {
    const teclas = await driver.findElements(By.css('#screen-pin button.key'));
    for (const t of teclas) if ((await t.getText()).trim() === d) { await t.click(); break; }
  }
}

async function entrarNoPainel(driver, pin) {
  await nav.esperarVisivel(driver, '#screen-pin.active');
  await digitarPin(driver, pin);
  await nav.esperarVisivel(driver, '#screen-home.active');
}

const textoToast = (driver) => driver.executeScript("return (document.getElementById('toast')?.textContent || '').replace(/\\s+/g, ' ').trim();");

/** Fecha um chamado só pela tela: abre o cartão, preenche, captura GPS e foto e confirma. */
async function fecharPelaTela(driver, protocolo, ev) {
  await nav.tocar(driver, await nav.esperarCss(driver, `#lista-chamados .js-call-item[data-proto="${protocolo}"]`));
  await nav.esperarVisivel(driver, '#screen-close.active');
  await (await driver.findElement(By.id('f-tecnico'))).sendKeys('Técnico QA');
  await nav.tocar(driver, await driver.findElement(By.xpath('//*[@id="screen-close"]//*[contains(@class,"s-chip") and contains(normalize-space(), "Concluído")]')));
  await (await driver.findElement(By.id('f-servico'))).sendKeys('Troca de lâmpada (teste de integração)');
  for (const g of ['braco', 'luminaria', 'reator', 'fotosensor', 'porta_fusivel', 'fusivel', 'cabo', 'conector']) {
    await nav.tocar(driver, await driver.findElement(By.css(`#cfg-${g} .cfg-chip`)));
  }
  await (await driver.findElement(By.id('f-referencia'))).sendKeys('Em frente à praça (teste)');
  await nav.clicar(driver, '#tech-btn-gps');
  await nav.aguardar(driver, async () => (await nav.texto(driver, '#tech-gps-coords')).length > 0, 15000, 'GPS do técnico não foi capturado');
  await enviarArquivo(driver, '#tech-photo-input', fotoPoste);
  await nav.aguardar(driver, async () => ((await driver.findElement(By.id('tech-photo-thumb')).getAttribute('src')) || '').startsWith('data:'), 10000, 'foto do reparo não carregou');
  if (ev) await foto(driver, ev, 'formulario-preenchido');

  const toastAntes = await textoToast(driver);
  await nav.clicar(driver, '#btn-fechar');
  await nav.esperarVisivel(driver, '#confirm-modal');
  await nav.tocar(driver, await driver.findElement(By.xpath('//*[@id="confirm-modal"]//button[contains(normalize-space(), "Sim, fechar")]')));
  const fim = await nav.aguardar(driver, async () => {
    if (await nav.visivel(driver, '#screen-success.active')) return 'tela-sucesso';
    const t = await textoToast(driver);
    return t && t !== toastAntes ? 'aviso' : false;
  }, 50000, 'o fechamento não terminou');
  return { fim, titulo: fim === 'tela-sucesso' ? await nav.texto(driver, '#success-title') : '', toast: await textoToast(driver) };
}

/** Reabre o painel na tela inicial (a sessão salva no aparelho evita pedir o PIN de novo). */
async function irParaInicio(driver) {
  await nav.comInternet(driver, srv);
  await driver.get(srv.url + '/tecnico/');
  await nav.esperarVisivel(driver, '#screen-home.active');
  await nav.aguardar(driver, async () => (await driver.findElements(By.css('#lista-chamados .js-call-item'))).length > 0, 15000).catch(() => {});
}

async function voltarAoInicio(driver) {
  await (await driver.findElement(By.xpath('//*[@id="screen-success"]//button[contains(normalize-space(), "Novo atendimento")]'))).click();
  await nav.esperarVisivel(driver, '#screen-home.active');
}

/* ───────────── Preparação ───────────── */

before(async () => {
  fs.rmSync(FOTOS, { recursive: true, force: true });
  pool = await amb.prepararBanco();
  srv = await amb.subirServidor();
  ambiente.chamadosSemeados = await amb.semearChamados(srv.url);
  fotoPoste = nav.arquivoDeFoto(amb.RAIZ);
  ambiente.inicio = new Date().toISOString();
  ambiente.servidor = srv.url;
  ambiente.banco = `${process.env.DB_NAME} em ${process.env.DB_HOST}:${process.env.DB_PORT}`;
});

after(async () => {
  const banco = pool ? {
    chamados: await linhas('SELECT protocolo, tipo, status, poste_id FROM chamados ORDER BY protocolo'),
    fechamentos: await linhas('SELECT f.status, f.administrativo, f.informante, c.protocolo FROM fechamentos f JOIN chamados c ON c.id = f.chamado_id ORDER BY f.id'),
    sessoes: await contar('sessoes'),
    tentativas_login: await linhas('SELECT perfil, sucesso, ip FROM tentativas_login ORDER BY id').catch(() => []),
    itens_estoque: await linhas('SELECT nome, saldo, minimo FROM itens_estoque ORDER BY id')
  } : null;
  const versao = require('selenium-webdriver/package.json').version;
  fs.mkdirSync(EVID, { recursive: true });
  fs.writeFileSync(path.join(EVID, 'resultados.json'), JSON.stringify({
    ferramenta: `Selenium WebDriver ${versao} (Node.js ${process.version}) + Google Chrome sem janela`,
    executadoEm: ambiente.inicio, ambiente, total: resultados.length,
    aprovados: resultados.filter((r) => r.resultado === 'Aprovado').length,
    reprovados: resultados.filter((r) => r.resultado !== 'Aprovado').length,
    casos: resultados, bancoAoFinal: banco, pedidosApi: srv ? srv.estado.pedidosApi : []
  }, null, 2));
  if (srv) await srv.fechar();
  if (pool) await pool.end();
});

/* ═════════════════════════ App do cidadão ═════════════════════════ */

describe('App do cidadão → API Node → MySQL', () => {
  caso('SEL-01', {
    titulo: 'Reporte feito com internet é gravado no MySQL',
    requisito: 'UC01 fluxo principal; RF01',
    dado: 'o cidadão abriu o app com internet', quando: 'preenche GPS, tipo, foto e descrição e toca em Enviar',
    entao: 'vê "Reporte enviado" e o chamado aparece na tabela chamados com status aberto'
  }, async (ev) => {
    const driver = await novoChrome();
    try {
      await nav.abrirComServiceWorker(driver, srv.url + '/');
      await nav.passarAbertura(driver);
      await preencherReporte(driver, 'Poste apagado na esquina (SEL-01)');
      await foto(driver, ev, 'formulario');
      const r = await enviarReporte(driver);
      await foto(driver, ev, 'depois-de-enviar');
      const fila = await nav.lerFila(driver, 'ilumina_v2', 'reports');
      const linha = await um('SELECT protocolo, tipo, status FROM chamados WHERE protocolo = ?', [r.protocolo]);
      Object.assign(ev.obtido, { tela: r.titulo, protocolo: r.protocolo, filaDoAparelho: fila.length, pedidoApi: srv.estado.pedidosApi.filter((p) => p.caminho === '/api/chamados').slice(-1)[0] });
      ev.banco.chamado = linha || null;
      assert.equal(r.titulo, 'Reporte enviado', `a tela mostrou "${r.titulo}"`);
      assert.ok(linha, `o protocolo ${r.protocolo} não foi gravado na tabela chamados`);
    } finally { await driver.quit(); }
  });

  caso('SEL-02', {
    titulo: 'Reporte feito sem internet fica no aparelho e chega ao MySQL quando a internet volta',
    requisito: 'UC01-A1; UC03 fluxo principal; RF02; CA03',
    dado: 'o app já foi aberto uma vez e o cidadão está sem internet', quando: 'faz o reporte e depois a internet volta',
    entao: 'o reporte fica na fila do aparelho e, com internet, é gravado uma única vez no MySQL e sai da fila'
  }, async (ev) => {
    const driver = await novoChrome();
    try {
      await nav.abrirComServiceWorker(driver, srv.url + '/');
      await nav.passarAbertura(driver);
      await nav.semInternet(driver, srv);
      await preencherReporte(driver, 'Reporte feito sem sinal (SEL-02)');
      const r = await enviarReporte(driver);
      await foto(driver, ev, 'salvo-sem-internet');
      const filaOffline = await nav.lerFila(driver, 'ilumina_v2', 'reports');
      const noBancoOffline = await contar('chamados', 'protocolo = ?', [r.protocolo]);

      await nav.comInternet(driver, srv);
      await nav.aguardar(driver, async () => (await nav.lerFila(driver, 'ilumina_v2', 'reports')).length === 0, 25000).catch(() => {});
      await foto(driver, ev, 'depois-da-internet-voltar');
      const filaOnline = await nav.lerFila(driver, 'ilumina_v2', 'reports');
      const noBanco = await contar('chamados', 'protocolo = ?', [r.protocolo]);
      Object.assign(ev.obtido, { tela: r.titulo, protocolo: r.protocolo, filaSemInternet: filaOffline.length, noBancoSemInternet: noBancoOffline, filaDepois: filaOnline.length, tentativasNaFila: filaOnline[0]?.tentativas ?? 0 });
      ev.banco.registrosDoProtocolo = noBanco;
      assert.equal(filaOffline.length, 1, 'sem internet o reporte deveria ficar na fila');
      assert.equal(noBanco, 1, `com a internet de volta o protocolo deveria estar 1 vez no MySQL (está ${noBanco})`);
      assert.equal(filaOnline.length, 0, 'a fila deveria esvaziar');
    } finally { await driver.quit(); }
  });

  caso('SEL-03', {
    titulo: 'Link com parâmetros (ex.: compartilhado no WhatsApp) abre o app sem internet',
    requisito: 'RNF01 (DEF-14)',
    dado: 'o app já foi aberto uma vez', quando: 'o cidadão, sem internet, abre /?utm_source=whatsapp',
    entao: 'o formulário de reporte aparece'
  }, async (ev) => {
    const driver = await novoChrome();
    try {
      await nav.abrirComServiceWorker(driver, srv.url + '/');
      await nav.passarAbertura(driver);
      await nav.semInternet(driver, srv);
      let erro = '';
      try { await driver.get(srv.url + '/?utm_source=whatsapp'); } catch (e) { erro = String(e.message).split('\n')[0]; }
      const abriu = (await driver.findElements(By.id('screen-report'))).length > 0;
      await foto(driver, ev, 'link-sem-internet');
      await nav.comInternet(driver, srv);
      Object.assign(ev.obtido, { abriuOApp: abriu, erroDoNavegador: erro || null });
      assert.ok(abriu, 'sem internet o link com parâmetros mostrou a página de erro do navegador');
    } finally { await driver.quit(); }
  });
});

/* ═════════════════════════ Painel do técnico ═════════════════════════ */

describe('Painel do técnico → API Node → MySQL', () => {
  let tec;
  before(async () => {
    tec = await novoChrome();
    await nav.abrirComServiceWorker(tec, srv.url + '/tecnico/');
  });
  after(async () => { if (tec) await tec.quit(); });

  caso('SEL-04', {
    titulo: 'Login do técnico pelo PIN abre o painel e grava a sessão no MySQL',
    requisito: 'UC04 fluxo principal; RF03',
    dado: 'existe um técnico ativo com PIN 0123', quando: 'ele digita o PIN no teclado do painel',
    entao: 'o painel abre e uma nova sessão é gravada na tabela sessoes'
  }, async (ev) => {
    const antes = await contar('sessoes');
    await entrarNoPainel(tec, amb.PIN.tecnico);
    await foto(tec, ev, 'painel');
    const depois = await contar('sessoes');
    Object.assign(ev.obtido, { telaAtiva: 'screen-home' });
    ev.banco = { sessoesAntes: antes, sessoesDepois: depois };
    assert.equal(depois, antes + 1, 'nenhuma sessão nova foi gravada');
  });

  caso('SEL-05', {
    titulo: 'A lista do painel mostra exatamente os chamados abertos do MySQL',
    requisito: 'UC05 pré-condição; RF04',
    dado: 'há chamados abertos na tabela chamados', quando: 'o técnico está no painel',
    entao: 'cada chamado aberto do banco aparece na lista, e nenhum outro'
  }, async (ev) => {
    const noBanco = (await linhas("SELECT protocolo FROM chamados WHERE status = 'aberto' ORDER BY protocolo")).map((r) => r.protocolo);
    await nav.aguardar(tec, async () => (await tec.findElements(By.css('#lista-chamados .js-call-item'))).length >= noBanco.length, 15000).catch(() => {});
    const naTela = [];
    for (const el of await tec.findElements(By.css('#lista-chamados .js-call-item'))) naTela.push(await el.getAttribute('data-proto'));
    await foto(tec, ev, 'lista');
    ev.obtido.naTela = [...naTela].sort();
    ev.banco.abertos = noBanco;
    assert.deepEqual([...naTela].sort(), noBanco);
  });

  caso('SEL-06', {
    titulo: 'Fechamento feito com internet é gravado no MySQL e fecha o chamado',
    requisito: 'UC05 fluxo principal; RF04; CA04',
    dado: 'o chamado IC-261127-SEL01 está aberto', quando: 'o técnico preenche o fechamento (serviço, configuração do poste, GPS e foto) e confirma',
    entao: 'aparece a tela de sucesso, existe 1 fechamento no MySQL e o chamado deixa de estar aberto'
  }, async (ev) => {
    await irParaInicio(tec);
    const r = await fecharPelaTela(tec, 'IC-261127-SEL01', ev);
    await foto(tec, ev, 'resultado');
    const f = await linhas("SELECT f.status, f.administrativo FROM fechamentos f JOIN chamados c ON c.id = f.chamado_id WHERE c.protocolo = 'IC-261127-SEL01'");
    const c = await um("SELECT status FROM chamados WHERE protocolo = 'IC-261127-SEL01'");
    Object.assign(ev.obtido, r);
    ev.banco = { fechamentos: f, statusDoChamado: c.status };
    if (r.fim === 'tela-sucesso') await voltarAoInicio(tec);
    assert.equal(r.fim, 'tela-sucesso', `em vez da tela de sucesso: "${r.toast}"`);
    assert.equal(f.length, 1, `fechamentos gravados: ${f.length}`);
    assert.notEqual(c.status, 'aberto');
  });

  caso('SEL-07', {
    titulo: 'Fechamento feito sem internet fica no aparelho e é gravado uma vez quando a internet volta',
    requisito: 'UC05-A5; CA03; CA04',
    dado: 'o técnico está no painel e perde a internet', quando: 'fecha o IC-261127-SEL02 e depois a internet volta',
    entao: 'o fechamento fica na fila do aparelho e, com internet, é gravado uma única vez no MySQL'
  }, async (ev) => {
    await irParaInicio(tec);
    await nav.semInternet(tec, srv);
    let r, filaOffline, noBancoOffline;
    try {
      r = await fecharPelaTela(tec, 'IC-261127-SEL02', ev);
      await foto(tec, ev, 'salvo-sem-internet');
      filaOffline = await nav.lerFila(tec, 'ilumina_tec', 'close_queue');
      noBancoOffline = await contar('fechamentos f JOIN chamados c ON c.id = f.chamado_id', "c.protocolo = 'IC-261127-SEL02'");
      if (r.fim === 'tela-sucesso') await voltarAoInicio(tec);
    } finally {
      await nav.comInternet(tec, srv);
    }
    await nav.aguardar(tec, async () => (await nav.lerFila(tec, 'ilumina_tec', 'close_queue')).length === 0, 25000).catch(() => {});
    await foto(tec, ev, 'depois-da-internet-voltar');
    const filaOnline = await nav.lerFila(tec, 'ilumina_tec', 'close_queue');
    const noBanco = await contar('fechamentos f JOIN chamados c ON c.id = f.chamado_id', "c.protocolo = 'IC-261127-SEL02'");
    Object.assign(ev.obtido, { tela: r.titulo || r.toast, filaSemInternet: filaOffline.length, noBancoSemInternet: noBancoOffline, filaDepois: filaOnline.length });
    ev.banco.fechamentosDoChamado = noBanco;
    assert.equal(filaOffline.length, 1, 'sem internet o fechamento deveria ficar na fila');
    assert.equal(noBancoOffline, 0, 'sem internet nada deveria chegar ao banco');
    assert.equal(noBanco, 1, `com a internet de volta deveria haver 1 fechamento (há ${noBanco})`);
    assert.equal(filaOnline.length, 0, 'a fila deveria esvaziar');
  });

  caso('SEL-08', {
    titulo: 'Técnico comum não consegue fazer fechamento administrativo',
    requisito: 'Regra de perfil: só o gestor fecha administrativamente',
    dado: 'o técnico (perfil tecnico) está logado', quando: 'abre o Ambiente Gestor e toca em fechar administrativamente',
    entao: 'o painel recusa e nenhum fechamento administrativo é gravado'
  }, async (ev) => {
    const antes = await contar('fechamentos', 'administrativo = 1');
    await irParaInicio(tec);
    await nav.clicar(tec, 'button[onclick="abrirGestor()"]');
    await nav.esperarVisivel(tec, '#screen-gestor.active');
    const botao = await tec.findElement(By.css('button[onclick="abrirFechamentoAdm()"]'));
    await tec.executeScript('arguments[0].scrollIntoView({block: "center"});', botao);
    await botao.click();
    const aviso = await nav.aguardar(tec, async () => { const t = await textoToast(tec); return /gestor/i.test(t) ? t : false; }, 5000).catch(() => textoToast(tec));
    const modalAberto = await tec.executeScript("return document.getElementById('adm-modal').open;");
    await foto(tec, ev, 'recusado');
    const depois = await contar('fechamentos', 'administrativo = 1');
    Object.assign(ev.obtido, { aviso, modalAberto });
    ev.banco = { administrativosAntes: antes, administrativosDepois: depois };
    assert.equal(modalAberto, false, 'o formulário de fechamento administrativo abriu para um técnico');
    assert.equal(depois, antes);
  });

  caso('SEL-09', {
    titulo: 'Logout limpa o PIN e o técnico consegue entrar de novo sem recarregar',
    requisito: 'UC04; correção do PR #14 (CT-29)',
    dado: 'o técnico está logado', quando: 'toca em Sair e digita o PIN de novo',
    entao: 'a tela do PIN aparece com os pontos vazios e o novo login abre o painel e grava outra sessão'
  }, async (ev) => {
    await irParaInicio(tec);
    await nav.clicar(tec, '#btn-logout');
    await nav.esperarVisivel(tec, '#screen-pin.active');
    const pontos = (await tec.findElements(By.css('.pin-dot.filled'))).length;
    await foto(tec, ev, 'pin-depois-do-logout');
    const antes = await contar('sessoes');
    await entrarNoPainel(tec, amb.PIN.tecnico);
    const depois = await contar('sessoes');
    Object.assign(ev.obtido, { pontosPreenchidosAposLogout: pontos, entrouDeNovo: true });
    ev.banco = { sessoesAntes: antes, sessoesDepois: depois };
    assert.equal(pontos, 0);
    assert.equal(depois, antes + 1);
  });
});

/* ═════════════════════════ Gestor e almoxarifado ═════════════════════════ */

describe('Gestor e almoxarifado → API Node → MySQL', () => {
  let ges;
  before(async () => {
    ges = await novoChrome();
    await nav.abrirComServiceWorker(ges, srv.url + '/tecnico/');
  });
  after(async () => { if (ges) await ges.quit(); });

  caso('SEL-10', {
    titulo: 'PIN errado é recusado e a tentativa fica registrada no MySQL',
    requisito: 'UC04-A2; proteção contra força bruta',
    dado: 'o painel está na tela do PIN', quando: 'alguém digita o PIN 9999',
    entao: 'aparece "PIN incorreto", o painel não abre e a tentativa é gravada em tentativas_login'
  }, async (ev) => {
    const antes = await contar('tentativas_login');
    await nav.esperarVisivel(ges, '#screen-pin.active');
    await digitarPin(ges, '9999');
    const msg = await nav.aguardar(ges, async () => { const t = await nav.texto(ges, '#pin-error'); return /incorreto/i.test(t) ? t : false; }, 15000).catch(() => nav.texto(ges, '#pin-error'));
    await foto(ges, ev, 'pin-incorreto');
    const abriu = await nav.visivel(ges, '#screen-home.active');
    const depois = await contar('tentativas_login');
    Object.assign(ev.obtido, { mensagem: msg, painelAbriu: abriu });
    ev.banco = { tentativasAntes: antes, tentativasDepois: depois };
    assert.match(msg, /incorreto/i);
    assert.equal(abriu, false);
    assert.equal(depois, antes + 1);
    await nav.aguardar(ges, async () => (await ges.findElements(By.css('.pin-dot.filled'))).length === 0, 3000).catch(() => {});
  });

  caso('SEL-11', {
    titulo: 'Gestor fecha um chamado administrativamente e o MySQL registra o fechamento sem baixa de estoque',
    requisito: 'Fechamento administrativo (Sprint 2); CA04',
    dado: 'o gestor (PIN 0456) está logado e o IC-261127-SEL03 está aberto',
    quando: 'abre o fechamento administrativo, escolhe o chamado, informa quem avisou e a justificativa e confirma',
    entao: 'aparece a confirmação, o MySQL tem 1 fechamento administrativo do chamado e o estoque não muda'
  }, async (ev) => {
    const saldoAntes = Number((await um('SELECT saldo FROM itens_estoque WHERE nome = ?', [amb.ITEM_ESTOQUE.nome])).saldo);
    await entrarNoPainel(ges, amb.PIN.gestor);
    await nav.aguardar(ges, async () => (await ges.findElements(By.css('#lista-chamados .js-call-item'))).length > 0, 15000);
    await nav.clicar(ges, 'button[onclick="abrirGestor()"]');
    await nav.esperarVisivel(ges, '#screen-gestor.active');
    const botao = await ges.findElement(By.css('button[onclick="abrirFechamentoAdm()"]'));
    await ges.executeScript('arguments[0].scrollIntoView({block: "center"});', botao);
    await botao.click();
    await nav.esperarVisivel(ges, '#adm-modal');
    await (await ges.findElement(By.css('#adm-chamado option[value="IC-261127-SEL03"]'))).click();
    await (await ges.findElement(By.id('adm-informante'))).sendKeys('Morador da rua (telefone)');
    await (await ges.findElement(By.id('adm-justificativa'))).sendKeys('Concessionária religou a rede; poste voltou a acender sozinho.');
    await foto(ges, ev, 'formulario');
    await nav.clicar(ges, '#adm-submit-btn');
    await ges.wait(until.alertIsPresent(), 5000, 'a confirmação não apareceu');
    const textoConfirmacao = await (await ges.switchTo().alert()).getText();
    await (await ges.switchTo().alert()).accept();
    const aviso = await nav.aguardar(ges, async () => { const t = await textoToast(ges); return /administrativamente|Falha|gestor|fechado/i.test(t) ? t : false; }, 20000).catch(() => textoToast(ges));
    await foto(ges, ev, 'resultado');
    const f = await linhas("SELECT f.status, f.administrativo, f.informante FROM fechamentos f JOIN chamados c ON c.id = f.chamado_id WHERE c.protocolo = 'IC-261127-SEL03'");
    const c = await um("SELECT status FROM chamados WHERE protocolo = 'IC-261127-SEL03'");
    const saldoDepois = Number((await um('SELECT saldo FROM itens_estoque WHERE nome = ?', [amb.ITEM_ESTOQUE.nome])).saldo);
    Object.assign(ev.obtido, { confirmacao: textoConfirmacao.split('\n')[0], aviso });
    ev.banco = { fechamentos: f, statusDoChamado: c.status, saldoAntes, saldoDepois };
    assert.equal(f.length, 1, `fechamentos do chamado: ${f.length}`);
    assert.equal(Number(f[0].administrativo), 1);
    assert.notEqual(c.status, 'aberto');
    assert.equal(saldoDepois, saldoAntes, 'o fechamento administrativo não pode mexer no estoque');
  });

  caso('SEL-12', {
    titulo: 'Relatório de postes mostra os postes cadastrados no MySQL',
    requisito: 'Relatórios do gestor',
    dado: 'há 3 postes cadastrados no MySQL e o gestor está no Ambiente Gestor', quando: 'toca em "Gerar relatório" de postes',
    entao: 'abre o relatório com os 3 postes'
  }, async (ev) => {
    const janelas = await ges.getAllWindowHandles();
    const principal = await ges.getWindowHandle();
    const botao = await ges.findElement(By.css('button[onclick="gerarRelatorioPostes()"]'));
    await ges.executeScript('arguments[0].scrollIntoView({block: "center"});', botao);
    await botao.click();
    const nova = await nav.aguardar(ges, async () => (await ges.getAllWindowHandles()).find((h) => !janelas.includes(h)) || false, 15000).catch(() => null);
    let postesNoRelatorio = [];
    if (nova) {
      await ges.switchTo().window(nova);
      await nav.esperarCss(ges, 'body');
      const corpo = await ges.findElement(By.css('body')).getText();
      postesNoRelatorio = amb.POSTES.map((p) => p.id).filter((id) => corpo.includes(id));
      await foto(ges, ev, 'relatorio');
      await ges.close();
      await ges.switchTo().window(principal);
    } else {
      await foto(ges, ev, 'sem-relatorio');
    }
    const aviso = await textoToast(ges);
    const noBanco = (await linhas('SELECT id FROM postes ORDER BY id')).map((r) => r.id);
    Object.assign(ev.obtido, { abriuRelatorio: Boolean(nova), postesNoRelatorio, aviso });
    ev.banco.postes = noBanco;
    assert.ok(nova, `o relatório não abriu; aviso na tela: "${aviso}"`);
    assert.deepEqual(postesNoRelatorio, noBanco);
  });

  caso('SEL-13', {
    titulo: 'Almoxarife entra com o PIN e vê o estoque do MySQL',
    requisito: 'Gestão de material (almoxarifado)',
    dado: 'existe um almoxarife com PIN 0789 e o item "Lâmpada LED 100W (teste)" no estoque', quando: 'abre Gestão de Material e entra com o PIN',
    entao: 'a área do almoxarifado abre e lista o item do MySQL'
  }, async (ev) => {
    await irParaInicio(ges);
    await nav.clicar(ges, 'button[onclick="abrirAlmox()"]');
    await nav.esperarVisivel(ges, '#screen-almox.active');
    await (await nav.esperarVisivel(ges, '#almox-pin')).sendKeys(amb.PIN.almoxarife);
    await nav.clicar(ges, 'button[onclick="loginAlmox()"]');
    const entrou = await nav.aguardar(ges, async () => nav.visivel(ges, '#almox-content'), 10000).catch(() => false);
    const aviso = await textoToast(ges);
    let listaItem = false;
    if (entrou) listaItem = await nav.aguardar(ges, async () => (await ges.findElement(By.id('almox-content')).getText()).includes(amb.ITEM_ESTOQUE.nome), 10000).catch(() => false);
    await foto(ges, ev, 'almoxarifado');
    const pedidos = srv.estado.pedidosApi.filter((p) => p.metodo === 'POST' && /\/api\/?$|almox/.test(p.caminho)).slice(-2);
    Object.assign(ev.obtido, { entrou, listaItem, aviso, pedidosDoLogin: pedidos });
    ev.banco.itens = await linhas('SELECT nome, saldo FROM itens_estoque');
    assert.ok(entrou, `a área do almoxarifado não abriu; aviso na tela: "${aviso}"`);
    assert.ok(listaItem, 'o item do MySQL não apareceu na lista');
  });
});
