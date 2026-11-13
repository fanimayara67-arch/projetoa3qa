/**
 * UC05 — Atender e encerrar chamado (fechar OS) | Envio do fechamento pelo painel do técnico.
 *
 * As funções são recortadas de public/tecnico/index.html e rodam num contexto isolado
 * (apoio dos testes offline: extrair-funcao.js), com a rede e a fila substituídas por dublês.
 * Defeitos de referência no catálogo dos testes offline: DEF-02, DEF-07 e DEF-08.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('../testes-offline/apoio/extrair-funcao');
const { montarFilaTecnico } = require('../testes-offline/apoio/dubles-cliente');

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const OPERACAO = '44444444-4444-4444-8444-444444444444';

/** Payload exatamente como a função fecharChamado() da tela monta. */
function payloadDaTela(alterar = {}) {
  return {
    action: 'close',
    token: 'tok-tecnico',
    operacao_id: OPERACAO,
    protocolo: 'IC-261110-FECHA',
    tecnico: 'Carlos',
    status: 'Concluído',
    servico: 'Troca do reator',
    referencia: 'Em frente à escola',
    poste_id_override: 'P-0007',
    poste_force_new: false,
    materiais_os: [{ item: 'Reator', qtd: 1, unidade: 'un' }, { item: 'Cabo (m)', qtd: 3, unidade: 'm' }],
    config: { braco: 'Curto', luminaria: 'LED', reator: 'Eletrônico', fotosensor: 'Novo', porta_fusivel: '5x20', fusivel: '2A', cabo: '2,5', conector: 'Cunha', obs: '' },
    latitude: '-10.125300',
    longitude: '-36.175600',
    precisao_m: 8,
    data_fechamento: '13/11/2026, 10:30',
    data_fechamento_iso: '2026-11-13T13:30:00.000Z',
    foto_reparo_base64: FOTO,
    ...alterar
  };
}

/** apiFetchTO real, com SHEETS_URL configurado e a rede trocada por um stub que anota a chamada. */
function montarEnvio({ url = '/api', resposta = { ok: true, data: { id: 1 } } } = {}) {
  const chamadas = [];
  const ctx = carregar('tecnico', ['apiFetchTO', 'fechamentoParaApiNode', 'respostaDaApiNode'], {
    SHEETS_URL: url,
    AbortController,
    setTimeout: () => 1,
    clearTimeout: () => {},
    crypto: { randomUUID: () => '55555555-5555-4555-8555-555555555555' },
    fetch: (u, opcoes) => {
      chamadas.push({ url: u, opcoes });
      return Promise.resolve({ json: async () => (typeof resposta === 'function' ? resposta(u, opcoes) : resposta) });
    }
  });
  return { ctx, chamadas };
}

/* ── DEF-02: o fechamento precisa chegar à API Node ── */

test('FO-25 [caixa-branca | DEF-02] com a API Node, o fechamento vai para POST /api/chamados/:protocolo/fechamento em JSON com o token no cabeçalho', async () => {
  const { ctx, chamadas } = montarEnvio();
  await ctx.apiFetchTO(payloadDaTela(), 40000);

  const { url, opcoes } = chamadas[0];
  assert.equal(url, '/api/chamados/IC-261110-FECHA/fechamento');
  assert.equal(opcoes.method, 'POST');
  assert.equal(opcoes.headers['Content-Type'], 'application/json');
  assert.equal(opcoes.headers.Authorization, 'Bearer tok-tecnico');
  const corpo = JSON.parse(opcoes.body);
  assert.equal('action' in corpo, false, 'o corpo não leva a ação do Apps Script');
  assert.equal('token' in corpo, false, 'o token vai no cabeçalho, não no corpo');
});

test('FO-26 [caixa-branca | DEF-02] o corpo segue o contrato da API: operacao_id, materiais {nome, quantidade}, data ISO, poste e precisão', async () => {
  const { ctx, chamadas } = montarEnvio();
  await ctx.apiFetchTO(payloadDaTela(), 40000);
  const corpo = JSON.parse(chamadas[0].opcoes.body);

  assert.equal(corpo.operacao_id, OPERACAO, 'a mesma operação criada na tela (idempotência no reenvio)');
  assert.deepEqual(corpo.materiais_os, [{ nome: 'Reator', quantidade: 1 }, { nome: 'Cabo (m)', quantidade: 3 }]);
  assert.equal(corpo.data_fechamento, '2026-11-13T13:30:00.000Z');
  assert.equal(corpo.poste_id, 'P-0007');
  assert.equal(corpo.precisao_m, 8);
  assert.equal(corpo.latitude, '-10.125300');
  assert.equal(corpo.foto_reparo_base64, FOTO);
});

