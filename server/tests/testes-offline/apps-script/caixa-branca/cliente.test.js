/**
 * CAIXA-BRANCA — Código offline das telas com o servidor Apps Script
 *
 * CBA-01 a CBA-45: caminhos das funções offline (casos compartilhados,
 *                  com as respostas no formato do Apps Script).
 * CBA-50 em diante: casos que só existem com o Apps Script, incluindo
 *                  integração com o dublê do script (servidor de teste).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { registrarCasosCliente } = require('../../apoio/casos-cliente');
const d = require('../../apoio/dubles-cliente');
const { criarServidorTeste } = require('../../apoio/servidor-teste');

registrarCasosCliente(test, 'apps-script');

test('CBA-50 flushQueue (técnico): reenvio que o script responde "ja_fechado" deve sair da fila', { todo: 'Defeito DEF-08 — fechamento já registrado trava a fila para sempre' }, async () => {
  // Preparação: o fechamento chegou ao servidor, mas a resposta se perdeu; o item ficou na fila.
  const { ctx, banco } = d.montarFilaTecnico({
    itens: ['IC-JA-FECHADO', 'IC-2'],
    responder: (p) => (p.protocolo === 'IC-JA-FECHADO' ? { success: false, error: 'ja_fechado', status_atual: 'Concluído' } : { success: true })
  });
  // Ação
  await ctx.flushQueue();
  // Verificação: o servidor já tem o fechamento; o item não tem mais o que fazer na fila.
  assert.equal(banco.size, 0, `itens presos na fila: ${banco.size}`);
});

test('CBA-51 integração (cidadão ↔ dublê do Apps Script): flushQueue e postReport reais esvaziam a fila', async () => {
  const srv = await criarServidorTeste({ servidor: 'apps-script' });
  try {
    const { ctx, banco } = d.montarFilaCidadao({
      itens: [d.item('IC-261112-INT01')],
      endpoint: srv.url + '/apps-script/cidadao',
      comPostReportReal: true,
      rede: (url, opcoes) => fetch(url, opcoes)
    });
    await ctx.flushQueue();
    assert.equal(banco.size, 0);
    assert.equal(srv.estado.chamados.filter((c) => c.protocolo === 'IC-261112-INT01').length, 1);
  } finally { await srv.fechar(); }
});

test('CBA-52 integração (cidadão ↔ dublê): resposta perdida e reenvio geram um único registro', { todo: 'Defeito DEF-11 — sem identificador único, a duplicidade depende de o script descartar protocolo repetido' }, async () => {
  const srv = await criarServidorTeste({ servidor: 'apps-script', deduplicar: false });
  try {
    srv.estado.controle.cidadao = 'perde-resposta';
    const { ctx } = d.montarFilaCidadao({
      itens: [d.item('IC-261112-INT02')],
      endpoint: srv.url + '/apps-script/cidadao',
      comPostReportReal: true,
      rede: (url, opcoes) => fetch(url, opcoes)
    });
    await ctx.flushQueue(); // grava, mas a resposta é cortada
    srv.estado.controle.cidadao = 'ok';
    await ctx.flushQueue(); // reenvio
    const linhas = srv.estado.chamados.filter((c) => c.protocolo === 'IC-261112-INT02').length;
    assert.equal(linhas, 1, `linhas na planilha com o mesmo protocolo: ${linhas}`);
  } finally { await srv.fechar(); }
});

test('CBA-53 integração (técnico ↔ dublê): fechamento na fila é registrado e sai da fila', async () => {
  const srv = await criarServidorTeste({ servidor: 'apps-script' });
  try {
    const login = await fetch(srv.url + '/apps-script/tecnico', { method: 'POST', body: JSON.stringify({ action: 'login', pin: '1234' }) }).then((r) => r.json());
    const { ctx, banco } = d.montarFilaTecnico({
      itens: ['IC-261112-T01'], token: login.token,
      url: srv.url + '/apps-script/tecnico', rede: (u, o) => fetch(u, o)
    });
    await ctx.flushQueue();
    assert.equal(banco.size, 0);
    assert.equal(srv.estado.fechamentos.filter((f) => f.protocolo === 'IC-261112-T01').length, 1);
  } finally { await srv.fechar(); }
});
