/**
 * Dublês usados nos testes de caixa-branca do código offline das telas.
 *
 * Cada "montar..." recorta a função real do HTML (extrair-funcao.js) e a roda
 * num contexto isolado com dublês no lugar do navegador:
 *   - Fake:  banco do aparelho em memória (Map), com a mesma regra do IndexedDB
 *            de devolver cópias dos registros;
 *   - Stub:  rede que devolve uma resposta pronta (ou chama o servidor de teste);
 *   - Spy:   objeto `registro`, que anota envios, exclusões, tentativas e avisos;
 *   - Dummy: console vazio, só para a função ter onde escrever.
 */

const assert = require('node:assert/strict');
const { carregar, extrairDeclaracao } = require('./extrair-funcao');

const ENDPOINT_APPS_SCRIPT = 'https://script.google.com/macros/s/teste/exec';
const item = (protocolo, extra = {}) => ({ payload: { protocolo }, ...extra });

/* ───────────── App do cidadão ───────────── */

/** flushQueue do cidadão com fila Fake e rede Stub. */
function montarFilaCidadao({ itens = [], online = true, endpoint = ENDPOINT_APPS_SCRIPT, enviar, comPostReportReal = false, rede } = {}) {
  const banco = new Map(itens.map((it, i) => [i + 1, { id: i + 1, attempts: 0, ...it }]));
  const registro = { envios: [], apagados: [], tentativas: [], avisosAtualizados: 0, alertas: [] };
  const globais = {
    navigator: { onLine: online },
    ENDPOINT: endpoint,
    console: { log() {}, error() {}, warn: (...a) => registro.alertas.push(a.join(' ')) },
    dbGetAll: async () => [...banco.values()].map((r) => ({ ...r })),
    dbDelete: async (id) => { registro.apagados.push(id); banco.delete(id); },
    dbUpdateAttempts: async (id, attempts, lastError) => {
      registro.tentativas.push({ id, attempts, lastError });
      const r = banco.get(id);
      if (r) Object.assign(r, { attempts, lastError });
    },
    updatePendingBanner: () => { registro.avisosAtualizados++; },
    showToast: (...a) => registro.alertas.push(a.join(' '))
  };
  if (comPostReportReal) {
    // Integração: a função real postReport faz a requisição pela rede informada.
    Object.assign(globais, {
      AbortController, URLSearchParams, setTimeout, clearTimeout,
      fetch: async (url, opcoes) => {
        registro.envios.push(JSON.parse(opcoes.body.get ? opcoes.body.get('payload') : opcoes.body).protocolo);
        return rede(url, opcoes);
      }
    });
  } else {
    globais.postReport = async (payload) => {
      registro.envios.push(payload.protocolo);
      return enviar ? enviar(payload) : { ok: true };
    };
  }
  const ctx = carregar('cidadao', comPostReportReal ? ['flushQueue', 'postReport'] : ['flushQueue'], globais);
  return { ctx, banco, registro };
}

/** submitReport do cidadão com tela, fila e rede substituídas. */
function montarEnvioCidadao({ online = true, endpoint = ENDPOINT_APPS_SCRIPT, enviar, gravar } = {}) {
  const tela = { 'submit-btn': { disabled: false }, 'submit-btn-text': { textContent: 'Enviar reporte' } };
  const registro = { envios: 0, gravados: [], sucesso: [], mensagens: [], avisosConsole: [] };
  const ctx = carregar('cidadao', ['submitReport'], {
    state: { submitting: false },
    navigator: { onLine: online },
    ENDPOINT: endpoint,
    console: { log() {}, error() {}, warn: (...a) => registro.avisosConsole.push(a.map(String).join(' ')) },
    $: (id) => tela[id],
    buildPayload: () => ({ protocolo: 'IC-261112-TESTE' }),
    postReport: async () => { registro.envios++; return enviar ? enviar() : { ok: true }; },
    dbAdd: async (p) => { if (gravar) gravar(); registro.gravados.push(p.protocolo); },
    onSubmitSuccess: (p, modo) => registro.sucesso.push(modo),
    showToast: (tipo, msg) => registro.mensagens.push(`${tipo}: ${msg}`)
  });
  return { ctx, tela, registro };
}

