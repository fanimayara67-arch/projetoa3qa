/**
 * CAMADA DE APRESENTAÇÃO — Rotas de Almoxarifado (Estoque e Missões)
 */

const autenticar = require('../middlewares/autenticar');
const EstoqueController = require('../controllers/EstoqueController');

function registrarRotasEstoque(router) {
  router.get('/api/estoque', autenticar(['almoxarife', 'tecnico', 'gestor']), EstoqueController.listar);
  router.put('/api/estoque/:item', autenticar(['almoxarife', 'gestor']), EstoqueController.salvar);
  router.delete('/api/estoque/:item', autenticar(['almoxarife', 'gestor']), EstoqueController.remover);

  router.get('/api/missoes', autenticar(['almoxarife', 'gestor']), EstoqueController.listarMissoes);
  router.post('/api/missoes', autenticar(['almoxarife', 'gestor']), EstoqueController.criarMissao);
  router.post('/api/missoes/:id/retorno', autenticar(['almoxarife', 'gestor']), EstoqueController.registrarRetorno);
}

module.exports = registrarRotasEstoque;
