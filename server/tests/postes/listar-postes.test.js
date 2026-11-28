/**
 * Relatório de postes | A listagem traz quantos atendimentos cada poste teve e quando foi o último.
 *
 * O relatório de postes (tela do técnico) mostra "N atendimentos · último: data" em cada poste.
 * No Apps Script esses campos vinham prontos; na API Node, GET /api/postes devolvia só a ficha
 * do poste, e a tela mostraria "undefined atendimento".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const PosteRepository = require('../../src/infrastructure/repositories/PosteRepository');

function txFalso() {
  const consultas = [];
  return { consultas, query: async (sql, valores) => { consultas.push({ sql, valores }); return { rows: [] }; } };
}

test('PL-01 [caixa-branca] listarTodos conta os chamados do poste e traz a data do último, com e sem filtro de bairro', async () => {
  for (const bairro of ['', 'Centro']) {
    const tx = txFalso();
    await PosteRepository.listarTodos(bairro, tx);
    const { sql } = tx.consultas[0];
    assert.match(sql, /COUNT\(\*\)[\s\S]*FROM chamados c[\s\S]*c\.poste_id = p\.id[\s\S]*AS qtd/, `bairro "${bairro}"`);
    assert.match(sql, /MAX\(c\.criado_em\)[\s\S]*AS data_ult/, `bairro "${bairro}"`);
    assert.match(sql, /ORDER BY p\.id ASC/);
  }
});
