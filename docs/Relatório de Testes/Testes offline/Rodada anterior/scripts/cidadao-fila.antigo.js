/**
 * TESTES DE CAIXA-BRANCA — Fila offline do app do cidadão
 *
 * Funções testadas (código real, recortado de public/index.html):
 *   - flushQueue          envia a fila guardada no aparelho
 *   - updatePendingBanner mostra o aviso de reportes pendentes
 *
 * Técnica: caminhos básicos (McCabe) e cobertura de decisões. Cada teste
 * força um caminho do grafo de fluxo descrito no relatório.
 * Testes marcados com `todo` exigem o comportamento correto e falham hoje:
 * eles confirmam um defeito sem quebrar o `npm test`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('../apoio/extrair-funcao');

const ENDPOINT_APPS_SCRIPT = 'https://script.google.com/macros/s/teste/exec';

/** Monta flushQueue com um banco em memória e dublês de rede e tela. */
function montarFila({ itens = [], online = true, endpoint = ENDPOINT_APPS_SCRIPT, enviar } = {}) {
  const banco = new Map(itens.map((item, i) => [i + 1, { id: i + 1, attempts: 0, ...item }]));
  const registro = { envios: [], apagados: [], tentativas: [], avisosAtualizados: 0, alertas: [] };

  const ctx = carregar('cidadao', ['flushQueue'], {
    navigator: { onLine: online },
    ENDPOINT: endpoint,
    console: { log() {}, error() {}, warn: (...a) => registro.alertas.push(a.join(' ')) },
    // Como o IndexedDB, devolve cópias: o que cada chamada lê é uma "foto" da fila.
    dbGetAll: async () => [...banco.values()].map((r) => ({ ...r })),
    dbDelete: async (id) => { registro.apagados.push(id); banco.delete(id); },
    dbUpdateAttempts: async (id, attempts, lastError) => {
      registro.tentativas.push({ id, attempts, lastError });
      const r = banco.get(id);
      if (r) Object.assign(r, { attempts, lastError });
    },
    postReport: async (payload) => {
      registro.envios.push(payload.protocolo);
      return enviar ? enviar(payload) : { ok: true };
    },
    updatePendingBanner: () => { registro.avisosAtualizados++; },
    showToast: (...a) => registro.alertas.push(a.join(' '))
  });
  return { ctx, banco, registro };
}

const item = (protocolo, extra = {}) => ({ payload: { protocolo }, ...extra });

/* ───────────── flushQueue: decisões de entrada ───────────── */

test('CB-01 flushQueue: sem internet não lê a fila nem envia nada', async () => {
  const { ctx, registro } = montarFila({ itens: [item('IC-1')], online: false });
  await ctx.flushQueue();
  assert.equal(registro.envios.length, 0);
  assert.equal(registro.avisosAtualizados, 0);
});

test('CB-02 flushQueue: com o endereço do servidor ainda não configurado ("__...") não envia', async () => {
  const { ctx, registro } = montarFila({ itens: [item('IC-1')], endpoint: '__ILUMINA_ENDPOINT_CIDADAO__' });
  await ctx.flushQueue();
  assert.equal(registro.envios.length, 0);
});

test('CB-03 flushQueue: erro ao ler o banco do aparelho encerra sem enviar e sem lançar erro', async () => {
  const { ctx, registro } = montarFila({ itens: [item('IC-1')] });
  ctx.dbGetAll = async () => { throw new Error('IndexedDB indisponível'); };
  await assert.doesNotReject(ctx.flushQueue());
  assert.equal(registro.envios.length, 0);
  assert.equal(registro.avisosAtualizados, 0);
});

test('CB-04 flushQueue: fila vazia encerra sem tentar enviar', async () => {
  const { ctx, registro } = montarFila({ itens: [] });
  await ctx.flushQueue();
  assert.equal(registro.envios.length, 0);
  assert.equal(registro.avisosAtualizados, 0);
});

/* ───────────── flushQueue: decisões dentro do laço ───────────── */

test('CB-05 flushQueue: envio aceito apaga o item da fila e atualiza o aviso', async () => {
  const { ctx, banco, registro } = montarFila({ itens: [item('IC-1')] });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-1']);
  assert.deepEqual(registro.apagados, [1]);
  assert.equal(banco.size, 0);
  assert.equal(registro.avisosAtualizados, 1);
});

test('CB-06 flushQueue: recusa do servidor mantém o item e soma uma tentativa com o motivo', async () => {
  const { ctx, banco, registro } = montarFila({
    itens: [item('IC-1', { attempts: 2 })],
    enviar: () => ({ ok: false, error: 'dados inválidos' })
  });
  await ctx.flushQueue();
  assert.equal(banco.size, 1);
  assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 3, lastError: 'dados inválidos' }]);
  assert.equal(registro.apagados.length, 0);
});

test('CB-06b flushQueue: resposta vazia do servidor conta como recusa ("server error")', async () => {
  const { ctx, registro } = montarFila({ itens: [item('IC-1')], enviar: () => null });
  await ctx.flushQueue();
  assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 1, lastError: 'server error' }]);
});

test('CB-07 flushQueue: erro de rede mantém o item e soma uma tentativa com a mensagem do erro', async () => {
  const { ctx, banco, registro } = montarFila({
    itens: [item('IC-1')],
    enviar: () => { throw new Error('Failed to fetch'); }
  });
  await ctx.flushQueue();
  assert.equal(banco.size, 1);
  assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 1, lastError: 'Failed to fetch' }]);
});

