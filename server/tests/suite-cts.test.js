const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');

const ROOT_DIR = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SERVER_DIR = path.join(ROOT_DIR, 'server');

function encontrarArquivo(caminhosRelativos) {
  for (const rel of caminhosRelativos) {
    const completo = path.join(PUBLIC_DIR, rel);
    if (fs.existsSync(completo)) return completo;
  }
  return null;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'db_iluminacao',
});

const tokensCriadosNoTeste = [];

function resolverModulo(mod, nomeEsperado) {
  const alvo = mod && mod[nomeEsperado] ? mod[nomeEsperado] : mod;
  if (typeof alvo === 'function') {
    const ehClasse = alvo.prototype && Object.getOwnPropertyNames(alvo.prototype).length > 1;
    if (ehClasse) {
      try {
        return new alvo();
      } catch (_) {
        return new alvo(pool);
      }
    }
    return alvo(pool);
  }
  return alvo;
}

function carregarAuthService() {
  const authMod = require(path.join(SERVER_DIR, 'src/application/services/AuthService'));
  const AuthTarget = authMod.AuthService || authMod;

  if (typeof AuthTarget === 'object' && typeof AuthTarget.autenticarPorPin === 'function') {
    return AuthTarget;
  }

  const userRepoMod = require(path.join(SERVER_DIR, 'src/infrastructure/repositories/UsuarioRepository'));
  const sessaoRepoMod = require(path.join(SERVER_DIR, 'src/infrastructure/repositories/SessaoRepository'));

  const usuarioRepo = resolverModulo(userRepoMod, 'UsuarioRepository');
  const sessaoRepo = resolverModulo(sessaoRepoMod, 'SessaoRepository');

  const svc = new AuthTarget({
    usuarioRepository: usuarioRepo,
    sessaoRepository: sessaoRepo,
    usuarioRepo,
    sessaoRepo,
  });

  if (svc.usuarioRepository || svc.usuarioRepo) return svc;
  return new AuthTarget(usuarioRepo, sessaoRepo);
}

async function chamarLogin(authService, pin, ip) {
  if (authService.autenticarPorPin.length >= 2) {
    return authService.autenticarPorPin(pin, ip);
  }
  return authService.autenticarPorPin({ pin, ip });
}

after(async () => {
  try {
    if (tokensCriadosNoTeste.length > 0) {
      await pool.query('DELETE FROM sessoes WHERE token IN (?)', [tokensCriadosNoTeste]);
    }
    await pool.query("DELETE FROM tentativas_login WHERE ip = '127.0.0.99'");
  } catch (_) {}

  await pool.end();

  try {
    const dbPoolMod = require(path.join(SERVER_DIR, 'src/infrastructure/database/pool'));
    const appPool = dbPoolMod.pool || dbPoolMod;
    if (appPool && typeof appPool.end === 'function') {
      await appPool.end();
    }
  } catch (_) {}
});

// ============================================================================
// TAREFA 1 — Frontend Tela de PIN
// ============================================================================

test('CT-01 [Caixa Branca] Arquivo design-tokens.css existe e possui tokens CSS', () => {
  const arq = encontrarArquivo([
    'shared/styles/design-tokens.css',
    'shared/design-tokens.css',
    'css/design-tokens.css',
  ]);
  assert.ok(arq, 'Arquivo design-tokens.css nao encontrado em public/');
  const conteudo = fs.readFileSync(arq, 'utf-8');
  assert.ok(conteudo.includes('--'), 'design-tokens.css nao contem variaveis CSS');
});

test('CT-02 [Caixa Branca] Arquivo tecnico.css existe e possui estilos da tela', () => {
  const arq = encontrarArquivo([
    'tecnico/tecnico.css',
    'tecnico/styles/tecnico.css',
    'shared/styles/tecnico.css',
  ]);
  assert.ok(arq, 'Arquivo tecnico.css nao encontrado em public/');
  const conteudo = fs.readFileSync(arq, 'utf-8');
  assert.ok(conteudo.trim().length > 50, 'tecnico.css esta vazio');
});

test('CT-03 [Caixa Branca] Arquivo utilities.css existe e possui classes utilitarias', () => {
  const arq = encontrarArquivo([
    'shared/styles/utilities.css',
    'shared/utilities.css',
    'css/utilities.css',
  ]);
  assert.ok(arq, 'Arquivo utilities.css nao encontrado em public/');
  const conteudo = fs.readFileSync(arq, 'utf-8');
  assert.ok(conteudo.trim().length > 20, 'utilities.css esta vazio');
});

