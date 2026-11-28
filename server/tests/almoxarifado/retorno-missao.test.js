/**
 * UC07 — Almoxarifado | Retorno de material da missão (POST /api/missoes/:id/retorno)
 *
 * A tela do almoxarifado tem "Registrar retorno", mas a API Node não tinha a rota: o
 * material que voltava do campo não era devolvido ao estoque. O domínio já tinha a
 * regra (Missao.validarRetornoMissao); faltavam o serviço, o repositório e a rota.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const EstoqueService = require('../../src/application/services/EstoqueService');
const EstoqueRepository = require('../../src/infrastructure/repositories/EstoqueRepository');

const SINTAXE_POSTGRES = /\$\d|RETURNING|ON CONFLICT|EXCLUDED\.|json_agg|json_build_object|FILTER \(/i;

/** Repositório em memória com uma missão de duas saídas (4 lâmpadas e 10 m de cabo). */
function bancoFalso({ missao = { id: 3, data: '2026-11-27', equipe: 'A' }, retornoAnterior = null } = {}) {
  const estado = {
    saldos: { 1: 6, 2: 30 },
    itens: [
      { item_id: 1, nome: 'Lâmpada LED 100W', unidade: 'un', qtd_saida: '4.00', qtd_retorno: retornoAnterior },
      { item_id: 2, nome: 'Cabo 2,5mm', unidade: 'm', qtd_saida: '10.00', qtd_retorno: null }
    ],
    chamadas: []
  };
  const deps = {
    emTransacao: async (fn) => fn({ tx: true }),
    EstoqueRepo: {
      async buscarMissaoParaAtualizar(_tx, id) { estado.chamadas.push(['missao', id]); return missao && Number(id) === missao.id ? missao : null; },
      async listarItensDaMissao(_tx, id) { estado.chamadas.push(['itens', id]); return estado.itens; },
      async creditarSaldo(_tx, itemId, delta) { estado.chamadas.push(['credito', itemId, delta]); estado.saldos[itemId] += delta; },
      async registrarRetornoItem(_tx, missaoId, itemId, qtd) {
        estado.chamadas.push(['retorno', missaoId, itemId, qtd]);
        estado.itens.find((i) => i.item_id === itemId).qtd_retorno = qtd;
      }
    }
  };
  return { estado, deps };
}

test('RM-01 [caixa-preta | fluxo principal] retorno devolve ao estoque o que voltou e registra o retorno de cada item', async () => {
  const { estado, deps } = bancoFalso();
  const r = await EstoqueService.registrarRetornoMissao(3, [
    { nome: 'Lâmpada LED 100W', qtd_retorno: 1 },
    { nome: 'Cabo 2,5mm', qtd_retorno: 0 }
  ], deps);
  assert.deepEqual(estado.saldos, { 1: 7, 2: 30 }, 'lâmpada volta 1 ao estoque; cabo, nada');
  assert.deepEqual(estado.itens.map((i) => i.qtd_retorno), [1, 0]);
  assert.equal(r.missao_id, 3);
});

test('RM-02 [caixa-preta | valor limite] retorno igual à saída é aceito; um a mais é recusado sem mexer no estoque', async () => {
  const igual = bancoFalso();
  await EstoqueService.registrarRetornoMissao(3, [{ nome: 'Lâmpada LED 100W', qtd_retorno: 4 }], igual.deps);
  assert.equal(igual.estado.saldos[1], 10);

  const acima = bancoFalso();
  await assert.rejects(
    EstoqueService.registrarRetornoMissao(3, [{ nome: 'Lâmpada LED 100W', qtd_retorno: 5 }], acima.deps),
    { name: 'DadoInvalido', status: 400, message: /não pode ser maior que a saída \(4\)/ }
  );
  assert.deepEqual(acima.estado.saldos, { 1: 6, 2: 30 });
});

