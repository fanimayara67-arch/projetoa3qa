/**
 * TESTES DE CAIXA-BRANCA — Envio do reporte do cidadão (com e sem internet)
 *
 * Funções testadas (código real, recortado de public/index.html):
 *   - submitReport     decide entre enviar agora ou guardar na fila
 *   - postReport       faz a requisição ao servidor, com limite de 60 s
 *   - generateProtocol gera o protocolo mostrado ao cidadão
 *
 * Técnica: caminhos básicos e cobertura de decisões.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('../apoio/extrair-funcao');

const ENDPOINT_APPS_SCRIPT = 'https://script.google.com/macros/s/teste/exec';

/* ───────────── submitReport ───────────── */

function montarEnvio({ online = true, endpoint = ENDPOINT_APPS_SCRIPT, enviar, gravar } = {}) {
  const tela = { 'submit-btn': { disabled: false }, 'submit-btn-text': { textContent: 'Enviar reporte' } };
  const registro = { envios: 0, gravados: [], sucesso: [], mensagens: [] };
  const ctx = carregar('cidadao', ['submitReport'], {
    state: { submitting: false },
    navigator: { onLine: online },
    ENDPOINT: endpoint,
    $: (id) => tela[id],
    buildPayload: () => ({ protocolo: 'IC-261112-TESTE' }),
    postReport: async () => { registro.envios++; return enviar ? enviar() : { ok: true }; },
    dbAdd: async (p) => { if (gravar) gravar(); registro.gravados.push(p.protocolo); },
    onSubmitSuccess: (p, modo) => registro.sucesso.push(modo),
    showToast: (tipo, msg) => registro.mensagens.push(`${tipo}: ${msg}`)
  });
  return { ctx, tela, registro };
}

test('CB-16 submitReport: um segundo toque durante o envio é ignorado', async () => {
  const { ctx, registro } = montarEnvio();
  ctx.state.submitting = true;
  await ctx.submitReport();
  assert.equal(registro.envios, 0);
  assert.equal(registro.gravados.length, 0);
});

test('CB-17 submitReport: com internet e envio aceito, mostra "enviado" e não grava na fila', async () => {
  const { ctx, tela, registro } = montarEnvio();
  await ctx.submitReport();
  assert.equal(registro.envios, 1);
  assert.deepEqual(registro.sucesso, ['sent']);
  assert.equal(registro.gravados.length, 0);
  assert.equal(tela['submit-btn'].disabled, true, 'o botão fica travado até a tela de sucesso');
});

test('CB-18 submitReport: com internet e recusa do servidor, guarda na fila', async () => {
  const { ctx, registro } = montarEnvio({ enviar: () => ({ ok: false, error: 'erro_interno' }) });
  await ctx.submitReport();
  assert.deepEqual(registro.gravados, ['IC-261112-TESTE']);
  assert.deepEqual(registro.sucesso, ['queued']);
});

test('CB-19 submitReport: com internet e erro de rede, guarda na fila', async () => {
  const { ctx, registro } = montarEnvio({ enviar: () => { throw new Error('Failed to fetch'); } });
  await ctx.submitReport();
  assert.deepEqual(registro.gravados, ['IC-261112-TESTE']);
  assert.deepEqual(registro.sucesso, ['queued']);
});

test('CB-20 submitReport: se o envio falha e o aparelho não consegue gravar, avisa e libera o botão', async () => {
  const { ctx, tela, registro } = montarEnvio({
    enviar: () => ({ ok: false }),
    gravar: () => { throw new Error('cota do IndexedDB esgotada'); }
  });
  await ctx.submitReport();
  assert.equal(registro.sucesso.length, 0);
  assert.deepEqual(registro.mensagens, ['error: Erro ao salvar o reporte. Tente de novo.']);
  assert.equal(tela['submit-btn'].disabled, false);
  assert.equal(tela['submit-btn-text'].textContent, 'Enviar reporte');
  assert.equal(ctx.state.submitting, false);
});

test('CB-21 submitReport: sem internet, grava direto na fila sem tentar enviar', async () => {
  const { ctx, registro } = montarEnvio({ online: false });
  await ctx.submitReport();
  assert.equal(registro.envios, 0);
  assert.deepEqual(registro.gravados, ['IC-261112-TESTE']);
  assert.deepEqual(registro.sucesso, ['queued']);
});

test('CB-22 submitReport: sem internet e sem conseguir gravar, avisa e libera o botão', async () => {
  const { ctx, tela, registro } = montarEnvio({ online: false, gravar: () => { throw new Error('falha'); } });
  await ctx.submitReport();
  assert.deepEqual(registro.mensagens, ['error: Erro ao salvar. Tente de novo.']);
  assert.equal(tela['submit-btn'].disabled, false);
  assert.equal(ctx.state.submitting, false);
});

