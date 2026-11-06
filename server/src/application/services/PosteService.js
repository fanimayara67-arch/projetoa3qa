/**
 * CAMADA DE APLICAÇÃO — PosteService
 * Histórico técnico e listagem de postes.
 */

const PosteRepoDefault = require('../../infrastructure/repositories/PosteRepository');
const Poste = require('../../domain/Poste');
const { DadoInvalido, NaoEncontrado } = require('../errors');

async function obterHistorico(rawId, deps = {}) {
  const PosteRepo = deps.PosteRepo || PosteRepoDefault;
  const posteId = Poste.normalizarPosteId(rawId);
  if (!posteId) {
    throw new DadoInvalido('Identificador de poste inválido.');
  }

  const poste = await PosteRepo.buscarPorId(posteId);
  if (!poste) {
    throw new NaoEncontrado(`Poste ${posteId} não encontrado.`);
  }

  const chamados = await PosteRepo.listarHistoricoDoPoste(posteId);
  return {
    poste: {
      ...poste,
      qtd: chamados.length
    },
    chamados
  };
}

async function listarPostes(bairro = '', deps = {}) {
  const PosteRepo = deps.PosteRepo || PosteRepoDefault;
  return PosteRepo.listarTodos(bairro);
}

module.exports = {
  obterHistorico,
  listarPostes
};
