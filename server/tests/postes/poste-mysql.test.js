const test = require('node:test');
const assert = require('node:assert/strict');
const PosteRepository = require('../../src/infrastructure/repositories/PosteRepository');

const SINTAXE_POSTGRES = /\$\d|RETURNING|ON CONFLICT|EXCLUDED\.|ILIKE/i;

function txFalso(poste = { id: 'P-0001', bairro: 'Centro' }) {
  const consultas = [];
  return {
    consultas,
    query: async (sql, valores) => {
      consultas.push({ sql, valores });
      return { rows: /^\s*SELECT/.test(sql) ? (poste ? [poste] : []) : { affectedRows: 1 } };
    }
  };
}

test('Postes: nenhuma consulta usa sintaxe do PostgreSQL', async () => {
  const tx = txFalso();
  await PosteRepository.buscarPorId('P-0001', tx);
  await PosteRepository.garantirExistencia(tx, 'P-0001', { endereco: 'Praça' });
  await PosteRepository.buscarChamadoAbertoNoPoste('P-0001', tx);
  await PosteRepository.listarHistoricoDoPoste('P-0001', tx);
  await PosteRepository.atualizarConfiguracao(tx, 'P-0001', { bairro: 'Centro' });
  await PosteRepository.listarTodos('centro', tx);
  await PosteRepository.listarTodos('', tx);
  for (const { sql } of tx.consultas) {
    assert.doesNotMatch(sql, SINTAXE_POSTGRES, `SQL com sintaxe PostgreSQL:\n${sql}`);
  }
});

test('Postes: garantirExistencia não sobrescreve poste existente e devolve a linha', async () => {
  const tx = txFalso();
  const poste = await PosteRepository.garantirExistencia(tx, 'P-0001', {});
  assert.match(tx.consultas[0].sql, /ON DUPLICATE KEY UPDATE id = id/);
  assert.equal(poste.id, 'P-0001');
});

test('Postes: atualizarConfiguracao preserva campos não informados (COALESCE) e devolve a linha', async () => {
  const tx = txFalso();
  const poste = await PosteRepository.atualizarConfiguracao(tx, 'P-0001', { luminaria: 'LED 100W' });
  assert.match(tx.consultas[0].sql, /bairro\s+= COALESCE\(novo\.bairro, postes\.bairro\)/);
  assert.equal(tx.consultas[0].valores.length, 18);
  assert.equal(poste.bairro, 'Centro');
});

test('Postes: atualizarConfiguracao sem poste não executa nada', async () => {
  const tx = txFalso();
  assert.equal(await PosteRepository.atualizarConfiguracao(tx, '', {}), null);
  assert.equal(tx.consultas.length, 0);
});

test('Postes: filtro por bairro usa LIKE com curingas', async () => {
  const tx = txFalso();
  await PosteRepository.listarTodos('  Centro ', tx);
  assert.match(tx.consultas[0].sql, /bairro LIKE \?/);
  assert.deepEqual(tx.consultas[0].valores, ['%Centro%']);
});
