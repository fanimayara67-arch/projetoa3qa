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

// Reporte como o buildPayload da tela monta (UC01: tipo, GPS, foto). Sem id: o envio cria.
const REPORTE_DA_TELA = {
  timestamp: '2026-11-12T11:00:00.000Z', tipo: 'apagado', lat: -10.1251, lng: -36.1752, acc: 6,
  descricao: 'Poste apagado em frente à escola', nome: '', tel: '', endereco: 'Rua de Teste, 1',
  foto_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', user_agent: 'Teste'
};
const reporte = (protocolo) => ({ payload: { ...REPORTE_DA_TELA, protocolo } });

// DEF-01 (corrigido): era `todo` — a API recusava o formulário com 400 JSON_INVALIDO.
test('CBN-50 integração (cidadão ↔ API Node): a fila deve esvaziar quando a API está no ar', async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    // Preparação: um reporte na fila; flushQueue e postReport são o código real da tela.
    const { ctx, banco, registro } = d.montarFilaCidadao({
      itens: [reporte('IC-261112-NODE1')],
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

// DEF-01: antes este caso comprovava a causa da recusa (formulário → 400 JSON_INVALIDO).
// Revisado: a mensagem tem de ir em JSON, com o id único, e a API grava um chamado só.
test('CBN-51 integração (cidadão ↔ API Node): a mensagem vai em JSON, com id, e a API grava o chamado', async () => {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try {
    const { ctx, registro } = d.montarFilaCidadao({
      itens: [reporte('IC-261112-NODE2')],
      endpoint: srv.url + '/api/chamados',
      comPostReportReal: true,
      rede: (url, opcoes) => fetch(url, opcoes)
    });
    await ctx.flushQueue();
    const motivo = registro.tentativas[0] && JSON.stringify(registro.tentativas[0].lastError);
    assert.match(srv.estado.requisicoes[0].tipo, /application\/json/, `recusa: ${motivo}`);
    assert.equal(srv.estado.chamados.filter((c) => c.protocolo === 'IC-261112-NODE2').length, 1);
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

// DEF-01 (corrigido): era `todo` — a mensagem não tinha o campo id.
test('CBN-55 buildPayload: a mensagem do reporte deve levar o id único exigido pela API Node', () => {
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

// DEF-01: reporte salvo na fila antes da correção (sem id). O id criado no primeiro envio fica
// no próprio payload da fila: se a resposta se perder, o reenvio usa o mesmo id e a API não duplica.
test('CBN-56 postReport: reporte antigo da fila, sem id, ganha um id que se mantém no reenvio', async () => {
  const { ctx, registro } = d.montarRequisicaoCidadao({ endpoint: '/api/chamados' });
  const antigo = { protocolo: 'IC-261101-VELHO', tipo: 'apagado' };
  await ctx.postReport(antigo);
  await ctx.postReport(antigo);
  const [primeiro, segundo] = registro.chamadas.map((ch) => JSON.parse(ch.opcoes.body));
  assert.match(primeiro.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(segundo.id, primeiro.id);
  assert.equal(antigo.id, primeiro.id, 'o id fica guardado no item da fila');
});
