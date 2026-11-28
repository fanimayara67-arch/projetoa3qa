/**
 * Ambiente do "sistema completo" para os testes de integração com Selenium.
 *
 *   Navegador (Selenium + Chrome)
 *        │  mesma origem, como em produção (API_URL = '/')
 *        ▼
 *   Servidor deste arquivo ── arquivos de public/  (app do cidadão e painel do técnico)
 *        └── /api/*  ──────────► API Node REAL (server/src/app.js)
 *                                     └──► MySQL REAL (todas as tabelas)
 *
 * Nada é simulado entre a tela e o banco. O único controle extra é o
 * "modo sem internet": além de o Chrome ficar offline, o servidor deixa de
 * responder, porque o Chrome pode deixar o service worker ir à rede mesmo
 * com a página offline (lição do DEF-14 nos testes offline de 26/11).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '../../..');
const PUBLIC = path.join(RAIZ, 'public');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

/* ───────────── Massa de dados (fictícia) ───────────── */

const PIN = { tecnico: '0123', gestor: '0456', almoxarife: '0789' };
const CORURIPE = { latitude: -10.1253, longitude: -36.1756, accuracy: 6 };
const POSTES = [
  { id: 'P-0101', bairro: 'Centro', rua: 'Rua da Praça', lat: -10.1251, lng: -36.1752 },
  { id: 'P-0102', bairro: 'Centro', rua: 'Av. Beira Mar', lat: -10.1262, lng: -36.1770 },
  { id: 'P-0103', bairro: 'Pontal', rua: 'Rua do Farol', lat: -10.1301, lng: -36.1702 }
];
const CHAMADOS = [
  { n: 1, protocolo: 'IC-261127-SEL01', tipo: 'apagado', poste: 'P-0101' },
  { n: 2, protocolo: 'IC-261127-SEL02', tipo: 'piscando', poste: 'P-0102' },
  { n: 3, protocolo: 'IC-261127-SEL03', tipo: 'queimada', poste: 'P-0103' },
  { n: 4, protocolo: 'IC-261127-SEL04', tipo: 'apagado', poste: 'P-0101' }
];
const ITEM_ESTOQUE = { nome: 'Lâmpada LED 100W (teste)', saldo: 50, minimo: 5 };
const FOTO_DATA_URL = 'data:image/png;base64,' + fs.readFileSync(path.join(PUBLIC, 'icon-192.png')).toString('base64');

/* ───────────── Banco ───────────── */

const DDL = [
  `CREATE TABLE IF NOT EXISTS postes (
    id VARCHAR(50) PRIMARY KEY, codigo VARCHAR(50) NULL, bairro VARCHAR(120) NULL, rua VARCHAR(200) NULL,
    referencia VARCHAR(255) NULL, endereco VARCHAR(255) NULL, latitude DECIMAL(10, 7) NULL, longitude DECIMAL(10, 7) NULL,
    braco VARCHAR(100) NULL, luminaria VARCHAR(100) NULL, reator VARCHAR(100) NULL, fotosensor VARCHAR(100) NULL,
    porta_fusivel VARCHAR(100) NULL, fusivel VARCHAR(100) NULL, cabo VARCHAR(100) NULL, conector VARCHAR(100) NULL,
    foto_ref_url TEXT NULL, obs TEXT NULL, atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS chamados (
    id VARCHAR(36) PRIMARY KEY, protocolo VARCHAR(40) NOT NULL UNIQUE, tipo VARCHAR(40) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'aberto', latitude DECIMAL(10, 7) NULL, longitude DECIMAL(10, 7) NULL,
    precisao_m DECIMAL(10, 2) NULL, descricao TEXT NULL, nome VARCHAR(120) NULL, telefone VARCHAR(40) NULL,
    endereco VARCHAR(255) NULL, foto_url TEXT NULL, poste_id VARCHAR(50) NULL, user_agent VARCHAR(255) NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS fechamentos (
    id INT AUTO_INCREMENT PRIMARY KEY, operacao_id VARCHAR(36) NOT NULL UNIQUE, chamado_id VARCHAR(36) NOT NULL,
    tecnico_id INT NULL, status VARCHAR(50) NOT NULL, servico TEXT NULL, referencia VARCHAR(255) NULL,
    latitude DECIMAL(10, 7) NULL, longitude DECIMAL(10, 7) NULL, foto_url TEXT NULL,
    administrativo TINYINT(1) NOT NULL DEFAULT 0, informante VARCHAR(120) NULL, justificativa TEXT NULL,
    data_fechamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS tentativas (
    id INT AUTO_INCREMENT PRIMARY KEY, operacao_id VARCHAR(36) NOT NULL UNIQUE, chamado_id VARCHAR(36) NOT NULL,
    tecnico_id INT NULL, motivo TEXT NOT NULL, latitude DECIMAL(10, 7) NULL, longitude DECIMAL(10, 7) NULL,
    foto_url TEXT NULL, criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS itens_estoque (
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL UNIQUE, unidade VARCHAR(20) NOT NULL DEFAULT 'un',
    saldo DECIMAL(12, 2) NOT NULL DEFAULT 0, minimo DECIMAL(12, 2) NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS fechamento_materiais (
    fechamento_id INT NOT NULL, item_id INT NOT NULL, quantidade DECIMAL(12, 2) NOT NULL,
    PRIMARY KEY (fechamento_id, item_id))`,
  `CREATE TABLE IF NOT EXISTS missoes (
    id INT AUTO_INCREMENT PRIMARY KEY, data_missao DATE NOT NULL, equipe VARCHAR(120) NOT NULL, obs TEXT NULL,
    criado_por INT NULL, criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS missao_itens (
    id INT AUTO_INCREMENT PRIMARY KEY, missao_id INT NOT NULL, item_id INT NOT NULL,
    qtd_saida DECIMAL(12, 2) NOT NULL, qtd_retorno DECIMAL(12, 2) NULL)`
];

