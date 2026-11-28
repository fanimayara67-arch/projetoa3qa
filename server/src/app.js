/**
 * ILUMINA CORURIPE — Servidor de Aplicação Node.js (Monólito Modular em Camadas)
 * Registra as rotas REST da camada de Apresentação e o middleware global de erros.
 */

require('./infrastructure/config/env');

const http = require('node:http');
const { URL } = require('node:url');
const registrarRotasChamados = require('./presentation/routes/chamados.routes');
const registrarRotasPostes = require('./presentation/routes/postes.routes');
const registrarRotasAuth = require('./presentation/routes/auth.routes');
const registrarRotasEstoque = require('./presentation/routes/estoque.routes');
const registrarRotasFotos = require('./presentation/routes/fotos.routes');
const tratarErros = require('./presentation/middlewares/tratarErros');

/**
 * Compila um padrão de rota (ex.: '/api/chamados/:protocolo/fechamento') em RegExp
 * e extrai os parâmetros nomeados (`req.params`).
 */
function compilarRota(padrao) {
  const nomesParams = [];
  const regexStr = padrao.replace(/:([A-Za-z0-9_]+)/g, (_, nome) => {
    nomesParams.push(nome);
    return '([^/]+)';
  });
  return {
    regex: new RegExp(`^${regexStr}$`),
    nomesParams
  };
}

function criarApp() {
  const rotas = [];

  const router = {
    adicionar(method, pathPattern, ...handlers) {
      const { regex, nomesParams } = compilarRota(pathPattern);
      rotas.push({ method: method.toUpperCase(), pathPattern, regex, nomesParams, handlers });
    },
    get(p, ...h) { this.adicionar('GET', p, ...h); },
    post(p, ...h) { this.adicionar('POST', p, ...h); },
    put(p, ...h) { this.adicionar('PUT', p, ...h); },
    delete(p, ...h) { this.adicionar('DELETE', p, ...h); }
  };

  registrarRotasChamados(router);
  registrarRotasPostes(router);
  registrarRotasAuth(router);
  registrarRotasEstoque(router);
  registrarRotasFotos(router);

  /**
   * Despacha uma requisição (seja de `http.Server` real ou simulada em testes)
   * pela cadeia de middlewares e controller correspondente.
   */
  async function handle(req, res) {
    // Helpers estilo Express para `res.status().json()`
    if (typeof res.status !== 'function') {
      res.statusCode = 200;
      res.status = function (code) {
        this.statusCode = code;
        return this;
      };
    }
    if (typeof res.json !== 'function') {
      res.json = function (payload) {
        const body = JSON.stringify(payload);
        if (typeof this.setHeader === 'function') {
          this.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        this.body = payload;
        if (typeof this.end === 'function') {
          this.end(body);
        }
        return this;
      };
    }

    // CORS controlado para mesma origem ou origem configurada
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    if (typeof res.setHeader === 'function') {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204);
      if (typeof res.end === 'function') res.end();
      return res;
    }

    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = parsedUrl.pathname;
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    req.headers = req.headers || {};

    // Faz parse do body JSON caso venha de stream HTTP real
    if (req.body === undefined && (req.method === 'POST' || req.method === 'PUT')) {
      try {
        req.body = await lerBodyJson(req);
      } catch (err) {
        return tratarErros(err, req, res);
      }
    }

    // Procura rota correspondente
    const rota = rotas.find(r => r.method === req.method && r.regex.test(pathname));
    if (!rota) {
      return res.status(404).json({
        success: false,
        error: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: `Rota ${req.method} ${pathname} não existe.` }
      });
    }

    const match = rota.regex.exec(pathname);
    req.params = {};
    try {
      rota.nomesParams.forEach((nome, idx) => {
        req.params[nome] = decodeURIComponent(match[idx + 1]);
      });
    } catch (_) {
      const err = new Error('Parâmetro de rota com codificação inválida.');
      err.status = 400;
      err.codigo = 'PARAMETRO_INVALIDO';
      return tratarErros(err, req, res);
    }

    // Executa cadeia de middlewares -> controller
    let idx = 0;
    const next = async (err) => {
      if (err) {
        return tratarErros(err, req, res, next);
      }
      const fn = rota.handlers[idx++];
      if (!fn) return;
      try {
        await fn(req, res, next);
      } catch (ex) {
        return tratarErros(ex, req, res, next);
      }
    };

    await next();
    return res;
  }

  function listen(port = process.env.PORT || 3001, callback) {
    const server = http.createServer(handle);
    return server.listen(port, callback);
  }

  return { handle, listen, rotas };
}

function lerBodyJson(req, limiteBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > limiteBytes) {
        const err = new Error('Corpo da requisição excede o limite máximo (8 MB).');
        err.status = 413;
        err.codigo = 'PAYLOAD_MUITO_GRANDE';
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        const err = new Error('JSON inválido no corpo da requisição.');
        err.status = 400;
        err.codigo = 'JSON_INVALIDO';
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const app = criarApp();

if (require.main === module) {
  const porta = Number(process.env.PORT || 3001);
  app.listen(porta, () => {
    console.log(`Servidor Ilumina Coruripe rodando em http://localhost:${porta}`);
  });
}

module.exports = { criarApp, app };
