/**
 * CAMADA DE APRESENTAÇÃO — PosteController
 */

const PosteService = require('../../application/services/PosteService');
const { ok } = require('../views/resposta');

async function historico(req, res, next) {
  try {
    const dados = await PosteService.obterHistorico(req.params.id);
    return ok(res, dados);
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const bairro = (req.query && req.query.bairro) || '';
    const postes = await PosteService.listarPostes(bairro);
    return ok(res, postes);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  historico,
  listar
};
