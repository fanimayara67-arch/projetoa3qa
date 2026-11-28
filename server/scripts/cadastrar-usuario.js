/**
 * Cadastra (ou atualiza) um usuário do painel com PIN: técnico, gestor ou almoxarife.
 *
 *   npm run usuario:cadastrar -- --nome "Maria Silva" --perfil gestor --pin 0456
 *   npm run usuario:cadastrar -- --nome "Maria Silva" --perfil gestor --desativar
 *
 * Usa a conexão do .env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 * - O PIN é guardado só como hash (scrypt), como no login.
 * - Mesmo nome e perfil: troca o PIN e reativa, sem duplicar.
 * - PIN já usado por outro usuário ativo é recusado: o login testa o PIN contra todos os
 *   usuários ativos dos perfis da tela e entra com o primeiro que bater (um técnico poderia
 *   entrar como gestor).
 */

const { gerarHashPin: gerarHashPinPadrao, verificarPin: verificarPinPadrao } = require('../src/infrastructure/security/hashPin');

const PERFIS = ['tecnico', 'gestor', 'almoxarife'];
const OPCOES = ['nome', 'perfil', 'pin', 'desativar'];

function analisarArgumentos(argv) {
  const r = { nome: undefined, perfil: undefined, pin: undefined, desativar: false };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m || !OPCOES.includes(m[1])) throw new Error(`Opção desconhecida: ${argv[i]}. Use --nome, --perfil, --pin e --desativar.`);
    if (m[1] === 'desativar') { r.desativar = true; continue; }
    r[m[1]] = m[2] !== undefined ? m[2] : argv[++i];
  }
  return r;
}

function validar({ nome, perfil, pin }, { exigirPin = true } = {}) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) throw new Error('Informe o nome (--nome).');
  if (nomeLimpo.length > 120) throw new Error('O nome pode ter no máximo 120 caracteres.');
  if (!PERFIS.includes(perfil)) throw new Error(`Perfil inválido (${perfil}). Use: ${PERFIS.join(', ')}.`);
  if (exigirPin && !/^\d{4}$/.test(String(pin || ''))) throw new Error('O PIN deve ter exatamente 4 dígitos.');
  return nomeLimpo;
}

async function buscarPorNomeEPerfil(banco, nome, perfil) {
  const { rows } = await banco.query('SELECT id FROM usuarios WHERE nome = ? AND perfil = ?', [nome, perfil]);
  return rows[0] || null;
}

async function cadastrarUsuario(dados, { banco, gerarHashPin = gerarHashPinPadrao, verificarPin = verificarPinPadrao } = {}) {
  const nome = validar(dados);
  const { perfil, pin } = dados;

  const existente = await buscarPorNomeEPerfil(banco, nome, perfil);
  const { rows: ativos } = await banco.query('SELECT id, nome, perfil, pin_hash FROM usuarios WHERE ativo = 1');
  for (const outro of ativos) {
    if (existente && outro.id === existente.id) continue;
    if (await verificarPin(pin, outro.pin_hash)) {
      throw new Error(`Este PIN já é usado por outro usuário ativo (${outro.perfil}). Escolha outro PIN.`);
    }
  }

  const pinHash = await gerarHashPin(pin);
  if (existente) {
    await banco.query('UPDATE usuarios SET pin_hash = ?, ativo = 1 WHERE id = ?', [pinHash, existente.id]);
    return { acao: 'atualizado', id: existente.id, mensagem: `Usuário '${nome}' (${perfil}) atualizado: PIN trocado e acesso ativo.` };
  }
  const { rows } = await banco.query('INSERT INTO usuarios (nome, perfil, pin_hash, ativo) VALUES (?, ?, ?, 1)', [nome, perfil, pinHash]);
  return { acao: 'criado', id: rows.insertId, mensagem: `Usuário '${nome}' (${perfil}) cadastrado.` };
}

async function desativarUsuario(dados, { banco } = {}) {
  const nome = validar(dados, { exigirPin: false });
  const existente = await buscarPorNomeEPerfil(banco, nome, dados.perfil);
  if (!existente) throw new Error(`Usuário '${nome}' (${dados.perfil}) não encontrado.`);
  await banco.query('UPDATE usuarios SET ativo = 0 WHERE id = ?', [existente.id]);
  return { acao: 'desativado', id: existente.id, mensagem: `Usuário '${nome}' (${dados.perfil}) desativado.` };
}

async function main() {
  require('../src/infrastructure/config/env');
  const pool = require('../src/infrastructure/database/pool');
  try {
    const args = analisarArgumentos(process.argv.slice(2));
    const r = args.desativar ? await desativarUsuario(args, { banco: pool }) : await cadastrarUsuario(args, { banco: pool });
    console.log('OK: ' + r.mensagem);
  } catch (err) {
    console.error('Erro: ' + err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) main();

module.exports = { analisarArgumentos, cadastrarUsuario, desativarUsuario, PERFIS };
