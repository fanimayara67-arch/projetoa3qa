// Verificação no navegador da remoção do QR Code (casos Q-01 a Q-14).
// Uso (na raiz do projeto, com o Google Chrome instalado):
//   npm install --no-save playwright-core
//   node "docs/Relatório de Testes/Remoção do QR Code/scripts/verificar-sem-qr.navegador.mjs" . <pasta de saída>
// Opcional: PLAYWRIGHT_CORE=<caminho> escolhe outra cópia do Playwright.
// Usa o servidor de teste dos testes offline (API Node real, banco em memória).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(process.argv[2] || '.');
const SAIDA = resolve(process.argv[3] || '.');
const require = createRequire(join(RAIZ, 'package.json'));
const { criarServidorTeste, PIN_TESTE } = require(join(RAIZ, 'server/tests/testes-offline/apoio/servidor-teste.js'));
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const r = [];
const passo = (id, descricao, obtido, esperado) => r.push({ id, descricao, obtido, esperado, ok: JSON.stringify(obtido) === JSON.stringify(esperado) });

const srv = await criarServidorTeste({ servidor: 'api-node' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function novoContexto() {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const pedidos = [];
  const erros = [];
  ctx.on('request', (q) => pedidos.push({ url: q.url(), corpo: q.postData() || '' }));
  ctx.on('page', (p) => p.on('pageerror', (e) => erros.push(e.message)));
  return { ctx, pedidos, erros };
}
async function passarAbertura(page) {
  // Igual ao apoio dos testes offline: toca em "Começar" se a abertura ainda estiver na tela.
  await page.waitForSelector('#screen-splash.active, #screen-report.active', { timeout: 15000 });
  if (await page.locator('#screen-splash.active').count()) {
    await page.locator('#screen-splash.active .splash-btn').click({ timeout: 8000 }).catch(() => {});
    await page.waitForSelector('#screen-report.active', { timeout: 15000 });
  }
}

// ── Cidadão ──
{
  const { ctx, pedidos, erros } = await novoContexto();
  const page = await ctx.newPage();
  await page.goto(srv.url + '/');
  await passarAbertura(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await passarAbertura(page);

  const p2 = await ctx.newPage();
  await p2.goto(srv.url + '/?poste=P-0007');
  await passarAbertura(p2);
  passo('Q-01', 'Endereço antigo do QR (/?poste=P-0007) abre o formulário normal', await p2.isVisible('#screen-report.active'), true);
  passo('Q-02', 'Não existe mais a tela "poste identificado"', await p2.locator('#screen-poste-info').count(), 0);
  passo('Q-03', 'Seção de GPS continua visível (não é escondida por poste)', await p2.isVisible('#gps-btn'), true);

  await ctx.setOffline(true);
  const p3 = await ctx.newPage();
  let erro = '';
  try { await p3.goto(srv.url + '/?utm_source=whatsapp', { timeout: 10000 }); await passarAbertura(p3); } catch (e) { erro = e.message.split('\n')[0]; }
  passo('Q-04', 'DEF-14: sem internet, link com parâmetros abre o app', erro || 'abriu', 'abriu');
  const p4 = await ctx.newPage();
  erro = '';
  try { await p4.goto(srv.url + '/?poste=P-0007', { timeout: 10000 }); await passarAbertura(p4); } catch (e) { erro = e.message.split('\n')[0]; }
  passo('Q-05', 'DEF-14: sem internet, endereço antigo do QR também abre o formulário', erro || 'abriu', 'abriu');
  await ctx.setOffline(false);

  const chamouPoste = pedidos.filter((q) => /check_poste|link_poste/.test(q.corpo)).length;
  passo('Q-06', 'Cidadão não chama check_poste nem link_poste', chamouPoste, 0);
  passo('Q-07', 'Cidadão sem erros de JavaScript', erros, []);
  await ctx.close();
}

// ── Técnico ──
{
  const { ctx, pedidos, erros } = await novoContexto();
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept('p0007'));
  await page.goto(srv.url + '/tecnico/');
  await page.waitForSelector('#screen-pin.active', { timeout: 15000 });
  for (const d of PIN_TESTE) await page.locator('.keypad .key', { hasText: new RegExp(`^${d}$`) }).click();
  await page.waitForSelector('#screen-home.active', { timeout: 15000 });

  passo('Q-08', 'Botão "Ler QR" não existe mais', await page.locator('button', { hasText: 'Ler QR' }).count(), 0);
  passo('Q-09', 'Botão "Buscar poste" visível', await page.locator('button', { hasText: 'Buscar poste' }).isVisible(), true);
  passo('Q-10', 'Modal do leitor de QR não existe', await page.locator('#qr-modal').count(), 0);
  passo('Q-11', 'Card "Folha de QR codes" não existe', await page.locator('.card-title', { hasText: 'Folha de QR codes' }).count(), 0);

  await page.locator('button', { hasText: 'Buscar poste' }).click();
  await page.waitForSelector('#screen-poste.active', { timeout: 10000 });
  passo('Q-12', 'Buscar poste com "p0007" abre a tela de histórico do poste', await page.isVisible('#screen-poste.active'), true);
  await page.screenshot({ path: join(SAIDA, 'tecnico-historico.png') });

  await page.goBack().catch(() => {});
  const arquivosQr = pedidos.map((q) => q.url).filter((u) => /jsQR\.js|qr\.css|qrserver/.test(u));
  passo('Q-13', 'Nenhum pedido a jsQR.js, qr.css ou ao gerador externo de QR', arquivosQr, []);
  passo('Q-14', 'Técnico sem erros de JavaScript', erros, []);
  await ctx.close();
}

await browser.close();
await srv.fechar();
writeFileSync(join(SAIDA, 'verificacao-sem-qr.json'), JSON.stringify(r, null, 2));
for (const x of r) console.log(`${x.ok ? 'PASSOU' : 'FALHOU'}  ${x.id} ${x.descricao} — obtido: ${JSON.stringify(x.obtido)}`);
console.log(`\n${r.filter((x) => x.ok).length} de ${r.length} verificações passaram.`);
process.exit(r.every((x) => x.ok) ? 0 : 1);
