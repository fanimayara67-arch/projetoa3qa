/**
 * CAMADA DE APRESENTAÇÃO — Tentativa View
 * Formata a tentativa (com dados do chamado) para o relatório de tentativas do PWA.
 */

function formatarTentativa(t) {
  if (!t) return null;
  return {
    id: t.id,
    protocolo: t.protocolo,
    tipo: t.tipo,
    statusChamado: t.chamado_status,
    endereco: t.endereco || t.descricao || '',
    motivo: t.motivo,
    lat: t.latitude != null ? Number(t.latitude) : null,
    lng: t.longitude != null ? Number(t.longitude) : null,
    fotoUrl: t.foto_url || null,
    fotoDefeitoUrl: t.chamado_foto_url || null,
    tecnico: t.tecnico_nome || null,
    criadoEm: t.criado_em
  };
}

module.exports = formatarTentativa;
