/**
 * Servidor de apoio dos testes de caixa-preta das funcionalidades offline.
 *
 * Serve a pasta public/ (mesma origem do service worker) e atende as telas de
 * um de dois jeitos, conforme o servidor que o projeto vier a usar:
 *
 *   servidor: 'api-node'
 *     A API Node REAL (server/src/app.js): rotas, middlewares, validação,
 *     serviços e regras de domínio são o código do projeto. Só o acesso ao
 *     MySQL é trocado por repositórios em memória (Fake), porque o esquema
 *     definitivo do banco ainda não existe. A senha (PIN) é conferida pelo
 *     hash real (scrypt).
 *
 *   servidor: 'apps-script'
 *     Um dublê do Google Apps Script com uma "planilha" em memória. O script
 *     real não está no repositório; o dublê segue o contrato que as telas
 *     esperam (campos `ok`/`success`, erros `sessao_expirada` e `ja_fechado`).
 *     `deduplicar` diz se a planilha descarta protocolo repetido, porque não
 *     se sabe o que o script real faz.
 *
 * O teste pode injetar falhas pelo endereço /__controle e conferir o que
 * chegou ao servidor por /__estado. Nenhum arquivo do projeto é alterado e
 * nenhum banco real é acessado. Todos os dados são fictícios.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const RAIZ_PUBLIC = path.resolve(__dirname, '../../../../public');
const SRC = path.resolve(__dirname, '../../../src');
const PIN_TESTE = '1234';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

/** Mesmas regras de scripts/build-config.mjs para cada servidor. */
const CONFIG = {
  'api-node': { API_URL: '/', ENDPOINT_CIDADAO: '/api/chamados', ENDPOINT_TECNICO: '/api' },
  'apps-script': { API_URL: '', ENDPOINT_CIDADAO: '/apps-script/cidadao', ENDPOINT_TECNICO: '/apps-script/tecnico' }
};

