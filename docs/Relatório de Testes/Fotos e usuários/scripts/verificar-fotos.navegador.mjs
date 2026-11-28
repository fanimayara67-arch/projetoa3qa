// Verificação no navegador das fotos (casos F-01 a F-08), nos dois modos de armazenamento.
// Uso (na raiz do projeto, com o Google Chrome instalado):
//   npm install --no-save playwright-core
//   node "docs/Relatório de Testes/Fotos e usuários/scripts/verificar-fotos.navegador.mjs" . <pasta de saída>
// Opcional: PLAYWRIGHT_CORE=<caminho> escolhe outra cópia do Playwright; NAVEGADOR=chromium usa o Chromium.
//
// Sobe a pasta public/ e a API Node real (rotas, serviços e o FotoStorage de verdade) na mesma
// origem, como o site faz em produção com o repasse de /api/* e /uploads/*. Só os repositórios
// e a tabela fotos ficam em memória (server/tests/telas-api-node/apoio/api-em-memoria.js).
// O cidadão envia um reporte com foto pela tela; o técnico abre o chamado e a foto precisa aparecer.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat, mkdtemp, readdir } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const RAIZ = resolve(process.argv[2] || '.');
const SAIDA = resolve(process.argv[3] || '.');
mkdirSync(SAIDA, { recursive: true });
const require = createRequire(join(RAIZ, 'package.json'));
const FotoStorage = require(join(RAIZ, 'server/src/infrastructure/storage/FotoStorage.js'));
const salvarDeVerdade = FotoStorage.salvar;
const { criarApiEmMemoria, PIN_TECNICO } = require(join(RAIZ, 'server/tests/telas-api-node/apoio/api-em-memoria.js'));
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const { app, banco } = await criarApiEmMemoria();
FotoStorage.salvar = salvarDeVerdade; // o apoio troca a gravação por um dublê; aqui vale a real
const PASTA_FOTOS = await mkdtemp(join(tmpdir(), 'ilumina-fotos-'));
process.env.UPLOAD_DIR = PASTA_FOTOS;

/* ── Servidor: public/ + /api e /uploads na mesma origem ── */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const CONFIG = `(function (g) { var o = g.location ? g.location.origin : '';
  g.ILUMINA = { API_URL: '/', ENDPOINT_CIDADAO: '/api/chamados', ENDPOINT_TECNICO: '/api', APP_CIDADAO: o + '/', APP_TECNICO: o + '/tecnico/', HUB_URL: 'https://example.invalid' };
})(typeof window !== 'undefined' ? window : globalThis);`;
const servidor = createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname;
  if (caminho.startsWith('/api/') || caminho.startsWith('/uploads/')) return app.handle(req, res);
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
const erros = [];

async function reportarComFoto(modo) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, geolocation: { latitude: -10.1251, longitude: -36.1752, accuracy: 6 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(`[cidadão ${modo}] ${e.message}`));
  await page.goto(URL_BASE + '/');
  await page.locator('#screen-splash .splash-btn').click({ force: true });
  await page.waitForSelector('#screen-report.active');
  await page.click('#gps-btn');
  await page.waitForSelector('#gps-result.show');
  await page.click('#type-chips .chip[data-value="apagado"]');
  await page.setInputFiles('#photo-input', join(RAIZ, 'public/icon-192.png'));
  await page.waitForSelector('#photo-preview-wrap.show');
  await page.waitForFunction(() => !document.getElementById('submit-btn').disabled);
  await page.click('#submit-btn');
  await page.waitForSelector('#screen-success.active', { timeout: 30000 });
  const titulo = (await page.textContent('#success-title')).trim();
  const protocolo = (await page.textContent('#success-protocol')).replace(/^Protocolo:\s*/, '').trim();
  await ctx.close();
  return { titulo, protocolo };
}

