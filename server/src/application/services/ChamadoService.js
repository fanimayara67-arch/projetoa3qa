/**
 * CAMADA DE APLICAÇÃO — ChamadoService
 * Orquestra os casos de uso de abertura de reporte pelo cidadão, consulta de chamados,
 * vínculo transacional de QR Code de poste e registro de tentativas.
 */

const { emTransacao: defaultEmTransacao } = require('../../infrastructure/database/transacao');
const ChamadoRepoDefault = require('../../infrastructure/repositories/ChamadoRepository');
const PosteRepoDefault = require('../../infrastructure/repositories/PosteRepository');
const TentativaRepoDefault = require('../../infrastructure/repositories/TentativaRepository');
const FotoStorageDefault = require('../../infrastructure/storage/FotoStorage');
const Chamado = require('../../domain/Chamado');
const Poste = require('../../domain/Poste');
const Tentativa = require('../../domain/Tentativa');
const { DadoInvalido, NaoEncontrado, Conflito } = require('../errors');

/**
 * Cria um chamado de forma idempotente e vincula o poste na mesma transação ACID
 * (elimina o antigo `link_poste` fire-and-forget que perdia vínculos em conexões instáveis).
 */
async function criarChamado(dados, deps = {}) {
  const emTransacao = deps.emTransacao || defaultEmTransacao;
  const ChamadoRepo = deps.ChamadoRepo || ChamadoRepoDefault;
  const PosteRepo = deps.PosteRepo || PosteRepoDefault;
  const FotoStorage = deps.FotoStorage || FotoStorageDefault;

  const validacao = Chamado.validarNovoChamado(dados);
  if (!validacao.valido) {
    throw new DadoInvalido(validacao.erros.join(' '), validacao.erros);
  }

  const posteIdNormalizado = Poste.normalizarPosteId(dados.poste_id || dados.posteId);
  const fotoUrl = await FotoStorage.salvar(dados.foto_base64 || dados.fotoUrl);

  return emTransacao(async (tx) => {
    const local = await resolverLocalizacao(tx, dados, posteIdNormalizado, PosteRepo);
    return ChamadoRepo.criarOuRetornarExistente(
      tx,
      montarRegistroChamado(dados, local, fotoUrl, posteIdNormalizado)
    );
  });
}

/**
 * Define a localização do chamado: GPS do aparelho ou, sem GPS, as coordenadas do poste do QR.
 * CA01: nenhum chamado fica sem localização. O erro é lançado dentro da transação,
 * então o cadastro provisório do poste também é desfeito.
 */
async function resolverLocalizacao(tx, dados, posteId, PosteRepo) {
  const local = {
    latitude: dados.lat ?? dados.latitude ?? null,
    longitude: dados.lng ?? dados.longitude ?? null,
    endereco: dados.endereco || null
  };
  if (posteId) {
    const poste = await PosteRepo.garantirExistencia(tx, posteId, { ...local });
    completarComPoste(local, poste);
  }
  if (!Chamado.coordenadasValidas(local.latitude, local.longitude)) {
    throw new DadoInvalido(
      'Localização indisponível: capture o GPS do aparelho para reportar este poste.',
      ['O poste do QR Code não tem coordenadas cadastradas e o reporte veio sem GPS.']
    );
  }
  return local;
}

function completarComPoste(local, poste) {
  if (!poste) return;
  if (local.latitude == null || local.longitude == null) {
    local.latitude = poste.latitude;
    local.longitude = poste.longitude;
  }
  if (!local.endereco && poste.endereco) {
    local.endereco = poste.endereco;
  }
}

function montarRegistroChamado(dados, local, fotoUrl, posteId) {
  return {
    id: dados.id,
    protocolo: dados.protocolo,
    tipo: dados.tipo,
    latitude: local.latitude,
    longitude: local.longitude,
    precisao_m: dados.acc ?? dados.precisao_m ?? null,
    descricao: dados.descricao,
    nome: dados.nome,
    telefone: dados.tel || dados.telefone,
    endereco: local.endereco,
    fotoUrl,
    posteId: posteId || null,
    userAgent: dados.user_agent || dados.userAgent,
    criadoEm: dados.timestamp || dados.criadoEm
  };
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
