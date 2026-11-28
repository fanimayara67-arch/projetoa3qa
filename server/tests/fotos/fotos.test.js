/**
 * Fotos | As fotos gravadas pela API precisam ser entregues e precisam sobreviver ao deploy
 *
 * A API grava a foto do reporte, do reparo e da tentativa e guarda no banco o endereço
 * /uploads/fotos/<arquivo>. Antes deste PR, nada servia esse endereço: o servidor Node não
 * tinha a rota e o site só repassava /api/* para o Render. Toda foto aparecia quebrada.
 * Além disso, o disco do Render é apagado a cada deploy; por isso existe o modo
 * STORAGE_DRIVER=mysql, que guarda a foto numa tabela própria.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const FotoStorage = require('../../src/infrastructure/storage/FotoStorage');

const RAIZ = path.resolve(__dirname, '../../..');
// JPEG mínimo (cabeçalho SOI/APP0) só para conferir os bytes de ida e volta.
const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const DATA_URL = 'data:image/jpeg;base64,' + BYTES.toString('base64');
// A foto fica em <temporária>/fotos; o "segredo" do FT-02 fica um nível acima, fora da pasta.
const PASTA = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilumina-fotos-')), 'fotos');
fs.mkdirSync(PASTA);

const nomeDe = (url) => url.replace('/uploads/fotos/', '');

/** Banco falso para o modo MySQL: guarda as linhas da tabela fotos. */
function bancoFalso() {
  const linhas = new Map();
  const consultas = [];
  return {
    consultas,
    linhas,
    async query(sql, valores = []) {
      consultas.push({ sql, valores });
      if (/^\s*INSERT INTO fotos/i.test(sql)) { linhas.set(valores[0], { tipo: valores[1], dados: valores[2] }); return { rows: { affectedRows: 1 } }; }
      if (/^\s*SELECT tipo, dados FROM fotos WHERE nome = \?/i.test(sql)) { const l = linhas.get(valores[0]); return { rows: l ? [l] : [] }; }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
}

/* ─────────────── Armazenamento ─────────────── */

test('FT-01 [caixa-preta | fluxo principal] foto salva em disco é lida de volta com os mesmos bytes e o tipo certo', async () => {
  const url = await FotoStorage.salvar(DATA_URL, { diretorio: PASTA, driver: 'disco' });
  assert.match(url, /^\/uploads\/fotos\/\d+-[0-9a-f]{8}\.jpg$/);
  const foto = await FotoStorage.ler(nomeDe(url), { diretorio: PASTA, driver: 'disco' });
  assert.deepEqual(foto.conteudo, BYTES);
  assert.equal(foto.tipo, 'image/jpeg');
});

test('FT-02 [caixa-preta | risco: segurança] nome com caminho ou extensão estranha é recusado sem ler o disco', async () => {
  fs.writeFileSync(path.join(PASTA, '..', 'segredo.jpg'), 'nao pode sair');
  for (const nome of ['../segredo.jpg', '..\\segredo.jpg', 'sub/foto.jpg', '.env', 'foto.exe', 'foto.jpg.exe', '', null, undefined]) {
    assert.equal(await FotoStorage.ler(nome, { diretorio: PASTA, driver: 'disco' }), null, String(nome));
  }
});

test('FT-03 [caixa-preta | fluxo alternativo] foto que não existe devolve nulo', async () => {
  assert.equal(await FotoStorage.ler('1700000000000-deadbeef.jpg', { diretorio: PASTA, driver: 'disco' }), null);
});

test('FT-04 [caixa-preta | fluxo principal] no modo MySQL a foto vai para a tabela fotos, não para o disco', async () => {
  const banco = bancoFalso();
  const pastaVazia = fs.mkdtempSync(path.join(os.tmpdir(), 'ilumina-fotos-mysql-'));
  const url = await FotoStorage.salvar('data:image/png;base64,' + BYTES.toString('base64'), { driver: 'mysql', banco, diretorio: pastaVazia });
  assert.match(url, /^\/uploads\/fotos\/\d+-[0-9a-f]{8}\.png$/);
  assert.deepEqual(fs.readdirSync(pastaVazia), [], 'nada no disco');
  assert.match(banco.consultas[0].sql, /^\s*INSERT INTO fotos \(nome, tipo, dados\) VALUES \(\?, \?, \?\)/);
  assert.deepEqual(banco.consultas[0].valores.slice(0, 2), [nomeDe(url), 'image/png']);
  assert.ok(Buffer.isBuffer(banco.consultas[0].valores[2]));

  const foto = await FotoStorage.ler(nomeDe(url), { driver: 'mysql', banco });
  assert.deepEqual(Buffer.from(foto.conteudo), BYTES);
  assert.equal(foto.tipo, 'image/png');
  assert.equal(await FotoStorage.ler('1700000000000-deadbeef.png', { driver: 'mysql', banco }), null);
});

test('FT-05 [caixa-branca] o modo vem de STORAGE_DRIVER; sem a variável, grava em disco', async (t) => {
  const anterior = process.env.STORAGE_DRIVER;
  t.after(() => { if (anterior === undefined) delete process.env.STORAGE_DRIVER; else process.env.STORAGE_DRIVER = anterior; });

  delete process.env.STORAGE_DRIVER;
  assert.equal(FotoStorage.driverAtual(), 'disco');
  process.env.STORAGE_DRIVER = 'mysql';
  assert.equal(FotoStorage.driverAtual(), 'mysql');
  process.env.STORAGE_DRIVER = 'MySQL ';
  assert.equal(FotoStorage.driverAtual(), 'mysql');
  process.env.STORAGE_DRIVER = 's3';
  assert.throws(() => FotoStorage.driverAtual(), /STORAGE_DRIVER/);
});

test('FT-06 [caixa-branca] a migração 002 cria a tabela fotos no MySQL', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'server/database/migrations/002_fotos_mysql.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS fotos/);
  assert.match(sql, /nome\s+VARCHAR\(\d+\)\s+NOT NULL PRIMARY KEY/);
  assert.match(sql, /dados\s+MEDIUMBLOB\s+NOT NULL/, 'MEDIUMBLOB comporta até 16 MB; a foto tem no máximo 5 MB');
});

/* ─────────────── Rota GET /uploads/fotos/:arquivo ─────────────── */

async function comServidor(fn) {
  process.env.UPLOAD_DIR = PASTA;
  process.env.STORAGE_DRIVER = 'disco';
  const { criarApp } = require('../../src/app');
  const servidor = http.createServer(criarApp().handle);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  try { return await fn(`http://127.0.0.1:${servidor.address().port}`); }
  finally { await new Promise((ok) => servidor.close(ok)); delete process.env.UPLOAD_DIR; delete process.env.STORAGE_DRIVER; }
}

test('FT-07 [integração | fluxo principal] GET /uploads/fotos/:arquivo entrega a foto, sem login, com cache longo', async () => {
  const url = await FotoStorage.salvar(DATA_URL, { diretorio: PASTA, driver: 'disco' });
  await comServidor(async (base) => {
    const r = await fetch(base + url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('cache-control'), /max-age=31536000/);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), BYTES);
  });
});

