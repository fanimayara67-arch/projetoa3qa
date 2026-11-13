/**
 * CAMADA DE PERSISTÊNCIA / INFRAESTRUTURA — EstoqueRepository
 * Operações SQL (MySQL) de estoque, baixa de materiais em fechamento e controle de missões.
 */

const pool = require('../database/pool');
const { Conflito, NaoEncontrado } = require('../../application/errors');

const ehId = valor => /^\d+$/.test(String(valor));

async function listarItens(tx = pool) {
  const { rows } = await tx.query('SELECT * FROM itens_estoque ORDER BY nome ASC');
  return rows;
}

/**
 * Cria o item ou atualiza o existente com o mesmo nome (upsert) e devolve a linha salva.
 */
async function salvarItem(dados, tx = pool) {
  const nome = dados.nome.trim();
  await tx.query(
    `INSERT INTO itens_estoque (nome, unidade, saldo, minimo, atualizado_em)
     VALUES (?, ?, ?, ?, NOW()) AS novo
     ON DUPLICATE KEY UPDATE
       unidade       = novo.unidade,
       saldo         = novo.saldo,
       minimo        = novo.minimo,
       atualizado_em = NOW()`,
    [nome, dados.unidade || 'un', Number(dados.saldo || 0), Number(dados.minimo || 0)]
  );
  const { rows } = await tx.query('SELECT * FROM itens_estoque WHERE nome = ?', [nome]);
  return rows[0];
}

/**
 * Remove o item (por id numérico ou por nome) e devolve a linha removida, ou null se não existir.
 */
async function removerItem(nomeOuId, tx = pool) {
  const coluna = ehId(nomeOuId) ? 'id' : 'nome';
  const { rows } = await tx.query(`SELECT * FROM itens_estoque WHERE ${coluna} = ?`, [nomeOuId]);
  const item = rows[0];
  if (!item) return null;
  await tx.query('DELETE FROM itens_estoque WHERE id = ?', [item.id]);
  return item;
}

/** Busca o item travando a linha até o fim da transação (evita duas baixas simultâneas do mesmo saldo). */
async function buscarItemParaAtualizar(tx, itemId, nome) {
  const { rows } = itemId
    ? await tx.query('SELECT * FROM itens_estoque WHERE id = ? FOR UPDATE', [itemId])
    : await tx.query('SELECT * FROM itens_estoque WHERE nome = ? FOR UPDATE', [nome]);
  return rows[0] || null;
}

async function debitarSaldo(tx, itemId, quantidade) {
  await tx.query(
    'UPDATE itens_estoque SET saldo = saldo - ?, atualizado_em = NOW() WHERE id = ?',
    [quantidade, itemId]
  );
}

/**
 * Debita materiais utilizados no fechamento de um chamado dentro da mesma transação ACID.
 * Usa `SELECT ... FOR UPDATE` no item do estoque e valida saldo antes de debitar.
 */
async function baixarMateriais(tx, fechamentoId, materiais = []) {
  if (!Array.isArray(materiais) || materiais.length === 0) return [];

  // Soma as quantidades por item do almoxarifado antes de conferir o saldo. Assim, o mesmo item
  // listado duas vezes (ou uma vez pelo id e outra pelo nome) é abatido e registrado na OS com o
  // mesmo total (CA04). Antes, o estoque abatia a soma e a OS guardava só a última quantidade.
  const totais = new Map();
  for (const mat of materiais) {
    const qtd = Number(mat && mat.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) continue;

    const item = await buscarItemParaAtualizar(tx, mat.item_id, mat.nome);
    if (!item) {
      throw new NaoEncontrado(`Material '${mat.item_id || mat.nome}' não encontrado no almoxarifado.`);
    }
    const total = totais.get(item.id) || { item, quantidade: 0 };
    total.quantidade += qtd;
    totais.set(item.id, total);
  }

  const baixados = [];
  for (const { item, quantidade } of totais.values()) {
    if (Number(item.saldo) < quantidade) {
      throw new Conflito(
        `Saldo insuficiente para '${item.nome}': disponível ${item.saldo} ${item.unidade}, solicitado ${quantidade}.`
      );
    }
    await debitarSaldo(tx, item.id, quantidade);
    await tx.query(
      `INSERT INTO fechamento_materiais (fechamento_id, item_id, quantidade)
       VALUES (?, ?, ?) AS novo
       ON DUPLICATE KEY UPDATE quantidade = novo.quantidade`,
      [fechamentoId, item.id, quantidade]
    );
    baixados.push({ item_id: item.id, nome: item.nome, quantidade });
  }

  return baixados;
}

async function criarMissaoComItens(tx, { data, equipe, obs, criadoPor, itens }) {
  const { rows: resultado } = await tx.query(
    'INSERT INTO missoes (data, equipe, obs, criado_por) VALUES (?, ?, ?, ?)',
    [data, equipe, obs || null, criadoPor || null]
  );
  const { rows: missaoRows } = await tx.query('SELECT * FROM missoes WHERE id = ?', [resultado.insertId]);
  const missao = missaoRows[0];

  for (const it of itens) {
    const qtd = Number(it.qtd_saida);
    const chave = it.item_id || it.nome;
    const item = await buscarItemParaAtualizar(tx, it.item_id, it.nome);
    if (!item) throw new NaoEncontrado(`Item '${chave}' não encontrado no estoque.`);
    if (Number(item.saldo) < qtd) {
      throw new Conflito(`Saldo insuficiente para '${item.nome}' na saída de missão.`);
    }

    await debitarSaldo(tx, item.id, qtd);
    await tx.query(
      'INSERT INTO missao_itens (missao_id, item_id, qtd_saida) VALUES (?, ?, ?)',
      [missao.id, item.id, qtd]
    );
  }

  return missao;
}

/**
 * Lista as missões com seus itens agregados em um array JSON (`itens`).
 */
async function listarMissoes(tx = pool) {
  const { rows } = await tx.query(
    `SELECT m.*,
       COALESCE(
         (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                   'item_id', mi.item_id,
                   'nome', ie.nome,
                   'unidade', ie.unidade,
                   'qtd_saida', mi.qtd_saida,
                   'qtd_retorno', mi.qtd_retorno
                 ))
            FROM missao_itens mi
            JOIN itens_estoque ie ON ie.id = mi.item_id
           WHERE mi.missao_id = m.id),
         JSON_ARRAY()
       ) AS itens
     FROM missoes m
     ORDER BY m.data DESC, m.id DESC`
  );
  // mysql2 já converte colunas JSON; o fallback cobre drivers que devolvem texto.
  return rows.map(m => ({ ...m, itens: typeof m.itens === 'string' ? JSON.parse(m.itens) : (m.itens || []) }));
}

module.exports = {
  listarItens,
  salvarItem,
  removerItem,
  baixarMateriais,
  criarMissaoComItens,
  listarMissoes
};
