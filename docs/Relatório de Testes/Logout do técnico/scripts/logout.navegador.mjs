// Teste de comportamento do logout do técnico, no navegador, contra a API Node real.
// Uso (na raiz do projeto):
//   node "docs/Relatório de Testes/Logout do técnico/scripts/logout.navegador.mjs" public depois <pasta-saida>
// Variável opcional: CHROME_PATH (padrão: Chrome no caminho padrão do Windows).
// Pré-requisito: API Node em http://localhost:3001 (técnico de teste com PIN 0123).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [, , PUBLIC, ROTULO, SAIDA] = process.argv;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const estatico = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const arq = path.join(PUBLIC, p);
  if (!arq.startsWith(path.resolve(PUBLIC)) || !fs.existsSync(arq)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
  fs.createReadStream(arq).pipe(res);
});
await new Promise(r => estatico.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${estatico.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errosJs = [];
page.on('pageerror', e => errosJs.push(e.message));

const r = [];
const passo = (id, descricao, obtido, esperado) => r.push({ id, descricao, obtido, esperado, ok: obtido === esperado });
const pontos = () => page.locator('.pin-dot.filled').count();
const sairVisivel = () => page.locator('button', { hasText: 'Sair' }).first().isVisible();
const digitar = async pin => { for (const d of pin) await page.locator('.keypad .key', { hasText: new RegExp(`^${d}$`) }).click(); };

await page.goto(BASE + '/tecnico/');
await page.waitForSelector('#screen-pin.active');
passo('L-01', 'Tela do PIN: botão "Sair" escondido', await sairVisivel(), false);

await digitar('0123');
await page.waitForSelector('#screen-home.active', { timeout: 15000 });
passo('L-02', 'Login com PIN 0123 abre o painel', true, true);
passo('L-03', 'Painel: botão "Sair" visível', await sairVisivel(), true);
await page.screenshot({ path: path.join(SAIDA, `${ROTULO}-painel.png`), clip: { x: 0, y: 0, width: 420, height: 160 } });

await page.locator('button', { hasText: 'Sair' }).first().click();
await page.waitForSelector('#screen-pin.active');
passo('L-04', 'Logout volta para a tela do PIN', true, true);
passo('L-05', 'Após logout: pontos do PIN vazios', await pontos(), 0);
passo('L-06', 'Após logout: sessão removida do aparelho', await page.evaluate(() => localStorage.getItem('ilu_tech_session')), null);
await page.screenshot({ path: path.join(SAIDA, `${ROTULO}-apos-logout.png`) });

await digitar('0');
passo('L-07', 'Após logout: teclado aceita novo dígito (1 ponto)', await pontos(), 1);
await digitar('123');
const relogou = await page.waitForSelector('#screen-home.active', { timeout: 8000 }).then(() => true, () => false);
passo('L-08', 'Novo login sem recarregar a página', relogou, true);

if (relogou) {
  await page.locator('button', { hasText: 'Sair' }).first().click();
  await page.waitForSelector('#screen-pin.active');
}
// PIN errado: mede quanto tempo os pontos ficam preenchidos depois do aviso
await page.evaluate(() => { while (typeof pinBuffer === 'string' && pinBuffer.length) pinDel(); });
await digitar('9999');
await page.waitForFunction(() => document.getElementById('pin-error').textContent.includes('incorreto'), null, { timeout: 15000 });
const t0 = Date.now();
await page.waitForFunction(() => document.querySelectorAll('.pin-dot.filled').length === 0, null, { timeout: 5000 });
const ms = Date.now() - t0;
r.push({ id: 'L-09', descricao: 'PIN errado: tempo até limpar os pontos (ms, aprox.)', obtido: ms, esperado: 'informativo', ok: true });
passo('L-10', 'Nenhum erro de JavaScript na página', errosJs.length, 0);

await browser.close();
estatico.close();
fs.writeFileSync(path.join(SAIDA, `${ROTULO}-logout.json`), JSON.stringify({ rotulo: ROTULO, resultados: r, errosJs }, null, 2));
console.log(`\n### ${ROTULO}`);
for (const x of r) console.log(`${x.ok ? 'PASSOU ' : 'FALHOU '} ${x.id} ${x.descricao} — obtido: ${JSON.stringify(x.obtido)}${x.esperado === 'informativo' ? '' : ` (esperado: ${JSON.stringify(x.esperado)})`}`);
if (errosJs.length) console.log('Erros JS:', errosJs);