/** postReport com a rede Stub e temporizador controlado pelo teste. */
function montarRequisicaoCidadao({ endpoint = ENDPOINT_APPS_SCRIPT, responder } = {}) {
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

/** updatePendingBanner do cidadão com tela Stub. */
function montarAvisoCidadao(qtd) {
  const classes = new Set();
  const banner = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  const texto = { innerHTML: '' };
  const ctx = carregar('cidadao', ['updatePendingBanner'], {
    dbGetAll: async () => Array.from({ length: qtd }, (_, i) => ({ id: i })),
    $: (id) => ({ 'pending-banner': banner, 'pending-text': texto })[id] || null
  });
  return { ctx, classes, texto };
}

/** buildPayload do cidadão com formulário Stub (para o contrato da mensagem). */
function montarPayloadCidadao({ poste = '', navegador = 'Teste' } = {}) {
  const campos = { descricao: '  poste apagado  ', nome: 'Ana', tel: '82999990000', endereco: 'Rua A' };
  return carregar('cidadao', ['buildPayload'], {
    $: (id) => ({ value: campos[id] || '' }),
    state: { tipo: 'apagado', gps: { lat: -10.12, lng: -36.17, acc: 6.4 }, foto: 'data:image/jpeg;base64,AAAA', poste_id: poste },
    generateProtocol: () => 'IC-261112-ABCDE',
    navigator: { userAgent: navegador }
  });
}

/* ───────────── Painel do técnico ───────────── */

/** flushQueue do técnico com fila Fake e rede Stub (ou o servidor de teste). */
function montarFilaTecnico({ itens = [], online = true, token = 'tok-valido', responder, rede, url, dadosFechamento = {} } = {}) {
  // dadosFechamento: campos do formulário (status, serviço, foto, GPS…), para a integração com a API real.
  const banco = new Map(itens.map((protocolo, i) => [i + 1, { id: i + 1, payload: { action: 'close', protocolo, token, ...dadosFechamento } }]));
  const registro = { envios: [], apagados: [], avisos: 0 };
  // A trava `flushInFlight` é uma variável do script da página: vem do próprio HTML.
  const trava = extrairDeclaracao('tecnico', /let flushInFlight\s*=\s*false;/);
  const globais = {
    navigator: { onLine: online },
    sessionToken: token,
    queueAll: async () => [...banco.values()].map((r) => ({ ...r })),
    queueDelete: async (id) => { registro.apagados.push(id); banco.delete(id); },
    renderPendingBanner: () => { registro.avisos++; }
  };
  let nomes = ['flushQueue'];
  if (rede) {
    // Integração: a função real apiFetchTO faz a requisição ao servidor de teste.
    Object.assign(globais, {
      SHEETS_URL: url, AbortController, setTimeout, clearTimeout,
      fetch: (u, opcoes) => { registro.envios.push(JSON.parse(opcoes.body).protocolo); return rede(u, opcoes); }
    });
    // fechamentoParaApiNode e respostaDaApiNode: conversões do envio para a API Node (UC05, DEF-02).
    nomes = ['flushQueue', 'apiFetchTO', 'fechamentoParaApiNode', 'respostaDaApiNode'];
  } else {
    globais.apiFetchTO = async (payload, ms) => {
      registro.envios.push(payload.protocolo);
      assert.equal(ms, 40000, 'a fila usa limite de 40 s por envio');
      return responder ? responder(payload) : { success: true };
    };
  }
  const ctx = carregar('tecnico', nomes, globais, [trava]);
  return { ctx, banco, registro };
}

/** apiFetchTO com rede Stub e temporizador controlado. */
function montarRequisicaoTecnico({ url = ENDPOINT_APPS_SCRIPT, resposta = { success: true } } = {}) {
  const registro = { chamadas: [], timers: [], limpos: [] };
  const ctx = carregar('tecnico', ['apiFetchTO', 'fechamentoParaApiNode', 'respostaDaApiNode'], {
    SHEETS_URL: url,
    AbortController,
    setTimeout: (fn, ms) => { registro.timers.push({ fn, ms }); return registro.timers.length; },
    clearTimeout: (id) => registro.limpos.push(id),
    fetch: (u, opcoes) => {
      registro.chamadas.push({ url: u, opcoes });
      return Promise.resolve({ json: async () => resposta });
    }
  });
  return { ctx, registro };
}

function montarAvisoTecnico(qtd, online) {
  const classes = new Set();
  const texto = { textContent: '' };
  const banner = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, querySelector: () => texto };
  const ctx = carregar('tecnico', ['renderPendingBanner'], {
    queueCount: async () => qtd,
    isOnline: online,
    document: { getElementById: () => banner }
  });
  return { ctx, classes, texto };
}

function montarContagemTecnico(queueAll) {
  return carregar('tecnico', ['queueCount'], { queueAll });
}

module.exports = {
  ENDPOINT_APPS_SCRIPT, item,
  montarFilaCidadao, montarEnvioCidadao, montarRequisicaoCidadao, montarAvisoCidadao, montarPayloadCidadao,
  montarFilaTecnico, montarRequisicaoTecnico, montarAvisoTecnico, montarContagemTecnico
};
