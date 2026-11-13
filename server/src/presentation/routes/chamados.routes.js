/**
 * CAMADA DE APRESENTAÇÃO — Rotas de Chamados, Tentativas e Fechamentos
 */

const autenticar = require('../middlewares/autenticar');
const validar = require('../middlewares/validar');
const ChamadoController = require('../controllers/ChamadoController');
const FechamentoController = require('../controllers/FechamentoController');

function registrarRotasChamados(router) {
  // Público (PWA do Cidadão)
  router.post('/api/chamados', validar(['id', 'protocolo', 'tipo']), ChamadoController.criar);

  // Equipe Técnica / Gestor
  router.get('/api/chamados', autenticar('tecnico'), ChamadoController.listar);
  router.get('/api/chamados/:protocolo', autenticar('tecnico'), ChamadoController.buscar);
  router.get('/api/tentativas', autenticar('tecnico'), ChamadoController.listarTentativas);
  router.post(
    '/api/chamados/:protocolo/tentativas',
    autenticar('tecnico'),
    validar(['operacao_id', 'motivo']),
    ChamadoController.registrarTentativa
  );
  router.post(
    '/api/chamados/:protocolo/fechamento',
    autenticar('tecnico'),
    validar(['operacao_id', 'status', 'servico']),
    FechamentoController.fechar
  );

  // Exclusivo Gestor (Fechamento Administrativo)
  router.post(
    '/api/chamados/:protocolo/fechamento-admin',
    autenticar('gestor'),
    validar(['operacao_id', 'informante', 'justificativa']),
    FechamentoController.fecharAdmin
  );
}

module.exports = registrarRotasChamados;
