/**
 * UC01 — Reportar defeito em poste | Testes do serviço de criação de chamados
 * (server/src/application/services/ChamadoService.js → criarChamado) com o
 * ChamadoRepository real sobre um banco simulado.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarChamado } = require('../../src/application/services/ChamadoService');
const ChamadoRepo = require('../../src/infrastructure/repositories/ChamadoRepository');
const { reporteValido } = require('./fixture');
const { criarBancoSimulado } = require('./banco-simulado');

function montarDependencias(banco, fotoStorage) {
  return {
    emTransacao: op => banco.emTransacao(op),
    ChamadoRepo,
    PosteRepo: { garantirExistencia: async () => assert.fail('Este reporte não usa QR Code') },
    FotoStorage: fotoStorage || { salvar: async () => '/uploads/fotos/teste.jpg' }
  };
}

test('RP-09 [baseada em risco | duplicidade] reenvio do mesmo reporte devolve o mesmo chamado (CA03)', async () => {
  const banco = criarBancoSimulado();
  const deps = montarDependencias(banco);

  const primeiro = await criarChamado(reporteValido(), deps);
  const reenvio = await criarChamado(reporteValido(), deps);

  assert.equal(banco.chamados.size, 1, 'o reenvio não pode criar um segundo chamado');
  assert.equal(reenvio.id, primeiro.id);
  assert.equal(reenvio.protocolo, primeiro.protocolo);
  assert.equal(primeiro.status, 'aberto');
});

test('RP-09 [baseada em risco | duplicidade] outro reporte com protocolo já usado é recusado', async () => {
  const banco = criarBancoSimulado();
  const deps = montarDependencias(banco);

  await criarChamado(reporteValido(), deps);
  await assert.rejects(
    criarChamado(reporteValido({ id: '22222222-2222-4222-8222-222222222222' }), deps),
    { code: 'ER_DUP_ENTRY' }
  );
  assert.equal(banco.chamados.size, 1);
});

test('RP-10 [caixa-branca | ramo de erro] falha ao salvar a foto não cria chamado', async () => {
  const banco = criarBancoSimulado();
  const falhaNaFoto = Object.assign(new Error('Disco cheio'), { status: 500 });
  const deps = montarDependencias(banco, { salvar: async () => { throw falhaNaFoto; } });

  await assert.rejects(criarChamado(reporteValido(), deps), erro => erro === falhaNaFoto);
  assert.equal(banco.chamados.size, 0);
  assert.equal(banco.eventos.includes('INSERT'), false, 'nenhuma gravação pode acontecer');
});

test('RP-15 [baseada em risco | chamado sem localização] QR de poste sem coordenadas e sem GPS é recusado (CA01)', async () => {
  const banco = criarBancoSimulado();
  const semGps = reporteValido({ lat: null, lng: null, poste_id: 'P-0099' });
  const deps = {
    ...montarDependencias(banco),
    PosteRepo: { garantirExistencia: async () => ({ id: 'P-0099', latitude: null, longitude: null }) }
  };

  await assert.rejects(criarChamado(semGps, deps), { status: 400 });
  assert.equal(banco.chamados.size, 0, 'nenhum chamado pode ficar sem localização');
});

test('RP-15 [caixa-preta | partição válida] QR de poste cadastrado dispensa o GPS e usa as coordenadas do poste', async () => {
  const banco = criarBancoSimulado();
  const deps = {
    ...montarDependencias(banco),
    PosteRepo: { garantirExistencia: async () => ({ id: 'P-0001', latitude: -10.1301, longitude: -36.1702, endereco: 'Rua A' }) }
  };

  const chamado = await criarChamado(reporteValido({ lat: null, lng: null, poste_id: 'P-0001' }), deps);
  assert.equal(chamado.latitude, -10.1301);
  assert.equal(chamado.longitude, -36.1702);
  assert.equal(chamado.poste_id, 'P-0001');
});
