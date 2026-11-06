/**
 * CAMADA DE DOMÍNIO (CIDADÃO) — Report.js
 * Entidade pura que representa o reporte do cidadão, suas validações e a máquina
 * de estados da fila offline: `pending` -> `syncing` -> `synced` | `needs_attention`.
 * Sem dependências de DOM, IndexedDB ou fetch.
 */

export const ESTADOS_SYNC = Object.freeze({
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  NEEDS_ATTENTION: 'needs_attention'
});

const BACKOFF_BASE_MS = 30_000;          // 30 segundos
const BACKOFF_MAX_MS  = 30 * 60_000;     // 30 minutos

export function gerarUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function gerarProtocolo(dataRef = new Date()) {
  const ymd = `${dataRef.getFullYear().toString().slice(-2)}${String(dataRef.getMonth() + 1).padStart(2, '0')}${String(dataRef.getDate()).padStart(2, '0')}`;
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `IC-${ymd}-${rnd}`;
}

/**
 * Cria um objeto Report imutável na origem com `id` estável (UUID) para envio idempotente.
 */
export function criarReport({
  id = gerarUuid(),
  protocolo = gerarProtocolo(),
  timestamp = new Date().toISOString(),
  tipo,
  gps,
  foto,
  descricao = '',
  nome = '',
  tel = '',
  endereco = '',
  userAgent = ''
} = {}) {
  return {
    id,
    protocolo,
    timestamp,
    tipo: tipo || null,
    lat: gps && gps.lat != null ? Number(gps.lat) : null,
    lng: gps && gps.lng != null ? Number(gps.lng) : null,
    acc: gps && gps.acc != null ? Math.round(Number(gps.acc)) : null,
    foto_base64: foto || null,
    descricao: String(descricao || '').trim(),
    nome: String(nome || '').trim(),
    tel: String(tel || '').trim(),
    endereco: String(endereco || '').trim(),
    user_agent: String(userAgent || '').slice(0, 180),
    sync: {
      estado: ESTADOS_SYNC.PENDING,
      attempts: 0,
      lastError: null,
      nextRetryAt: null
    }
  };
}

/**
 * Valida o reporte antes do salvamento local.
 * Regra crítica: nunca inventa coordenadas caso o GPS falhe.
 */
export function validarReport(report) {
  const erros = [];
  if (!report || typeof report !== 'object') {
    return ['Dados do reporte inválidos.'];
  }
  if (!report.tipo) {
    erros.push('Escolha o tipo de defeito no poste.');
  }
  const temCoordenadas =
    report.lat !== null &&
    report.lng !== null &&
    Number.isFinite(report.lat) &&
    Number.isFinite(report.lng) &&
    !(Math.abs(report.lat) < 0.0001 && Math.abs(report.lng) < 0.0001);

  if (!temCoordenadas) {
    erros.push('Localização GPS não registrada. Capture o GPS antes de enviar.');
  }
  if (!report.foto_base64) {
    erros.push('Tire uma foto do poste para enviar o reporte.');
  }
  return erros;
}

/**
 * Calcula o tempo de espera do Exponential Backoff: min(2^attempts * 30s, 30min)
 */
export function calcularBackoffMs(attempts = 0) {
  const exp = Math.max(0, Number(attempts) || 0);
  return Math.min((2 ** exp) * BACKOFF_BASE_MS, BACKOFF_MAX_MS);
}