test('CB-23 submitReport: com internet mas servidor não configurado ("__..."), guarda na fila', async () => {
  const { ctx, registro } = montarEnvio({ endpoint: '__ILUMINA_ENDPOINT_CIDADAO__' });
  await ctx.submitReport();
  assert.equal(registro.envios, 0);
  assert.deepEqual(registro.sucesso, ['queued']);
});

/* ───────────── postReport ───────────── */

function montarRequisicao({ endpoint = ENDPOINT_APPS_SCRIPT, responder } = {}) {
  const registro = { chamadas: [], timers: [], limpos: [] };
  const ctx = carregar('cidadao', ['postReport'], {
    ENDPOINT: endpoint,
    AbortController,
    URLSearchParams,
    setTimeout: (fn, ms) => { registro.timers.push({ fn, ms }); return registro.timers.length; },
    clearTimeout: (id) => registro.limpos.push(id),
    fetch: async (url, opcoes) => {
      registro.chamadas.push({ url, opcoes });
      return responder ? responder(opcoes) : { text: async () => JSON.stringify({ ok: true, protocolo: 'IC-1' }) };
    }
  });
  return { ctx, registro };
}

test('CB-24 postReport: envia como formulário (campo payload em JSON), lê a resposta e limpa o timer', async () => {
  const { ctx, registro } = montarRequisicao();
  const resposta = await ctx.postReport({ protocolo: 'IC-1', tipo: 'apagado' });
  assert.deepEqual({ ...resposta }, { ok: true, protocolo: 'IC-1' });
  const { url, opcoes } = registro.chamadas[0];
  assert.equal(url, ENDPOINT_APPS_SCRIPT);
  assert.equal(opcoes.method, 'POST');
  assert.ok(opcoes.body instanceof URLSearchParams);
  assert.deepEqual(JSON.parse(opcoes.body.get('payload')), { protocolo: 'IC-1', tipo: 'apagado' });
  assert.equal(registro.timers[0].ms, 60000);
  assert.deepEqual(registro.limpos, [1]);
});

test('CB-25 postReport: resposta que não é JSON vira recusa ("resposta inválida do servidor")', async () => {
  const { ctx } = montarRequisicao({ responder: () => ({ text: async () => '<html>Erro 502</html>' }) });
  const resposta = await ctx.postReport({ protocolo: 'IC-1' });
  assert.deepEqual({ ...resposta }, { ok: false, error: 'resposta inválida do servidor' });
});

test('CB-26 postReport: erro de rede é repassado a quem chamou e o timer é limpo', async () => {
  const { ctx, registro } = montarRequisicao({ responder: () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(ctx.postReport({ protocolo: 'IC-1' }), /Failed to fetch/);
  assert.deepEqual(registro.limpos, [1]);
});

test('CB-27 postReport: depois de 60 s sem resposta a requisição é cancelada', async () => {
  const { ctx, registro } = montarRequisicao({
    responder: (opcoes) => new Promise((_, rejeitar) => {
      opcoes.signal.addEventListener('abort', () => rejeitar(new Error('AbortError')));
    })
  });
  const envio = ctx.postReport({ protocolo: 'IC-1' });
  await new Promise((r) => setImmediate(r));
  registro.timers[0].fn(); // simula o fim dos 60 s
  await assert.rejects(envio, /AbortError/);
  assert.equal(registro.chamadas[0].opcoes.signal.aborted, true);
});

test('CB-28 [D4] postReport: com a API Node deve enviar JSON com o campo id', { todo: 'Defeito D4 — formato incompatível com a API Node' }, async () => {
  const { ctx, registro } = montarRequisicao({ endpoint: '/api/chamados' });
  await ctx.postReport({ protocolo: 'IC-1', tipo: 'apagado' });
  const { opcoes } = registro.chamadas[0];
  const tipo = (opcoes.headers && (opcoes.headers['Content-Type'] || opcoes.headers['content-type'])) || '(nenhum: o navegador usa form-urlencoded)';
  assert.match(tipo, /application\/json/, `Content-Type enviado: ${tipo}`);
  assert.ok(JSON.parse(opcoes.body).id, 'o corpo deve ter um id único para a API evitar duplicidade');
});

/* ───────────── generateProtocol ───────────── */

test('CB-29 generateProtocol: formato IC-AAMMDD-XXXXX com zero à esquerda no mês e no dia', () => {
  class DataFixa extends Date {
    constructor(...args) { if (args.length) super(...args); else super(2026, 0, 5, 9, 30); }
  }
  const aleatorio = Object.create(Math);
  aleatorio.random = () => 0.123456789;
  const ctx = carregar('cidadao', ['generateProtocol'], { Date: DataFixa, Math: aleatorio });
  assert.equal(ctx.generateProtocol(), 'IC-260105-4FZZZ');
});
