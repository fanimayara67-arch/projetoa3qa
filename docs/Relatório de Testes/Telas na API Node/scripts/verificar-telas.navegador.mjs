// Verificação no navegador das telas que passaram para a API Node (casos V-01 a V-12).
// Uso (na raiz do projeto, com o Google Chrome instalado):
//   npm install --no-save playwright-core
//   node "docs/Relatório de Testes/Telas na API Node/scripts/verificar-telas.navegador.mjs" . <pasta de saída>
// Opcional: PLAYWRIGHT_CORE=<caminho> escolhe outra cópia do Playwright; NAVEGADOR=chromium usa o Chromium.
//
// Sobe a pasta public/ e a API Node real (rotas, PIN, perfis, serviços) com o banco em memória
// de server/tests/telas-api-node/apoio/api-em-memoria.js, na mesma origem, com a configuração
// que o build gera para a API Node. Tudo é feito pela tela, como o usuário faria.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const RAIZ = resolve(process.argv[2] || '.');
const SAIDA = resolve(process.argv[3] || '.');
mkdirSync(SAIDA, { recursive: true });
const require = createRequire(join(RAIZ, 'package.json'));
const { criarApiEmMemoria, PIN_TECNICO, PIN_ALMOX } = require(join(RAIZ, 'server/tests/telas-api-node/apoio/api-em-memoria.js'));
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

/* ── Massa de dados (fictícia) ── */
const { app, banco } = await criarApiEmMemoria();
const agora = Date.now();
banco.itens.push(
  { id: 1, nome: 'Lâmpada LED 100W', unidade: 'un', saldo: '10.00', minimo: '4.00', atualizado_em: new Date() },
  { id: 2, nome: 'Reator 250W', unidade: 'un', saldo: '8.00', minimo: '2.00', atualizado_em: new Date() }
);
banco.postes.push({ id: 'P-0007', codigo: 'CRP-7', bairro: 'Centro', rua: 'Rua da Praça', referencia: 'Em frente à igreja', foto_ref_url: null, latitude: '-10.125000', longitude: '-36.175000' });
banco.chamados.push(
  { id: randomUUID(), protocolo: 'IC-261127-P7ABE', tipo: 'apagado', status: 'aberto', poste_id: 'P-0007', latitude: '-10.125000', longitude: '-36.175000', descricao: 'Apagado', criado_em: new Date(agora - 3600e3) },
  { id: randomUUID(), protocolo: 'IC-261110-P7FEC', tipo: 'piscando', status: 'fechado', poste_id: 'P-0007', latitude: '-10.125000', longitude: '-36.175000', criado_em: new Date(agora - 17 * 86400e3), servico: 'Troca do reator', tecnico: 'Técnico Teste' },
  { id: randomUUID(), protocolo: 'IC-261120-BUSCA', tipo: 'quebrado', status: 'fechado', poste_id: null, latitude: '-10.12', longitude: '-36.17', criado_em: new Date(agora - 7 * 86400e3) }
);

