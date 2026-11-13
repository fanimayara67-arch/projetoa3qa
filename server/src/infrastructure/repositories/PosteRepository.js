/**
 * CAMADA DE PERSISTÊNCIA / INFRAESTRUTURA — PosteRepository
 * Consultas e atualizações cadastrais/técnicas dos postes (MySQL).
 */

const pool = require('../database/pool');

async function buscarPorId(posteId, tx = pool) {
  const { rows } = await tx.query('SELECT * FROM postes WHERE id = ?', [posteId]);
  return rows[0] || null;
}

/**
 * Cria o poste se ainda não existir; se já existir, não altera nada. Devolve a linha do poste.
 */
async function garantirExistencia(tx = pool, posteId, dadosIniciais = {}) {
  await tx.query(
    `INSERT INTO postes (id, endereco, latitude, longitude, atualizado_em)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE id = id`,
    [
      posteId,
      dadosIniciais.endereco || null,
      dadosIniciais.latitude ?? null,
      dadosIniciais.longitude ?? null
    ]
  );
  return buscarPorId(posteId, tx);
}

async function buscarChamadoAbertoNoPoste(posteId, tx = pool) {
  const { rows } = await tx.query(
    `SELECT protocolo, tipo, descricao, criado_em
     FROM chamados
     WHERE poste_id = ? AND status IN ('aberto', 'em_atendimento')
     ORDER BY criado_em DESC
     LIMIT 1`,
    [posteId]
  );
  return rows[0] || null;
}

async function listarHistoricoDoPoste(posteId, tx = pool) {
  const { rows } = await tx.query(
    `SELECT
       c.protocolo, c.tipo, c.status, c.descricao, c.criado_em, c.foto_url,
       f.servico, f.data_fechamento, f.foto_url AS foto_reparo_url,
       u.nome AS tecnico
     FROM chamados c
     LEFT JOIN fechamentos f ON f.chamado_id = c.id
     LEFT JOIN usuarios u ON u.id = f.tecnico_id
     WHERE c.poste_id = ?
     ORDER BY c.criado_em DESC`,
    [posteId]
  );
  return rows;
}

/**
 * Cria ou atualiza a ficha técnica do poste. Campos não informados (null) mantêm o valor já salvo.
 */
async function atualizarConfiguracao(tx = pool, posteId, config = {}) {
  if (!posteId) return null;
  await tx.query(
    `INSERT INTO postes (
       id, codigo, bairro, rua, referencia, endereco, latitude, longitude,
       braco, luminaria, reator, fotosensor, porta_fusivel, fusivel, cabo, conector,
       foto_ref_url, obs, atualizado_em
     )
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW()) AS novo
     ON DUPLICATE KEY UPDATE
       codigo        = COALESCE(novo.codigo, postes.codigo),
       bairro        = COALESCE(novo.bairro, postes.bairro),
       rua           = COALESCE(novo.rua, postes.rua),
       referencia    = COALESCE(novo.referencia, postes.referencia),
       endereco      = COALESCE(novo.endereco, postes.endereco),
       latitude      = COALESCE(novo.latitude, postes.latitude),
       longitude     = COALESCE(novo.longitude, postes.longitude),
       braco         = COALESCE(novo.braco, postes.braco),
       luminaria     = COALESCE(novo.luminaria, postes.luminaria),
       reator        = COALESCE(novo.reator, postes.reator),
       fotosensor    = COALESCE(novo.fotosensor, postes.fotosensor),
       porta_fusivel = COALESCE(novo.porta_fusivel, postes.porta_fusivel),
       fusivel       = COALESCE(novo.fusivel, postes.fusivel),
       cabo          = COALESCE(novo.cabo, postes.cabo),
       conector      = COALESCE(novo.conector, postes.conector),
       foto_ref_url  = COALESCE(novo.foto_ref_url, postes.foto_ref_url),
       obs           = COALESCE(novo.obs, postes.obs),
       atualizado_em = NOW()`,
    [
      posteId,
      config.codigo || null,
      config.bairro || null,
      config.rua || null,
      config.referencia || null,
      config.endereco || null,
      config.latitude ?? null,
      config.longitude ?? null,
      config.braco || null,
      config.luminaria || null,
      config.reator || null,
      config.fotosensor || null,
      config.porta_fusivel || null,
      config.fusivel || null,
      config.cabo || null,
      config.conector || null,
      config.foto_ref_url || null,
      config.obs || null
    ]
  );
  return buscarPorId(posteId, tx);
}

async function listarTodos(filtroBairro = '', tx = pool) {
  if (filtroBairro && filtroBairro.trim()) {
    // A collation da tabela (utf8mb4_0900_ai_ci) já ignora maiúsculas e acentos, como o ILIKE fazia.
    const { rows } = await tx.query(
      'SELECT * FROM postes WHERE bairro LIKE ? ORDER BY id ASC',
      [`%${filtroBairro.trim()}%`]
    );
    return rows;
  }
  const { rows } = await tx.query('SELECT * FROM postes ORDER BY id ASC');
  return rows;
}

module.exports = {
  buscarPorId,
  garantirExistencia,
  buscarChamadoAbertoNoPoste,
  listarHistoricoDoPoste,
  atualizarConfiguracao,
  listarTodos
};
