/**
 * UC01 — Reportar defeito em poste | Teste de integração da rota POST /api/chamados
 * (apresentação → serviço → repositório), com banco simulado e foto sem gravação em disco.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../../src/infrastructure/database/pool');
const FotoStorage = require('../../src/infrastructure/storage/FotoStorage');
const { reporteValido } = require('./fixture');
const { criarBancoSimulado } = require('./banco-simulado');

function enviar(app, corpo) {
  return app.handle({ method: 'POST', url: '/api/chamados', body: corpo, headers: { 'content-type': 'application/json' } }, {});
}

test('RP-11 [caixa-preta | integração] POST /api/chamados: 201 para reporte válido e 400 para inválido', async t => {
  const banco = criarBancoSimulado();
  pool.setPool(banco.pool);
  t.mock.method(FotoStorage, 'salvar', async () => '/uploads/fotos/teste.jpg');
  t.after(() => pool.setPool(null));
  const app = require('../../src/app').criarApp();

  const criado = await enviar(app, reporteValido());
  assert.equal(criado.statusCode, 201);
  assert.equal(criado.body.data.protocolo, 'IC-261106-ABCDE');
  assert.equal(criado.body.data.status, 'aberto');
  assert.equal(criado.body.data.fotoUrl, '/uploads/fotos/teste.jpg');

  const semTipo = await enviar(app, reporteValido({ tipo: '' }));
  assert.equal(semTipo.statusCode, 400);

  const semLocalizacao = await enviar(app, reporteValido({ lat: null, lng: null }));
  assert.equal(semLocalizacao.statusCode, 400);

  assert.equal(banco.chamados.size, 1, 'só o reporte válido pode ser gravado');
});
