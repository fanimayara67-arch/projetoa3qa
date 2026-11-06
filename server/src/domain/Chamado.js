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

const LIMITE_DESCRICAO = 500; // UC01, passo 5
const LIMITE_FOTO_BYTES = 2 * 1024 * 1024; // RNF02: imagem comprimida para no máximo 2 MB

/**
 * Tamanho, em bytes, da imagem enviada em Base64 (com ou sem o prefixo `data:`).
 * Uma foto que já é URL (enviada antes) não tem conteúdo a medir e conta como 0.
 */
function tamanhoFotoBytes(foto) {
  if (/^https?:\/\//i.test(foto) || foto.startsWith('/uploads/')) return 0;
  const base64 = foto.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const preenchimento = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - preenchimento;
}

/**
 * Verifica se o chamado pode receber fechamento (baixa técnica ou administrativa).
 * Evita que dois técnicos fechem o mesmo chamado silenciosamente.
 */
function podeFechar(chamado) {
  if (!chamado || typeof chamado.status !== 'string') return false;
  return STATUS_FECHAVEIS.includes(chamado.status);
}

/** Converte para número; vazio ou ausente vira NaN (inválido). */
function paraNumero(valor) {
  if (valor == null || valor === '') return NaN;
  return Number(valor);
}

/**
 * Valida se as coordenadas geográficas são reais e válidas (rejeita 0,0 / NaN / fora do globo).
 */
function coordenadasValidas(lat, lng) {
  const la = paraNumero(lat);
  const ln = paraNumero(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  const pontoZero = Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001;
  return !pontoZero && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
}

/* Regras do novo chamado (UC01). Cada uma devolve a lista de erros que encontrou. */

function validarIdentificacao(dados) {
  const erros = [];
  if (typeof dados.id !== 'string' || !dados.id) {
    erros.push('Identificador único (id) do chamado é obrigatório para idempotência.');
  }
  if (typeof dados.protocolo !== 'string' || !dados.protocolo) {
    erros.push('Protocolo do chamado é obrigatório.');
  }
  return erros;
}

function validarTipo({ tipo }) {
  if (typeof tipo !== 'string' || !tipo.trim()) return ['Tipo de defeito é obrigatório.'];
  if (!TIPOS_VALIDOS.includes(tipo)) return [`Tipo de defeito não reconhecido: ${tipo}.`];
  return [];
}

/** Se vier de um QR Code de poste (`poste_id`), as coordenadas podem vir do cadastro do poste. */
function validarLocalizacao(dados) {
  const temPosteId = Boolean(dados.poste_id && String(dados.poste_id).trim());
  const temGps = coordenadasValidas(dados.lat ?? dados.latitude, dados.lng ?? dados.longitude);
  if (temPosteId || temGps) return [];
  return ['Localização GPS válida ou identificação do poste (QR) é obrigatória.'];
}

function validarDescricao({ descricao }) {
  if (descricao == null) return [];
  if (String(descricao).trim().length <= LIMITE_DESCRICAO) return [];
  return [`A descrição pode ter no máximo ${LIMITE_DESCRICAO} caracteres.`];
}

function validarFoto(dados) {
  const foto = dados.foto_base64 || dados.fotoUrl;
  if (typeof foto !== 'string' || !foto.trim()) return ['Foto do poste é obrigatória.'];
  if (tamanhoFotoBytes(foto) > LIMITE_FOTO_BYTES) return ['A foto pode ter no máximo 2 MB.'];
  return [];
}

const REGRAS_NOVO_CHAMADO = [validarIdentificacao, validarTipo, validarLocalizacao, validarDescricao, validarFoto];

/**
 * Valida os dados de entrada de um novo chamado do cidadão, aplicando todas as regras do UC01.
 */
function validarNovoChamado(dados) {
  const entrada = dados || {};
  const erros = REGRAS_NOVO_CHAMADO.flatMap(regra => regra(entrada));
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
