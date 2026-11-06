/**
 * CAMADA DE APLICAÇÃO — ChamadoService
 * Orquestra os casos de uso de abertura de reporte pelo cidadão, consulta de chamados,
 * e registro de tentativas.
 */

const { emTransacao: defaultEmTransacao } = require('../../infrastructure/database/transacao');
const ChamadoRepoDefault = require('../../infrastructure/repositories/ChamadoRepository');
const TentativaRepoDefault = require('../../infrastructure/repositories/TentativaRepository');
const FotoStorageDefault = require('../../infrastructure/storage/FotoStorage');
const Chamado = require('../../domain/Chamado');
const Tentativa = require('../../domain/Tentativa');
const { DadoInvalido, NaoEncontrado, Conflito } = require('../errors');

/**
 * Cria um chamado de forma idempotente (reenvio da fila offline não duplica).
 */
async function criarChamado(dados, deps = {}) {
  const emTransacao = deps.emTransacao || defaultEmTransacao;
  const ChamadoRepo = deps.ChamadoRepo || ChamadoRepoDefault;
  const FotoStorage = deps.FotoStorage || FotoStorageDefault;

  const validacao = Chamado.validarNovoChamado(dados);
  if (!validacao.valido) {
    throw new DadoInvalido(validacao.erros.join(' '), validacao.erros);
  }

  const fotoUrl = await FotoStorage.salvar(dados.foto_base64 || dados.fotoUrl);

  return emTransacao(async (tx) => {
    const latitude = dados.lat ?? dados.latitude;
    const longitude = dados.lng ?? dados.longitude;
    const endereco = dados.endereco || null;

    const chamado = await ChamadoRepo.criarOuRetornarExistente(tx, {
      id: dados.id,
      protocolo: dados.protocolo,
      tipo: dados.tipo,
      latitude,
      longitude,
      precisao_m: dados.acc ?? dados.precisao_m ?? null,
      descricao: dados.descricao,
      nome: dados.nome,
      telefone: dados.tel || dados.telefone,
      endereco,
      fotoUrl,
      userAgent: dados.user_agent || dados.userAgent,
      criadoEm: dados.timestamp || dados.criadoEm
    });

    return chamado;
  });
}

async function listarChamados({ escopo = 'abertos' } = {}, deps = {}) {
  const ChamadoRepo = deps.ChamadoRepo || ChamadoRepoDefault;
  const [registros, estatisticas] = await Promise.all([
    ChamadoRepo.listar(escopo),
    ChamadoRepo.obterEstatisticas()
  ]);
  return {
    records: registros,
    ...estatisticas
  };
}

async function buscarPorProtocolo(protocolo, deps = {}) {
  const ChamadoRepo = deps.ChamadoRepo || ChamadoRepoDefault;
  const chamado = await ChamadoRepo.buscarPorProtocolo(protocolo);
  if (!chamado) throw new NaoEncontrado(`Chamado '${protocolo}' não encontrado.`);
  return chamado;
}

async function registrarTentativa({ protocolo, tecnicoId, dados }, deps = {}) {
  const emTransacao = deps.emTransacao || defaultEmTransacao;
  const ChamadoRepo = deps.ChamadoRepo || ChamadoRepoDefault;
  const TentativaRepo = deps.TentativaRepo || TentativaRepoDefault;
  const FotoStorage = deps.FotoStorage || FotoStorageDefault;

  const validacao = Tentativa.validarTentativa(dados);
  if (!validacao.valido) {
    throw new DadoInvalido(validacao.erros.join(' '), validacao.erros);
  }

  const fotoUrl = await FotoStorage.salvar(dados.foto_base64 || dados.fotoUrl);

  return emTransacao(async (tx) => {
    const chamado = await ChamadoRepo.buscarParaAtualizar(tx, protocolo);
    if (!chamado) throw new NaoEncontrado('Chamado não existe.');
    if (!Chamado.podeFechar(chamado)) {
      throw new Conflito('Chamado já foi fechado e não aceita novas tentativas.');
    }

    const tentativa = await TentativaRepo.inserir(tx, {
      operacaoId: dados.operacao_id,
      chamadoId: chamado.id,
      tecnicoId,
      motivo: dados.motivo,
      latitude: dados.lat ?? dados.latitude,
      longitude: dados.lng ?? dados.longitude,
      fotoUrl
    });

    await ChamadoRepo.mudarStatus(tx, chamado.id, 'em_atendimento');
    return tentativa;
  });
}

module.exports = {
  criarChamado,
  listarChamados,
  buscarPorProtocolo,
  registrarTentativa
};
