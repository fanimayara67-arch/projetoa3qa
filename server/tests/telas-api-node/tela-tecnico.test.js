/**
 * Telas do painel na API Node | Ligação das telas ao adaptador (public/tecnico/index.html)
 *
 * As funções são recortadas do HTML real e rodam num contexto isolado (apoio dos testes
 * offline: extrair-funcao.js). O adaptador e a rede são dublês: aqui só se verifica para
 * onde a tela manda cada ação, nos dois servidores, e o que ela mostra ao usuário.
 * Defeitos de referência: DEF-15 e DEF-16.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { carregar } = require('../testes-offline/apoio/extrair-funcao');

const ACOES_DAS_TELAS = {
  almox_login: { pin: '5678' },
  estoque_list: {},
  estoque_upsert: { item: 'Reator', unidade: 'un', saldo: '3', minimo: '1' },
  estoque_delete: { item: 'Reator' },
  missao_create: { data: '27/11/2026', equipe: 'A', obs: '', itens: [{ item: 'Reator', qtd: 1, unidade: 'un' }] },
  missao_list: {},
  missao_return: { id_missao: 3, retornos: [{ item: 'Reator', qtd: 0 }] },
  material_report: {},
  get_poste_history: { poste_id: 'P-0007' },
  list_postes: {},
  search: { protocolo: 'IC-1' },
  attempt: { protocolo: 'IC-1', motivo: 'Sem acesso ao poste' }
};

/** apiFetchTO da tela com rede e adaptador falsos. */
function montarEnvio(sheetsUrl) {
  const registro = { fetches: [], adaptador: [] };
  const ctx = carregar('tecnico', ['apiFetchTO'], {
    SHEETS_URL: sheetsUrl,
    AbortController,
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: async (url, opcoes) => {
      registro.fetches.push({ url, opcoes });
      return { json: async () => ({ success: true, origem: 'fetch' }) };
    },
    acoesApiNode: async () => ({
      executarAcao: async (payload, opcoes) => {
        registro.adaptador.push({ payload, opcoes });
        return { success: true, origem: 'adaptador' };
      }
    })
  });
  return { ctx, registro };
}

test('TN-21 [caixa-preta | DEF-15 e DEF-16] com a API Node, as ações das telas que faltavam vão pelo adaptador, com o tempo limite da tela', async () => {
  for (const [action, campos] of Object.entries(ACOES_DAS_TELAS)) {
    const { ctx, registro } = montarEnvio('/api');
    const payload = { action, token: 'tok', ...campos };
    const r = await ctx.apiFetchTO(payload, 25000);
    assert.equal(r.origem, 'adaptador', `${action}: a tela mandou no formato do Apps Script para ${registro.fetches[0] && registro.fetches[0].url}`);
    assert.equal(registro.fetches.length, 0, action);
    assert.equal(registro.adaptador[0].payload, payload, action);
    assert.equal(registro.adaptador[0].opcoes.timeout, 25000, action);
  }
});

test('TN-22 [caixa-preta | regressão] com o Apps Script, as mesmas ações continuam no formato antigo (text/plain com action)', async () => {
  for (const [action, campos] of Object.entries(ACOES_DAS_TELAS)) {
    const { ctx, registro } = montarEnvio('https://script.google.com/macros/s/ID/exec');
    const r = await ctx.apiFetchTO({ action, token: 'tok', ...campos }, 25000);
    assert.equal(r.origem, 'fetch', action);
    assert.equal(registro.adaptador.length, 0, action);
    const { url, opcoes } = registro.fetches[0];
    assert.equal(url, 'https://script.google.com/macros/s/ID/exec');
    assert.match(opcoes.headers['Content-Type'], /text\/plain/);
    assert.equal(JSON.parse(opcoes.body).action, action);
  }
});

test('TN-23 [caixa-preta | regressão] com a API Node, o fechamento continua indo direto para a rota REST da tela (UC05)', async () => {
  const { ctx, registro } = montarEnvio('/api');
  ctx.fechamentoParaApiNode = () => ({ caminho: '/chamados/IC-1/fechamento', corpo: { status: 'Concluído' }, token: 'tok' });
  ctx.respostaDaApiNode = (json) => json;
  await ctx.apiFetchTO({ action: 'close', protocolo: 'IC-1', token: 'tok' }, 15000);
  assert.equal(registro.adaptador.length, 0);
  assert.equal(registro.fetches[0].url, '/api/chamados/IC-1/fechamento');
});

