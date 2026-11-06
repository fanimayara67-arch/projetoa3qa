/**
 * CAMADA DE APRESENTAÇÃO — Rotas de Postes (Histórico)
 */

const autenticar = require('../middlewares/autenticar');
const PosteController = require('../controllers/PosteController');

function registrarRotasPostes(router) {
  // Equipe Técnica / Gestor: Histórico e listagem de postes
  router.get('/api/postes', autenticar('tecnico'), PosteController.listar);
  router.get('/api/postes/:id/historico', autenticar('tecnico'), PosteController.historico);
}

module.exports = registrarRotasPostes;