test('CT-04 [Caixa Preta] Tela tecnico/index.html renderiza os 4 indicadores visuais de PIN (d0 a d3)', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'tecnico/index.html'), 'utf-8');
  for (const id of ['d0', 'd1', 'd2', 'd3']) {
    assert.ok(html.includes(`id="${id}"`) || html.includes(`id='${id}'`), `Indicador ${id} ausente`);
  }
});

test('CT-05 [Caixa Preta] Tela tecnico/index.html possui teclado numerico (0-9) e preenchimento de 4 digitos', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'tecnico/index.html'), 'utf-8');
  for (let d = 0; d <= 9; d++) {
    assert.ok(
      html.includes(`pinKey('${d}')`) || html.includes(`pinKey("${d}")`) || html.includes(`pinKey(${d})`),
      `Tecla ${d} ausente`
    );
  }
  assert.ok(html.includes('length === 4') || html.includes('length == 4'), 'Limite de 4 digitos nao encontrado');
});

test('CT-06 [Caixa Preta] Tela tecnico/index.html possui botao apagar e funcao de limpeza do PIN', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'tecnico/index.html'), 'utf-8');
  assert.ok(html.includes('pinDel'), 'Funcao pinDel nao encontrada no HTML');
});

// ============================================================================
// TAREFA 2 — Configuracao API e Blindagem window.ILUMINA
// ============================================================================

test('CT-07 [Caixa Branca] Arquivo public/shared/config.js existe e define namespace ILUMINA', () => {
  const arq = encontrarArquivo(['shared/config.js', 'config.js']);
  assert.ok(arq, 'Arquivo config.js nao encontrado');
  const conteudo = fs.readFileSync(arq, 'utf-8');
  assert.ok(conteudo.includes('ILUMINA'), 'Namespace ILUMINA nao definido em config.js');
});

test('CT-08 [Caixa Branca] config.js define propriedade API_URL', () => {
  const arq = encontrarArquivo(['shared/config.js', 'config.js']);
  const conteudo = fs.readFileSync(arq, 'utf-8');
  assert.ok(conteudo.includes('API_URL'), 'Propriedade API_URL ausente em config.js');
});

test('CT-09 [Caixa Branca] config.js define string valida para API_URL', () => {
  const arq = encontrarArquivo(['shared/config.js', 'config.js']);
  const conteudo = fs.readFileSync(arq, 'utf-8');
  assert.match(conteudo, /API_URL\s*[:=]\s*['"`]/, 'Formato de API_URL invalido em config.js');
});

test('CT-10 [Caixa Branca] Codigo protege acesso contra window.ILUMINA indefinido (optional chaining)', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'tecnico/index.html'), 'utf-8');
  assert.ok(html.includes('window.ILUMINA?.') || html.includes('ILUMINA?.'), 'Protecao ILUMINA?. ausente no index.html');

  const apiClient = encontrarArquivo([
    'shared/infrastructure/ApiClient.js',
    'shared/api/ApiClient.js',
    'shared/ApiClient.js',
  ]);
  if (apiClient) {
    const conteudoApi = fs.readFileSync(apiClient, 'utf-8');
    assert.ok(conteudoApi.includes('window.ILUMINA'), 'window.ILUMINA ausente no ApiClient.js');
  }
});

test('CT-11 [Caixa Preta] Fluxo de login dispara POST /api/auth/login quando USA_API_NODE esta ativo', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'tecnico/index.html'), 'utf-8');
  assert.ok(html.includes('USA_API_NODE'), 'Flag USA_API_NODE nao encontrada');
  assert.ok(html.includes('/api/auth/login') || html.includes('autenticar'), 'Chamada de autenticacao API nao encontrada');
});

test('CT-12 [Caixa Preta] Fluxo de login preserva fallback apiFetchTO quando USA_API_NODE esta falso', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'tecnico/index.html'), 'utf-8');
  assert.ok(html.includes('apiFetchTO'), 'Fallback apiFetchTO nao encontrado');
});

// ============================================================================
// TAREFA 3 — Validacao de PIN com Exatamente 4 Digitos no Backend
// ============================================================================

