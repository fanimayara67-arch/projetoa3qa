/**
 * UC01 — Reportar defeito em poste | Testes de unidade da validação do chamado no servidor
 * (server/src/domain/Chamado.js → validarNovoChamado).
 * Cada teste traz no nome o ID do caso (RP-xx) e a técnica usada.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Chamado = require('../../src/domain/Chamado');
const { reporteValido, TIPOS_DO_UC01 } = require('./fixture');

const valida = alterar => Chamado.validarNovoChamado(reporteValido(alterar)).valido;

test('RP-01 [caixa-preta | partição válida] reporte completo é aceito', () => {
  const resultado = Chamado.validarNovoChamado(reporteValido());
  assert.equal(resultado.valido, true);
  assert.deepEqual(resultado.erros, []);
});

test('RP-04 [caixa-preta | partição válida] os seis tipos do UC01 são aceitos', () => {
  for (const tipo of TIPOS_DO_UC01) {
    assert.equal(valida({ tipo }), true, `o tipo "${tipo}" deveria ser aceito`);
  }
});

test('RP-05 [caixa-preta | valor-limite] limites de latitude e longitude e o ponto (0,0)', () => {
  const casos = [
    // [lat, lng, esperado]
    [90, -36.1756, true], [90.0001, -36.1756, false],
    [-90, -36.1756, true], [-90.0001, -36.1756, false],
    [-10.1253, 180, true], [-10.1253, 180.0001, false],
    [-10.1253, -180, true], [-10.1253, -180.0001, false],
    [0, 0, false],
    [null, null, false], ['abc', -36.1756, false]
  ];
  for (const [lat, lng, esperado] of casos) {
    assert.equal(valida({ lat, lng }), esperado, `lat=${lat}, lng=${lng} deveria ser ${esperado ? 'aceito' : 'rejeitado'}`);
  }
});

test('RP-08 [caixa-preta | partição válida] nome, telefone, endereço e descrição são opcionais', () => {
  assert.equal(valida({ nome: '', tel: '', endereco: '', descricao: '' }), true);
  assert.equal(valida({ nome: undefined, tel: undefined, endereco: undefined, descricao: undefined }), true);
});
