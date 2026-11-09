/**
 * CAMADA DE DOMÍNIO (TÉCNICO) — Ticket.js
 * Regras puras para chamados no painel técnico, normalização de coordenadas e filtro de status.
 */

export function normalizarCoordenada(valor, tipo = 'lat') {
  if (typeof valor !== 'number' && (typeof valor !== 'string' || !valor.trim())) return NaN;
  const n = typeof valor === 'string' ? Number(valor.trim().replace(',', '.')) : valor;
  const limite = tipo === 'lng' ? 180 : 90;
  return Number.isFinite(n) && Math.abs(n) <= limite ? n : NaN;
}

export function coordenadasValidas(lat, lng) {
  const latitude = normalizarCoordenada(lat);
  const longitude = normalizarCoordenada(lng, 'lng');
  return Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0);
}

export function chamadoEstaAberto(ticket) {
  if (!ticket) return false;
  const st = String(ticket.status || '').toLowerCase();
  return st === 'aberto' || st === 'em_atendimento' || st === 'aguardando atendimento';
}

export function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (g) => (g * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

const ROTULOS_TIPO = Object.freeze({
  apagado: 'Poste apagado',
  piscando: 'Luz piscando',
  aceso_dia: 'Aceso durante o dia',
  quebrado: 'Luminária quebrada',
  fios_soltos: 'Fios soltos',
  outro: 'Outro problema'
});

/** Converte o código do tipo de defeito (ex.: 'aceso_dia') no texto exibido ao usuário. */
export function rotuloTipo(tipo) {
  const chave = String(tipo || '').trim();
  return ROTULOS_TIPO[chave] || chave || 'Não informado';
}

const ROTULOS_STATUS = Object.freeze({
  aberto: 'Aguardando atendimento',
  em_atendimento: 'Em atendimento',
  fechado: 'Concluído',
  cancelado: 'Cancelado'
});

/** Converte o status do chamado no banco (ex.: 'em_atendimento') no texto exibido ao usuário. */
export function rotuloStatusChamado(status) {
  const chave = String(status || '').trim();
  return ROTULOS_STATUS[chave] || chave || 'Aguardando atendimento';
}
