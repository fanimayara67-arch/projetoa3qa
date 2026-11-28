/**
 * CAMADA DE APRESENTAÇÃO — Rotas de Fotos
 * O endereço é o mesmo que fica gravado em foto_url (/uploads/fotos/<arquivo>).
 */

const FotoController = require('../controllers/FotoController');

function registrarRotasFotos(router) {
  router.get('/uploads/fotos/:arquivo', FotoController.servir);
}

module.exports = registrarRotasFotos;
