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

// Fechamento como a tela monta (fecharChamado), com os campos que o UC05 exige.
const FECHAMENTO_DA_TELA = {
  status: 'Concluído', servico: 'Troca de lâmpada', referencia: 'Em frente à escola',
  latitude: '-10.125100', longitude: '-36.175200', precisao_m: 6,
  foto_reparo_base64: 'data:image/jpeg;base64,AAAA', materiais_os: [],
  data_fechamento: '12/11/2026, 10:30', data_fechamento_iso: '2026-11-12T13:30:00.000Z'
};

// Revisado no UC05: DEF-02 corrigido (o fechamento vai para POST /api/chamados/:protocolo/fechamento).
test('CBN-52 integração (técnico ↔ API Node): o fechamento na fila deve ser registrado', async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    const login = await fetch(srv.url + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN_TESTE })
    }).then((r) => r.json());
    const { ctx, banco } = d.montarFilaTecnico({
      itens: ['IC-261112-T01'], token: login.data.token, dadosFechamento: FECHAMENTO_DA_TELA,
      url: srv.url + '/api', rede: (u, o) => fetch(u, o)
    });
    await ctx.flushQueue();
    const caminhos = srv.estado.requisicoes.map((q) => `${q.metodo} ${q.caminho}`).join(', ');
    assert.equal(srv.estado.fechamentos.length, 1, `requisições recebidas: ${caminhos}`);
    assert.equal(banco.size, 0);
  } finally { await srv.fechar(); }
});

// Revisado no UC05: antes registrava o DEF-02 (404 em /api e fila presa). Com o envio corrigido,
// o fechamento vai à rota certa; com sessão inválida a API responde 401 e a fila espera o novo PIN.
test('CBN-53 integração (técnico ↔ API Node): com sessão inválida a API responde 401 e a fila fica guardada', async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    const { ctx, banco } = d.montarFilaTecnico({
      itens: ['IC-261112-T01', 'IC-261112-T02'], token: 'qualquer', dadosFechamento: FECHAMENTO_DA_TELA,
      url: srv.url + '/api', rede: (u, o) => fetch(u, o)
    });
    await ctx.flushQueue();
    assert.equal(banco.size, 2, 'nenhum item saiu da fila');
    assert.deepEqual(srv.estado.requisicoes.map((q) => q.caminho), ['/api/chamados/IC-261112-T01/fechamento'], 'parou no primeiro item');
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