test('FT-08 [integração | fluxo alternativo e segurança] foto inexistente e caminho com ../ respondem 404 sem vazar arquivo', async () => {
  await comServidor(async (base) => {
    const inexistente = await fetch(base + '/uploads/fotos/1700000000000-deadbeef.jpg');
    assert.equal(inexistente.status, 404);
    for (const tentativa of ['/uploads/fotos/..%2Fsegredo.jpg', '/uploads/fotos/..%5Csegredo.jpg', '/uploads/fotos/%2E%2E%2F.env']) {
      const r = await fetch(base + tentativa);
      assert.equal(r.status, 404, tentativa);
      assert.doesNotMatch(await r.text(), /nao pode sair/);
    }
  });
});

/* ─────────────── Deploy ─────────────── */

test('FT-09 [caixa-branca] Vercel e Netlify repassam /uploads/* para a API, como fazem com /api/*', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const api = vercel.rewrites.find((r) => r.source === '/api/:path*').destination.replace(/\/api\/:path\*$/, '');
  assert.ok(vercel.rewrites.some((r) => r.source === '/uploads/:path*' && r.destination === `${api}/uploads/:path*`), 'vercel.json');

  const netlify = fs.readFileSync(path.join(RAIZ, 'netlify.toml'), 'utf8');
  assert.match(netlify, /from = "\/uploads\/\*"\s+to = "https:\/\/[^"]+\/uploads\/:splat"\s+status = 200/, 'netlify.toml');
});
