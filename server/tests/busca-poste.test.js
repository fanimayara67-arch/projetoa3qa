/**
 * Busca de poste por ID no painel do técnico (substitui o leitor de QR Code,
 * que saiu do projeto em 26/11/2026).
 *
 * Roda as funções REAIS de public/tecnico/index.html (recortadas pelo apoio
 * extrair-funcao), com prompt, aviso e histórico trocados por dublês.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./testes-offline/apoio/extrair-funcao');

function montarBusca(digitado) {
  const chamadas = { historico: [], avisos: [] };
  const ctx = carregar('tecnico', ['normalizarIdPoste', 'buscarPoste'], {
    prompt: () => digitado,
    showToast: (msg, tipo) => chamadas.avisos.push({ msg, tipo }),
    abrirHistoricoPoste: (id) => chamadas.historico.push(id)
  });
  return { ctx, chamadas };
}

test('BP-01 [caixa-preta | partição válida] normalizarIdPoste aceita P-0001, P0001 e p0001 e devolve P-0001', () => {
  const { ctx } = montarBusca();
  for (const entrada of ['P-0001', 'P0001', 'p0001', '  p-0001  ']) {
    assert.equal(ctx.normalizarIdPoste(entrada), 'P-0001', `entrada "${entrada}"`);
  }
  assert.equal(ctx.normalizarIdPoste('P-12'), 'P-12', 'mantém o número como foi digitado');
});

test('BP-02 [caixa-preta | partição inválida] normalizarIdPoste recusa texto que não é ID de poste', () => {
  const { ctx } = montarBusca();
  for (const entrada of ['', 'P-', 'PX-0001', '0001', 'P-00A1', 'https://exemplo/?poste=P-0001', null, undefined]) {
    assert.equal(ctx.normalizarIdPoste(entrada), '', `entrada ${JSON.stringify(entrada)}`);
  }
});

test('BP-03 [caixa-preta | fluxo principal] buscarPoste abre o histórico do poste digitado', () => {
  const { ctx, chamadas } = montarBusca('p0007');
  ctx.buscarPoste();
  assert.deepEqual(chamadas.historico, ['P-0007']);
  assert.deepEqual(chamadas.avisos, []);
});

test('BP-04 [caixa-preta | fluxo alternativo] buscarPoste avisa quando o ID é inválido e não abre nada', () => {
  const { ctx, chamadas } = montarBusca('poste 7');
  ctx.buscarPoste();
  assert.deepEqual(chamadas.historico, []);
  assert.equal(chamadas.avisos.length, 1);
  assert.equal(chamadas.avisos[0].tipo, 'err');
});

test('BP-05 [caixa-preta | fluxo alternativo] buscarPoste cancelado não abre nada nem mostra erro', () => {
  const { ctx, chamadas } = montarBusca(null);
  ctx.buscarPoste();
  assert.deepEqual(chamadas.historico, []);
  assert.deepEqual(chamadas.avisos, []);
});
