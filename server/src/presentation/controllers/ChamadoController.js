/**
 * CAMADA DE APRESENTAÇÃO — ChamadoController
 * Recebe requisições HTTP, delega para ChamadoService e formata a saída com chamado.view.js.
 */

const ChamadoService = require('../../application/services/ChamadoService');
const formatarChamado = require('../views/chamado.view');
const formatarTentativa = require('../views/tentativa.view');
const { ok } = require('../views/resposta');

async function criar(req, res, next) {
  try {
    const chamado = await ChamadoService.criarChamado(req.body);
    return ok(res, formatarChamado(chamado), 201);
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const escopo = (req.query && req.query.escopo) || 'abertos';
    const resultado = await ChamadoService.listarChamados({ escopo });
    return ok(res, {
      records: resultado.records.map(formatarChamado),
      total: resultado.total,
      abertos: resultado.abertos,
      atendidos: resultado.atendidos
    });
  } catch (err) {
    next(err);
  }
}

async function buscar(req, res, next) {
  try {
    const chamado = await ChamadoService.buscarPorProtocolo(req.params.protocolo);
    return ok(res, formatarChamado(chamado));
  } catch (err) {
    next(err);
  }
}

async function registrarTentativa(req, res, next) {
  try {
    const tentativa = await ChamadoService.registrarTentativa({
      protocolo: req.params.protocolo,
      tecnicoId: req.usuario.id,
      dados: req.body
    });
    return ok(res, tentativa, 201);
  } catch (err) {
    next(err);
  }
}

async function listarTentativas(req, res, next) {
  try {
    const tentativas = await ChamadoService.listarTentativas();
    return ok(res, { tentativas: tentativas.map(formatarTentativa) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  criar,
  listar,
  buscar,
  registrarTentativa,
  listarTentativas
};
