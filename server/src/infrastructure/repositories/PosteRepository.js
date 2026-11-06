/**
 * CAMADA DE PERSISTÊNCIA / INFRAESTRUTURA — PosteRepository
 * Consultas e atualizações cadastrais/técnicas dos postes.
 */

const pool = require('../database/pool');

async function buscarPorId(posteId, tx = pool) {
  const { rows } = await tx.query('SELECT * FROM postes WHERE id = $1', [posteId]);
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
     WHERE c.poste_id = $1
     ORDER BY c.criado_em DESC`,
    [posteId]
  );
  return rows;
}

async function atualizarConfiguracao(tx = pool, posteId, config = {}) {
  if (!posteId) return null;
  const { rows } = await tx.query(
    `INSERT INTO postes (
       id, codigo, bairro, rua, referencia, endereco, latitude, longitude,
       braco, luminaria, reator, fotosensor, porta_fusivel, fusivel, cabo, conector,
       foto_ref_url, obs, atualizado_em
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
     ON CONFLICT (id) DO UPDATE SET
       codigo        = COALESCE(EXCLUDED.codigo, postes.codigo),
       bairro        = COALESCE(EXCLUDED.bairro, postes.bairro),
       rua           = COALESCE(EXCLUDED.rua, postes.rua),
       referencia    = COALESCE(EXCLUDED.referencia, postes.referencia),
       endereco      = COALESCE(EXCLUDED.endereco, postes.endereco),
       latitude      = COALESCE(EXCLUDED.latitude, postes.latitude),
       longitude     = COALESCE(EXCLUDED.longitude, postes.longitude),
       braco         = COALESCE(EXCLUDED.braco, postes.braco),
       luminaria     = COALESCE(EXCLUDED.luminaria, postes.luminaria),
       reator        = COALESCE(EXCLUDED.reator, postes.reator),
       fotosensor    = COALESCE(EXCLUDED.fotosensor, postes.fotosensor),
       porta_fusivel = COALESCE(EXCLUDED.porta_fusivel, postes.porta_fusivel),
       fusivel       = COALESCE(EXCLUDED.fusivel, postes.fusivel),
       cabo          = COALESCE(EXCLUDED.cabo, postes.cabo),
       conector      = COALESCE(EXCLUDED.conector, postes.conector),
       foto_ref_url  = COALESCE(EXCLUDED.foto_ref_url, postes.foto_ref_url),
       obs           = COALESCE(EXCLUDED.obs, postes.obs),
       atualizado_em = now()
     RETURNING *`,
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
  return rows[0];
}

async function listarTodos(filtroBairro = '', tx = pool) {
  if (filtroBairro && filtroBairro.trim()) {
    const { rows } = await tx.query(
      'SELECT * FROM postes WHERE bairro ILIKE $1 ORDER BY id ASC',
      [`%${filtroBairro.trim()}%`]
    );
    return rows;
  }
  const { rows } = await tx.query('SELECT * FROM postes ORDER BY id ASC');
  return rows;
}

module.exports = {
  buscarPorId,
  listarHistoricoDoPoste,
  atualizarConfiguracao,
  listarTodos
};