/**
 * Banco do zero: apaga o banco de teste, cria as tabelas de login (script do
 * projeto) e as operacionais (mesma estrutura do teste INT-01 a INT-15) e
 * grava a massa de dados.
 */
async function prepararBanco() {
  const mysql = require('mysql2/promise');
  const cfg = {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD
  };
  const nome = process.env.DB_NAME;
  if (!/teste|selenium|iluminacao/i.test(nome)) throw new Error(`Banco "${nome}" não parece de teste; abortando para não apagar dados.`);

  const adm = await mysql.createConnection(cfg);
  await adm.query(`DROP DATABASE IF EXISTS \`${nome}\``);
  await adm.query(`CREATE DATABASE \`${nome}\``);
  await adm.end();

  execFileSync(process.execPath, [path.join(RAIZ, 'server/scripts/setup-auth-mysql.js')], { env: process.env, stdio: 'pipe' });

  const pool = require('../../src/infrastructure/database/pool');
  for (const sql of DDL) await pool.query(sql);

  const { gerarHashPin } = require('../../src/infrastructure/security/hashPin');
  await pool.query("INSERT INTO usuarios (nome, perfil, pin_hash, ativo) VALUES ('Gestor QA', 'gestor', ?, 1)", [await gerarHashPin(PIN.gestor)]);
  await pool.query("INSERT INTO usuarios (nome, perfil, pin_hash, ativo) VALUES ('Almoxarife QA', 'almoxarife', ?, 1)", [await gerarHashPin(PIN.almoxarife)]);

  for (const p of POSTES) {
    await pool.query('INSERT INTO postes (id, bairro, rua, latitude, longitude) VALUES (?, ?, ?, ?, ?)', [p.id, p.bairro, p.rua, p.lat, p.lng]);
  }
  await pool.query('INSERT INTO itens_estoque (nome, unidade, saldo, minimo) VALUES (?, ?, ?, ?)',
    [ITEM_ESTOQUE.nome, 'un', ITEM_ESTOQUE.saldo, ITEM_ESTOQUE.minimo]);
  return pool;
}

/* ───────────── Servidor (telas + API na mesma origem) ───────────── */

function configJs() {
  return `(function (global) {
  var origin = global.location ? global.location.origin : '';
  global.ILUMINA = {
    API_URL: '/',
    ENDPOINT_CIDADAO: '/api/chamados',
    ENDPOINT_TECNICO: '/api',
    APP_CIDADAO: origin + '/',
    APP_TECNICO: origin + '/tecnico/',
    HUB_URL: 'https://example.invalid'
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

async function subirServidor() {
  const { criarApp } = require('../../src/app');
  const app = criarApp();
  const estado = { semInternet: false, pedidosApi: [] };

  const srv = http.createServer(async (req, res) => {
    // "Sem internet": a conexão cai sem resposta, inclusive para o service worker.
    if (estado.semInternet) return req.socket.destroy();

    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api')) {
      estado.pedidosApi.push({ metodo: req.method, caminho: url.pathname, tipo: req.headers['content-type'] || '' });
      return app.handle(req, res);
    }
    if (url.pathname === '/shared/config.js' || url.pathname === '/shared/infrastructure/config.js') {
      res.writeHead(200, { 'Content-Type': TIPOS['.js'], 'Cache-Control': 'no-store' });
      return res.end(configJs());
    }
    let arquivo = path.join(PUBLIC, decodeURIComponent(url.pathname));
    if (!arquivo.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).isDirectory()) arquivo = path.join(arquivo, 'index.html');
    if (!fs.existsSync(arquivo)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    fs.createReadStream(arquivo).pipe(res);
  });

  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://localhost:${srv.address().port}`;
  return {
    url,
    estado,
    fechar: () => new Promise((ok) => { srv.closeAllConnections?.(); srv.close(() => ok()); })
  };
}

/** Cria os chamados abertos pela própria API, como o app do cidadão faria. */
async function semearChamados(url) {
  const criados = [];
  for (const c of CHAMADOS) {
    const p = POSTES.find((x) => x.id === c.poste);
    const corpo = {
      id: `5e1e0000-0000-4000-8000-00000000000${c.n}`, protocolo: c.protocolo, timestamp: new Date().toISOString(),
      tipo: c.tipo, lat: p.lat, lng: p.lng, acc: 8, foto_base64: FOTO_DATA_URL,
      descricao: `Chamado de teste ${c.n}`, nome: 'Cidadão QA', tel: '', endereco: p.rua
    };
    const r = await fetch(`${url}/api/chamados`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (r.status >= 300) throw new Error(`Falha ao semear ${c.protocolo}: HTTP ${r.status} ${await r.text()}`);
    criados.push(c.protocolo);
  }
  return criados;
}

module.exports = { prepararBanco, subirServidor, semearChamados, PIN, CORURIPE, CHAMADOS, POSTES, ITEM_ESTOQUE, RAIZ };
