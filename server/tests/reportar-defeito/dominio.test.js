/**
 * UC01 — Reportar defeito em poste | Testes de unidade da validação do chamado no servidor
 * (server/src/domain/Chamado.js → validarNovoChamado).
 * Cada teste traz no nome o ID do caso (RP-xx) e a técnica usada.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Chamado = require('../../src/domain/Chamado');
const { reporteValido, fotoComBytes, TIPOS_DO_UC01, UM_MEGABYTE } = require('./fixture');

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

test('RP-02 (servidor) [caixa-preta | tabela de decisão] só aceita com GPS, tipo e foto (passo 6, CA01)', () => {
  for (const temGps of [true, false]) {
    for (const temTipo of [true, false]) {
      for (const temFoto of [true, false]) {
        const aceito = valida({
          lat: temGps ? -10.1253 : null,
          lng: temGps ? -36.1756 : null,
          tipo: temTipo ? 'apagado' : '',
          foto_base64: temFoto ? reporteValido().foto_base64 : null
        });
        assert.equal(aceito, temGps && temTipo && temFoto, `GPS=${temGps}, tipo=${temTipo}, foto=${temFoto}`);
      }
    }
  }
});

test('RP-03 [caixa-preta | partição inválida] tipo fora da lista do UC01 é rejeitado', () => {
  for (const tipo of ['POSTE_CAIU', 'fios_soltos', 'Poste apagado', 'APAGADO', '   ']) {
    assert.equal(valida({ tipo }), false, `o tipo "${tipo}" deveria ser rejeitado`);
  }
});

test('RP-06 [caixa-preta | valor-limite] descrição: 500 caracteres aceita, 501 rejeita (passo 5)', () => {
  assert.equal(valida({ descricao: 'x'.repeat(500) }), true);
  assert.equal(valida({ descricao: 'x'.repeat(501) }), false);
});

test('RP-07 [caixa-preta | valor-limite] foto: 2 MB aceita, 2 MB + 1 byte rejeita (RNF02)', () => {
  assert.equal(valida({ foto_base64: fotoComBytes(2 * UM_MEGABYTE) }), true);
  assert.equal(valida({ foto_base64: fotoComBytes(2 * UM_MEGABYTE + 1) }), false);
});

/* ── Caixa-branca: casos criados a partir do relatório de cobertura (Passo 5) ── */

test('RP-14 [caixa-branca | cobertura de ramos] identificação: id e protocolo ausentes ou de tipo errado', () => {
  const erros = alterar => Chamado.validarNovoChamado(reporteValido(alterar)).erros;
  assert.match(erros({ id: undefined }).join(' '), /Identificador único/);
  assert.match(erros({ id: 123 }).join(' '), /Identificador único/);
  assert.match(erros({ protocolo: '' }).join(' '), /Protocolo do chamado/);
  assert.match(erros({ protocolo: 42 }).join(' '), /Protocolo do chamado/);
  assert.equal(Chamado.validarNovoChamado(null).valido, false, 'entrada nula não pode derrubar o servidor');
  assert.equal(Chamado.validarNovoChamado(undefined).valido, false);
});

test('RP-14 [caixa-branca | cobertura de ramos] foto: URL já enviada, campo fotoUrl e preenchimento do Base64', () => {
  assert.equal(valida({ foto_base64: 'https://exemplo.org/foto.jpg' }), true, 'URL não tem tamanho a medir');
  assert.equal(valida({ foto_base64: undefined, fotoUrl: '/uploads/fotos/a.jpg' }), true, 'aceita a foto pelo campo fotoUrl');
  assert.equal(valida({ foto_base64: '   ' }), false, 'foto só com espaços é ausente');
  // 2 MB − 1 byte termina em "==", 2 MB em "=" e 2 MB + 1 sem preenchimento: os três ramos da conta.
  assert.equal(valida({ foto_base64: fotoComBytes(2 * UM_MEGABYTE - 1) }), true);
  assert.equal(valida({ foto_base64: fotoComBytes(2 * UM_MEGABYTE) }), true);
  assert.equal(valida({ foto_base64: fotoComBytes(2 * UM_MEGABYTE + 1) }), false);
});

test('RP-14 [caixa-branca | cobertura de ramos] coordenadas como texto vazio e como texto numérico', () => {
  assert.equal(Chamado.coordenadasValidas('', ''), false);
  assert.equal(Chamado.coordenadasValidas('-10.1253', '-36.1756'), true);
});
