/**
 * CAMADA DE APLICAÇÃO — AuthService
 * Autenticação por PIN com hash criptográfico, controle de sessão na tabela `sessoes`
 * e bloqueio de força bruta via `tentativas_login` (HTTP 429).
 */

const UsuarioRepoDefault = require('../../infrastructure/repositories/UsuarioRepository');
const SessaoRepoDefault = require('../../infrastructure/repositories/SessaoRepository');
const { verificarPin: defaultVerificarPin } = require('../../infrastructure/security/hashPin');
const { gerarToken: defaultGerarToken } = require('../../infrastructure/security/gerarToken');
const { NaoAutenticado, MuitasTentativas, DadoInvalido } = require('../errors');

const MAX_FALHAS_POR_JANELA = 5;
const JANELA_MINUTOS = 15;
const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000; // 12 horas

async function autenticarPorPin({ pin, ip, perfisPermitidos = ['tecnico', 'gestor'] }, deps = {}) {
  const UsuarioRepo = deps.UsuarioRepo || UsuarioRepoDefault;
  const SessaoRepo = deps.SessaoRepo || SessaoRepoDefault;
  const verificarPin = deps.verificarPin || defaultVerificarPin;
  const gerarToken = deps.gerarToken || defaultGerarToken;

  const pinLimpo = String(pin || '').trim();
  if (!/^\d{4}$/.test(pinLimpo)) {
    throw new DadoInvalido('PIN deve conter exatamente 4 dígitos numéricos.');
  }

  const falhasRecentes = await SessaoRepo.contarFalhasRecentesPorIp(ip, JANELA_MINUTOS);
  if (falhasRecentes >= MAX_FALHAS_POR_JANELA) {
    throw new MuitasTentativas('Muitas tentativas incorretas de PIN. Aguarde 15 minutos.');
  }

  const candidatos = await UsuarioRepo.listarAtivosPorPerfis(perfisPermitidos);
  let usuarioAutenticado = null;

  for (const usuario of candidatos) {
    const bateu = await verificarPin(pinLimpo, usuario.pin_hash);
    if (bateu) {
      usuarioAutenticado = usuario;
      break;
    }
  }

  if (!usuarioAutenticado) {
    await SessaoRepo.registrarTentativaLogin({
      ip,
      perfil: perfisPermitidos[0],
      sucesso: false
    });
    throw new NaoAutenticado('PIN incorreto.');
  }

  await SessaoRepo.registrarTentativaLogin({
    ip,
    perfil: usuarioAutenticado.perfil,
    sucesso: true
  });

  const token = gerarToken();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);

  await SessaoRepo.criarSessao({
    token,
    usuarioId: usuarioAutenticado.id,
    expiraEm: expiraEm.toISOString()
  });

  return {
    token,
    expiry: expiraEm.getTime(),
    usuario: {
      id: usuarioAutenticado.id,
      nome: usuarioAutenticado.nome,
      perfil: usuarioAutenticado.perfil
    }
  };
}

async function validarTokenSessao(token, deps = {}) {
  const SessaoRepo = deps.SessaoRepo || SessaoRepoDefault;
  if (!token || typeof token !== 'string') {
    throw new NaoAutenticado('Token de autenticação ausente.');
  }
  const sessao = await SessaoRepo.buscarSessaoValida(token.trim());
  if (!sessao) {
    throw new NaoAutenticado('Sessão expirada ou inválida.');
  }
  return {
    id: sessao.usuario_id,
    nome: sessao.nome,
    perfil: sessao.perfil,
    expiraEm: sessao.expira_em
  };
}

module.exports = {
  MAX_FALHAS_POR_JANELA,
  JANELA_MINUTOS,
  DURACAO_SESSAO_MS,
  autenticarPorPin,
  validarTokenSessao
};
