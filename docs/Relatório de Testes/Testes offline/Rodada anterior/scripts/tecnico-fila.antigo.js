/**
 * TESTES DE CAIXA-BRANCA — Fila offline de fechamentos do painel do técnico
 *
 * Funções testadas (código real, recortado de public/tecnico/index.html):
 *   - flushQueue          envia os fechamentos guardados no aparelho
 *   - apiFetchTO          faz a requisição ao servidor, com limite de tempo
 *   - renderPendingBanner mostra o aviso de fechamentos pendentes
 *   - queueCount          conta a fila (usada no limite de 10 fechamentos)
 *
 * Técnica: caminhos básicos e cobertura de decisões.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, extrairDeclaracao } = require('../apoio/extrair-funcao');

/* ───────────── flushQueue ───────────── */

function montarFila({ itens = [], online = true, token = 'tok-valido', responder } = {}) {
  const banco = new Map(itens.map((protocolo, i) => [i + 1, { id: i + 1, payload: { action: 'close', protocolo } }]));
  const registro = { envios: [], apagados: [], avisos: 0 };
  // A trava `flushInFlight` é uma variável do script da página: vem do próprio HTML.
  const trava = extrairDeclaracao('tecnico', /let flushInFlight\s*=\s*false;/);
  const ctx = carregar('tecnico', ['flushQueue'], {
    navigator: { onLine: online },
    sessionToken: token,
    queueAll: async () => [...banco.values()].map((r) => ({ ...r })),
    queueDelete: async (id) => { registro.apagados.push(id); banco.delete(id); },
    apiFetchTO: async (payload, ms) => {
      registro.envios.push(payload.protocolo);
      assert.equal(ms, 40000, 'a fila usa limite de 40 s por envio');
      return responder ? responder(payload) : { success: true };
    },
    renderPendingBanner: () => { registro.avisos++; }
  }, [trava]);
  return { ctx, banco, registro };
}

test('CB-30 flushQueue (técnico): sem internet não envia e não atualiza o aviso', async () => {
  const { ctx, registro } = montarFila({ itens: ['IC-1'], online: false });
  await ctx.flushQueue();
  assert.equal(registro.envios.length, 0);
  assert.equal(registro.avisos, 0);
});

test('CB-31 flushQueue (técnico): sem sessão (sem PIN) não envia', async () => {
  const { ctx, registro } = montarFila({ itens: ['IC-1'], token: null });
  await ctx.flushQueue();
  assert.equal(registro.envios.length, 0);
});

test('CB-32 flushQueue (técnico): fila vazia libera a trava e atualiza o aviso', async () => {
  const { ctx, registro } = montarFila({ itens: [] });
  await ctx.flushQueue();
  assert.equal(registro.avisos, 1);
  ctx.queueAll = async () => [{ id: 9, payload: { protocolo: 'IC-9' } }];
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-9'], 'uma nova execução não ficou bloqueada');
});

test('CB-33 flushQueue (técnico): todos aceitos são apagados na ordem da fila', async () => {
  const { ctx, banco, registro } = montarFila({ itens: ['IC-1', 'IC-2', 'IC-3'] });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-1', 'IC-2', 'IC-3']);
  assert.deepEqual(registro.apagados, [1, 2, 3]);
  assert.equal(banco.size, 0);
});

test('CB-34 flushQueue (técnico): sessão expirada interrompe o envio e mantém a fila', async () => {
  const { ctx, banco, registro } = montarFila({
    itens: ['IC-1', 'IC-2'],
    responder: () => ({ success: false, error: 'sessao_expirada' })
  });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-1']);
  assert.equal(banco.size, 2);
  assert.equal(registro.avisos, 1);
});

test('CB-35 flushQueue (técnico): erro de rede interrompe o envio e mantém a fila', async () => {
  const { ctx, banco, registro } = montarFila({
    itens: ['IC-1', 'IC-2'],
    responder: () => { throw new TypeError('Failed to fetch'); }
  });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-1']);
  assert.equal(banco.size, 2);
});

test('CB-36 flushQueue (técnico): duas sincronizações ao mesmo tempo enviam cada fechamento uma vez', async () => {
  const { ctx, registro } = montarFila({ itens: ['IC-1'] });
  await Promise.all([ctx.flushQueue(), ctx.flushQueue(), ctx.flushQueue()]);
  assert.deepEqual(registro.envios, ['IC-1']);
});

test('CB-37 flushQueue (técnico): erro ao ler a fila libera a trava, mas o erro escapa da função', async () => {
  const { ctx, registro } = montarFila({ itens: ['IC-1'] });
  const ler = ctx.queueAll;
  ctx.queueAll = async () => { throw new Error('IndexedDB indisponível'); };
  // Observação O1: a função rejeita; quem a chama (setTimeout, visibilitychange) não trata o erro.
  await assert.rejects(ctx.flushQueue(), /IndexedDB indisponível/);
  assert.equal(registro.avisos, 1, 'o bloco finally rodou');
  ctx.queueAll = ler;
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-1'], 'a trava foi liberada');
});

