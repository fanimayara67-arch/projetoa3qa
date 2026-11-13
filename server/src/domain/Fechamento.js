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

const textoPreenchido = (valor) => typeof valor === 'string' && valor.trim() !== '';

/**
 * Valida os dados obrigatórios para fechar um chamado em campo.
 */
function validarFechamentoCampo(dados) {
  // Corpo nulo (ex.: JSON "null") é tratado como vazio, igual ao fechamento administrativo.
  dados = dados || {};
  const erros = [];

  if (!dados.operacao_id || typeof dados.operacao_id !== 'string') {
    erros.push('Identificador da operação (operacao_id) é obrigatório para idempotência.');
  }
  if (!dados.status || typeof dados.status !== 'string' || !dados.status.trim()) {
    erros.push('Status de resolução é obrigatório.');
  } else if (!STATUS_CAMPO.includes(dados.status)) {
    erros.push(`Status de resolução inválido. Use: ${STATUS_CAMPO.join(', ')}.`);
  }
  if (!dados.servico || typeof dados.servico !== 'string' || !dados.servico.trim()) {
    erros.push('Descrição do serviço executado é obrigatória.');
  }
  // Passo 6 do UC05: a foto do reparo é obrigatória (foto nova em Base64 ou URL de foto já enviada).
  if (!textoPreenchido(dados.foto_reparo_base64) && !textoPreenchido(dados.fotoUrl)) {
    erros.push('Foto do reparo é obrigatória.');
  }
  erros.push(...errosDeLocalizacao(dados));
  // A data é opcional (sem ela vale a hora do servidor), mas se vier precisa ser uma data ISO válida.
  // A tela antiga mandava "13/11/2026, 10:30", que o MySQL recusa com erro interno.
  if (dados.data_fechamento !== undefined && dados.data_fechamento !== null && dados.data_fechamento !== ''
      && (typeof dados.data_fechamento !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(dados.data_fechamento)
        || Number.isNaN(Date.parse(dados.data_fechamento)))) {
    erros.push('Data do fechamento inválida (use o formato ISO, ex.: 2026-11-13T12:00:00.000Z).');
  }
  if (Array.isArray(dados.materiais_os)) {
    for (const mat of dados.materiais_os) {
      if (!mat || typeof mat !== 'object') {
        erros.push('Material da OS em formato inválido.');
        continue;
      }
      if (!mat.nome && !mat.item_id) {
        erros.push('Todo material utilizado deve identificar o item.');
      }
      if (Number(mat.quantidade) <= 0 || !Number.isFinite(Number(mat.quantidade))) {
        erros.push(`Quantidade inválida para o material ${mat.nome || mat.item_id}.`);
      }
    }
  }

  return {
    valido: erros.length === 0,
    erros
  };
}

/** Passo 6 e fluxo A4 do UC05: GPS válido, dentro da região e com precisão de até 100 m. */
function errosDeLocalizacao(dados) {
  const lat = dados.lat ?? dados.latitude;
  const lng = dados.lng ?? dados.longitude;
  if (!coordenadasValidas(lat, lng)) return ['Localização GPS válida é obrigatória.'];

  const erros = [];
  const la = Number(lat);
  const ln = Number(lng);
  if (la < REGIAO.latMin || la > REGIAO.latMax || ln < REGIAO.lngMin || ln > REGIAO.lngMax) {
    erros.push('Localização fora da região atendida. Recapture o GPS.');
  }
  const precisao = dados.precisao_m ?? dados.acc;
  const p = precisao === '' || precisao === null || precisao === undefined ? NaN : Number(precisao);
  if (!Number.isFinite(p) || p < 0 || p > PRECISAO_MAXIMA_M) {
    erros.push(`Precisão do GPS deve ser informada e ser de até ${PRECISAO_MAXIMA_M} m.`);
  }
  return erros;
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