function configJs(cfg) {
  return `(function (global) {
  var origin = global.location ? global.location.origin : '';
  global.ILUMINA = {
    API_URL: ${JSON.stringify(cfg.API_URL)},
    ENDPOINT_CIDADAO: ${JSON.stringify(cfg.ENDPOINT_CIDADAO)},
    ENDPOINT_TECNICO: ${JSON.stringify(cfg.ENDPOINT_TECNICO)},
    APP_CIDADAO: origin + '/',
    APP_TECNICO: origin + '/tecnico/',
    HUB_URL: 'https://example.invalid',
    qrPoste: function (id) { return origin + '/?poste=' + encodeURIComponent(id); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

/* ───────────── Massa de dados (fictícia) ───────────── */

/** 20 chamados abertos em Coruripe/AL para o painel do técnico. */
function chamadosIniciais(servidor) {
  const base = Date.parse('2026-11-12T08:00:00-03:00');
  return Array.from({ length: 20 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const comum = {
      protocolo: `IC-261112-T${n}`,
      tipo: 'apagado',
      descricao: 'Chamado fictício de teste',
      endereco: `Rua de Teste, ${i + 1}`,
      semente: true
    };
    if (servidor === 'api-node') {
      return {
        ...comum,
        id: crypto.randomUUID(),
        status: 'aberto',
        latitude: -10.125 + i * 0.0004,
        longitude: -36.175 + i * 0.0004,
        precisao_m: 8,
        foto_url: null,
        poste_id: null,
        criado_em: new Date(base + i * 60000)
      };
    }
    return {
      ...comum,
      status: 'Aguardando atendimento',
      lat: -10.125 + i * 0.0004,
      lng: -36.175 + i * 0.0004,
      acc: 8,
      data: '12/11/2026 08:' + n
    };
  });
}

/* ───────────── API Node real com banco em memória ───────────── */

let estadoAtual = null; // o Fake lê sempre o estado do servidor em execução
let appNode = null;

function falhaSql() {
  throw new Error('SQL inesperado no teste: um repositório não foi substituído pelo Fake.');
}

async function prepararApiNode() {
  if (appNode) return appNode;

  // Troca a conexão MySQL pelo ponto oficial do projeto (pool.setPool). O código real de
  // transação (BEGIN/COMMIT/ROLLBACK) continua rodando; qualquer outro SQL falha avisando.
  const pool = require(`${SRC}/infrastructure/database/pool`);
  const conexao = {
    async query(sql) {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      return falhaSql();
    },
    release() {}
  };
  pool.setPool({ query: conexao.query, connect: async () => conexao, end: async () => {} });

  const { gerarHashPin } = require(`${SRC}/infrastructure/security/hashPin`);
  const hashTeste = await gerarHashPin(PIN_TESTE);

  const dup = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });

  const ChamadoRepo = require(`${SRC}/infrastructure/repositories/ChamadoRepository`);
  Object.assign(ChamadoRepo, {
    // Mesma regra do INSERT real: id é chave primária e protocolo é único.
    async criarOuRetornarExistente(_tx, d) {
      const porId = estadoAtual.chamados.find((c) => c.id === d.id);
      if (porId) return porId;
      if (estadoAtual.chamados.some((c) => c.protocolo === d.protocolo)) throw dup();
      const novo = {
        id: d.id, protocolo: d.protocolo, tipo: d.tipo, status: 'aberto',
        latitude: d.latitude ?? null, longitude: d.longitude ?? null, precisao_m: d.precisao_m ?? null,
        descricao: d.descricao || null, nome: d.nome || null, telefone: d.telefone || null,
        endereco: d.endereco || null, foto_url: d.fotoUrl || null, poste_id: d.posteId || null,
        user_agent: d.userAgent || null, criado_em: new Date(d.criadoEm || Date.now())
      };
      estadoAtual.chamados.push(novo);
      return novo;
    },
    async buscarParaAtualizar(_tx, protocolo) { return estadoAtual.chamados.find((c) => c.protocolo === protocolo) || null; },
    async buscarPorProtocolo(protocolo) { return estadoAtual.chamados.find((c) => c.protocolo === protocolo) || null; },
    async listar(escopo = 'abertos') {
      const lista = escopo === 'abertos'
        ? estadoAtual.chamados.filter((c) => ['aberto', 'em_atendimento'].includes(c.status))
        : [...estadoAtual.chamados];
      return lista.sort((a, b) => a.criado_em - b.criado_em);
    },
    async obterEstatisticas() {
      const total = estadoAtual.chamados.length;
      const abertos = estadoAtual.chamados.filter((c) => ['aberto', 'em_atendimento'].includes(c.status)).length;
      return { total, abertos, atendidos: estadoAtual.chamados.filter((c) => c.status === 'fechado').length };
    },
    async mudarStatus(_tx, id, status, posteId = null) {
      const c = estadoAtual.chamados.find((x) => x.id === id);
      if (c) { c.status = status; if (posteId && !c.poste_id) c.poste_id = posteId; }
    }
  });

  const FechamentoRepo = require(`${SRC}/infrastructure/repositories/FechamentoRepository`);
  Object.assign(FechamentoRepo, {
    async buscarPorOperacaoId(_tx, op) { return estadoAtual.fechamentos.find((f) => f.operacao_id === op) || null; },
    async inserir(_tx, d) {
      if (estadoAtual.fechamentos.some((f) => f.operacao_id === d.operacaoId)) throw dup();
      const novo = {
        id: estadoAtual.fechamentos.length + 1, operacao_id: d.operacaoId, chamado_id: d.chamadoId,
        tecnico_id: d.tecnicoId || null, status: d.status, servico: d.servico || null,
        referencia: d.referencia || null, latitude: d.latitude ?? null, longitude: d.longitude ?? null,
        foto_url: d.fotoUrl || null, administrativo: Boolean(d.administrativo),
        informante: d.informante || null, justificativa: d.justificativa || null,
        data_fechamento: new Date(d.dataFechamento || Date.now())
      };
      const chamado = estadoAtual.chamados.find((c) => c.id === d.chamadoId);
      estadoAtual.fechamentos.push({ ...novo, protocolo: chamado && chamado.protocolo });
      return novo;
    }
  });

  const EstoqueRepo = require(`${SRC}/infrastructure/repositories/EstoqueRepository`);
  EstoqueRepo.baixarMateriais = async (_tx, fechamentoId, materiais = []) => {
    estadoAtual.baixasEstoque.push({ fechamentoId, materiais });
  };

  const PosteRepo = require(`${SRC}/infrastructure/repositories/PosteRepository`);
  Object.assign(PosteRepo, {
    async buscarPorId() { return null; },
    async buscarChamadoAbertoNoPoste() { return null; },
    async garantirExistencia(_tx, id) { return { id, latitude: null, longitude: null, endereco: null }; },
    async atualizarConfiguracao(_tx, id, config) { estadoAtual.postesAtualizados.push({ id, config }); }
  });

  const UsuarioRepo = require(`${SRC}/infrastructure/repositories/UsuarioRepository`);
  UsuarioRepo.listarAtivosPorPerfis = async (perfis = ['tecnico', 'gestor']) =>
    [{ id: 1, nome: 'Técnico Teste', perfil: 'tecnico', pin_hash: hashTeste }].filter((u) => perfis.includes(u.perfil));
  UsuarioRepo.buscarPorId = async (id) => (id === 1 ? { id: 1, nome: 'Técnico Teste', perfil: 'tecnico' } : null);

  const SessaoRepo = require(`${SRC}/infrastructure/repositories/SessaoRepository`);
  Object.assign(SessaoRepo, {
    async criarSessao({ token, usuarioId, expiraEm }) { estadoAtual.sessoes.push({ token, usuarioId, expiraEm: Date.parse(expiraEm) }); },
    async buscarSessaoValida(token) {
      const s = estadoAtual.sessoes.find((x) => x.token === token && x.expiraEm > Date.now());
      return s ? { usuario_id: s.usuarioId, nome: 'Técnico Teste', perfil: 'tecnico', expira_em: new Date(s.expiraEm) } : null;
    },
    async contarFalhasRecentesPorIp(ip, janela = 15) {
      const desde = Date.now() - janela * 60000;
      return estadoAtual.tentativasLogin.filter((t) => t.ip === ip && !t.sucesso && t.em >= desde).length;
    },
    async registrarTentativaLogin({ ip, perfil, sucesso }) { estadoAtual.tentativasLogin.push({ ip, perfil, sucesso, em: Date.now() }); }
  });

  const FotoStorage = require(`${SRC}/infrastructure/storage/FotoStorage`);
  FotoStorage.salvar = async (foto) => {
    if (!foto) return null;
    estadoAtual.fotosSalvas += 1;
    return `/fotos/teste-${estadoAtual.fotosSalvas}.jpg`;
  };

  appNode = require(`${SRC}/app`).criarApp();
  return appNode;
}

/* ───────────── Utilidades HTTP ───────────── */

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function lerCorpo(req) {
  return new Promise((resolve) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes)));
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/** Lê o protocolo de um corpo em JSON ou em formulário (payload=...). */
function lerProtocolo(texto) {
  try { return JSON.parse(texto).protocolo || null; } catch { /* não é JSON */ }
  try { return JSON.parse(new URLSearchParams(texto).get('payload') || '{}').protocolo || null; } catch { return null; }
}

/** Copia a requisição para um fluxo novo, para a API ler o corpo pelo caminho normal. */
function reenviavel(req, corpo) {
  const r = Readable.from(corpo.length ? [corpo] : []);
  return Object.assign(r, { method: req.method, url: req.url, headers: req.headers, socket: req.socket, connection: req.socket });
}

/** Resposta que a API escreve sem que nada chegue ao navegador (simula a resposta perdida). */
function respostaDescartada(aoTerminar) {
  return { statusCode: 200, setHeader() {}, getHeader() {}, writeHead() {}, end() { aoTerminar(); } };
}

/**
 * Corta a resposta no meio, depois que o servidor já gravou: o aparelho recebe
 * o início e a conexão cai. Como já chegaram bytes, o navegador não repete o
 * pedido sozinho; quem decide reenviar é o app.
 */
function cortarResposta(res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': '200' });
  res.write('{"');
  setImmediate(() => res.socket && res.socket.destroy());
}

/* ───────────── Rotas da API Node ───────────── */

const ERRO_NODE = {
  erro500: [500, { success: false, ok: false, error: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno no servidor.' } }],
  rejeita: [400, { success: false, ok: false, error: { codigo: 'DADO_INVALIDO', mensagem: 'Reporte recusado pelo servidor (teste).' } }]
};

async function tratarApiNode(req, res, url, estado) {
  const corpo = await lerCorpo(req);
  const texto = corpo.toString('utf8');
  const tipo = req.headers['content-type'] || '';
  estado.requisicoes.push({ metodo: req.method, caminho: url.pathname, tipo });

  const ehCidadao = req.method === 'POST' && url.pathname === '/api/chamados';
  const rotaFechamento = /^\/api\/chamados\/([^/]+)\/fechamento$/.exec(url.pathname);
  const ehFechamento = req.method === 'POST' && (Boolean(rotaFechamento) || url.pathname === '/api');
  const protocolo = rotaFechamento ? decodeURIComponent(rotaFechamento[1]) : lerProtocolo(texto);

  if (ehCidadao) estado.recebidos.cidadao.push({ protocolo, tipo });
  if (ehFechamento) estado.recebidos.tecnico.push({ protocolo, tipo, caminho: url.pathname });

  const modo = ehCidadao ? estado.controle.cidadao
    : ehFechamento ? (estado.controle.tecnico === 'erro-no-protocolo'
      ? (protocolo === estado.controle.protocoloComErro ? 'erro500' : 'ok')
      : estado.controle.tecnico)
      : 'ok';

  if (modo === 'perde-conexao') return req.socket.destroy();
  if (modo === 'sem-resposta') return; // nunca responde
  if (ERRO_NODE[modo]) return json(res, ...ERRO_NODE[modo]);

  if (ehCidadao && estado.controle.atrasoMs) await espera(estado.controle.atrasoMs);
  const app = await prepararApiNode();
  if (modo === 'perde-resposta') {
    // A API processa e grava normalmente; só a resposta não chega ao aparelho.
    return app.handle(reenviavel(req, corpo), respostaDescartada(() => cortarResposta(res)));
  }
  return app.handle(reenviavel(req, corpo), res);
}

/* ───────────── Dublê do Apps Script ───────────── */

function sessaoValida(estado, token) {
  return estado.sessoes.some((s) => s.token === token && s.expiraEm > Date.now());
}

function registroApps(c) {
  const { semente, ...resto } = c;
  return resto;
}

async function tratarAppsScript(req, res, url, estado) {
  const texto = (await lerCorpo(req)).toString('utf8');
  estado.requisicoes.push({ metodo: req.method, caminho: url.pathname, tipo: req.headers['content-type'] || '' });

  if (url.pathname === '/apps-script/cidadao') {
    const payload = JSON.parse(new URLSearchParams(texto).get('payload') || '{}');
    estado.recebidos.cidadao.push({ protocolo: payload.protocolo, tipo: req.headers['content-type'] || '' });
    const modo = estado.controle.cidadao;
    if (modo === 'perde-conexao') return req.socket.destroy();
    if (modo === 'sem-resposta') return;
    if (modo === 'erro500') { res.writeHead(500); return res.end('Erro interno'); }
    if (modo === 'rejeita') return json(res, 200, { ok: false, error: 'dados inválidos' });
    if (estado.controle.atrasoMs) await espera(estado.controle.atrasoMs);

    const repetido = estado.chamados.some((c) => c.protocolo === payload.protocolo);
    if (!(repetido && estado.deduplicar)) {
      estado.chamados.push({
        protocolo: payload.protocolo, status: 'Aguardando atendimento', tipo: payload.tipo,
        lat: payload.lat, lng: payload.lng, acc: payload.acc, descricao: payload.descricao,
        endereco: payload.endereco || '', data: '12/11/2026 10:00'
      });
    }
    if (modo === 'perde-resposta') return cortarResposta(res);
    return json(res, 200, { ok: true, protocolo: payload.protocolo });
  }

  if (url.pathname === '/apps-script/tecnico') {
    let payload;
    try { payload = JSON.parse(texto); } catch { payload = JSON.parse(new URLSearchParams(texto).get('payload') || '{}'); }

    if (payload.action === 'login') {
      if (payload.pin !== PIN_TESTE) return json(res, 200, { success: false, error: 'pin_invalido' });
      const token = 'tok-' + crypto.randomUUID();
      const expiry = Date.now() + 8 * 3600e3;
      estado.sessoes.push({ token, expiraEm: expiry });
      return json(res, 200, { success: true, token, expiry, nome: 'Técnico Teste' });
    }
    if (payload.action === 'list') {
      if (!sessaoValida(estado, payload.token)) return json(res, 200, { success: false, error: 'sessao_expirada' });
      const abertos = estado.chamados.filter((c) => c.status === 'Aguardando atendimento');
      return json(res, 200, {
        success: true, records: abertos.map(registroApps),
        total: estado.chamados.length, abertos: abertos.length, atendidos: estado.chamados.length - abertos.length
      });
    }
    if (payload.action === 'close') {
      estado.recebidos.tecnico.push({ protocolo: payload.protocolo, tipo: req.headers['content-type'] || '', caminho: url.pathname });
      const modo = estado.controle.tecnico === 'erro-no-protocolo'
        ? (payload.protocolo === estado.controle.protocoloComErro ? 'erro' : 'ok')
        : estado.controle.tecnico;
      if (modo === 'perde-conexao') return req.socket.destroy();
      if (modo === 'erro') return json(res, 200, { success: false, error: 'erro_interno' });
      if (!sessaoValida(estado, payload.token)) return json(res, 200, { success: false, error: 'sessao_expirada' });

      const chamado = estado.chamados.find((c) => c.protocolo === payload.protocolo);
      if (!chamado) return json(res, 200, { success: false, error: 'nao_encontrado' });
      if (chamado.status !== 'Aguardando atendimento') {
        return json(res, 200, { success: false, error: 'ja_fechado', status_atual: chamado.status });
      }
      chamado.status = payload.status || 'Concluído';
      estado.fechamentos.push({ protocolo: payload.protocolo, status: chamado.status, tecnico: payload.tecnico });
      if (modo === 'perde-resposta') return cortarResposta(res);
      return json(res, 200, { success: true, protocolo: payload.protocolo });
    }
    // check_poste, link_poste e demais ações não fazem parte do escopo offline.
    if (payload.action === 'check_poste') return json(res, 200, { success: true, existe: false });
    return json(res, 200, { success: true });
  }

  res.writeHead(404); return res.end();
}

/* ───────────── Servidor ───────────── */

async function criarServidorTeste({ servidor = 'api-node', deduplicar = false } = {}) {
  if (!CONFIG[servidor]) throw new Error('Servidor desconhecido: ' + servidor);
  const estado = {
    servidor,
    deduplicar,
    chamados: chamadosIniciais(servidor),
    fechamentos: [],
    sessoes: [],
    tentativasLogin: [],
    baixasEstoque: [],
    postesAtualizados: [],
    fotosSalvas: 0,
    recebidos: { cidadao: [], tecnico: [] },
    requisicoes: [],
    controle: { cidadao: 'ok', tecnico: 'ok', protocoloComErro: null, atrasoMs: 0 }
  };
  if (servidor === 'api-node') { await prepararApiNode(); estadoAtual = estado; }

  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/__estado') return json(res, 200, estado);
      if (url.pathname === '/__controle') {
        const pedido = JSON.parse((await lerCorpo(req)).toString('utf8') || '{}');
        if (pedido.expirarSessoes) { estado.sessoes.forEach((s) => { s.expiraEm = 0; }); delete pedido.expirarSessoes; }
        Object.assign(estado.controle, pedido);
        return json(res, 200, estado.controle);
      }
      if (url.pathname === '/shared/config.js' || url.pathname === '/shared/infrastructure/config.js') {
        res.writeHead(200, { 'Content-Type': TIPOS['.js'], 'Cache-Control': 'no-store' });
        return res.end(configJs(CONFIG[servidor]));
      }
      if (servidor === 'api-node' && url.pathname.startsWith('/api')) return await tratarApiNode(req, res, url, estado);
      if (servidor === 'apps-script' && url.pathname.startsWith('/apps-script/')) return await tratarAppsScript(req, res, url, estado);

      let arquivo = path.join(RAIZ_PUBLIC, decodeURIComponent(url.pathname));
      if (!arquivo.startsWith(RAIZ_PUBLIC)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(arquivo) && fs.statSync(arquivo).isDirectory()) arquivo = path.join(arquivo, 'index.html');
      if (!fs.existsSync(arquivo)) { res.writeHead(404); return res.end('não encontrado'); }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
      fs.createReadStream(arquivo).pipe(res);
    } catch (erro) {
      estado.requisicoes.push({ erroDoServidorDeTeste: erro.message, caminho: url.pathname });
      if (!res.headersSent) json(res, 500, { success: false, ok: false, error: 'falha no servidor de teste: ' + erro.message });
    }
  });

  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({
        url: `http://localhost:${port}`,
        servidor,
        estado,
        fechar: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(() => r()); })
      });
    });
  });
}

module.exports = { criarServidorTeste, CONFIG, PIN_TESTE };
