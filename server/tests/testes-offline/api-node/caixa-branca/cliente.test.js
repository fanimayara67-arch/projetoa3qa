/**
 * CAIXA-BRANCA — Código offline das telas com o servidor API Node
 *
 * CBN-01 a CBN-45: caminhos das funções offline (casos compartilhados, com as
 *                  respostas no formato da API Node: { success, ok, error: { codigo, mensagem } }).
 * CBN-50 em diante: integração do código real das telas com a API Node real
 *                  (rotas, validação e serviços do projeto; banco em memória).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { registrarCasosCliente } = require('../../apoio/casos-cliente');
const d = require('../../apoio/dubles-cliente');
const { criarServidorTeste, PIN_TESTE } = require('../../apoio/servidor-teste');

registrarCasosCliente(test, 'api-node');

test('CBN-50 integração (cidadão ↔ API Node): a fila deve esvaziar quando a API está no ar', { todo: 'Defeito DEF-01 — a API recusa o formulário com 400 JSON_INVALIDO' }, async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    // Preparação: um reporte na fila; flushQueue e postReport são o código real da tela.
    const { ctx, banco, registro } = d.montarFilaCidadao({
      itens: [d.item('IC-261112-NODE1')],
      endpoint: srv.url + '/api/chamados',
      comPostReportReal: true,
      rede: (url, opcoes) => fetch(url, opcoes)
    });
    // Ação
    await ctx.flushQueue();
    // Verificação
    const motivo = registro.tentativas[0] && JSON.stringify(registro.tentativas[0].lastError);
    assert.equal(banco.size, 0, `o reporte ficou na fila com o motivo ${motivo}`);
  } finally { await srv.fechar(); }
});

test('CBN-51 integração (cidadão ↔ API Node): a causa da recusa é o formato da mensagem', async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    const { ctx, registro } = d.montarFilaCidadao({
      itens: [d.item('IC-261112-NODE2')],
      endpoint: srv.url + '/api/chamados',
      comPostReportReal: true,
      rede: (url, opcoes) => fetch(url, opcoes)
    });
    await ctx.flushQueue();
    assert.equal(registro.tentativas[0].lastError.codigo, 'JSON_INVALIDO');
    assert.match(srv.estado.requisicoes[0].tipo, /x-www-form-urlencoded/);
  } finally { await srv.fechar(); }
});

test('CBN-52 integração (técnico ↔ API Node): o fechamento na fila deve ser registrado', { todo: 'Defeito DEF-02 — o app envia { action: "close" } para /api, rota que não existe' }, async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    const login = await fetch(srv.url + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN_TESTE })
    }).then((r) => r.json());
    const { ctx, banco } = d.montarFilaTecnico({
      itens: ['IC-261112-T01'], token: login.data.token,
      url: srv.url + '/api', rede: (u, o) => fetch(u, o)
    });
    await ctx.flushQueue();
    const caminhos = srv.estado.requisicoes.map((q) => `${q.metodo} ${q.caminho}`).join(', ');
    assert.equal(srv.estado.fechamentos.length, 1, `requisições recebidas: ${caminhos}`);
    assert.equal(banco.size, 0);
  } finally { await srv.fechar(); }
});

test('CBN-53 integração (técnico ↔ API Node): a API responde 404 ROTA_NAO_ENCONTRADA e a fila fica presa', async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    const { ctx, banco } = d.montarFilaTecnico({
      itens: ['IC-261112-T01', 'IC-261112-T02'], token: 'qualquer',
      url: srv.url + '/api', rede: (u, o) => fetch(u, o)
    });
    await ctx.flushQueue();
    assert.equal(banco.size, 2, 'nenhum item saiu da fila');
    assert.deepEqual(srv.estado.requisicoes.map((q) => q.caminho), ['/api'], 'parou no primeiro item');
  } finally { await srv.fechar(); }
});

test('CBN-55 buildPayload: a mensagem do reporte deve levar o id único exigido pela API Node', { todo: 'Defeito DEF-01 — a mensagem não tem o campo id' }, () => {
  const p = { ...d.montarPayloadCidadao().buildPayload() };
  assert.ok(p.id, `campos enviados: ${Object.keys(p).join(', ')}`);
});

test('CBN-54 submitReport: o motivo de uma recusa da API deve ser legível', { todo: 'Defeito DEF-12 — o objeto de erro da API vira "[object Object]"' }, async () => {
  const { ctx, registro } = d.montarEnvioCidadao({
    endpoint: '/api/chamados',
    enviar: () => ({ success: false, ok: false, error: { codigo: 'JSON_INVALIDO', mensagem: 'JSON inválido no corpo da requisição.' } })
  });
  await ctx.submitReport();
  const log = registro.avisosConsole.join(' ');
  assert.doesNotMatch(log, /\[object Object\]/, `registro do app: ${log}`);
});
