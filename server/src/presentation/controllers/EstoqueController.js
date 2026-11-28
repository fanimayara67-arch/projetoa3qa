/**
 * CAMADA DE APRESENTAÇÃO — EstoqueController
 */

const EstoqueService = require('../../application/services/EstoqueService');
const { ok } = require('../views/resposta');

async function listar(req, res, next) {
  try {
    const itens = await EstoqueService.listarEstoque();
    return ok(res, itens);
  } catch (err) {
    next(err);
  }
}

async function salvar(req, res, next) {
  try {
    const nome = (req.params && req.params.item) || (req.body && req.body.nome) || (req.body && req.body.item);
    const item = await EstoqueService.salvarItemEstoque({
      ...req.body,
      nome
    });
    return ok(res, item);
  } catch (err) {
    next(err);
  }
}

async function remover(req, res, next) {
  try {
    const item = await EstoqueService.excluirItemEstoque(req.params.item);
    return ok(res, item);
  } catch (err) {
    next(err);
  }
}

async function criarMissao(req, res, next) {
  try {
    const missao = await EstoqueService.registrarSaidaMissao(req.body, req.usuario.id);
    return ok(res, missao, 201);
  } catch (err) {
    next(err);
  }
}

async function listarMissoes(req, res, next) {
  try {
    const missoes = await EstoqueService.listarMissoes();
    return ok(res, missoes);
  } catch (err) {
    next(err);
  }
}

async function registrarRetorno(req, res, next) {
  try {
    const resultado = await EstoqueService.registrarRetornoMissao(req.params.id, req.body && req.body.itens);
    return ok(res, resultado);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registrarRetorno,
  listar,
  salvar,
  remover,
  criarMissao,
  listarMissoes
};
