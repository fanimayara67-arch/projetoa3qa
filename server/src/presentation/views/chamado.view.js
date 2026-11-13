/**
 * CAMADA DE APRESENTAÇÃO — Chamado View
 * Sanitiza os campos internos do banco antes de enviar o JSON para o cliente PWA.
 */

function formatarFechamento(c) {
  if (c.fechamento_data === undefined) return null;
  return {
    status: c.fechamento_status || '',
    servico: c.fechamento_servico || '',
    data: c.fechamento_data,
    administrativo: c.fechamento_administrativo === true || c.fechamento_administrativo === 1,
    informante: c.fechamento_informante || null,
    tecnico: c.fechamento_tecnico || null,
    fotoUrl: c.fechamento_foto_url || null
  };
}

function formatarChamado(c) {
  if (!c) return null;
  const fechamento = formatarFechamento(c);
  return {
    ...(fechamento ? { fechamento } : {}),
    id: c.id,
    protocolo: c.protocolo,
    tipo: c.tipo,
    status: c.status,
    lat: c.latitude != null ? Number(c.latitude) : null,
    lng: c.longitude != null ? Number(c.longitude) : null,
    acc: c.precisao_m != null ? Number(c.precisao_m) : null,
    descricao: c.descricao || '',
    endereco: c.endereco || '',
    fotoUrl: c.foto_url || null,
    posteId: c.poste_id || null,
    criadoEm: c.criado_em
  };
}

module.exports = formatarChamado;