test('CB-07b flushQueue: erro de rede sem mensagem é registrado como "network error"', async () => {
  const { ctx, registro } = montarFila({ itens: [item('IC-1')], enviar: () => { throw new Error(''); } });
  await ctx.flushQueue();
  assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 1, lastError: 'network error' }]);
});

test('CB-08 flushQueue: valor limite das tentativas — com 4 ainda envia, com 5 descarta sem enviar', async () => {
  const { ctx, registro } = montarFila({
    itens: [item('IC-QUATRO', { attempts: 4 }), item('IC-CINCO', { attempts: 5 })]
  });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-QUATRO'], 'só o item com 4 tentativas foi enviado');
  assert.deepEqual(registro.apagados.sort(), [1, 2], 'o item com 5 tentativas foi apagado sem envio');
});

test('CB-09 flushQueue: falha ao apagar um item descartado não interrompe o resto da fila', async () => {
  const { ctx, registro } = montarFila({ itens: [item('IC-VELHO', { attempts: 5 }), item('IC-NOVO')] });
  const apagar = ctx.dbDelete;
  ctx.dbDelete = async (id) => { if (id === 1) throw new Error('falha'); return apagar(id); };
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-NOVO']);
});

test('CB-10 flushQueue: falha ao gravar a tentativa depois de um erro de rede não interrompe a fila', async () => {
  const { ctx, registro } = montarFila({
    itens: [item('IC-1'), item('IC-2')],
    enviar: (p) => { if (p.protocolo === 'IC-1') throw new Error('timeout'); return { ok: true }; }
  });
  ctx.dbUpdateAttempts = async () => { throw new Error('banco travado'); };
  await assert.doesNotReject(ctx.flushQueue());
  assert.deepEqual(registro.envios, ['IC-1', 'IC-2']);
  assert.equal(registro.avisosAtualizados, 1);
});

test('CB-11 flushQueue: falha no primeiro item não impede o envio do segundo', async () => {
  const { ctx, banco, registro } = montarFila({
    itens: [item('IC-1'), item('IC-2')],
    enviar: (p) => (p.protocolo === 'IC-1' ? { ok: false, error: 'x' } : { ok: true })
  });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-1', 'IC-2']);
  assert.deepEqual([...banco.keys()], [1]);
});

/* ───────────── flushQueue: defeitos confirmados ───────────── */

test('CB-12 [D1] flushQueue: reporte descartado após 5 tentativas deve avisar o cidadão', { todo: 'Defeito D1 — descarte silencioso' }, async () => {
  const { ctx, banco, registro } = montarFila({ itens: [item('IC-PERDIDO', { attempts: 5 })] });
  await ctx.flushQueue();
  const continuaNaFila = banco.size === 1;
  const avisouNaTela = registro.alertas.some((a) => /IC-PERDIDO/.test(a) && !/descartando item/.test(a));
  assert.ok(continuaNaFila || avisouNaTela,
    'o reporte foi apagado e só houve console.warn, que o cidadão não vê');
});

test('CB-13 [D2] flushQueue: três sincronizações ao mesmo tempo devem enviar o reporte uma única vez', { todo: 'Defeito D2 — falta trava contra execução simultânea' }, async () => {
  const { ctx, registro } = montarFila({ itens: [item('IC-1')] });
  // Gatilhos reais que podem coincidir: evento "online", volta ao primeiro plano e timer de 60 s.
  await Promise.all([ctx.flushQueue(), ctx.flushQueue(), ctx.flushQueue()]);
  assert.equal(registro.envios.length, 1, `o mesmo protocolo foi enviado ${registro.envios.length} vezes`);
});

/* ───────────── updatePendingBanner ───────────── */

function montarAviso(qtd) {
  const classes = new Set();
  const banner = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  const texto = { innerHTML: '' };
  const ctx = carregar('cidadao', ['updatePendingBanner'], {
    dbGetAll: async () => Array.from({ length: qtd }, (_, i) => ({ id: i })),
    $: (id) => ({ 'pending-banner': banner, 'pending-text': texto })[id] || null
  });
  return { ctx, classes, texto };
}

test('CB-14 updatePendingBanner: esconde com 0, usa singular com 1 e plural com 3', async () => {
  const zero = montarAviso(0);
  zero.classes.add('show');
  await zero.ctx.updatePendingBanner();
  assert.equal(zero.classes.has('show'), false);

  const um = montarAviso(1);
  await um.ctx.updatePendingBanner();
  assert.equal(um.classes.has('show'), true);
  assert.match(um.texto.innerHTML, /1<\/span> reporte pendente — será enviado quando/);

  const tres = montarAviso(3);
  await tres.ctx.updatePendingBanner();
  assert.match(tres.texto.innerHTML, /3<\/span> reportes pendentes — serão enviados quando/);
});

test('CB-15 updatePendingBanner: erro no banco ou tela sem o aviso não quebram o app', async () => {
  const comErro = montarAviso(1);
  comErro.ctx.dbGetAll = async () => { throw new Error('falha'); };
  await assert.doesNotReject(comErro.ctx.updatePendingBanner());

  const semElemento = montarAviso(2);
  semElemento.ctx.$ = () => null;
  await assert.doesNotReject(semElemento.ctx.updatePendingBanner());
});