test('FO-27 [suposição de erro | DEF-02] fechamento antigo da fila, sem operacao_id nem data ISO, ainda é enviado', async () => {
  const { ctx, chamadas } = montarEnvio();
  const antigo = payloadDaTela({ operacao_id: undefined, data_fechamento_iso: undefined, precisao_m: undefined });
  await ctx.apiFetchTO(antigo, 40000);
  const corpo = JSON.parse(chamadas[0].opcoes.body);
  assert.match(corpo.operacao_id, /^[0-9a-f-]{36}$/);
  assert.equal(antigo.operacao_id, corpo.operacao_id, 'a operação gerada fica no item, para o reenvio usar a mesma');
  assert.ok(!Number.isNaN(Date.parse(corpo.data_fechamento)), 'data em formato que o servidor aceita');
});

test('FO-28 [caixa-branca | DEF-02] as respostas da API viram as respostas que a tela já sabe tratar', async () => {
  const casos = [
    [{ ok: true, data: { id: 9, status: 'Concluído' } }, (r) => assert.equal(r.success, true)],
    [{ ok: false, error: { codigo: 'CONFLITO', mensagem: 'Chamado já foi fechado por outro técnico.' } },
      (r) => { assert.equal(r.success, false); assert.equal(r.error, 'ja_fechado'); }],
    [{ ok: false, error: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão expirada ou inválida.' } },
      (r) => assert.equal(r.error, 'sessao_expirada')],
    [{ ok: false, error: { codigo: 'DADO_INVALIDO', mensagem: 'Foto do reparo é obrigatória.' } },
      (r) => { assert.equal(r.success, false); assert.equal(r.error, 'Foto do reparo é obrigatória.', 'mensagem legível, não "[object Object]"'); }]
  ];
  for (const [resposta, conferir] of casos) {
    const { ctx } = montarEnvio({ resposta });
    conferir(await ctx.apiFetchTO(payloadDaTela(), 40000));
  }
});

test('FO-29 [caixa-preta | regressão] com o Apps Script o envio continua igual (text/plain, corpo inalterado)', async () => {
  const url = 'https://script.google.com/macros/s/teste/exec';
  const { ctx, chamadas } = montarEnvio({ url, resposta: { success: true } });
  const payload = payloadDaTela();
  const r = await ctx.apiFetchTO(payload, 40000);
  assert.equal(chamadas[0].url, url);
  assert.equal(chamadas[0].opcoes.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(chamadas[0].opcoes.body), payload);
  assert.equal(r.success, true);
});

/* ── DEF-07 e DEF-08: a fila do técnico não pode travar ── */

test('FO-30 [baseada em risco | DEF-07 | A5] um fechamento recusado não trava os seguintes e continua na fila', async () => {
  const { ctx, banco, registro } = montarFilaTecnico({
    itens: ['IC-RUIM', 'IC-2', 'IC-3'],
    responder: (p) => (p.protocolo === 'IC-RUIM' ? { success: false, error: 'Foto do reparo é obrigatória.' } : { success: true })
  });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-RUIM', 'IC-2', 'IC-3']);
  assert.deepEqual([...banco.values()].map((r) => r.payload.protocolo), ['IC-RUIM'], 'só o recusado fica para o técnico corrigir');
});

test('FO-31 [baseada em risco | DEF-08 | A5] chamado já fechado (resposta "ja_fechado") sai da fila e não trava os outros', async () => {
  const { ctx, banco, registro } = montarFilaTecnico({
    itens: ['IC-JA', 'IC-2'],
    responder: (p) => (p.protocolo === 'IC-JA' ? { success: false, error: 'ja_fechado' } : { success: true })
  });
  await ctx.flushQueue();
  assert.deepEqual(registro.envios, ['IC-JA', 'IC-2']);
  assert.equal(banco.size, 0);
});

test('FO-32 [caixa-branca | cobertura de ramos] sessão expirada e falta de rede interrompem a fila sem apagar nada', async () => {
  const expirada = montarFilaTecnico({ itens: ['IC-1', 'IC-2'], responder: () => ({ success: false, error: 'sessao_expirada' }) });
  await expirada.ctx.flushQueue();
  assert.deepEqual(expirada.registro.envios, ['IC-1']);
  assert.equal(expirada.banco.size, 2);

  const semRede = montarFilaTecnico({ itens: ['IC-1', 'IC-2'], responder: () => { throw new TypeError('Failed to fetch'); } });
  await semRede.ctx.flushQueue();
  assert.deepEqual(semRede.registro.envios, ['IC-1']);
  assert.equal(semRede.banco.size, 2);
});
