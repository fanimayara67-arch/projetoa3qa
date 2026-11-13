/**
 * Servidor de apoio para os testes offline (caixa-preta no navegador).
 *
 * - Serve a pasta public/ como site estático (mesma origem do service worker).
 * - Substitui /shared/config.js pela configuração do modo testado.
 * - Modo "node": encaminha /api/* para a API Node real (server/src/app.js),
 *   trocando apenas o banco MySQL por repositórios em memória.
 * - Modo "legado": simula os endpoints do Google Apps Script em /legado/*.
 * - /__controle e /__estado permitem que o teste mude a resposta do servidor
 *   (ok, erro 500, rejeição) e confira o que chegou.
 *
 * Nenhum arquivo do projeto é alterado e nenhum banco real é acessado.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ_PUBLIC = path.resolve(__dirname, '../../../../public');

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

function configJs({ apiUrl, endpointCidadao, endpointTecnico }) {
  return `(function (global) {
  var origin = global.location ? global.location.origin : '';
  global.ILUMINA = {
    API_URL: ${JSON.stringify(apiUrl)},
    ENDPOINT_CIDADAO: ${JSON.stringify(endpointCidadao)},
    ENDPOINT_TECNICO: ${JSON.stringify(endpointTecnico)},
    APP_CIDADAO: origin + '/',
    APP_TECNICO: origin + '/tecnico/',
    HUB_URL: 'https://example.invalid',
    qrPoste: function (id) { return origin + '/?poste=' + encodeURIComponent(id); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

/** Troca o acesso ao MySQL por memória, antes de carregar a API. */
function prepararApiEmMemoria(estado) {
  const transacao = require('../../../src/infrastructure/database/transacao');
  transacao.emTransacao = async (operacao) => operacao({ query: async () => ({ rows: [] }) });

  const ChamadoRepo = require('../../../src/infrastructure/repositories/ChamadoRepository');
  ChamadoRepo.criarOuRetornarExistente = async (_tx, dados) => {
    const existente = estado.chamados.find((c) => c.id === dados.id);
    if (existente) return existente;
    if (estado.chamados.some((c) => c.protocolo === dados.protocolo)) {
      const erro = new Error('Duplicate entry');
      erro.code = 'ER_DUP_ENTRY';
      throw erro;
    }
    const novo = {
      id: dados.id, protocolo: dados.protocolo, tipo: dados.tipo, status: 'aberto',
      latitude: dados.latitude, longitude: dados.longitude, precisao_m: dados.precisao_m,
      descricao: dados.descricao, foto_url: dados.fotoUrl, criado_em: new Date()
    };
    estado.chamados.push(novo);
    return novo;
  };
  ChamadoRepo.listar = async () => estado.chamados;
  ChamadoRepo.obterEstatisticas = async () => ({ total: estado.chamados.length, abertos: estado.chamados.length, atendidos: 0 });

  const PosteRepo = require('../../../src/infrastructure/repositories/PosteRepository');
  PosteRepo.garantirExistencia = async () => null;

  const FotoStorage = require('../../../src/infrastructure/storage/FotoStorage');
  FotoStorage.salvar = async () => {
    estado.fotosSalvas += 1;
    return `/fotos/teste-${estado.fotosSalvas}.jpg`;
  };

  const AuthService = require('../../../src/application/services/AuthService');
  AuthService.validarTokenSessao = async (token) => {
    if (token === 'tok-teste') return { id: 1, nome: 'Técnico Teste', perfil: 'tecnico' };
    const { NaoAutenticado } = require('../../../src/application/errors');
    throw new NaoAutenticado('Sessão inválida.');
  };

  return require('../../../src/app').criarApp();
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/** Chamados de exemplo para o painel do técnico (dados fictícios, Coruripe/AL). */
function chamadosLegado() {
  return [1, 2, 3].map((n) => ({
    protocolo: `IC-261112-TST0${n}`,
    status: 'Aguardando atendimento',
    tipo: 'apagado',
    lat: -10.125 + n * 0.001,
    lng: -36.175 + n * 0.001,
    acc: 8,
    data: '12/11/2026 10:00',
    descricao: 'Chamado fictício de teste',
    endereco: 'Rua de Teste, ' + n
  }));
}

async function tratarLegado(req, res, url, estado) {
  const corpo = await lerCorpo(req);
  if (url.pathname === '/legado/cidadao') {
    const payload = JSON.parse(new URLSearchParams(corpo).get('payload') || '{}');
    estado.recebidosCidadao.push(payload);
    const modo = estado.controle.cidadao;
    if (modo === 'erro500') { res.writeHead(500); return res.end('erro'); }
    if (modo === 'rejeita') return json(res, 200, { ok: false, error: 'dados inválidos' });
    if (modo === 'perde-resposta') { req.socket.destroy(); return; }
    return json(res, 200, { ok: true, protocolo: payload.protocolo });
  }
  if (url.pathname === '/legado/tecnico') {
    const payload = JSON.parse(corpo || '{}');
    if (payload.action === 'login') {
      return json(res, 200, payload.pin === '1234'
        ? { success: true, token: 'tok-legado', expiry: Date.now() + 8 * 3600e3 }
        : { success: false, error: 'pin_invalido' });
    }
    if (payload.action === 'list') {
      const records = chamadosLegado();
      return json(res, 200, { success: true, records, total: records.length, abertos: records.length, atendidos: 0 });
    }
    if (payload.action === 'close') {
      estado.recebidosTecnico.push(payload);
      const modo = estado.controle.tecnico;
      const falhaPrimeiro = modo === 'erro-no-primeiro' && payload.protocolo === estado.controle.protocoloComErro;
      if (modo === 'erro' || falhaPrimeiro) return json(res, 200, { success: false, error: 'erro_interno' });
      return json(res, 200, { success: true, protocolo: payload.protocolo });
    }
    return json(res, 200, { success: true });
  }
  res.writeHead(404); res.end();
}

function criarServidorTeste({ modo = 'node' } = {}) {
  const estado = {
    modo,
    chamados: [],
    fotosSalvas: 0,
    recebidosCidadao: [],
    recebidosTecnico: [],
    requisicoesApi: [],
    controle: { cidadao: 'ok', tecnico: 'ok', protocoloComErro: null }
  };
  const app = modo === 'node' ? prepararApiEmMemoria(estado) : null;
  const cfg = modo === 'node'
    ? { apiUrl: '/', endpointCidadao: '/api/chamados', endpointTecnico: '/api' }
    : { apiUrl: '', endpointCidadao: '/legado/cidadao', endpointTecnico: '/legado/tecnico' };

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/__estado') return json(res, 200, estado);
    if (url.pathname === '/__controle') {
      Object.assign(estado.controle, JSON.parse((await lerCorpo(req)) || '{}'));
      return json(res, 200, estado.controle);
    }
    if (url.pathname === '/shared/config.js' || url.pathname === '/shared/infrastructure/config.js') {
      res.writeHead(200, { 'Content-Type': TIPOS['.js'], 'Cache-Control': 'no-store' });
      return res.end(configJs(cfg));
    }
    if (url.pathname.startsWith('/legado/')) return tratarLegado(req, res, url, estado);
    if (url.pathname.startsWith('/api')) {
      estado.requisicoesApi.push({ metodo: req.method, caminho: url.pathname, tipo: req.headers['content-type'] || '' });
      if (!app) { res.writeHead(404); return res.end(); }
      if (estado.controle.api === 'erro500') return json(res, 500, { success: false, error: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno.' } });
      return app.handle(req, res);
    }

    let arquivo = path.join(RAIZ_PUBLIC, decodeURIComponent(url.pathname));
    if (!arquivo.startsWith(RAIZ_PUBLIC)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).isDirectory()) arquivo = path.join(arquivo, 'index.html');
    if (!fs.existsSync(arquivo)) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    fs.createReadStream(arquivo).pipe(res);
  });

  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      resolve({
        url: `http://localhost:${port}`,
        estado,
        fechar: () => new Promise((r) => { servidor.closeAllConnections?.(); servidor.close(() => r()); })
      });
    });
  });
}

module.exports = { criarServidorTeste };
