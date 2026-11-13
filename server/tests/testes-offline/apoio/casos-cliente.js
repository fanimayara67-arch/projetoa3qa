/**
 * Casos de caixa-branca do código offline das telas, parametrizados pelo
 * contrato do servidor (API Node ou Apps Script).
 *
 * O código do aparelho é o mesmo nos dois cenários; o que muda é o formato que
 * o servidor responde e espera receber. Por isso os caminhos testados são os
 * mesmos e cada servidor entra com as suas respostas (`contrato`).
 *
 * Padrão de cada teste: Preparação → Ação → Verificação (AAA).
 * Testes com `todo` exigem o comportamento correto e falham hoje: confirmam um
 * defeito sem quebrar o `npm test`.
 */

const assert = require('node:assert/strict');
const d = require('./dubles-cliente');
const { item } = d;

/**
 * Contratos de cada servidor, tirados do código:
 *   - API Node: server/src/presentation/views/resposta.js e tratarErros.js;
 *   - Apps Script: o que as telas esperam (o script não está no repositório).
 */
const CONTRATOS = {
  'apps-script': {
    nome: 'Apps Script',
    endpointCidadao: d.ENDPOINT_APPS_SCRIPT,
    endpointTecnico: d.ENDPOINT_APPS_SCRIPT,
    formatoCidadao: 'formulario', // form-urlencoded, para evitar o preflight de CORS do Apps Script
    cidadao: {
      aceito: { ok: true, protocolo: 'IC-1' },
      recusa: { ok: false, error: 'dados inválidos' }
    },
    tecnico: {
      aceito: { success: true },
      sessaoExpirada: { success: false, error: 'sessao_expirada' },
      erro: { success: false, error: 'erro_interno' }
    }
  },
  'api-node': {
    nome: 'API Node',
    endpointCidadao: '/api/chamados',
    endpointTecnico: '/api',
    formatoCidadao: 'json', // a API só lê JSON e exige o campo id
    cidadao: {
      aceito: { success: true, ok: true, data: { protocolo: 'IC-1' } },
      recusa: { success: false, ok: false, error: { codigo: 'DADO_INVALIDO', mensagem: 'Dados inválidos.' } }
    },
    tecnico: {
      aceito: { success: true, ok: true, data: {} },
      sessaoExpirada: { success: false, ok: false, error: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão expirada ou inválida.' } },
      erro: { success: false, ok: false, error: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno no servidor.' } }
    }
  }
};

function registrarCasosCliente(test, servidor) {
  const c = CONTRATOS[servidor];
  const P = servidor === 'api-node' ? 'CBN' : 'CBA';
  const id = (n) => `${P}-${String(n).padStart(2, '0')}`;
  const ehNode = servidor === 'api-node';

  /* ═══════════ flushQueue do cidadão (V(G) = 11) ═══════════ */

  const filaC = (o) => d.montarFilaCidadao({ endpoint: c.endpointCidadao, ...o });

  test(`${id(1)} flushQueue (cidadão): sem internet não lê a fila nem envia`, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-1')], online: false });
    await ctx.flushQueue();
    assert.equal(registro.envios.length, 0);
    assert.equal(registro.avisosAtualizados, 0);
  });

  test(`${id(2)} flushQueue (cidadão): endereço do servidor não configurado ("__...") não envia`, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-1')], endpoint: '__ILUMINA_ENDPOINT_CIDADAO__' });
    await ctx.flushQueue();
    assert.equal(registro.envios.length, 0);
  });

  test(`${id(3)} flushQueue (cidadão): erro ao ler o banco do aparelho encerra sem enviar e sem lançar erro`, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-1')] });
    ctx.dbGetAll = async () => { throw new Error('IndexedDB indisponível'); };
    await assert.doesNotReject(ctx.flushQueue());
    assert.equal(registro.envios.length, 0);
    assert.equal(registro.avisosAtualizados, 0);
  });

  test(`${id(4)} flushQueue (cidadão): fila vazia encerra sem enviar`, async () => {
    const { ctx, registro } = filaC({ itens: [] });
    await ctx.flushQueue();
    assert.equal(registro.envios.length, 0);
    assert.equal(registro.avisosAtualizados, 0);
  });

  test(`${id(5)} flushQueue (cidadão): envio aceito (${c.nome}) apaga o item e atualiza o aviso`, async () => {
    const { ctx, banco, registro } = filaC({ itens: [item('IC-1')], enviar: () => c.cidadao.aceito });
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-1']);
    assert.equal(banco.size, 0);
    assert.equal(registro.avisosAtualizados, 1);
  });

  test(`${id(6)} flushQueue (cidadão): recusa do servidor (${c.nome}) mantém o item e soma 1 tentativa com o motivo`, async () => {
    const { ctx, banco, registro } = filaC({ itens: [item('IC-1', { attempts: 2 })], enviar: () => c.cidadao.recusa });
    await ctx.flushQueue();
    assert.equal(banco.size, 1);
    assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 3, lastError: c.cidadao.recusa.error }]);
  });

  test(`${id(7)} flushQueue (cidadão): resposta vazia conta como recusa ("server error")`, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-1')], enviar: () => null });
    await ctx.flushQueue();
    assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 1, lastError: 'server error' }]);
  });

  test(`${id(8)} flushQueue (cidadão): erro de rede mantém o item, soma 1 tentativa e guarda a mensagem do erro`, async () => {
    const { ctx, banco, registro } = filaC({ itens: [item('IC-1', { attempts: 3 })], enviar: () => { throw new Error('Failed to fetch'); } });
    await ctx.flushQueue();
    assert.equal(banco.size, 1);
    assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 4, lastError: 'Failed to fetch' }]);
  });

  test(`${id(9)} flushQueue (cidadão): erro de rede sem mensagem é guardado como "network error"`, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-1')], enviar: () => { throw new Error(''); } });
    await ctx.flushQueue();
    assert.deepEqual(registro.tentativas, [{ id: 1, attempts: 1, lastError: 'network error' }]);
  });

  test(`${id(10)} flushQueue (cidadão): valor limite — com 4 tentativas ainda envia; com 5 descarta sem enviar`, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-QUATRO', { attempts: 4 }), item('IC-CINCO', { attempts: 5 })] });
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-QUATRO']);
    assert.deepEqual(registro.apagados.sort(), [1, 2]);
  });

  test(`${id(11)} flushQueue (cidadão): falha ao apagar um item descartado não interrompe a fila`, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-VELHO', { attempts: 5 }), item('IC-NOVO')] });
    const apagar = ctx.dbDelete;
    ctx.dbDelete = async (n) => { if (n === 1) throw new Error('falha'); return apagar(n); };
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-NOVO']);
  });

  test(`${id(12)} flushQueue (cidadão): falha ao gravar a tentativa depois de um erro de rede não interrompe a fila`, async () => {
    const { ctx, registro } = filaC({
      itens: [item('IC-1'), item('IC-2')],
      enviar: (p) => { if (p.protocolo === 'IC-1') throw new Error('timeout'); return c.cidadao.aceito; }
    });
    ctx.dbUpdateAttempts = async () => { throw new Error('banco travado'); };
    await assert.doesNotReject(ctx.flushQueue());
    assert.deepEqual(registro.envios, ['IC-1', 'IC-2']);
  });

  test(`${id(13)} flushQueue (cidadão): falha no 1º item não impede o envio do 2º`, async () => {
    const { ctx, banco, registro } = filaC({
      itens: [item('IC-1'), item('IC-2')],
      enviar: (p) => (p.protocolo === 'IC-1' ? c.cidadao.recusa : c.cidadao.aceito)
    });
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-1', 'IC-2']);
    assert.deepEqual([...banco.keys()], [1]);
  });

  test(`${id(14)} flushQueue (cidadão): reporte descartado após 5 tentativas deve avisar o cidadão`, { todo: 'Defeito DEF-03 — descarte silencioso (UC03 regra de negócio)' }, async () => {
    const { ctx, banco, registro } = filaC({ itens: [item('IC-PERDIDO', { attempts: 5 })] });
    await ctx.flushQueue();
    const avisouNaTela = registro.alertas.some((a) => /IC-PERDIDO/.test(a) && !/descartando item/.test(a));
    assert.ok(banco.size === 1 || avisouNaTela, 'o reporte foi apagado e só houve console.warn, que o cidadão não vê');
  });

  test(`${id(15)} flushQueue (cidadão): três sincronizações ao mesmo tempo enviam o reporte uma única vez`, { todo: 'Defeito DEF-04 — falta trava contra execução simultânea' }, async () => {
    const { ctx, registro } = filaC({ itens: [item('IC-1')] });
    await Promise.all([ctx.flushQueue(), ctx.flushQueue(), ctx.flushQueue()]);
    assert.equal(registro.envios.length, 1, `o mesmo protocolo foi enviado ${registro.envios.length} vezes`);
  });

  /* ═══════════ updatePendingBanner do cidadão ═══════════ */

  test(`${id(16)} updatePendingBanner: esconde com 0; singular com 1; plural com 3`, async () => {
    const zero = d.montarAvisoCidadao(0);
    zero.classes.add('show');
    await zero.ctx.updatePendingBanner();
    assert.equal(zero.classes.has('show'), false);
    const um = d.montarAvisoCidadao(1);
    await um.ctx.updatePendingBanner();
    assert.match(um.texto.innerHTML, /1<\/span> reporte pendente — será enviado quando/);
    const tres = d.montarAvisoCidadao(3);
    await tres.ctx.updatePendingBanner();
    assert.match(tres.texto.innerHTML, /3<\/span> reportes pendentes — serão enviados quando/);
  });

  test(`${id(17)} updatePendingBanner: erro no banco ou tela sem o aviso não quebram o app`, async () => {
    const comErro = d.montarAvisoCidadao(1);
    comErro.ctx.dbGetAll = async () => { throw new Error('falha'); };
    await assert.doesNotReject(comErro.ctx.updatePendingBanner());
    const semElemento = d.montarAvisoCidadao(2);
    semElemento.ctx.$ = () => null;
    await assert.doesNotReject(semElemento.ctx.updatePendingBanner());
  });

  /* ═══════════ submitReport do cidadão (V(G) = 7) ═══════════ */

  const envio = (o) => d.montarEnvioCidadao({ endpoint: c.endpointCidadao, ...o });

  test(`${id(18)} submitReport: segundo toque durante o envio é ignorado`, async () => {
    const { ctx, registro } = envio();
    ctx.state.submitting = true;
    await ctx.submitReport();
    assert.equal(registro.envios, 0);
    assert.equal(registro.gravados.length, 0);
  });

  test(`${id(19)} submitReport: com internet e envio aceito (${c.nome}), mostra "enviado" sem gravar na fila`, async () => {
    const { ctx, registro } = envio({ enviar: () => c.cidadao.aceito });
    await ctx.submitReport();
    assert.deepEqual(registro.sucesso, ['sent']);
    assert.equal(registro.gravados.length, 0);
  });

  test(`${id(20)} submitReport: com internet e recusa (${c.nome}), guarda na fila`, async () => {
    const { ctx, registro } = envio({ enviar: () => c.cidadao.recusa });
    await ctx.submitReport();
    assert.deepEqual(registro.gravados, ['IC-261112-TESTE']);
    assert.deepEqual(registro.sucesso, ['queued']);
  });

  test(`${id(21)} submitReport: com internet e erro de rede, guarda na fila`, async () => {
    const { ctx, registro } = envio({ enviar: () => { throw new Error('Failed to fetch'); } });
    await ctx.submitReport();
    assert.deepEqual(registro.sucesso, ['queued']);
  });

  test(`${id(22)} submitReport: envio e gravação falham — mensagem de erro e botão liberado (UC01-E1)`, async () => {
    const { ctx, tela, registro } = envio({ enviar: () => c.cidadao.recusa, gravar: () => { throw new Error('cota esgotada'); } });
    await ctx.submitReport();
    assert.deepEqual(registro.mensagens, ['error: Erro ao salvar o reporte. Tente de novo.']);
    assert.equal(tela['submit-btn'].disabled, false);
    assert.equal(ctx.state.submitting, false);
  });

  test(`${id(23)} submitReport: sem internet grava direto na fila, sem tentar enviar`, async () => {
    const { ctx, registro } = envio({ online: false });
    await ctx.submitReport();
    assert.equal(registro.envios, 0);
    assert.deepEqual(registro.sucesso, ['queued']);
  });

  test(`${id(24)} submitReport: sem internet e sem conseguir gravar — mensagem de erro (UC01-E1)`, async () => {
    const { ctx, tela, registro } = envio({ online: false, gravar: () => { throw new Error('falha'); } });
    await ctx.submitReport();
    assert.deepEqual(registro.mensagens, ['error: Erro ao salvar. Tente de novo.']);
    assert.equal(tela['submit-btn'].disabled, false);
    assert.equal(ctx.state.submitting, false, 'o app aceita uma nova tentativa');
  });

  test(`${id(47)} submitReport: durante o envio o botão fica travado e marcado "Enviando…"`, async () => {
    let durante;
    const { ctx, tela } = envio({
      enviar: () => { durante = { travado: tela['submit-btn'].disabled, texto: tela['submit-btn-text'].textContent, enviando: ctx.state.submitting }; return c.cidadao.aceito; }
    });
    await ctx.submitReport();
    assert.deepEqual(durante, { travado: true, texto: 'Enviando…', enviando: true });
  });

  test(`${id(25)} submitReport: com internet e servidor não configurado ("__..."), guarda na fila`, async () => {
    const { ctx, registro } = envio({ endpoint: '__ILUMINA_ENDPOINT_CIDADAO__' });
    await ctx.submitReport();
    assert.equal(registro.envios, 0);
    assert.deepEqual(registro.sucesso, ['queued']);
  });

  test(`${id(46)} submitReport: recusa sem motivo é registrada como "server error" e guardada na fila`, async () => {
    const { ctx, registro } = envio({ enviar: () => ({ ok: false }) });
    await ctx.submitReport();
    assert.deepEqual(registro.sucesso, ['queued']);
    assert.match(registro.avisosConsole.join(' '), /server error/);
  });

  /* ═══════════ postReport do cidadão ═══════════ */

  const req = (o) => d.montarRequisicaoCidadao({ endpoint: c.endpointCidadao, ...o });

  test(`${id(26)} postReport: envia ao endereço do ${c.nome} no formato que ele aceita`,
    ehNode ? { todo: 'Defeito DEF-01 — o app envia formulário sem id; a API Node só aceita JSON com id' } : {},
    async () => {
      const { ctx, registro } = req();
      await ctx.postReport({ protocolo: 'IC-1', tipo: 'apagado' });
      const { url, opcoes } = registro.chamadas[0];
      assert.equal(url, c.endpointCidadao);
      assert.equal(opcoes.method, 'POST');
      if (c.formatoCidadao === 'formulario') {
        assert.ok(opcoes.body instanceof URLSearchParams, 'formulário evita o preflight de CORS do Apps Script');
        assert.deepEqual(JSON.parse(opcoes.body.get('payload')), { protocolo: 'IC-1', tipo: 'apagado' });
      } else {
        const tipo = (opcoes.headers && (opcoes.headers['Content-Type'] || opcoes.headers['content-type'])) || '(nenhum: o navegador usa form-urlencoded)';
        assert.match(tipo, /application\/json/, `Content-Type enviado: ${tipo}`);
        assert.ok(JSON.parse(opcoes.body).id, 'o corpo precisa do id único para a API não duplicar o chamado');
      }
    });

  test(`${id(27)} postReport: limite de 60 s, timer limpo e resposta lida`, async () => {
    const { ctx, registro } = req();
    const r = await ctx.postReport({ protocolo: 'IC-1' });
    assert.equal(r.ok, true);
    assert.equal(registro.timers[0].ms, 60000);
    assert.deepEqual(registro.limpos, [1]);
  });

  test(`${id(28)} postReport: resposta que não é JSON vira recusa ("resposta inválida do servidor")`, async () => {
    const { ctx } = req({ responder: () => ({ text: async () => '<html>Erro 502</html>' }) });
    const r = await ctx.postReport({ protocolo: 'IC-1' });
    assert.deepEqual({ ...r }, { ok: false, error: 'resposta inválida do servidor' });
  });

  test(`${id(29)} postReport: erro de rede é repassado e o timer é limpo`, async () => {
    const { ctx, registro } = req({ responder: () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(ctx.postReport({ protocolo: 'IC-1' }), /Failed to fetch/);
    assert.deepEqual(registro.limpos, [1]);
  });

  test(`${id(30)} postReport: depois de 60 s sem resposta a requisição é cancelada`, async () => {
    const { ctx, registro } = req({
      responder: (opcoes) => new Promise((_, rejeitar) => opcoes.signal.addEventListener('abort', () => rejeitar(new Error('AbortError'))))
    });
    const envioP = ctx.postReport({ protocolo: 'IC-1' });
    await new Promise((r) => setImmediate(r));
    registro.timers[0].fn();
    await assert.rejects(envioP, /AbortError/);
    assert.equal(registro.chamadas[0].opcoes.signal.aborted, true);
  });

  /* ═══════════ generateProtocol e buildPayload ═══════════ */

  test(`${id(31)} generateProtocol: formato IC-AAMMDD-XXXXX com zero à esquerda no mês e no dia`, () => {
    class DataFixa extends Date { constructor(...a) { if (a.length) super(...a); else super(2026, 0, 5, 9, 30); } }
    const aleatorio = Object.create(Math);
    aleatorio.random = () => 0.123456789;
    const { carregar } = require('./extrair-funcao');
    const ctx = carregar('cidadao', ['generateProtocol'], { Date: DataFixa, Math: aleatorio });
    assert.equal(ctx.generateProtocol(), 'IC-260105-4FZZZ');
  });

  test(`${id(32)} buildPayload: a mensagem do reporte leva protocolo, tipo, GPS, foto, poste e textos limpos`, () => {
    const p = { ...d.montarPayloadCidadao().buildPayload() };
    for (const campo of ['protocolo', 'tipo', 'lat', 'lng', 'acc', 'descricao', 'foto_base64', 'poste_id']) assert.ok(campo in p, `falta ${campo}`);
    assert.equal(p.acc, 6, 'precisão arredondada');
    assert.equal(p.descricao, 'poste apagado', 'texto sem espaços nas pontas');
    assert.equal(p.poste_id, '', 'sem QR, poste vazio');
    const comQr = { ...d.montarPayloadCidadao({ poste: 'P-0007', navegador: 'x'.repeat(200) }).buildPayload() };
    assert.equal(comQr.poste_id, 'P-0007');
    assert.equal(comQr.user_agent.length, 180, 'identificação do navegador limitada a 180 caracteres');
  });

  /* ═══════════ flushQueue do técnico (V(G) = 8) ═══════════ */

  const filaT = (o) => d.montarFilaTecnico(o);

  test(`${id(33)} flushQueue (técnico): sem internet não envia e não atualiza o aviso`, async () => {
    const { ctx, registro } = filaT({ itens: ['IC-1'], online: false });
    await ctx.flushQueue();
    assert.equal(registro.envios.length, 0);
    assert.equal(registro.avisos, 0);
  });

  test(`${id(34)} flushQueue (técnico): sem sessão (sem PIN) não envia`, async () => {
    const { ctx, registro } = filaT({ itens: ['IC-1'], token: null });
    await ctx.flushQueue();
    assert.equal(registro.envios.length, 0);
  });

  test(`${id(35)} flushQueue (técnico): fila vazia libera a trava e atualiza o aviso`, async () => {
    const { ctx, registro } = filaT({ itens: [] });
    await ctx.flushQueue();
    assert.equal(registro.avisos, 1);
    ctx.queueAll = async () => [{ id: 9, payload: { protocolo: 'IC-9' } }];
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-9'], 'uma nova execução não ficou bloqueada');
  });

  test(`${id(36)} flushQueue (técnico): todos aceitos (${c.nome}) são apagados na ordem da fila`, async () => {
    const { ctx, banco, registro } = filaT({ itens: ['IC-1', 'IC-2', 'IC-3'], responder: () => c.tecnico.aceito });
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-1', 'IC-2', 'IC-3']);
    assert.equal(banco.size, 0);
  });

  test(`${id(37)} flushQueue (técnico): sessão expirada (${c.nome}) interrompe e mantém a fila`, async () => {
    const { ctx, banco, registro } = filaT({ itens: ['IC-1', 'IC-2'], responder: () => c.tecnico.sessaoExpirada });
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-1']);
    assert.equal(banco.size, 2);
  });

  test(`${id(38)} flushQueue (técnico): erro de rede interrompe e mantém a fila`, async () => {
    const { ctx, banco, registro } = filaT({ itens: ['IC-1', 'IC-2'], responder: () => { throw new TypeError('Failed to fetch'); } });
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-1']);
    assert.equal(banco.size, 2);
  });

  test(`${id(39)} flushQueue (técnico): três sincronizações ao mesmo tempo enviam cada fechamento uma vez (trava)`, async () => {
    const { ctx, registro } = filaT({ itens: ['IC-1'] });
    await Promise.all([ctx.flushQueue(), ctx.flushQueue(), ctx.flushQueue()]);
    assert.deepEqual(registro.envios, ['IC-1']);
  });

  test(`${id(40)} flushQueue (técnico): erro ao ler a fila libera a trava, mas o erro escapa da função`, async () => {
    const { ctx, registro } = filaT({ itens: ['IC-1'] });
    const ler = ctx.queueAll;
    ctx.queueAll = async () => { throw new Error('IndexedDB indisponível'); };
    await assert.rejects(ctx.flushQueue(), /IndexedDB indisponível/);
    assert.equal(registro.avisos, 1, 'o finally rodou');
    ctx.queueAll = ler;
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-1'], 'a trava foi liberada');
  });

  test(`${id(41)} flushQueue (técnico): erro do servidor em um fechamento não trava os seguintes`, { todo: 'Defeito DEF-07 — a fila do técnico para no primeiro erro' }, async () => {
    const { ctx, registro } = filaT({
      itens: ['IC-RUIM', 'IC-2', 'IC-3'],
      responder: (p) => (p.protocolo === 'IC-RUIM' ? c.tecnico.erro : c.tecnico.aceito)
    });
    await ctx.flushQueue();
    assert.deepEqual(registro.envios, ['IC-RUIM', 'IC-2', 'IC-3'], `enviados: ${registro.envios.join(', ')}`);
  });

  /* ═══════════ apiFetchTO, aviso e contagem do técnico ═══════════ */

  test(`${id(42)} apiFetchTO: fechamento vai ao endereço e formato do ${c.nome}`,
    ehNode ? { todo: 'Defeito DEF-02 — o app manda o formato do Apps Script para /api' } : {},
    async () => {
      const { ctx, registro } = d.montarRequisicaoTecnico({ url: c.endpointTecnico, resposta: c.tecnico.aceito });
      await ctx.apiFetchTO({ action: 'close', protocolo: 'IC-1', token: 'tok' }, 40000);
      const { url, opcoes } = registro.chamadas[0];
      if (ehNode) {
        assert.equal(url, '/api/chamados/IC-1/fechamento');
        assert.match(String(opcoes.headers.Authorization || ''), /^Bearer /);
        assert.ok(JSON.parse(opcoes.body).operacao_id, 'a API exige operacao_id para não fechar duas vezes');
      } else {
        assert.equal(url, c.endpointTecnico);
        assert.equal(opcoes.headers['Content-Type'], 'text/plain;charset=utf-8');
        assert.deepEqual(JSON.parse(opcoes.body), { action: 'close', protocolo: 'IC-1', token: 'tok' });
      }
    });

  test(`${id(43)} apiFetchTO: usa 15 s por padrão, limpa o timer e cancela ao fim do tempo`, async () => {
    const { ctx, registro } = d.montarRequisicaoTecnico({ url: c.endpointTecnico });
    await ctx.apiFetchTO({ action: 'list' });
    assert.equal(registro.timers[0].ms, 15000);
    assert.deepEqual(registro.limpos, [1]);
    ctx.fetch = (u, opcoes) => new Promise((_, rej) => opcoes.signal.addEventListener('abort', () => rej(new Error('AbortError'))));
    const p = ctx.apiFetchTO({ action: 'close' }, 40000);
    registro.timers[1].fn();
    await assert.rejects(p, /AbortError/);
    assert.equal(registro.timers[1].ms, 40000);
  });

  test(`${id(44)} renderPendingBanner: esconde com 0; singular/plural; "enviando…" e "sem sinal"; tela sem aviso`, async () => {
    const zero = d.montarAvisoTecnico(0, true);
    zero.classes.add('show');
    await zero.ctx.renderPendingBanner();
    assert.equal(zero.classes.has('show'), false);
    const um = d.montarAvisoTecnico(1, false);
    await um.ctx.renderPendingBanner();
    assert.equal(um.texto.textContent, '1 fechamento pendente — sem sinal');
    const dois = d.montarAvisoTecnico(2, true);
    await dois.ctx.renderPendingBanner();
    assert.equal(dois.texto.textContent, '2 fechamentos pendentes — enviando…');
    const sem = d.montarAvisoTecnico(3, true);
    sem.ctx.document = { getElementById: () => null };
    await assert.doesNotReject(sem.ctx.renderPendingBanner());
  });

  test(`${id(45)} queueCount: conta a fila e devolve 0 se o banco falhar (o limite de 10 deixa de valer)`, async () => {
    const ctx = d.montarContagemTecnico(async () => new Array(10).fill({}));
    assert.equal(await ctx.queueCount(), 10);
    ctx.queueAll = async () => { throw new Error('IndexedDB indisponível'); };
    assert.equal(await ctx.queueCount(), 0);
  });
}

module.exports = { registrarCasosCliente, CONTRATOS };
