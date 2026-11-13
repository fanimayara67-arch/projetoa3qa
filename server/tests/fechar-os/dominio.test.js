/**
 * UC05 — Atender e encerrar chamado (fechar OS) | Regras do domínio (Fechamento.validarFechamentoCampo).
 *
 * Base: passos 3 a 6 do UC05, fluxo alternativo A4, CA04 e o projeto de banco do grupo
 * (status com 4 valores, foto, latitude, longitude e precisão obrigatórias, precisão até 100 m).
 * Cada teste traz no nome o ID do caso e a técnica usada.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Fechamento = require('../../src/domain/Fechamento');
const { fechamentoValido, STATUS_UC05 } = require('./fixture');

const validar = (alterar) => Fechamento.validarFechamentoCampo(fechamentoValido(alterar));
const aceita = (alterar, msg) => assert.equal(validar(alterar).valido, true, msg || JSON.stringify(validar(alterar).erros));
const recusa = (alterar, msg) => assert.equal(validar(alterar).valido, false, msg);

test('FO-01 [caixa-preta | partição válida] fechamento completo do passo 6 é aceito', () => {
  const r = validar();
  assert.deepEqual(r, { valido: true, erros: [] });
});

test('FO-02 [caixa-preta | partição inválida] sem operacao_id, status ou serviço o fechamento é recusado', () => {
  recusa({ operacao_id: '' }, 'operacao_id é a chave de idempotência da fila offline');
  recusa({ status: '' });
  recusa({ servico: '   ' }, 'serviço só com espaços');
  assert.equal(Fechamento.validarFechamentoCampo(null).valido, false, 'corpo nulo');
});

test('FO-03 [caixa-preta | partição inválida | passo 6] sem foto do reparo o fechamento é recusado', () => {
  recusa({ foto_reparo_base64: null });
  recusa({ foto_reparo_base64: '' });
  aceita({ foto_reparo_base64: null, fotoUrl: '/uploads/fotos/reparo.jpg' }, 'foto já enviada antes (URL) vale');
});

test('FO-04 [caixa-preta | tabela de decisão | passo 3] só os quatro status do UC05 são aceitos', () => {
  for (const status of STATUS_UC05) aceita({ status }, `"${status}" deveria ser aceito`);
  for (const status of ['Resolvido', 'concluido', 'Concluído ', 'fechado', 'Cancelado']) {
    recusa({ status }, `"${status}" não é status do UC05`);
  }
});

test('FO-05 [caixa-preta | partição inválida | passo 6 e A4] sem GPS válido o fechamento é recusado', () => {
  recusa({ lat: null, lng: null }, 'sem GPS');
  recusa({ lat: 0, lng: 0 }, '(0,0) é falha do GPS');
  recusa({ lat: 'abc', lng: -36.17 }, 'coordenada não numérica');
  recusa({ lat: -10.12, lng: null }, 'só a latitude');
  aceita({ lat: undefined, lng: undefined, latitude: '-10.125300', longitude: '-36.175600' },
    'a tela antiga envia latitude/longitude como texto com 6 casas');
});

test('FO-06 [caixa-preta | valor-limite | A4] região: bordas aceitas, um passo fora recusado', () => {
  // Mesma cerca da tela do técnico (buildValidMapsUrl): Nordeste, lat -20 a -2 e lng -50 a -33.
  aceita({ lat: -2, lng: -33 });
  aceita({ lat: -20, lng: -50 });
  recusa({ lat: -1.99, lng: -36.17 }, 'ao norte da região');
  recusa({ lat: -20.01, lng: -36.17 }, 'ao sul da região');
  recusa({ lat: -10.12, lng: -32.99 }, 'a leste (no mar)');
  recusa({ lat: -10.12, lng: -50.01 }, 'a oeste da região');
  recusa({ lat: -23.55, lng: -46.63 }, 'São Paulo: GPS por Wi-Fi/IP fora da região');
});

test('FO-07 [caixa-preta | valor-limite | passo 6 e A4] precisão do GPS até 100 m', () => {
  aceita({ precisao_m: 0 });
  aceita({ precisao_m: 100 });
  aceita({ precisao_m: undefined, acc: 100 }, 'a tela também pode enviar a precisão como acc');
  recusa({ precisao_m: 100.01 });
  recusa({ precisao_m: 250 });
  recusa({ precisao_m: -1 }, 'precisão negativa é inválida');
  recusa({ precisao_m: 'abc' });
  recusa({ precisao_m: undefined }, 'precisão é obrigatória (coluna NOT NULL no projeto de banco)');
});

test('FO-08 [caixa-preta | tabela de decisão | passo 4 e CA04] materiais da OS', () => {
  aceita({ materiais_os: [] }, 'sem materiais');
  aceita({ materiais_os: undefined }, 'campo ausente');
  aceita({ materiais_os: [{ item_id: 3, quantidade: 2.5 }] }, 'item por id e quantidade fracionada (cabo em metros)');
  recusa({ materiais_os: [{ quantidade: 1 }] }, 'item sem nome nem id');
  recusa({ materiais_os: [{ nome: 'Reator', quantidade: 0 }] }, 'quantidade zero');
  recusa({ materiais_os: [{ nome: 'Reator', quantidade: -1 }] }, 'quantidade negativa');
  recusa({ materiais_os: [{ nome: 'Reator', quantidade: 'dois' }] }, 'quantidade não numérica');
});

test('FO-09 [suposição de erro] item nulo na lista de materiais é recusado, sem erro interno', () => {
  let r;
  assert.doesNotThrow(() => { r = validar({ materiais_os: [null] }); });
  assert.equal(r.valido, false);
});

test('FO-10 [suposição de erro | valor-limite] data do fechamento: ISO aceita; formato brasileiro e texto recusados', () => {
  aceita({ data_fechamento: '2026-11-13T12:00:00.000Z' });
  aceita({ data_fechamento: undefined }, 'sem data o servidor usa a hora atual');
  recusa({ data_fechamento: '13/11/2026, 10:30' }, 'formato que a tela antiga envia');
  recusa({ data_fechamento: 'ontem' });
});

test('FO-11 [caixa-preta | valor-limite] referência do local: 255 caracteres aceitos, 256 recusados', () => {
  aceita({ referencia: 'a'.repeat(255) });
  recusa({ referencia: 'a'.repeat(256) }, 'a coluna referencia é VARCHAR(255)');
});