/* ── Servidor: public/ + API na mesma origem ── */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const CONFIG = `(function (g) { var o = g.location ? g.location.origin : '';
  g.ILUMINA = { API_URL: '/', ENDPOINT_CIDADAO: '/api/chamados', ENDPOINT_TECNICO: '/api', APP_CIDADAO: o + '/', APP_TECNICO: o + '/tecnico/', HUB_URL: 'https://example.invalid' };
})(typeof window !== 'undefined' ? window : globalThis);`;
const pedidos = [];
const servidor = createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname;
  if (caminho.startsWith('/api/')) { pedidos.push(`${req.method} ${caminho}`); return app.handle(req, res); }
  if (/\/shared\/(infrastructure\/)?config\.js$/.test(caminho)) { res.writeHead(200, { 'Content-Type': TIPOS['.js'] }); return res.end(CONFIG); }
  let arquivo = normalize(join(RAIZ, 'public', decodeURIComponent(caminho)));
  try { if ((await stat(arquivo)).isDirectory()) arquivo = join(arquivo, 'index.html'); res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream' }); res.end(await readFile(arquivo)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const URL_BASE = `http://127.0.0.1:${servidor.address().port}`;

/* ── Navegador ── */
const r = [];
const passo = (id, descricao, obtido, esperado) => r.push({ id, descricao, obtido, esperado, ok: JSON.stringify(obtido) === JSON.stringify(esperado) });
const browser = await chromium.launch({ channel: process.env.NAVEGADOR || 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const erros = [];
ctx.on('page', (p) => p.on('pageerror', (e) => erros.push(e.message)));
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(e.message));
const avisos = [];
const ultimoAviso = async () => (await page.locator('#toast').textContent().catch(() => '')).trim();
const captura = (nome, alvo = page) => alvo.screenshot({ path: join(SAIDA, nome), fullPage: true });
const ate = (fn, ms = 10000) => page.waitForFunction(fn, null, { timeout: ms });

await page.goto(URL_BASE + '/tecnico/');
await page.waitForSelector('#screen-pin.active');
for (const d of PIN_TECNICO) await page.locator('#screen-pin button.key', { hasText: new RegExp(`^${d}$`) }).click();
await page.waitForSelector('#screen-home.active');

// ── Almoxarifado (DEF-16) ──
await page.locator('#screen-home button', { hasText: 'Gestão de Material' }).click();
await page.waitForSelector('#screen-almox.active');
await page.fill('#almox-pin', PIN_TECNICO);
await page.locator('#almox-pin-gate button', { hasText: 'Entrar' }).click();
await ate(() => /PIN incorreto|não/i.test(document.getElementById('toast')?.textContent || ''));
avisos.push(await ultimoAviso());
passo('V-01', 'Almoxarifado recusa o PIN do técnico e continua fechado',
  { aviso: avisos.at(-1), conteudoVisivel: await page.locator('#almox-content').isVisible() },
  { aviso: avisos.at(-1), conteudoVisivel: false });

await page.fill('#almox-pin', PIN_ALMOX);
await page.locator('#almox-pin-gate button', { hasText: 'Entrar' }).click();
await page.waitForSelector('#almox-content', { state: 'visible' });
await ate(() => document.querySelectorAll('#est-list > div').length >= 2);
const lista = async () => page.$$eval('#est-list > div', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
passo('V-02', 'Almoxarife entra com o próprio PIN e vê o estoque da API Node',
  { itens: (await lista()).map((t) => t.split(' mín')[0]) }, { itens: ['Lâmpada LED 100W', 'Reator 250W'] });
await captura('V-02-estoque.png');

await page.fill('#est-item', 'Cabo 2,5mm');
await page.selectOption('#est-unidade', 'm');
await page.fill('#est-saldo', '50');
await page.fill('#est-minimo', '10');
await page.click('#est-save-btn');
await ate(() => /Cabo 2,5mm/.test(document.getElementById('est-list').innerText));
passo('V-03', 'Cadastro de item pela tela aparece na lista',
  { cabo: (await lista()).some((t) => t.startsWith('Cabo 2,5mm') && /50 m/.test(t)) }, { cabo: true });

await page.click('#atab-missoes');
await ate(() => document.querySelectorAll('#mis-itens-saida input').length >= 3);
await page.fill('#mis-equipe', 'Equipe A');
const campoReator = await page.$$eval('#mis-itens-saida input', (els) => els.find((e) => e.parentElement.innerText.includes('Reator')).id);
await page.fill('#' + campoReator, '3');
await page.getByRole('button', { name: /Registrar saída/ }).click();
await ate(() => /ABERTA/.test(document.getElementById('mis-list').innerText));
await page.click('#atab-estoque');
await ate(() => /Reator 250W[\s\S]*?5\s*un/.test(document.getElementById('est-list').innerText));
passo('V-04', 'Saída para a missão aparece como ABERTA e debita o estoque (8 → 5)',
  { reator: (await lista()).find((t) => t.startsWith('Reator')).match(/(\d+) un ✏️/)?.[1] }, { reator: '5' });

await page.click('#atab-missoes');
await ate(() => /ABERTA/.test(document.getElementById('mis-list').innerText));
await captura('V-04-missao-aberta.png');
await page.getByRole('button', { name: /Registrar retorno/ }).click();
await page.waitForSelector('#ret-modal');
await page.fill('#ret-0', '1');
await page.getByRole('button', { name: 'Confirmar retorno' }).click();
await ate(() => /FECHADA/.test(document.getElementById('mis-list').innerText));
const missaoTxt = (await page.locator('#mis-list').innerText()).replace(/\s+/g, ' ');
passo('V-05', 'Retorno de material fecha a missão e mostra o consumo (saiu 3, voltou 1, usou 2)',
  { fechada: /FECHADA/.test(missaoTxt), consumo: /saiu 3, voltou 1 → usou 2/.test(missaoTxt) }, { fechada: true, consumo: true });
await page.click('#atab-estoque');
await ate(() => /Reator 250W[\s\S]*?6\s*un/.test(document.getElementById('est-list').innerText));
passo('V-06', 'O retorno volta ao estoque (5 → 6)',
  { reator: (await lista()).find((t) => t.startsWith('Reator')).match(/(\d+) un ✏️/)?.[1] }, { reator: '6' });

await page.click('#atab-relatorio');
const [janelaMaterial] = await Promise.all([ctx.waitForEvent('page'), page.locator('#asec-relatorio button', { hasText: /relatório/i }).first().click()]);
await janelaMaterial.waitForLoadState();
const materialTxt = (await janelaMaterial.locator('body').innerText()).replace(/\s+/g, ' ');
passo('V-07', 'Relatório de material abre com estoque e missão',
  { estoque: /Reator 250W/.test(materialTxt) && /Cabo 2,5mm/.test(materialTxt), missao: /consumo 2/.test(materialTxt) }, { estoque: true, missao: true });
await captura('V-07-relatorio-material.png', janelaMaterial);
await janelaMaterial.close();

// ── Postes (DEF-15) ──
await page.evaluate(() => goHome());
await page.waitForSelector('#screen-home.active');
page.once('dialog', (d) => d.accept('p0007'));
await page.locator('#screen-home button', { hasText: 'Buscar poste' }).click();
await page.waitForSelector('#screen-poste.active');
await ate(() => /P-0007/.test(document.getElementById('poste-content').innerText) && !/Carregando/.test(document.getElementById('poste-content').innerText));
const posteTxt = (await page.locator('#poste-content').innerText()).replace(/\s+/g, ' ');
passo('V-08', 'Histórico do poste P-0007: ficha, 1 chamado aberto e 1 atendido',
  { ficha: /CRP-7/.test(posteTxt) && /Centro/.test(posteTxt), aberto: /1 chamado aberto/i.test(posteTxt), atendido: /Histórico \(1 atendimento\)/i.test(posteTxt) },
  { ficha: true, aberto: true, atendido: true });
await captura('V-08-historico-poste.png');

page.once('dialog', (d) => d.accept('P-0999'));
await page.evaluate(() => goHome());
await page.locator('#screen-home button', { hasText: 'Buscar poste' }).click();
await ate(() => /não cadastrado/i.test(document.getElementById('poste-content').innerText));
passo('V-09', 'Poste sem cadastro mostra "Poste não cadastrado"', { mensagem: true }, { mensagem: true });

await page.evaluate(() => abrirGestor());
await page.waitForSelector('#screen-gestor.active');
const [janelaPostes] = await Promise.all([ctx.waitForEvent('page'), page.locator('button', { hasText: 'Gerar relatório' }).filter({ hasText: '📍' }).click()]);
await janelaPostes.waitForLoadState();
const postesTxt = (await janelaPostes.locator('body').innerText()).replace(/\s+/g, ' ');
passo('V-10', 'Relatório de postes lista o P-0007 com 2 atendimentos',
  { poste: /P-0007/.test(postesTxt), atendimentos: /2 atendimentos/.test(postesTxt), semUndefined: !/undefined/.test(postesTxt) },
  { poste: true, atendimentos: true, semUndefined: true });
await captura('V-10-relatorio-postes.png', janelaPostes);
await janelaPostes.close();

// ── Busca por protocolo fora da lista local ──
await page.evaluate(() => goHome());
await page.waitForSelector('#screen-home.active');
await page.fill('#search-proto', 'IC-261120-BUSCA');
await page.locator('.search-row button', { hasText: 'Buscar' }).click();
await ate(() => /IC-261120-BUSCA/.test(document.getElementById('search-result').innerText));
passo('V-11', 'Busca por protocolo de chamado já fechado (fora da lista local) acha no servidor',
  { achou: /IC-261120-BUSCA/.test(await page.locator('#search-result').innerText()) }, { achou: true });

passo('V-12', 'Nenhum erro de JavaScript nas telas', { erros }, { erros: [] });

await browser.close();
servidor.close();

const formatoApps = pedidos.filter((p) => p === 'POST /api');
const saida = { executadoEm: new Date().toISOString(), casos: r, pedidosNaApi: pedidos, pedidosNoFormatoAppsScript: formatoApps.length };
writeFileSync(join(SAIDA, 'verificacao-telas.json'), JSON.stringify(saida, null, 2) + '\n');
const linhas = r.map((x) => `${x.ok ? '✔' : '✘'} ${x.id} ${x.descricao}${x.ok ? '' : `\n   obtido: ${JSON.stringify(x.obtido)}\n   esperado: ${JSON.stringify(x.esperado)}`}`);
linhas.push('', `Pedidos no formato do Apps Script (POST /api): ${formatoApps.length}`, `Total ${r.length} | aprovados ${r.filter((x) => x.ok).length} | reprovados ${r.filter((x) => !x.ok).length}`);
writeFileSync(join(SAIDA, 'verificacao-telas.txt'), linhas.join('\n') + '\n');
console.log(linhas.join('\n'));
process.exit(r.every((x) => x.ok) ? 0 : 1);
