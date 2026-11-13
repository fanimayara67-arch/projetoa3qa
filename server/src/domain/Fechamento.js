/**
 * CAMADA DE DOMÍNIO — Fechamento
 * Regras puras para validação de baixa em campo (técnico) e baixa administrativa (gestor).
 */

const { coordenadasValidas } = require('./Chamado');

/**
 * Cerca geográfica do fechamento (fluxo A4 do UC05). É a mesma da tela do técnico
 * (buildValidMapsUrl): Nordeste do Brasil, com margem. Fora dela o GPS deu falso positivo.
 */
const REGIAO = Object.freeze({ latMin: -20, latMax: -2, lngMin: -50, lngMax: -33 });

/** Precisão máxima do GPS do técnico, em metros (passo 6 do UC05). */
const PRECISAO_MAXIMA_M = 100;

/** Status de resolução do passo 3 do UC05 (mesmos valores do projeto de banco do grupo). */
const STATUS_CAMPO = Object.freeze(['Concluído', 'Parcialmente resolvido', 'Requer material', 'Ponto não localizado']);

const LIMITE_REFERENCIA = 255;

const textoPreenchido = (valor) => typeof valor === 'string' && valor.trim() !== '';

/* Regras do fechamento em campo (UC05). Cada regra recebe os dados e devolve a lista de erros
   que encontrou; assim cada função fica com poucos caminhos (RNF05: no máximo 10). */

function validarIdentificacao(dados) {
  if (dados.operacao_id && typeof dados.operacao_id === 'string') return [];
  return ['Identificador da operação (operacao_id) é obrigatório para idempotência.'];
}

/** Passo 3: os quatro status de resolução. */
function validarStatus(dados) {
  if (!textoPreenchido(dados.status)) return ['Status de resolução é obrigatório.'];
  if (STATUS_CAMPO.includes(dados.status)) return [];
  return [`Status de resolução inválido. Use: ${STATUS_CAMPO.join(', ')}.`];
}

/** Passo 3: descrição do serviço e referência do local (coluna VARCHAR(255)). */
function validarTextos(dados) {
  const erros = [];
  if (!textoPreenchido(dados.servico)) erros.push('Descrição do serviço executado é obrigatória.');
  if (typeof dados.referencia === 'string' && dados.referencia.length > LIMITE_REFERENCIA) {
    erros.push(`Referência do local deve ter até ${LIMITE_REFERENCIA} caracteres.`);
  }
  return erros;
}

/** Passo 6: foto do reparo (foto nova em Base64 ou URL de foto já enviada). */
function validarFoto(dados) {
  if (textoPreenchido(dados.foto_reparo_base64) || textoPreenchido(dados.fotoUrl)) return [];
  return ['Foto do reparo é obrigatória.'];
}

function dentroDaRegiao(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  return la >= REGIAO.latMin && la <= REGIAO.latMax && ln >= REGIAO.lngMin && ln <= REGIAO.lngMax;
}

function precisaoAceita(precisao) {
  if (precisao === '' || precisao === null || precisao === undefined) return false;
  const p = Number(precisao);
  return Number.isFinite(p) && p >= 0 && p <= PRECISAO_MAXIMA_M;
}

/** Passo 6 e fluxo A4: GPS válido, dentro da região e com precisão de até 100 m. */
function validarLocalizacao(dados) {
  const lat = dados.lat ?? dados.latitude;
  const lng = dados.lng ?? dados.longitude;
  if (!coordenadasValidas(lat, lng)) return ['Localização GPS válida é obrigatória.'];

  const erros = [];
  if (!dentroDaRegiao(lat, lng)) erros.push('Localização fora da região atendida. Recapture o GPS.');
  if (!precisaoAceita(dados.precisao_m ?? dados.acc)) {
    erros.push(`Precisão do GPS deve ser informada e ser de até ${PRECISAO_MAXIMA_M} m.`);
  }
  return erros;
}

/** A data é opcional (sem ela vale a hora do servidor); se vier, precisa estar no formato ISO.
    A tela antiga mandava "13/11/2026, 10:30", que o MySQL recusa com erro interno. */
function validarData(dados) {
  const data = dados.data_fechamento;
  if (data === undefined || data === null || data === '') return [];
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(data) && !Number.isNaN(Date.parse(data))) return [];
  return ['Data do fechamento inválida (use o formato ISO, ex.: 2026-11-13T12:00:00.000Z).'];
}

function errosDoMaterial(mat) {
  if (!mat || typeof mat !== 'object') return ['Material da OS em formato inválido.'];
  const erros = [];
  if (!mat.nome && !mat.item_id) erros.push('Todo material utilizado deve identificar o item.');
  const qtd = Number(mat.quantidade);
  if (qtd <= 0 || !Number.isFinite(qtd)) erros.push(`Quantidade inválida para o material ${mat.nome || mat.item_id}.`);
  return erros;
}

/** Passo 4 e CA04: cada material precisa identificar o item e ter quantidade positiva. */
function validarMateriais(dados) {
  if (!Array.isArray(dados.materiais_os)) return [];
  return dados.materiais_os.flatMap(errosDoMaterial);
}

const REGRAS_FECHAMENTO_CAMPO = [
  validarIdentificacao,
  validarStatus,
  validarTextos,
  validarFoto,
  validarLocalizacao,
  validarData,
  validarMateriais
];

/**
 * Valida os dados obrigatórios para fechar um chamado em campo (UC05).
 * Corpo nulo (ex.: JSON "null") é tratado como vazio, igual ao fechamento administrativo.
 */
function validarFechamentoCampo(dados) {
  const d = dados || {};
  const erros = REGRAS_FECHAMENTO_CAMPO.flatMap((regra) => regra(d));
  return {
    valido: erros.length === 0,
    erros
  };
}

/**
 * Valida os dados obrigatórios para fechamento administrativo pelo gestor.
 */
const STATUS_ADMINISTRATIVOS = ['Concluído', 'Parcialmente resolvido', 'Ponto não localizado'];

function normalizarFechamentoAdmin(dados = {}) {
  const texto = valor => typeof valor === 'string' ? valor.trim() : '';
  return {
    operacao_id: texto(dados?.operacao_id).toLowerCase(),
    informante: texto(dados?.informante),
    justificativa: texto(dados?.justificativa),
    status: dados?.status === undefined ? 'Concluído' : texto(dados.status)
  };
}

function validarFechamentoAdmin(dados = {}) {
  const erros = [];
  const limpos = normalizarFechamentoAdmin(dados);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(limpos.operacao_id)) {
    erros.push('Identificador da operação (operacao_id) deve ser um UUID válido.');
  }
  if (!limpos.informante || limpos.informante.length > 120) {
    erros.push('Nome do informante/responsável é obrigatório e deve ter até 120 caracteres.');
  }
  if (limpos.justificativa.length < 10) {
    erros.push('Justificativa deve ter pelo menos 10 caracteres.');
  }
  if (!STATUS_ADMINISTRATIVOS.includes(limpos.status)) {
    erros.push('Status final inválido para fechamento administrativo.');
  }

  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  STATUS_CAMPO,
  REGIAO,
  PRECISAO_MAXIMA_M,
  validarFechamentoCampo,
  validarFechamentoAdmin,
  normalizarFechamentoAdmin
};
