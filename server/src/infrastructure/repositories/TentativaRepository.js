/**
 * CAMADA DE PERSISTÊNCIA / INFRAESTRUTURA — TentativaRepository
 */

const pool = require('../database/pool');

/**
 * Insere a tentativa de forma idempotente (MySQL).
 * Se o celular reenviar a mesma `operacao_id` após timeout, devolve o registro já salvo.
 */
async function inserir(tx = pool, dados) {
  try {
    await tx.query(
      `INSERT INTO tentativas (
         operacao_id, chamado_id, tecnico_id, motivo, latitude, longitude, foto_url
       )
       VALUES (?,?,?,?,?,?,?)`,
      [
        dados.operacaoId,
        dados.chamadoId,
        dados.tecnicoId,
        dados.motivo,
        dados.latitude ?? null,
        dados.longitude ?? null,
        dados.fotoUrl || null
      ]
    );
  } catch (erro) {
    if (erro.code !== 'ER_DUP_ENTRY') throw erro;
  }
  const { rows } = await tx.query('SELECT * FROM tentativas WHERE operacao_id = ?', [dados.operacaoId]);
  return rows[0];
}

async function listar(tx = pool) {
  const { rows } = await tx.query(
    `SELECT t.*, c.protocolo, u.nome AS tecnico_nome
     FROM tentativas t
     JOIN chamados c ON c.id = t.chamado_id
     LEFT JOIN usuarios u ON u.id = t.tecnico_id
     ORDER BY t.criado_em DESC`
  );
  return rows;
}

/**
 * Lista as tentativas com os dados do chamado, para o relatório de tentativas do gestor.
 */
async function listarParaRelatorio(tx = pool) {
  const { rows } = await tx.query(
    `SELECT t.id, t.motivo, t.latitude, t.longitude, t.foto_url, t.criado_em,
            c.protocolo, c.tipo, c.status AS chamado_status, c.endereco, c.descricao,
            c.foto_url AS chamado_foto_url,
            u.nome AS tecnico_nome
       FROM tentativas t
       JOIN chamados c ON c.id = t.chamado_id
       LEFT JOIN usuarios u ON u.id = t.tecnico_id
      ORDER BY t.criado_em ASC
      LIMIT 2000`
  );
  return rows;
}

module.exports = {
  inserir,
  listar,
  listarParaRelatorio
};
