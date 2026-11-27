/**
 * Telas do painel na API Node | Integração: adaptador real → ApiClient real → rotas reais da API Node
 *
 * Sobe a API Node do projeto (rotas, autenticação por PIN, perfis, validação, serviços e
 * transações reais) numa porta local. Só os repositórios são trocados por um banco em
 * memória, como no servidor de apoio dos testes offline. Cada caso chama a ação como a
 * tela chama (executarAcao com o payload do Apps Script) e confere o que voltou para a
 * tela e o que ficou gravado.
 *
 * O teste ponta a ponta com navegador e MySQL é o SEL-12 e o SEL-13 (test:selenium).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const SRC = path.resolve(__dirname, '../../src');
const URL_ADAPTADOR = pathToFileURL(path.resolve(__dirname, '../../../public/tecnico/js/infrastructure/AcoesApiNode.js')).href;

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

async function prepararApi() {
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

  return require(`${SRC}/app`).criarApp();
}

/* ─────────────── Servidor e adaptador ─────────────── */

let servidor;
let executarAcao;

test.before(async () => {
  const app = await prepararApi();
  servidor = http.createServer(app.handle);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  // O ApiClient usa window.ILUMINA.API_URL como base, como no navegador.
  globalThis.window = { ILUMINA: { API_URL: `http://127.0.0.1:${servidor.address().port}` } };
  ({ executarAcao } = await import(URL_ADAPTADOR));
});

test.after(async () => {
  delete globalThis.window;
  await new Promise((ok) => servidor.close(ok));
});

const entrar = async (pin) => (await executarAcao({ action: 'almox_login', pin })).token;

