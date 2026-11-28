/**
 * Apoio dos testes das telas na API Node: a API Node do projeto com o banco em memória.
 *
 * Rotas, autenticação por PIN, perfis, validação, serviços e transações são os reais; só os
 * repositórios (SQL) são trocados por listas em memória, como no servidor de apoio dos testes
 * offline. Usado pela integração (integracao.test.js) e pela verificação no navegador
 * (docs/Relatório de Testes/Telas na API Node/scripts).
 *
 * Os módulos do projeto são substituídos no próprio processo: use um processo por execução.
 */

const path = require('node:path');

const SRC = path.resolve(__dirname, '../../../src');

const PIN_TECNICO = '1234';
const PIN_ALMOX = '5678';

/* ─────────────── Banco em memória ─────────────── */

const banco = {
  usuarios: [],
  sessoes: [],
  itens: [],
  missoes: [],
  postes: [],
  chamados: [],
  tentativas: [],
  proximoId: 100
};

function falhaSql(sql) {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
  throw new Error('SQL inesperado no teste: um repositório não foi substituído.\n' + sql);
}

/** Monta a API com o banco em memória. Devolve o app (handle/listen) e o banco, para conferir. */
async function criarApiEmMemoria() {
  const pool = require(`${SRC}/infrastructure/database/pool`);
  const conexao = { query: async (sql) => falhaSql(sql), release() {} };
  pool.setPool({ query: conexao.query, connect: async () => conexao, end: async () => {} });

  const { gerarHashPin } = require(`${SRC}/infrastructure/security/hashPin`);
  banco.usuarios = [
    { id: 1, nome: 'Técnico Teste', perfil: 'tecnico', pin_hash: await gerarHashPin(PIN_TECNICO) },
    { id: 3, nome: 'Almoxarife Teste', perfil: 'almoxarife', pin_hash: await gerarHashPin(PIN_ALMOX) }
  ];

  Object.assign(require(`${SRC}/infrastructure/repositories/UsuarioRepository`), {
    async listarAtivosPorPerfis(perfis) { return banco.usuarios.filter((u) => perfis.includes(u.perfil)); },
    async buscarPorId(id) { return banco.usuarios.find((u) => u.id === id) || null; }
  });

  Object.assign(require(`${SRC}/infrastructure/repositories/SessaoRepository`), {
    async criarSessao({ token, usuarioId, expiraEm }) { banco.sessoes.push({ token, usuarioId, expiraEm: Date.parse(expiraEm) }); },
    async buscarSessaoValida(token) {
      const s = banco.sessoes.find((x) => x.token === token && x.expiraEm > Date.now());
      const u = s && banco.usuarios.find((x) => x.id === s.usuarioId);
      return u ? { usuario_id: u.id, nome: u.nome, perfil: u.perfil, expira_em: new Date(s.expiraEm) } : null;
    },
    async contarFalhasRecentesPorIp() { return 0; },
    async registrarTentativaLogin() {}
  });

  const item = (nome) => banco.itens.find((i) => i.nome === nome || i.id === nome);
  Object.assign(require(`${SRC}/infrastructure/repositories/EstoqueRepository`), {
    async listarItens() { return [...banco.itens].sort((a, b) => a.nome.localeCompare(b.nome)); },
    async salvarItem(d) {
      const nome = String(d.nome).trim();
      const atual = item(nome);
      const linha = { id: atual ? atual.id : banco.proximoId++, nome, unidade: d.unidade || 'un',
        saldo: Number(d.saldo || 0).toFixed(2), minimo: Number(d.minimo || 0).toFixed(2), atualizado_em: new Date() };
      banco.itens = banco.itens.filter((i) => i.nome !== nome).concat(linha);
      return linha;
    },
    async removerItem(nome) {
      const atual = item(nome);
      if (!atual) return null;
      banco.itens = banco.itens.filter((i) => i !== atual);
      return atual;
    },
    async criarMissaoComItens(_tx, { data, equipe, obs, criadoPor, itens }) {
      const missao = { id: banco.proximoId++, data, equipe, obs: obs || null, criado_por: criadoPor, itens: [] };
      for (const it of itens) {
        const linha = item(it.nome);
        linha.saldo = (Number(linha.saldo) - Number(it.qtd_saida)).toFixed(2);
        missao.itens.push({ item_id: linha.id, nome: linha.nome, unidade: linha.unidade, qtd_saida: Number(it.qtd_saida).toFixed(2), qtd_retorno: null });
      }
      banco.missoes.push(missao);
      return { id: missao.id, data, equipe, obs };
    },
    async listarMissoes() { return banco.missoes.map((m) => ({ ...m, itens: m.itens.map((i) => ({ ...i })) })); },
    async buscarMissaoParaAtualizar(_tx, id) { return banco.missoes.find((m) => m.id === Number(id)) || null; },
    async listarItensDaMissao(_tx, id) { return banco.missoes.find((m) => m.id === Number(id)).itens; },
    async creditarSaldo(_tx, itemId, delta) { const l = item(itemId); l.saldo = (Number(l.saldo) + delta).toFixed(2); },
    async registrarRetornoItem(_tx, missaoId, itemId, qtd) {
      banco.missoes.find((m) => m.id === Number(missaoId)).itens.find((i) => i.item_id === itemId).qtd_retorno = Number(qtd).toFixed(2);
    }
  });

  Object.assign(require(`${SRC}/infrastructure/repositories/PosteRepository`), {
    async buscarPorId(id) { return banco.postes.find((p) => p.id === id) || null; },
    async listarHistoricoDoPoste(id) { return banco.chamados.filter((c) => c.poste_id === id); },
    async listarTodos() {
      return banco.postes.map((p) => {
        const doPoste = banco.chamados.filter((c) => c.poste_id === p.id);
        return { ...p, qtd: doPoste.length, data_ult: doPoste.length ? doPoste[0].criado_em : null };
      });
    }
  });

  Object.assign(require(`${SRC}/infrastructure/repositories/ChamadoRepository`), {
    async listar(escopo = 'abertos') {
      const lista = escopo === 'abertos' ? banco.chamados.filter((c) => ['aberto', 'em_atendimento'].includes(c.status)) : [...banco.chamados];
      return lista.sort((a, b) => a.criado_em - b.criado_em);
    },
    async obterEstatisticas() {
      const abertos = banco.chamados.filter((c) => ['aberto', 'em_atendimento'].includes(c.status)).length;
      return { total: banco.chamados.length, abertos, atendidos: banco.chamados.filter((c) => c.status === 'fechado').length };
    },
    async buscarPorProtocolo(protocolo) { return banco.chamados.find((c) => c.protocolo === protocolo) || null; },
    async buscarParaAtualizar(_tx, protocolo) { return banco.chamados.find((c) => c.protocolo === protocolo) || null; },
    async mudarStatus(_tx, id, status) { banco.chamados.find((c) => c.id === id).status = status; }
  });

  require(`${SRC}/infrastructure/repositories/TentativaRepository`).inserir = async (_tx, d) => {
    const existente = banco.tentativas.find((t) => t.operacao_id === d.operacaoId);
    if (existente) return existente;
    const nova = { id: banco.tentativas.length + 1, operacao_id: d.operacaoId, chamado_id: d.chamadoId, motivo: d.motivo, latitude: d.latitude, longitude: d.longitude };
    banco.tentativas.push(nova);
    return nova;
  };

  require(`${SRC}/infrastructure/storage/FotoStorage`).salvar = async (foto) => (foto ? '/fotos/teste.jpg' : null);

  return { app: require(`${SRC}/app`).criarApp(), banco };
}

module.exports = { criarApiEmMemoria, PIN_TECNICO, PIN_ALMOX };
