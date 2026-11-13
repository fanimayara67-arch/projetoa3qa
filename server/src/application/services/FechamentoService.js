/**
 * CAMADA DE APLICAÇÃO — FechamentoService
 * Orquestra o fechamento de chamados em uma única transação ACID com bloqueio pessimista
 * (`SELECT ... FOR UPDATE`), baixa automática de materiais no almoxarifado e atualização do poste.
 */

const { emTransacao: defaultEmTransacao } = require('../../infrastructure/database/transacao');
const ChamadoRepoDefault = require('../../infrastructure/repositories/ChamadoRepository');
const FechamentoRepoDefault = require('../../infrastructure/repositories/FechamentoRepository');
const EstoqueRepoDefault = require('../../infrastructure/repositories/EstoqueRepository');
const PosteRepoDefault = require('../../infrastructure/repositories/PosteRepository');
const FotoStorageDefault = require('../../infrastructure/storage/FotoStorage');
const Chamado = require('../../domain/Chamado');
const Fechamento = require('../../domain/Fechamento');
const Poste = require('../../domain/Poste');
const { NaoEncontrado, Conflito, DadoInvalido } = require('../errors');

/**
 * Fecha um chamado em campo garantindo:
 * 1. Idempotência por `operacao_id` (se o celular reenviar após timeout, retorna a baixa existente).
 * 2. Bloqueio de linha (`SELECT ... FOR UPDATE`) para evitar que dois técnicos fechem o mesmo chamado.
 * 3. Baixa atômica no estoque (`EstoqueRepo.baixarMateriais`) e atualização técnica do poste.
 */
async function fecharChamado({ protocolo, tecnicoId, dados }, deps = {}) {
  const emTransacao = deps.emTransacao || defaultEmTransacao;
  const ChamadoRepo = deps.ChamadoRepo || ChamadoRepoDefault;
  const FechamentoRepo = deps.FechamentoRepo || FechamentoRepoDefault;
  const EstoqueRepo = deps.EstoqueRepo || EstoqueRepoDefault;
  const PosteRepo = deps.PosteRepo || PosteRepoDefault;
  const FotoStorage = deps.FotoStorage || FotoStorageDefault;

  const validacao = Fechamento.validarFechamentoCampo(dados);
  if (!validacao.valido) {
    throw new DadoInvalido(validacao.erros.join(' '), validacao.erros);
  }

  const fotoUrl = await FotoStorage.salvar(dados.foto_reparo_base64 || dados.fotoUrl);

  return emTransacao(async (tx) => {
    // 1. Trava o registro do chamado no banco durante a transação
    const chamado = await ChamadoRepo.buscarParaAtualizar(tx, protocolo);
    if (!chamado) throw new NaoEncontrado('Chamado não existe.');

    // 2. Idempotência: reenvio da mesma operação devolve o fechamento já gravado (sem debitar 2x)
    const existente = await buscarOperacaoDoChamado(FechamentoRepo, tx, dados.operacao_id, chamado);
    if (existente) return existente;

    if (!Chamado.podeFechar(chamado)) {
      throw new Conflito('Chamado já foi fechado por outro técnico.');
    }

    // 3. Atualiza a ficha técnica do poste (se identificado)
    const posteIdFinal = Poste.normalizarPosteId(dados.poste_id || chamado.poste_id);
    if (posteIdFinal) {
      await PosteRepo.atualizarConfiguracao(tx, posteIdFinal, configuracaoDoPoste(dados, fotoUrl));
    }

    // 4. Insere o registro de fechamento
    const fechamento = await FechamentoRepo.inserir(tx, montarRegistroFechamento(dados, chamado, tecnicoId, fotoUrl));

    // 5. Debita os materiais utilizados no estoque (reverte toda a transação se faltar saldo)
    await EstoqueRepo.baixarMateriais(tx, fechamento.id, dados.materiais_os || []);

    // 6. Muda o status do chamado para 'fechado'
    await ChamadoRepo.mudarStatus(tx, chamado.id, 'fechado', posteIdFinal || null);

    return fechamento;
  });
}