async function tokenTecnico() {
  const r = await fetch(`${globalThis.window.ILUMINA.API_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN_TECNICO })
  }).then((x) => x.json());
  return r.data.token;
}

/* ─────────────── Casos ─────────────── */

test('TN-30 [integração | DEF-16] almoxarife entra com o próprio PIN; o PIN do técnico não abre o almoxarifado', async () => {
  const aceito = await executarAcao({ action: 'almox_login', pin: PIN_ALMOX });
  assert.equal(aceito.success, true);
  assert.match(aceito.token, /\S{16,}/);
  const recusado = await executarAcao({ action: 'almox_login', pin: PIN_TECNICO });
  assert.equal(recusado.success, false);
  assert.ok(recusado.error, 'a tela recebe o motivo da recusa');
});

test('TN-31 [integração | DEF-16] estoque: cadastrar, listar, editar e excluir pela tela', async () => {
  const token = await entrar(PIN_ALMOX);
  assert.equal((await executarAcao({ action: 'estoque_upsert', token, item: 'Lâmpada LED 100W', unidade: 'un', saldo: '10', minimo: '4' })).success, true);
  assert.equal((await executarAcao({ action: 'estoque_upsert', token, item: 'Cabo 2,5mm', unidade: 'm', saldo: '50', minimo: '10' })).success, true);
  assert.equal((await executarAcao({ action: 'estoque_upsert', token, item: 'Cabo 2,5mm', unidade: 'm', saldo: '45', minimo: '10' })).success, true);

  const lista = await executarAcao({ action: 'estoque_list', token });
  assert.deepEqual(lista.itens.map((i) => [i.item, i.saldo, i.unidade]), [['Cabo 2,5mm', 45, 'm'], ['Lâmpada LED 100W', 10, 'un']]);

  const invalido = await executarAcao({ action: 'estoque_upsert', token, item: 'Fita', unidade: 'pç', saldo: '1', minimo: '0' });
  assert.equal(invalido.success, false);
  assert.match(invalido.error, /Unidade inválida/);

  assert.equal((await executarAcao({ action: 'estoque_delete', token, item: 'Cabo 2,5mm' })).success, true);
  assert.deepEqual((await executarAcao({ action: 'estoque_list', token })).itens.map((i) => i.item), ['Lâmpada LED 100W']);
});

test('TN-32 [integração | DEF-16] missão: a saída debita o estoque, o retorno devolve e o relatório mostra o consumo', async () => {
  const token = await entrar(PIN_ALMOX);
  await executarAcao({ action: 'estoque_upsert', token, item: 'Reator 250W', unidade: 'un', saldo: '8', minimo: '2' });

  const saida = await executarAcao({ action: 'missao_create', token, data: '27/11/2026', equipe: 'Equipe A', obs: 'Centro',
    itens: [{ item: 'Reator 250W', qtd: 3, unidade: 'un' }] });
  assert.equal(saida.success, true, saida.error);
  assert.equal((await executarAcao({ action: 'estoque_list', token })).itens.find((i) => i.item === 'Reator 250W').saldo, 5);

  const missoes = (await executarAcao({ action: 'missao_list', token })).missoes;
  const missao = missoes.find((m) => m.equipe === 'Equipe A');
  assert.equal(missao.status, 'Aberta');
  assert.equal(missao.data, '27/11/2026');

  const retorno = await executarAcao({ action: 'missao_return', token, id_missao: missao.id, retornos: [{ item: 'Reator 250W', qtd: 1 }] });
  assert.equal(retorno.success, true, retorno.error);
  assert.equal((await executarAcao({ action: 'estoque_list', token })).itens.find((i) => i.item === 'Reator 250W').saldo, 6);

  const rel = await executarAcao({ action: 'material_report', token });
  const m = rel.missoes.find((x) => x.id === missao.id);
  assert.equal(m.status, 'Fechada');
  assert.deepEqual(m.itens.map((i) => [i.item, i.saida, i.retorno, i.consumo]), [['Reator 250W', 3, 1, 2]]);

  const demais = await executarAcao({ action: 'missao_return', token, id_missao: missao.id, retornos: [{ item: 'Reator 250W', qtd: 4 }] });
  assert.equal(demais.success, false, 'retorno maior que a saída é recusado');
});

test('TN-33 [integração | perfis] o técnico não usa as rotas do almoxarifado', async () => {
  const token = await tokenTecnico();
  const r = await executarAcao({ action: 'estoque_upsert', token, item: 'Qualquer', unidade: 'un', saldo: '1', minimo: '0' });
  assert.equal(r.success, false);
});

test('TN-34 [integração | DEF-15] histórico do poste, poste não cadastrado e relatório de postes', async () => {
  banco.postes.push({ id: 'P-0007', codigo: 'CRP-7', bairro: 'Centro', rua: 'Rua A', referencia: 'Praça', foto_ref_url: null, latitude: '-10.125000', longitude: '-36.175000' });
  banco.chamados.push(
    { id: crypto.randomUUID(), protocolo: 'IC-261127-P7A', tipo: 'apagado', status: 'aberto', poste_id: 'P-0007', criado_em: new Date('2026-11-27T12:00:00Z') },
    { id: crypto.randomUUID(), protocolo: 'IC-261110-P7B', tipo: 'piscando', status: 'fechado', poste_id: 'P-0007', criado_em: new Date('2026-11-10T12:00:00Z'), servico: 'Troca do reator', tecnico: 'Técnico Teste' }
  );
  const token = await tokenTecnico();

  const hist = await executarAcao({ action: 'get_poste_history', token, poste_id: 'P-0007' });
  assert.equal(hist.success, true, hist.error);
  assert.equal(hist.poste.id, 'P-0007');
  assert.equal(hist.poste.qtd, 2);
  assert.deepEqual(hist.chamados.map((c) => c.status), ['Aguardando atendimento', 'Concluído']);

  const semCadastro = await executarAcao({ action: 'get_poste_history', token, poste_id: 'P-0999' });
  assert.equal(semCadastro.success, true);
  assert.equal(semCadastro.poste, null);

  const rel = await executarAcao({ action: 'list_postes', token });
  assert.equal(rel.success, true, rel.error);
  assert.deepEqual(rel.postes.map((p) => [p.id, p.qtd, p.lat]), [['P-0007', 2, -10.125]]);
});

test('TN-35 [integração] busca por protocolo e tentativa sem resolução pela tela do técnico', async () => {
  const chamado = { id: crypto.randomUUID(), protocolo: 'IC-261127-BUSCA', tipo: 'quebrado', status: 'aberto', latitude: '-10.1', longitude: '-36.1', criado_em: new Date() };
  banco.chamados.push(chamado);
  const token = await tokenTecnico();

  const achado = await executarAcao({ action: 'search', token, protocolo: 'IC-261127-BUSCA' });
  assert.equal(achado.success, true);
  assert.equal(achado.record.status, 'Aguardando atendimento');
  assert.equal((await executarAcao({ action: 'search', token, protocolo: 'IC-NAO-EXISTE' })).record, null);
  assert.equal((await executarAcao({ action: 'search', token: 'token-vencido', protocolo: 'IC-261127-BUSCA' })).error, 'sessao_expirada');

  const payload = { action: 'attempt', token, protocolo: 'IC-261127-BUSCA', tecnico: 'Técnico Teste', motivo: 'Portão trancado, sem acesso ao poste',
    latitude: '-10.100000', longitude: '-36.100000', foto_base64: null };
  assert.equal((await executarAcao(payload)).success, true);
  assert.equal((await executarAcao(payload)).success, true, 'reenvio');
  assert.equal(banco.tentativas.filter((t) => t.chamado_id === chamado.id).length, 1, 'o reenvio não duplica a tentativa');
  assert.equal(chamado.status, 'em_atendimento');
});
