/**
 * CAMADA DE DOMÍNIO — Chamado
 * Regras de negócio puras para abertura e ciclo de vida de chamados.
 * Não importa nada de banco de dados (pg), rede ou HTTP (express).
 */

const STATUS_VALIDOS = Object.freeze(['aberto', 'em_atendimento', 'fechado', 'cancelado']);
const STATUS_FECHAVEIS = Object.freeze(['aberto', 'em_atendimento']);
// Tipos de problema do passo 3 do UC01, com os mesmos códigos enviados pelo app do cidadão.
const TIPOS_VALIDOS = Object.freeze([
  'apagado',
  'queimada',
  'piscando',
  'aceso_dia',
  'quebrado',
  'outro'
]);

/**
 * Verifica se o chamado pode receber fechamento (baixa técnica ou administrativa).
 * Evita que dois técnicos fechem o mesmo chamado silenciosamente.
 */
function podeFechar(chamado) {
  if (!chamado || typeof chamado.status !== 'string') return false;
  return STATUS_FECHAVEIS.includes(chamado.status);
}

/**
 * Valida se as coordenadas geográficas são reais e válidas (rejeita 0,0 / NaN / fora do globo).
 */
function coordenadasValidas(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return false;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false;
  if (la < -90 || la > 90) return false;
  if (ln < -180 || ln > 180) return false;
  return true;
}

/**
 * Valida os dados de entrada de um novo chamado do cidadão.
 * Se vier de um QR Code de poste (`poste_id`), as coordenadas podem vir do cadastro do poste.
 */
function validarNovoChamado(dados = {}) {
  const erros = [];

  if (!dados.id || typeof dados.id !== 'string') {
    erros.push('Identificador único (id) do chamado é obrigatório para idempotência.');
  }
  if (!dados.protocolo || typeof dados.protocolo !== 'string') {
    erros.push('Protocolo do chamado é obrigatório.');
  }
  if (!dados.tipo || typeof dados.tipo !== 'string' || !dados.tipo.trim()) {
    erros.push('Tipo de defeito é obrigatório.');
  } else if (!TIPOS_VALIDOS.includes(dados.tipo)) {
    erros.push(`Tipo de defeito não reconhecido: ${dados.tipo}.`);
  }

  const temPosteId = Boolean(dados.poste_id && String(dados.poste_id).trim());
  const temGps = coordenadasValidas(dados.lat ?? dados.latitude, dados.lng ?? dados.longitude);

  if (!temPosteId && !temGps) {
    erros.push('Localização GPS válida ou identificação do poste (QR) é obrigatória.');
  }

  const foto = dados.foto_base64 || dados.fotoUrl;
  if (!foto || typeof foto !== 'string' || !foto.trim()) {
    erros.push('Foto do poste é obrigatória.');
  }

  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  STATUS_VALIDOS,
  STATUS_FECHAVEIS,
  TIPOS_VALIDOS,
  podeFechar,
  coordenadasValidas,
  validarNovoChamado
};