/**
 * Devolve o fechamento já gravado com esta operação, se houver. A mesma operação em outro
 * chamado é conflito: devolvê-la como sucesso deixaria o segundo chamado aberto sem aviso.
 */
async function buscarOperacaoDoChamado(FechamentoRepo, tx, operacaoId, chamado) {
  const existente = await FechamentoRepo.buscarPorOperacaoId(tx, operacaoId);
  if (existente && String(existente.chamado_id) !== String(chamado.id)) {
    throw new Conflito('Identificador da operação já usado em outro chamado. Reabra o formulário.');
  }
  return existente;
}

/** Configuração do poste (passo 4) com o GPS do técnico e a foto do reparo. O GPS é obrigatório (passo 6). */
function configuracaoDoPoste(dados, fotoUrl) {
  return {
    ...(dados.config || {}),
    latitude: dados.lat ?? dados.latitude,
    longitude: dados.lng ?? dados.longitude,
    foto_ref_url: fotoUrl || undefined
  };
}

function montarRegistroFechamento(dados, chamado, tecnicoId, fotoUrl) {
  return {
    operacaoId: dados.operacao_id,
    chamadoId: chamado.id,
    tecnicoId,
    status: dados.status,
    servico: dados.servico,
    referencia: dados.referencia,
    latitude: dados.lat ?? dados.latitude,
    longitude: dados.lng ?? dados.longitude,
    fotoUrl,
    administrativo: false,
    dataFechamento: dados.data_fechamento || new Date().toISOString()
  };
}

/**
 * Fechamento administrativo executado pelo gestor (sem baixa de materiais em campo).
 */
async function fecharChamadoAdmin({ protocolo, gestorId, dados }, deps = {}) {
  const emTransacao = deps.emTransacao || defaultEmTransacao;
  const ChamadoRepo = deps.ChamadoRepo || ChamadoRepoDefault;
  const FechamentoRepo = deps.FechamentoRepo || FechamentoRepoDefault;

  const validacao = Fechamento.validarFechamentoAdmin(dados);
  if (!validacao.valido) {
    throw new DadoInvalido(validacao.erros.join(' '), validacao.erros);
  }

  return emTransacao(async (tx) => {
    // A trava vem antes da consulta da operação, inclusive nos reenvios simultâneos.
    dados = Fechamento.normalizarFechamentoAdmin(dados);
    const chamado = await ChamadoRepo.buscarParaAtualizar(tx, protocolo);
    if (!chamado) throw new NaoEncontrado('Chamado não existe.');

    const existente = await FechamentoRepo.buscarPorOperacaoId(tx, dados.operacao_id);
    if (existente) {
      const mesmaOperacao = String(existente.chamado_id) === String(chamado.id)
        && String(existente.tecnico_id) === String(gestorId)
        && (existente.administrativo === true || existente.administrativo === 1)
        && existente.informante === dados.informante
        && existente.justificativa === dados.justificativa
        && existente.status === dados.status;
      if (!mesmaOperacao) throw new Conflito('Identificador da operação já utilizado com outros dados. Reabra o formulário.');
      return existente;
    }

    if (!Chamado.podeFechar(chamado)) {
      throw new Conflito('Chamado já foi fechado.');
    }

    const fechamento = await FechamentoRepo.inserir(tx, {
      operacaoId: dados.operacao_id,
      chamadoId: chamado.id,
      tecnicoId: gestorId,
      status: dados.status,
      servico: dados.justificativa,
      administrativo: true,
      informante: dados.informante,
      justificativa: dados.justificativa,
      dataFechamento: new Date().toISOString()
    });

    await ChamadoRepo.mudarStatus(tx, chamado.id, 'fechado');
    return fechamento;
  });
}

module.exports = {
  fecharChamado,
  fecharChamadoAdmin
};