test('RM-03 [caixa-preta | risco: reenvio] corrigir um retorno já registrado credita só a diferença', async () => {
  const { estado, deps } = bancoFalso({ retornoAnterior: '1.00' });
  await EstoqueService.registrarRetornoMissao(3, [{ nome: 'Lâmpada LED 100W', qtd_retorno: 3 }], deps);
  assert.equal(estado.saldos[1], 8, 'já tinham voltado 1; agora voltaram 3: credita 2');
  await EstoqueService.registrarRetornoMissao(3, [{ nome: 'Lâmpada LED 100W', qtd_retorno: 3 }], deps);
  assert.equal(estado.saldos[1], 8, 'o mesmo retorno enviado de novo não credita outra vez');
});

test('RM-04 [caixa-preta | fluxo de exceção] missão inexistente é 404; item que não saiu na missão é recusado', async () => {
  const inexistente = bancoFalso();
  await assert.rejects(EstoqueService.registrarRetornoMissao(99, [{ nome: 'Lâmpada LED 100W', qtd_retorno: 1 }], inexistente.deps),
    { name: 'NaoEncontrado', status: 404 });

  const forasteiro = bancoFalso();
  await assert.rejects(EstoqueService.registrarRetornoMissao(3, [{ nome: 'Reator', qtd_retorno: 1 }], forasteiro.deps),
    { name: 'DadoInvalido', message: /Reator/ });
  assert.deepEqual(forasteiro.estado.saldos, { 1: 6, 2: 30 });
});

test('RM-05 [caixa-preta | partição inválida] retorno sem itens ou com quantidade negativa é recusado antes da transação', async () => {
  for (const retornos of [[], null, [{ nome: 'Lâmpada LED 100W', qtd_retorno: -1 }], [{ nome: 'Lâmpada LED 100W', qtd_retorno: 'x' }]]) {
    const { estado, deps } = bancoFalso();
    await assert.rejects(EstoqueService.registrarRetornoMissao(3, retornos, deps), { name: 'DadoInvalido' }, JSON.stringify(retornos));
    if (!Array.isArray(retornos) || !retornos.length) assert.deepEqual(estado.chamadas, [], 'não abre a transação');
  }
});

/* ─────────────── Repositório (MySQL) ─────────────── */

function txFalso() {
  const consultas = [];
  return {
    consultas,
    query: async (sql, valores) => {
      consultas.push({ sql, valores });
      if (/^\s*SELECT \* FROM missoes/.test(sql)) return { rows: [{ id: 3 }] };
      if (/^\s*SELECT/.test(sql)) return { rows: [{ item_id: 1, nome: 'Lâmpada LED 100W', qtd_saida: '4.00', qtd_retorno: null }] };
      return { rows: { affectedRows: 1 } };
    }
  };
}

test('RM-06 [caixa-branca] repositório trava a missão e os itens, credita o saldo e grava o retorno em MySQL', async () => {
  const tx = txFalso();
  const missao = await EstoqueRepository.buscarMissaoParaAtualizar(tx, 3);
  const itens = await EstoqueRepository.listarItensDaMissao(tx, 3);
  await EstoqueRepository.creditarSaldo(tx, 1, 2);
  await EstoqueRepository.registrarRetornoItem(tx, 3, 1, 2);

  assert.equal(missao.id, 3);
  assert.equal(itens[0].nome, 'Lâmpada LED 100W');
  assert.match(tx.consultas[0].sql, /FROM missoes WHERE id = \? FOR UPDATE/);
  assert.match(tx.consultas[1].sql, /FROM missao_itens mi\s+JOIN itens_estoque ie ON ie\.id = mi\.item_id[\s\S]*FOR UPDATE/);
  assert.match(tx.consultas[2].sql, /UPDATE itens_estoque SET saldo = saldo \+ \?/);
  assert.deepEqual(tx.consultas[2].valores, [2, 1]);
  assert.match(tx.consultas[3].sql, /UPDATE missao_itens SET qtd_retorno = \? WHERE missao_id = \? AND item_id = \?/);
  assert.deepEqual(tx.consultas[3].valores, [2, 3, 1]);
  for (const { sql } of tx.consultas) assert.doesNotMatch(sql, SINTAXE_POSTGRES, sql);
});