test('CT-13 [Caixa Preta] AuthService aceita formato de PIN valido com 4 digitos ("1234")', async () => {
  const authService = carregarAuthService();
  try {
    await chamarLogin(authService, '1234', '127.0.0.99');
  } catch (err) {
    assert.notEqual(err.name, 'DadoInvalido', 'PIN "1234" nao deveria falhar na validacao de formato');
  }
});

test('CT-14 [Caixa Preta] AuthService aceita PIN com zero a esquerda ("0123") preservando string', async () => {
  const authService = carregarAuthService();
  const resultado = await chamarLogin(authService, '0123', '127.0.0.99');
  assert.ok(resultado && resultado.token, 'PIN "0123" deveria autenticar com sucesso');
  tokensCriadosNoTeste.push(resultado.token);
});

test('CT-15 [Caixa Preta] AuthService rejeita PIN com 3 digitos ("123") com DadoInvalido', async () => {
  const authService = carregarAuthService();
  await assert.rejects(
    () => chamarLogin(authService, '123', '127.0.0.99'),
    (err) => err.name === 'DadoInvalido' || /4 d[ií]gitos/i.test(err.message)
  );
});

test('CT-16 [Caixa Preta] AuthService rejeita PIN com 5 digitos ("12345") com DadoInvalido', async () => {
  const authService = carregarAuthService();
  await assert.rejects(
    () => chamarLogin(authService, '12345', '127.0.0.99'),
    (err) => err.name === 'DadoInvalido' || /4 d[ií]gitos/i.test(err.message)
  );
});

test('CT-17 [Caixa Preta] AuthService rejeita PIN contendo letra ("12a4") com DadoInvalido', async () => {
  const authService = carregarAuthService();
  await assert.rejects(
    () => chamarLogin(authService, '12a4', '127.0.0.99'),
    (err) => err.name === 'DadoInvalido' || /4 d[ií]gitos/i.test(err.message)
  );
});

// ============================================================================
// TAREFA 4 — Banco MySQL, Tabelas e Tecnico Ativo com Hash
// ============================================================================

test('CT-18 [Caixa Branca] Conexao ativa com MySQL executando SELECT 1', async () => {
  const [rows] = await pool.query('SELECT 1 AS conectado');
  assert.equal(rows[0].conectado, 1);
});

test('CT-19 [Caixa Branca] Tabelas usuarios, sessoes e tentativas_login existem no MySQL', async () => {
  const [rows] = await pool.query('SHOW TABLES');
  const tabelas = rows.map((r) => Object.values(r)[0]);
  assert.ok(tabelas.includes('usuarios'), 'Tabela usuarios ausente');
  assert.ok(tabelas.includes('sessoes'), 'Tabela sessoes ausente');
  assert.ok(tabelas.includes('tentativas_login'), 'Tabela tentativas_login ausente');
});

test('CT-20 [Caixa Branca] Existe tecnico ativo na tabela usuarios com pin_hash no formato scrypt$', async () => {
  const [rows] = await pool.query(
    "SELECT id, nome, perfil, pin_hash, ativo FROM usuarios WHERE perfil = 'tecnico' AND ativo = 1 LIMIT 1"
  );
  assert.ok(rows.length > 0, 'Nenhum tecnico ativo encontrado no MySQL');
  assert.ok(rows[0].pin_hash.startsWith('scrypt$'), 'pin_hash nao esta no formato scrypt$');
});

test('CT-21 [Caixa Preta] Login real no MySQL com PIN "0123" gera sessao valida na tabela sessoes', async () => {
  const authService = carregarAuthService();
  const res = await chamarLogin(authService, '0123', '127.0.0.99');
  assert.ok(res.token && res.token.length === 64, 'Token de sessao invalido');
  tokensCriadosNoTeste.push(res.token);

  const [sessoes] = await pool.query('SELECT token FROM sessoes WHERE token = ?', [res.token]);
  assert.equal(sessoes.length, 1, 'Sessao nao foi persistida na tabela sessoes');
});

test('CT-22 [Caixa Preta] Login real no MySQL rejeita "123" comprovando preservacao do zero a esquerda em "0123"', async () => {
  const authService = carregarAuthService();
  await assert.rejects(
    () => chamarLogin(authService, '123', '127.0.0.99'),
    'PIN "123" sem zero a esquerda deveria ser rejeitado'
  );
});