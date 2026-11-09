const test = require('node:test');
const assert = require('node:assert/strict');
const EstoqueRepository = require('../../src/infrastructure/repositories/EstoqueRepository');
const { Conflito, NaoEncontrado } = require('../../src/application/errors');

const SINTAXE_POSTGRES = /\$\d|RETURNING|ON CONFLICT|EXCLUDED\.|json_agg|json_build_object|FILTER \(/i;

/** Banco falso: grava cada SQL e responde conforme o tipo de comando. */
function txFalso(item = { id: 1, nome: 'Lâmpada LED 100W', unidade: 'un', saldo: '10.00' }) {
  const consultas = [];
  return {
    consultas,
    query: async (sql, valores) => {
      consultas.push({ sql, valores });
      if (/^\s*INSERT INTO missoes/.test(sql)) return { rows: { insertId: 42 } };
      if (/^\s*SELECT/.test(sql)) return { rows: item ? [{ ...item, id: sql.includes('missoes') ? 42 : item.id }] : [] };
      return { rows: { affectedRows: 1 } };
    }
  };
}

test('Almoxarifado: nenhuma consulta do estoque usa sintaxe do PostgreSQL', async () => {
  const tx = txFalso();
  await EstoqueRepository.listarItens(tx);
  await EstoqueRepository.salvarItem({ nome: ' Lâmpada LED 100W ', saldo: 5, minimo: 1 }, tx);
  await EstoqueRepository.removerItem('Lâmpada LED 100W', tx);
  await EstoqueRepository.baixarMateriais(tx, 7, [{ nome: 'Lâmpada LED 100W', quantidade: 1 }]);
  await EstoqueRepository.criarMissaoComItens(tx, { data: '2026-11-09', equipe: 'A', itens: [{ nome: 'Lâmpada LED 100W', qtd_saida: 1 }] });
  await EstoqueRepository.listarMissoes({ query: async (sql) => { tx.consultas.push({ sql }); return { rows: [] }; } });

  for (const { sql } of tx.consultas) {
    assert.doesNotMatch(sql, SINTAXE_POSTGRES, `SQL com sintaxe PostgreSQL:\n${sql}`);
  }
});

test('Almoxarifado: salvarItem faz upsert pelo nome e devolve a linha salva', async () => {
  const tx = txFalso();
  const salvo = await EstoqueRepository.salvarItem({ nome: '  Reator 250W ', unidade: 'un', saldo: '8', minimo: '2' }, tx);
  assert.match(tx.consultas[0].sql, /ON DUPLICATE KEY UPDATE/);
  assert.deepEqual(tx.consultas[0].valores, ['Reator 250W', 'un', 8, 2]);
  assert.deepEqual(tx.consultas[1].valores, ['Reator 250W']);
  assert.equal(salvo.id, 1);
});

test('Almoxarifado: removerItem devolve null quando o item não existe e não executa DELETE', async () => {
  const tx = txFalso(null);
  assert.equal(await EstoqueRepository.removerItem('99', tx), null);
  assert.match(tx.consultas[0].sql, /WHERE id = \?/);
  assert.equal(tx.consultas.some(c => /DELETE/.test(c.sql)), false);
});

test('Almoxarifado: baixa trava o item (FOR UPDATE) antes de debitar', async () => {
  const tx = txFalso();
  const baixados = await EstoqueRepository.baixarMateriais(tx, 7, [{ item_id: 1, quantidade: 3 }]);
  assert.match(tx.consultas[0].sql, /FOR UPDATE/);
  assert.match(tx.consultas[1].sql, /UPDATE itens_estoque SET saldo = saldo - \?/);
  assert.deepEqual(tx.consultas[1].valores, [3, 1]);
  assert.deepEqual(baixados, [{ item_id: 1, nome: 'Lâmpada LED 100W', quantidade: 3 }]);
});

test('Almoxarifado: saldo insuficiente gera Conflito sem debitar nada', async () => {
  const tx = txFalso();
  await assert.rejects(EstoqueRepository.baixarMateriais(tx, 7, [{ nome: 'Lâmpada LED 100W', quantidade: 11 }]), Conflito);
  assert.equal(tx.consultas.some(c => /^\s*UPDATE/.test(c.sql)), false);
});

test('Almoxarifado: material inexistente gera NaoEncontrado', async () => {
  await assert.rejects(EstoqueRepository.baixarMateriais(txFalso(null), 7, [{ nome: 'X', quantidade: 1 }]), NaoEncontrado);
});

test('Almoxarifado: missão usa o insertId e grava os itens debitados', async () => {
  const tx = txFalso();
  const missao = await EstoqueRepository.criarMissaoComItens(tx, { data: '2026-11-09', equipe: 'Equipe A', itens: [{ nome: 'Lâmpada LED 100W', qtd_saida: 2 }] });
  assert.equal(missao.id, 42);
  const insercaoItem = tx.consultas.find(c => /INSERT INTO missao_itens/.test(c.sql));
  assert.deepEqual(insercaoItem.valores, [42, 1, 2]);
});

test('Almoxarifado: listarMissoes devolve itens como array, mesmo se o driver mandar texto', async () => {
  const tx = { query: async () => ({ rows: [{ id: 1, itens: '[{"nome":"Cabo","qtd_saida":20}]' }, { id: 2, itens: [] }] }) };
  const missoes = await EstoqueRepository.listarMissoes(tx);
  assert.deepEqual(missoes[0].itens, [{ nome: 'Cabo', qtd_saida: 20 }]);
  assert.deepEqual(missoes[1].itens, []);
});
