/**
 * Utilitários do Selenium WebDriver para os testes de integração.
 * Tudo aqui usa só o que um usuário faria na tela, mais o protocolo do Chrome
 * (CDP) para GPS e internet, que um teste não consegue fazer com as mãos.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const ESPERA = 15000;

/** Abre um Chrome novo (perfil limpo), em tamanho de celular, com o GPS em Coruripe/AL. */
async function abrirChrome(gps) {
  const opcoes = new chrome.Options()
    .addArguments('--headless=new', '--window-size=420,900', '--lang=pt-BR', '--no-first-run', '--disable-search-engine-choice-screen')
    .setUserPreferences({ 'profile.default_content_setting_values.geolocation': 1 });
  if (process.env.CHROME_PATH) opcoes.setChromeBinaryPath(process.env.CHROME_PATH);
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(opcoes).build();
  await driver.sendDevToolsCommand('Emulation.setGeolocationOverride', gps);
  return driver;
}

/** Garante a permissão de GPS para a origem do app (o Chrome sem janela pergunta de novo a cada origem). */
async function liberarGps(driver, origem) {
  await driver.sendDevToolsCommand('Browser.grantPermissions', { origin: origem, permissions: ['geolocation'] }).catch(() => {});
}

/**
 * "Sem internet" de verdade: o Chrome fica offline (navigator.onLine = false,
 * evento "offline") E o servidor deixa de responder, para que nem o service
 * worker consiga buscar nada na rede.
 */
async function semInternet(driver, srv) {
  srv.estado.semInternet = true;
  await driver.setNetworkConditions({ offline: true, latency: 0, download_throughput: 0, upload_throughput: 0 });
}
async function comInternet(driver, srv) {
  srv.estado.semInternet = false;
  await driver.setNetworkConditions({ offline: false, latency: 0, download_throughput: -1, upload_throughput: -1 });
}

const visivel = async (driver, css) => {
  const els = await driver.findElements(By.css(css));
  for (const e of els) if (await e.isDisplayed().catch(() => false)) return true;
  return false;
};
const esperarCss = (driver, css, ms = ESPERA) => driver.wait(until.elementLocated(By.css(css)), ms, `não apareceu: ${css}`);
const esperarVisivel = async (driver, css, ms = ESPERA) => {
  const el = await esperarCss(driver, css, ms);
  await driver.wait(until.elementIsVisible(el), ms, `não ficou visível: ${css}`);
  return el;
};
/** Rola o elemento para o meio da tela antes de tocar, como o usuário faria (o rodapé fixo cobre o fim da tela). */
async function tocar(driver, el) {
  await driver.executeScript('arguments[0].scrollIntoView({ block: "center", inline: "center" });', el);
  await el.click();
}
const clicar = async (driver, css) => tocar(driver, await esperarVisivel(driver, css));
const texto = async (driver, css) => ((await driver.findElement(By.css(css)).getText()) || '').replace(/\s+/g, ' ').trim();

/** Espera uma condição qualquer (função assíncrona que devolve algo "verdadeiro"). */
async function aguardar(driver, condicao, ms = ESPERA, mensagem = 'condição não foi atendida') {
  return driver.wait(async () => { try { return await condicao(); } catch { return false; } }, ms, mensagem);
}

/** Captura de tela como evidência. */
async function foto(driver, pasta, nome) {
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `${nome}.png`);
  fs.writeFileSync(arquivo, await driver.takeScreenshot(), 'base64');
  return path.basename(arquivo);
}

/** Abre a página e espera o service worker assumir o controle (como no segundo acesso de um usuário real). */
async function abrirComServiceWorker(driver, url) {
  await driver.get(url);
  await driver.executeAsyncScript('const ok = arguments[arguments.length - 1]; navigator.serviceWorker.ready.then(() => ok(true), () => ok(false));');
  const controlado = await driver.executeScript('return Boolean(navigator.serviceWorker.controller);');
  if (!controlado) await driver.navigate().refresh();
}

/** Passa pela tela de abertura do app do cidadão. */
async function passarAbertura(driver) {
  await esperarCss(driver, '#screen-splash.active, #screen-report.active');
  if (await visivel(driver, '#screen-splash.active .splash-btn')) await clicar(driver, '#screen-splash.active .splash-btn').catch(() => {});
  await esperarVisivel(driver, '#screen-report.active');
}

/** Lê uma fila do IndexedDB do aparelho, como no DevTools (Application → IndexedDB). */
function lerFila(driver, banco, store) {
  return driver.executeAsyncScript(`
    const [banco, store, ok] = arguments;
    const req = indexedDB.open(banco);
    req.onerror = () => ok([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) return ok([]);
      const g = db.transaction(store, 'readonly').objectStore(store).getAll();
      g.onsuccess = () => ok(g.result.map((r) => ({ protocolo: r.payload && r.payload.protocolo, tentativas: r.attempts || 0 })));
      g.onerror = () => ok([]);
    };`, banco, store);
}

/** Grava a foto de teste num arquivo, porque o input de arquivo do Chrome precisa de um caminho real. */
function arquivoDeFoto(raiz) {
  const destino = path.join(os.tmpdir(), 'ilumina-selenium-poste.png');
  fs.copyFileSync(path.join(raiz, 'public/icon-192.png'), destino);
  return destino;
}

module.exports = {
  By, until, abrirChrome, liberarGps, semInternet, comInternet, visivel, esperarCss, esperarVisivel,
  tocar, clicar, texto, aguardar, foto, abrirComServiceWorker, passarAbertura, lerFila, arquivoDeFoto
};
