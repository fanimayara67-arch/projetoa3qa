/**
 * UC05 — Atender e encerrar chamado (fechar OS) | Integração da rota
 * POST /api/chamados/:protocolo/fechamento (autenticação → validação → serviço → repositórios),
 * com banco simulado, sessão do técnico simulada e foto sem gravação em disco.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../../src/infrastructure/database/pool');
const FotoStorage = require('../../src/infrastructure/storage/FotoStorage');
const AuthService = require('../../src/application/services/AuthService');
const { NaoAutenticado } = require('../../src/application/errors');
const { fechamentoValido, PROTOCOLO } = require('./fixture');
const { criarBancoSimulado } = require('./banco-simulado');

function preparar(t, banco = criarBancoSimulado()) {
  pool.setPool(banco.pool);
  t.after(() => pool.setPool(null));
  t.mock.method(FotoStorage, 'salvar', async (foto) => (foto ? '/uploads/fotos/reparo.jpg' : null));
  t.mock.method(AuthService, 'validarTokenSessao', async (token) => {
    if (token === 'tok-tecnico') return { id: 3, nome: 'Carlos', perfil: 'tecnico' };
    if (token === 'tok-almox') return { id: 4, nome: 'Rita', perfil: 'almoxarife' };
    throw new NaoAutenticado('Sessão expirada ou inválida.');
  });
  return { banco, app: require('../../src/app').criarApp() };
}

function enviar(app, corpo, token = 'tok-tecnico', protocolo = PROTOCOLO) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.handle({ method: 'POST', url: `/api/chamados/${protocolo}/fechamento`, body: corpo, headers }, {});
}

test('FO-21 [caixa-preta | integração | RNF03 e CA05] sem sessão válida: 401; perfil sem acesso: 403', async (t) => {
  const { app, banco } = preparar(t);
  assert.equal((await enviar(app, fechamentoValido(), null)).statusCode, 401);
  assert.equal((await enviar(app, fechamentoValido(), 'tok-vencido')).statusCode, 401);
  assert.equal((await enviar(app, fechamentoValido(), 'tok-almox')).statusCode, 403);
  assert.equal(banco.tabelas.fechamentos.length, 0);
});

test('FO-22 [caixa-preta | integração] fechamento válido: 201 com o fechamento; reenvio devolve o mesmo registro', async (t) => {
  const { app, banco } = preparar(t);
  const r = await enviar(app, fechamentoValido());
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.data.status, 'Concluído');

  const reenvio = await enviar(app, fechamentoValido());
  assert.ok([200, 201].includes(reenvio.statusCode));
  assert.equal(reenvio.body.data.id, r.body.data.id);
  assert.equal(banco.tabelas.fechamentos.length, 1);
});

test('FO-23 [caixa-preta | integração | passo 6] sem foto, sem GPS ou com status fora do UC05: 400 e nada gravado', async (t) => {
  const { app, banco } = preparar(t);
  for (const alterar of [{ foto_reparo_base64: null }, { lat: null, lng: null }, { status: 'Resolvido' }, { precisao_m: 300 }]) {
    const r = await enviar(app, fechamentoValido(alterar));
    assert.equal(r.statusCode, 400, `esperado 400 para ${JSON.stringify(alterar)}`);
    assert.equal(r.body.error.codigo, 'DADO_INVALIDO');
  }
  assert.equal(banco.tabelas.fechamentos.length, 0);
});

test('FO-24 [suposição de erro | integração] data no formato da tela antiga gera 400, não erro interno (500)', async (t) => {
  const { app } = preparar(t);
  const r = await enviar(app, fechamentoValido({ data_fechamento: '13/11/2026, 10:30' }));
  assert.equal(r.statusCode, 400);
});