test('CB-38 [D5] flushQueue (técnico): erro do servidor em um fechamento não deve travar os seguintes', { todo: 'Defeito D5 — fila do técnico para no primeiro erro' }, async () => {
  const { ctx, registro } = montarFila({
    itens: ['IC-RUIM', 'IC-2', 'IC-3'],
    responder: (p) => (p.protocolo === 'IC-RUIM' ? { success: false, error: 'erro_interno' } : { success: true })
  });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-RUIM', 'IC-2', 'IC-3'], `enviados: ${registro.envios.join(', ')}`);
});

/* ───────────── apiFetchTO ───────────── */

function montarRequisicao({ url = 'https://script.google.com/macros/s/teste/exec' } = {}) {
  const registro = { chamadas: [], timers: [], limpos: [] };
  const ctx = carregar('tecnico', ['apiFetchTO'], {
    SHEETS_URL: url,
    AbortController,
    setTimeout: (fn, ms) => { registro.timers.push({ fn, ms }); return registro.timers.length; },
    clearTimeout: (id) => registro.limpos.push(id),
    fetch: (u, opcoes) => {
      registro.chamadas.push({ url: u, opcoes });
      return Promise.resolve({ json: async () => ({ success: true }) });
    }
  });
  return { ctx, registro };
}

test('CB-39 apiFetchTO: envia JSON como text/plain, usa 15 s por padrão e limpa o timer', async () => {
  const { ctx, registro } = montarRequisicao();
  const resposta = await ctx.apiFetchTO({ action: 'close', protocolo: 'IC-1' });
  assert.equal(resposta.success, true);
  const { opcoes } = registro.chamadas[0];
  assert.equal(opcoes.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(opcoes.body), { action: 'close', protocolo: 'IC-1' });
  assert.equal(registro.timers[0].ms, 15000);
  assert.deepEqual(registro.limpos, [1]);

  await ctx.apiFetchTO({ action: 'list' }, 40000);
  assert.equal(registro.timers[1].ms, 40000);
});

test('CB-39b apiFetchTO: esgotado o tempo limite, a requisição é cancelada', async () => {
  const { ctx, registro } = montarRequisicao();
  ctx.fetch = (u, opcoes) => {
    registro.chamadas.push({ url: u, opcoes });
    return new Promise((_, rejeitar) => opcoes.signal.addEventListener('abort', () => rejeitar(new Error('AbortError'))));
  };
  const envio = ctx.apiFetchTO({ action: 'close', protocolo: 'IC-1' }, 40000);
  registro.timers[0].fn(); // simula o fim dos 40 s
  await assert.rejects(envio, /AbortError/);
  assert.equal(registro.chamadas[0].opcoes.signal.aborted, true);
  assert.deepEqual(registro.limpos, [1]);
});

test('CB-40 [D6] apiFetchTO: com a API Node, o fechamento deve ir para /api/chamados/{protocolo}/fechamento', { todo: 'Defeito D6 — formato do Apps Script enviado à API Node' }, async () => {
  const { ctx, registro } = montarRequisicao({ url: '/api' });
  await ctx.apiFetchTO({ action: 'close', protocolo: 'IC-1' }, 40000);
  assert.equal(registro.chamadas[0].url, '/api/chamados/IC-1/fechamento');
});

/* ───────────── renderPendingBanner e queueCount ───────────── */

function montarAviso(qtd, online) {
  const classes = new Set();
  const texto = { textContent: '' };
  const banner = {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    querySelector: () => texto
  };
  const ctx = carregar('tecnico', ['renderPendingBanner'], {
    queueCount: async () => qtd,
    isOnline: online,
    document: { getElementById: () => banner }
  });
  return { ctx, classes, texto };
}

test('CB-41 renderPendingBanner: esconde com 0; singular/plural; "enviando…" online e "sem sinal" offline', async () => {
  const zero = montarAviso(0, true);
  zero.classes.add('show');
  await zero.ctx.renderPendingBanner();
  assert.equal(zero.classes.has('show'), false);

  const um = montarAviso(1, false);
  await um.ctx.renderPendingBanner();
  assert.equal(um.texto.textContent, '1 fechamento pendente — sem sinal');

  const dois = montarAviso(2, true);
  await dois.ctx.renderPendingBanner();
  assert.equal(dois.texto.textContent, '2 fechamentos pendentes — enviando…');

  const semElemento = montarAviso(3, true);
  semElemento.ctx.document = { getElementById: () => null };
  await assert.doesNotReject(semElemento.ctx.renderPendingBanner());
});

test('CB-42 queueCount: erro ao ler a fila conta como 0 (o limite de 10 deixa de valer)', async () => {
  const ctx = carregar('tecnico', ['queueCount'], {
    queueAll: async () => { throw new Error('IndexedDB indisponível'); }
  });
  // Observação O2: com o banco falhando, a checagem `pending >= MAX_QUEUE` sempre passa.
  assert.equal(await ctx.queueCount(), 0);
  ctx.queueAll = async () => new Array(10).fill({});
  assert.equal(await ctx.queueCount(), 10);
});