/** loginAlmox da tela com o formulário, os avisos e o envio falsos. */
function montarLoginAlmox(resposta) {
  const avisos = [];
  const elementos = { 'almox-pin': { value: ' 0000 ' }, 'almox-pin-gate': { style: {} }, 'almox-content': { style: {} } };
  const ctx = carregar('tecnico', ['loginAlmox'], {
    document: { getElementById: (id) => elementos[id] },
    showToast: (msg, tipo) => avisos.push({ msg, tipo }),
    apiFetchTO: async () => resposta,
    almoxTab: () => {},
    carregarEstoque: () => {}
  });
  return { ctx, avisos, elementos };
}

test('TN-24 [caixa-preta | DEF-16] login do almoxarifado recusado mostra o motivo da API, não sempre "PIN incorreto."', async () => {
  const bloqueado = montarLoginAlmox({ success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' });
  await bloqueado.ctx.loginAlmox();
  assert.deepEqual(bloqueado.avisos.at(-1), { msg: 'Muitas tentativas. Aguarde 15 minutos.', tipo: 'err' });

  const semMotivo = montarLoginAlmox({ success: false });
  await semMotivo.ctx.loginAlmox();
  assert.deepEqual(semMotivo.avisos.at(-1), { msg: 'PIN incorreto.', tipo: 'err' });
});

test('TN-25 [caixa-preta | fluxo principal] login do almoxarifado aceito guarda o token e abre o estoque', async () => {
  const { ctx, elementos } = montarLoginAlmox({ success: true, token: 'tok-almox' });
  await ctx.loginAlmox();
  assert.equal(ctx.almoxToken, 'tok-almox');
  assert.equal(elementos['almox-pin-gate'].style.display, 'none');
  assert.equal(elementos['almox-content'].style.display, '');
});

test('TN-26 [caixa-branca] o adaptador entra no cache do service worker do técnico (o painel abre sem internet)', () => {
  const sw = fs.readFileSync(path.resolve(__dirname, '../../../public/tecnico/sw.js'), 'utf8');
  assert.match(sw, /'\.\/js\/infrastructure\/AcoesApiNode\.js'/);
  assert.match(sw, /'\.\.\/shared\/infrastructure\/ApiClient\.js'/);
});

/** Funções do almoxarifado com formulário, avisos e envio falsos (a API recusa com um motivo). */
function montarAlmox(nomes, motivo) {
  const avisos = [];
  const campos = { 'mis-data': '27/11/2026', 'mis-equipe': '', 'mis-obs': '', 'saida-0': '2', 'ret-0': '1',
    'est-item': 'Fita', 'est-unidade': 'pç', 'est-saldo': '1', 'est-minimo': '0' };
  const ctx = carregar('tecnico', ['brToISO', ...nomes], {
    document: { getElementById: (id) => (id in campos ? { value: campos[id] } : null) },
    showToast: (msg, tipo) => avisos.push({ msg, tipo }),
    apiFetchTO: async () => ({ success: false, error: motivo }),
    confirm: () => true,
    estoqueCache: [{ item: 'Reator', unidade: 'un', saldo: 8 }],
    missoesCache: [{ id: 3, itens: [{ item: 'Reator', saida: 2 }] }],
    almoxToken: 'tok-almox', estoqueEditando: null,
    carregarEstoque: () => {}, carregarMissoes: () => {}, cancelarEdicaoEstoque: () => {}, _setModoEdicaoEstoque: () => {}
  });
  return { ctx, avisos };
}

test('TN-27 [caixa-preta | fluxo de exceção] almoxarifado mostra o motivo da recusa da API ao salvar, excluir, registrar saída e retorno', async () => {
  const casos = [
    ['criarMissao', (c) => c.criarMissao(), 'Identificação da equipe é obrigatória.'],
    ['salvarEstoque', (c) => c.salvarEstoque(), 'Unidade inválida (pç). Use: un, m, cx, rolo, kg, par.'],
    ['excluirEstoque', (c) => c.excluirEstoque('Fita'), 'Item de estoque não encontrado.'],
    ['confirmarRetorno', (c) => c.confirmarRetorno(3, 0), "Retorno (5) não pode ser maior que a saída (2) do item Reator."]
  ];
  for (const [nome, agir, motivo] of casos) {
    const { ctx, avisos } = montarAlmox([nome], motivo);
    await agir(ctx);
    assert.deepEqual(avisos.at(-1), { msg: motivo, tipo: 'err' }, nome);
  }
});