async function abrirNoTecnico(protocolo, modo) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(`[técnico ${modo}] ${e.message}`));
  await page.goto(URL_BASE + '/tecnico/');
  await page.waitForSelector('#screen-pin.active');
  for (const d of PIN_TECNICO) await page.locator('#screen-pin button.key', { hasText: new RegExp(`^${d}$`) }).click();
  await page.waitForSelector('#screen-home.active');
  await page.click(`#lista-chamados .js-call-item[data-proto="${protocolo}"]`);
  await page.waitForSelector('#screen-close.active');
  await page.waitForFunction(() => { const i = document.getElementById('foto-cidadao'); return i && i.complete; }, null, { timeout: 15000 }).catch(() => {});
  const foto = await page.evaluate(() => { const i = document.getElementById('foto-cidadao'); return i ? { largura: i.naturalWidth, visivel: getComputedStyle(i).display !== 'none' } : null; });
  await page.screenshot({ path: join(SAIDA, `F-${modo}-foto-no-tecnico.png`), fullPage: true });
  await ctx.close();
  return foto;
}

let n = 1;
const id = () => `F-${String(n++).padStart(2, '0')}`;
for (const modo of ['disco', 'mysql']) {
  process.env.STORAGE_DRIVER = modo;
  const arquivosAntes = (await readdir(PASTA_FOTOS)).length;
  const fotosNoBancoAntes = banco.fotos.size;

  const envio = await reportarComFoto(modo);
  const chamado = banco.chamados.find((c) => c.protocolo === envio.protocolo);
  const url = chamado && chamado.foto_url;
  passo(id(), `[${modo}] Cidadão envia reporte com foto; o chamado guarda o endereço /uploads/fotos/...`,
    { titulo: envio.titulo, endereco: /^\/uploads\/fotos\/\d+-[0-9a-f]{8}\.(jpg|png|webp)$/.test(url || '') },
    { titulo: 'Reporte enviado', endereco: true });

  const guardada = { disco: (await readdir(PASTA_FOTOS)).length - arquivosAntes, banco: banco.fotos.size - fotosNoBancoAntes };
  passo(id(), `[${modo}] A foto fica ${modo === 'disco' ? 'na pasta UPLOAD_DIR' : 'na tabela fotos, não no disco'}`,
    guardada, modo === 'disco' ? { disco: 1, banco: 0 } : { disco: 0, banco: 1 });

  const resposta = await fetch(URL_BASE + url);
  const bytes = Buffer.from(await resposta.arrayBuffer());
  passo(id(), `[${modo}] GET /uploads/fotos/<arquivo> pela mesma origem do site entrega a imagem`,
    { status: resposta.status, imagem: /^image\//.test(resposta.headers.get('content-type') || ''), bytes: bytes.length > 100 },
    { status: 200, imagem: true, bytes: true });

  const foto = await abrirNoTecnico(envio.protocolo, modo);
  passo(id(), `[${modo}] O técnico abre o chamado e vê a foto do cidadão`,
    { carregou: Boolean(foto && foto.largura > 0 && foto.visivel) }, { carregou: true });
}
passo(id(), 'Nenhum erro de JavaScript', { erros }, { erros: [] });

await browser.close();
servidor.close();

writeFileSync(join(SAIDA, 'verificacao-fotos.json'), JSON.stringify({ executadoEm: new Date().toISOString(), casos: r }, null, 2) + '\n');
const linhas = r.map((x) => `${x.ok ? '✔' : '✘'} ${x.id} ${x.descricao}${x.ok ? '' : `\n   obtido: ${JSON.stringify(x.obtido)}\n   esperado: ${JSON.stringify(x.esperado)}`}`);
linhas.push('', `Total ${r.length} | aprovados ${r.filter((x) => x.ok).length} | reprovados ${r.filter((x) => !x.ok).length}`);
writeFileSync(join(SAIDA, 'verificacao-fotos.txt'), linhas.join('\n') + '\n');
console.log(linhas.join('\n'));
process.exit(r.every((x) => x.ok) ? 0 : 1);
