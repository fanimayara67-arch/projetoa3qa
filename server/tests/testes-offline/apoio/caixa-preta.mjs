/**
 * TESTES DE CAIXA-PRETA — Funcionalidades offline (biblioteca de casos)
 *
 * Os casos foram derivados dos casos de uso do Trabalho A3 (UC01 a UC05),
 * seguindo a regra da disciplina: fluxo principal → 1 caso positivo; cada
 * fluxo alternativo → 1 caso; cada exceção → 1 caso negativo; cada
 * pré-condição → 1 teste de violação; regras de negócio e critérios de
 * aceitação (CA02, CA03) → 1 caso cada.
 *
 * Os mesmos casos rodam contra os dois servidores possíveis do projeto
 * (API Node e Apps Script). O resultado esperado é o mesmo nos dois, porque
 * vem dos requisitos, não do servidor.
 *
 * Regras seguidas para não "burlar" o teste:
 *   - o teste usa só a tela (cliques, digitação, foto, GPS) e liga/desliga a
 *     internet do navegador; não chama funções internas da página;
 *   - cada caso tem servidor e navegador novos (independência);
 *   - espera por condição observável, nunca por tempo fixo;
 *   - o oráculo olha a tela, o que o servidor gravou e a fila do aparelho
 *     (como no DevTools do navegador).
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const aqui = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(aqui, '../../../..');
const { criarServidorTeste, PIN_TESTE } = require('./servidor-teste.js');

const FOTO = readFileSync(resolve(RAIZ, 'public/icon-192.png'));
const CORURIPE = { latitude: -10.1251, longitude: -36.1752, accuracy: 6 };
const FORMATO_PROTOCOLO = /^IC-\d{6}-[A-Z0-9]{5}$/;

/* ═════════════════════════ Utilidades ═════════════════════════ */

/** Espera uma condição observável (sem tempo fixo). Devolve o último valor lido. */
async function aguardar(condicao, { timeout = 15000, intervalo = 100 } = {}) {
  const fim = Date.now() + timeout;
  let ultimo;
  while (Date.now() < fim) {
    ultimo = await condicao();
    if (ultimo) return ultimo;
    await new Promise((r) => setTimeout(r, intervalo));
  }
  return ultimo;
}

function controlar(srv, valores) {
  const { expirarSessoes, ...resto } = valores;
  if (expirarSessoes) srv.estado.sessoes.forEach((s) => { s.expiraEm = 0; });
  Object.assign(srv.estado.controle, resto);
}

const semPrefixo = (p) => p.replace(/^Protocolo:\s*/, '');
const registrosDoProtocolo = (srv, p) => srv.estado.chamados.filter((c) => c.protocolo === p && !c.semente).length;
const recebidosCidadao = (srv, p) => srv.estado.recebidos.cidadao.filter((r) => !p || r.protocolo === p).length;
const fechamentosDoProtocolo = (srv, p) => srv.estado.fechamentos.filter((f) => f.protocolo === p).length;

/* ═════════════════════════ App do cidadão ═════════════════════════ */

async function novoContexto(browser) {
  return browser.newContext({
    geolocation: CORURIPE, permissions: ['geolocation'], serviceWorkers: 'allow',
    viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Maceio'
  });
}

async function abrirComServiceWorker(ctx, srv, caminho) {
  const page = await ctx.newPage();
  await page.goto(srv.url + caminho);
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload();
  return page;
}

/** Depois de uma navegação que pode falhar, espera a página (do app ou de erro) assentar. */
async function temTelaDeReporte(page) {
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
  return (await page.locator('#screen-report').count().catch(() => 0)) > 0;
}

async function passarAbertura(page) {
  await page.waitForSelector('#screen-splash.active, #screen-report.active, #screen-poste-info.active', { timeout: 15000 });
  if (await page.locator('#screen-splash.active').count()) {
    // Toca em "Começar" assim que o botão aparece; se a abertura terminar sozinha antes, segue.
    await page.locator('#screen-splash.active .splash-btn').click({ timeout: 8000 }).catch(() => {});
    await page.waitForSelector('#screen-report.active, #screen-poste-info.active', { timeout: 15000 });
  }
}

async function abrirCidadao(ctx, srv, caminho = '/') {
  const page = await abrirComServiceWorker(ctx, srv, caminho);
  await passarAbertura(page);
  if (caminho === '/') await page.waitForSelector('#screen-report.active', { timeout: 10000 });
  return page;
}

async function preencherReporte(page, { tipo = 'apagado', descricao = 'Teste offline' } = {}) {
  // Pelo QR do poste a seção de GPS fica escondida (o cidadão está no poste).
  if (await page.isVisible('#gps-btn')) {
    await page.click('#gps-btn');
    await page.waitForSelector('#gps-result.show', { timeout: 15000 });
  }
  await page.click(`#type-chips .chip[data-value="${tipo}"]`);
  await page.setInputFiles('#photo-input', { name: 'poste.png', mimeType: 'image/png', buffer: FOTO });
  await page.waitForSelector('#photo-preview-wrap.show', { timeout: 10000 });
  await page.fill('#descricao', descricao);
  await page.waitForFunction(() => !document.getElementById('submit-btn').disabled);
}

async function enviar(page) {
  await page.click('#submit-btn');
  await page.waitForSelector('#screen-success.active', { timeout: 80000 });
  return {
    titulo: (await page.textContent('#success-title')).trim(),
    protocolo: semPrefixo((await page.textContent('#success-protocol')).trim())
  };
}

async function novoReporte(page) {
  await page.click('#screen-success .new-report-btn');
  await page.waitForSelector('#screen-report.active');
}

/** Lê a fila do aparelho, como faria o DevTools (Application → IndexedDB). */
async function filaCidadao(page) {
  return page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open('ilumina_v2', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => {
      const g = req.result.transaction('reports', 'readonly').objectStore('reports').getAll();
      g.onsuccess = () => ok(g.result.map((r) => ({
        protocolo: r.payload && r.payload.protocolo, poste: r.payload && r.payload.poste_id,
        tipo: r.payload && r.payload.tipo, descricao: r.payload && r.payload.descricao, lat: r.payload && r.payload.lat,
        tentativas: r.attempts || 0,
        motivo: r.lastError == null ? null : (typeof r.lastError === 'string' ? r.lastError : JSON.stringify(r.lastError))
      })));
    };
  }));
}

async function avisosNaTela(page) {
  return page.evaluate(() => {
    const b = document.getElementById('pending-banner');
    const t = document.getElementById('toast');
    return {
      banner: b && b.classList.contains('show') ? b.textContent.replace(/\s+/g, ' ').trim() : '',
      toast: t ? t.textContent.replace(/\s+/g, ' ').trim() : ''
    };
  });
}

/* ═════════════════════════ Painel do técnico ═════════════════════════ */

async function abrirTecnico(ctx, srv) {
  return abrirComServiceWorker(ctx, srv, '/tecnico/');
}

async function digitarPin(page, pin = PIN_TESTE) {
  for (const d of pin) await page.locator('#screen-pin button.key', { hasText: d }).first().click();
}

async function entrar(page, { itens = 20 } = {}) {
  await page.waitForSelector('#screen-pin.active', { timeout: 10000 });
  await digitarPin(page);
  await page.waitForSelector('#screen-home.active', { timeout: 15000 });
  await page.waitForFunction((n) => document.querySelectorAll('#lista-chamados .js-call-item').length >= n, itens, { timeout: 15000 });
}

async function textoToast(page) {
  return page.evaluate(() => (document.getElementById('toast')?.textContent || '').replace(/\s+/g, ' ').trim());
}

/** Fecha um chamado usando só a tela: abre o cartão, preenche, captura GPS e foto e confirma. */
async function fecharPelaTela(page, protocolo) {
  const cartao = `#lista-chamados .js-call-item[data-proto="${protocolo}"]`;
  if (!(await page.isVisible(cartao))) return { resultado: 'sem-cartao', titulo: '', toast: '' };
  await page.click(cartao);
  const abriu = await aguardar(async () => (await page.isVisible('#screen-close.active')) || null, { timeout: 5000 });
  if (!abriu) return { resultado: 'nao-abriu', titulo: '', toast: await textoToast(page) };

  await page.fill('#f-tecnico', 'Técnico Teste');
  await page.click('#screen-close .s-chip:has-text("Concluído")');
  await page.fill('#f-servico', 'Troca de lâmpada (teste)');
  for (const g of ['braco', 'luminaria', 'reator', 'fotosensor', 'porta_fusivel', 'fusivel', 'cabo', 'conector']) {
    await page.locator(`#cfg-${g} .cfg-chip`).first().click();
  }
  await page.fill('#f-referencia', 'Em frente à praça (teste)');
  await page.click('#tech-btn-gps');
  await page.waitForFunction(() => (document.getElementById('tech-gps-coords')?.textContent || '').trim().length > 0, null, { timeout: 15000 });
  await page.setInputFiles('#tech-photo-input', { name: 'reparo.png', mimeType: 'image/png', buffer: FOTO });
  await page.waitForFunction(() => (document.getElementById('tech-photo-thumb')?.getAttribute('src') || '').startsWith('data:'), null, { timeout: 10000 });

  const toastAntes = await textoToast(page);
  await page.click('#btn-fechar');
  await page.waitForSelector('#confirm-modal', { state: 'visible' });
  await page.click('#confirm-modal button:has-text("Sim, fechar")');
  const fim = await aguardar(async () => {
    if (await page.isVisible('#screen-success.active')) return 'tela-sucesso';
    const t = await textoToast(page);
    return t && t !== toastAntes ? 'aviso' : null;
  }, { timeout: 50000 });
  return {
    resultado: fim || 'sem-resposta',
    titulo: fim === 'tela-sucesso' ? (await page.textContent('#success-title')).trim() : '',
    toast: await textoToast(page)
  };
}

async function voltarInicio(page) {
  await page.click('#screen-success button:has-text("Novo atendimento")');
  await page.waitForSelector('#screen-home.active');
}

async function filaTecnico(page) {
  return page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open('ilumina_tec', 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('close_queue')) return ok([]);
      const g = db.transaction('close_queue', 'readonly').objectStore('close_queue').getAll();
      g.onsuccess = () => ok(g.result.map((r) => r.payload && r.payload.protocolo));
    };
    req.onerror = () => ok([]);
  }));
}

const fechadoNoServidor = (srv, p) => {
  const c = srv.estado.chamados.find((x) => x.protocolo === p);
  return Boolean(c) && !['aberto', 'em_atendimento', 'Aguardando atendimento'].includes(c.status);
};

/* ═════════════════════════ Casos — app do cidadão ═════════════════════════ */

const CASOS = [];
const caso = (def) => CASOS.push(def);

caso({
  id: 'CP-01', titulo: 'App do cidadão abre sem internet depois do primeiro acesso',
  requisito: 'UC01 (pré-condição); RNF01', derivacao: 'Pré-condição atendida', tecnica: 'Partição de equivalência (com/sem internet)',
  dado: 'o app já foi aberto uma vez com internet', quando: 'o cidadão abre o app de novo sem internet',
  entao: 'a tela de reporte aparece normalmente',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    await ctx.setOffline(true);
    await page.reload();
    await passarAbertura(page);
    const ok = Boolean(await aguardar(() => page.isVisible('#screen-report.active'), { timeout: 8000 }));
    return { aprovado: ok, obtido: ok ? 'A tela de reporte abriu sem internet (arquivos guardados pelo service worker).' : 'A tela não abriu sem internet.' };
  }
});

caso({
  id: 'CP-02', titulo: 'Primeiro acesso sem internet não abre o app (violação da pré-condição)',
  requisito: 'UC01 (pré-condição)', derivacao: 'Violação de pré-condição', tecnica: 'Partição de equivalência (classe inválida)',
  dado: 'o app nunca foi aberto no aparelho', quando: 'o cidadão tenta abrir o app sem internet',
  entao: 'o app não abre (não há nada guardado) e nenhum dado é criado no aparelho ou no servidor',
  async executar({ ctx, srv }) {
    await ctx.setOffline(true);
    const page = await ctx.newPage();
    let erro = '';
    try { await page.goto(srv.url + '/', { timeout: 10000 }); } catch (e) { erro = e.message.split('\n')[0]; }
    const abriu = await temTelaDeReporte(page);
    const nadaNoServidor = srv.estado.recebidos.cidadao.length === 0;
    return { aprovado: !abriu && nadaNoServidor, obtido: abriu ? 'O app abriu mesmo sem acesso anterior.' : `O navegador mostrou erro de conexão (${erro || 'página de erro'}). Nada chegou ao servidor.` };
  }
});

caso({
  id: 'CP-03', titulo: 'Reporte com internet chega ao servidor (fluxo principal)',
  requisito: 'UC01 (passo 7); RF01', derivacao: 'Fluxo principal', tecnica: 'Baseado em requisito (caso positivo)',
  dado: 'o aparelho tem internet e o formulário está completo', quando: 'o cidadão toca em "Enviar reporte"',
  entao: 'a tela mostra "Reporte enviado" com protocolo IC-AAMMDD-XXXXX, o servidor tem 1 chamado aberto com esse protocolo e a fila do aparelho fica vazia',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    await preencherReporte(page);
    const r = await enviar(page);
    const registros = registrosDoProtocolo(srv, r.protocolo);
    const fila = await filaCidadao(page);
    const formato = FORMATO_PROTOCOLO.test(r.protocolo);
    const req = srv.estado.requisicoes.find((q) => q.metodo === 'POST' && /cidadao|\/api\/chamados$/.test(q.caminho));
    return {
      aprovado: r.titulo === 'Reporte enviado' && formato && registros === 1 && fila.length === 0,
      obtido: `Tela: "${r.titulo}", protocolo ${r.protocolo} (${formato ? 'formato válido' : 'formato inválido'}). Registros no servidor: ${registros}. Fila do aparelho: ${fila.length}. Envio feito como "${req ? req.tipo : '-'}".`
    };
  }
});

caso({
  id: 'CP-04', titulo: 'Reporte sem internet fica salvo no aparelho com protocolo',
  requisito: 'UC01-A1; RF02', derivacao: 'Fluxo alternativo', tecnica: 'Baseado em requisito',
  dado: 'o aparelho está sem internet e o formulário está completo', quando: 'o cidadão toca em "Enviar reporte"',
  entao: 'o app mostra o protocolo informando que o envio está pendente, guarda 1 item na fila e mostra o aviso de pendente',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    await ctx.setOffline(true);
    await preencherReporte(page);
    const r = await enviar(page);
    const fila = await filaCidadao(page);
    const { banner } = await avisosNaTela(page);
    return {
      aprovado: r.titulo === 'Salvo sem sinal' && FORMATO_PROTOCOLO.test(r.protocolo) && fila.length === 1 && /1 reporte pendente/.test(banner),
      obtido: `Tela: "${r.titulo}", protocolo ${r.protocolo}. Fila: ${fila.length}. Aviso: "${banner || 'nenhum'}".`
    };
  }
});

caso({
  id: 'CP-05', titulo: 'Erro do servidor no envio guarda o reporte na fila',
  requisito: 'UC01-A2', derivacao: 'Fluxo alternativo', tecnica: 'Baseado em requisito (falha do servidor)',
  dado: 'o aparelho tem internet, mas o servidor responde com erro 500', quando: 'o cidadão envia o reporte',
  entao: 'o reporte vai para a fila e o cidadão recebe o protocolo',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    controlar(srv, { cidadao: 'erro500' });
    await preencherReporte(page);
    const r = await enviar(page);
    const fila = await filaCidadao(page);
    return {
      aprovado: fila.length === 1 && fila[0].protocolo === r.protocolo && FORMATO_PROTOCOLO.test(r.protocolo),
      obtido: `Tela: "${r.titulo}", protocolo ${r.protocolo}. Fila: ${fila.length}.`,
      observacao: r.titulo === 'Salvo sem sinal' ? 'A tela diz "Salvo sem sinal" mesmo com sinal: a causa foi o servidor, não a internet.' : ''
    };
  }
});

caso({
  id: 'CP-06', titulo: 'Servidor sem resposta por 60 segundos: o reporte vai para a fila',
  requisito: 'UC01-A2', derivacao: 'Fluxo alternativo', tecnica: 'Valor limite (tempo de espera de 60 s)',
  dado: 'o servidor recebe o reporte mas não responde', quando: 'o cidadão envia e espera',
  entao: 'por volta de 60 s depois o reporte é guardado na fila e o protocolo aparece',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    controlar(srv, { cidadao: 'sem-resposta' });
    await preencherReporte(page);
    const inicio = Date.now();
    const r = await enviar(page);
    const segundos = Math.round((Date.now() - inicio) / 1000);
    const fila = await filaCidadao(page);
    return {
      aprovado: fila.length === 1 && segundos >= 55 && segundos <= 75,
      obtido: `Depois de ${segundos} s a tela mostrou "${r.titulo}" com o protocolo ${r.protocolo}. Fila: ${fila.length}.`
    };
  }
});

caso({
  id: 'CP-07', titulo: 'Falha ao gravar no aparelho mostra erro e mantém o formulário',
  requisito: 'UC01-E1', derivacao: 'Exceção', tecnica: 'Injeção de falha (armazenamento do navegador cheio)',
  dado: 'o aparelho está sem internet e o armazenamento do navegador recusa novas gravações', quando: 'o cidadão envia o reporte',
  entao: 'o app mostra mensagem de erro e o formulário continua preenchido para nova tentativa',
  async executar({ ctx, srv }) {
    // Simula armazenamento cheio: a gravação na fila "reports" é recusada pelo navegador.
    await ctx.addInitScript(() => {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (globalThis.__armazenamentoCheio && this.name === 'reports') throw new DOMException('Armazenamento cheio (teste)', 'QuotaExceededError');
        return original.apply(this, args);
      };
    });
    const page = await abrirCidadao(ctx, srv);
    await ctx.setOffline(true);
    await preencherReporte(page, { descricao: 'Não pode se perder' });
    await page.evaluate(() => { globalThis.__armazenamentoCheio = true; });
    await page.click('#submit-btn');
    const toast = await aguardar(async () => {
      const t = await textoToast(page);
      return /erro/i.test(t) ? t : null;
    }, { timeout: 10000 });
    const descricao = await page.inputValue('#descricao');
    const naTela = await page.isVisible('#screen-report.active');
    const botao = await page.isEnabled('#submit-btn');
    return {
      aprovado: Boolean(toast) && naTela && descricao === 'Não pode se perder' && botao,
      obtido: `Mensagem: "${toast || 'nenhuma'}". Continua no formulário: ${naTela ? 'sim' : 'não'}; descrição mantida: ${descricao === 'Não pode se perder' ? 'sim' : 'não'}; botão de envio liberado: ${botao ? 'sim' : 'não'}.`
    };
  }
});

caso({
  id: 'CP-08', titulo: 'Internet cai durante o preenchimento e o reporte é concluído com os dados já informados',
  requisito: 'CA02; UC01-A1', derivacao: 'Critério de aceitação', tecnica: 'Transição de estado (online → offline durante o uso)',
  dado: 'o cidadão já marcou GPS, tipo e descrição com internet', quando: 'a internet cai antes da foto e ele termina o reporte',
  entao: 'nada do que foi preenchido se perde e o reporte é salvo com esses dados',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    await page.click('#gps-btn');
    await page.waitForSelector('#gps-result.show');
    await page.click('#type-chips .chip[data-value="piscando"]');
    await page.fill('#descricao', 'Preenchido antes de cair');
    await ctx.setOffline(true);
    await page.setInputFiles('#photo-input', { name: 'poste.png', mimeType: 'image/png', buffer: FOTO });
    await page.waitForFunction(() => !document.getElementById('submit-btn').disabled);
    await enviar(page);
    const [p] = await filaCidadao(page);
    const ok = p && p.tipo === 'piscando' && p.descricao === 'Preenchido antes de cair' && p.lat != null;
    return { aprovado: Boolean(ok), obtido: p ? `Salvo com tipo "${p.tipo}", descrição "${p.descricao}" e GPS ${p.lat != null ? 'presente' : 'ausente'}.` : 'Nada foi salvo.' };
  }
});

caso({
  id: 'CP-09', titulo: 'Formulário preenchido sem internet sobrevive ao fechamento do app',
  requisito: 'CA02', derivacao: 'Critério de aceitação', tecnica: 'Baseado em risco (perda do preenchimento)',
  dado: 'o cidadão preencheu tipo, descrição e GPS e a internet caiu', quando: 'o app é fechado e aberto de novo antes do envio',
  entao: 'o que já tinha sido preenchido continua no formulário',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    await page.click('#gps-btn');
    await page.waitForSelector('#gps-result.show');
    await page.click('#type-chips .chip[data-value="quebrado"]');
    await page.fill('#descricao', 'Rascunho que não pode se perder');
    await ctx.setOffline(true);
    await page.reload();
    await passarAbertura(page);
    await page.waitForSelector('#screen-report.active');
    const desc = await page.inputValue('#descricao');
    const tipo = await page.evaluate(() => document.querySelector('#type-chips .chip[aria-pressed="true"]')?.dataset.value || '');
    const gps = await page.isVisible('#gps-result.show');
    return {
      aprovado: desc === 'Rascunho que não pode se perder' && tipo === 'quebrado' && gps,
      obtido: `Depois de reabrir: descrição "${desc}", tipo "${tipo || 'nenhum'}", GPS ${gps ? 'mantido' : 'perdido'}.`
    };
  }
});

/* ── UC03: sincronização ── */

async function salvarOffline(ctx, page, opcoes) {
  await ctx.setOffline(true);
  await preencherReporte(page, opcoes);
  return enviar(page);
}

caso({
  id: 'CP-10', titulo: 'Reporte pendente é enviado sozinho quando a internet volta',
  requisito: 'UC03 (fluxo principal); RF02; CA03', derivacao: 'Fluxo principal', tecnica: 'Transição de estado (offline → online)',
  dado: 'há 1 reporte na fila do aparelho', quando: 'a internet volta',
  entao: 'o servidor passa a ter 1 registro do protocolo, a fila esvazia e o aviso de pendente some',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    const { protocolo } = await salvarOffline(ctx, page);
    await ctx.setOffline(false);
    await aguardar(async () => (await filaCidadao(page)).length === 0, { timeout: 20000 });
    const fila = await filaCidadao(page);
    const { banner } = await avisosNaTela(page);
    const registros = registrosDoProtocolo(srv, protocolo);
    return {
      aprovado: registros === 1 && fila.length === 0 && banner === '',
      obtido: `Registros no servidor: ${registros} (envios recebidos: ${recebidosCidadao(srv, protocolo)}). Fila: ${fila.length}${fila[0] ? `, ${fila[0].tentativas} tentativa(s), motivo: ${fila[0].motivo}` : ''}. Aviso: "${banner || 'oculto'}".`
    };
  }
});

caso({
  id: 'CP-11', titulo: 'Três reportes offline são enviados um por vez, sem perda e sem duplicidade',
  requisito: 'UC03 (passo 2); CA03', derivacao: 'Critério de aceitação', tecnica: 'Valor limite (vários itens na fila)',
  dado: 'há 3 reportes na fila do aparelho', quando: 'a internet volta',
  entao: 'o servidor tem exatamente 1 registro de cada protocolo e a fila esvazia',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    await ctx.setOffline(true);
    const protocolos = [];
    for (let i = 0; i < 3; i++) {
      await preencherReporte(page, { descricao: 'Lote ' + i });
      protocolos.push((await enviar(page)).protocolo);
      await novoReporte(page);
    }
    await ctx.setOffline(false);
    await aguardar(async () => (await filaCidadao(page)).length === 0, { timeout: 25000 });
    const contagem = protocolos.map((p) => registrosDoProtocolo(srv, p));
    const fila = await filaCidadao(page);
    return {
      aprovado: contagem.every((c) => c === 1) && fila.length === 0,
      obtido: `Registros por protocolo: ${contagem.join(', ')}. Fila: ${fila.length}.`
    };
  }
});

caso({
  id: 'CP-12', titulo: 'Falha de rede durante a sincronização mantém o reporte e tenta de novo na próxima conexão',
  requisito: 'UC03-A1', derivacao: 'Fluxo alternativo', tecnica: 'Baseado em requisito (falha de rede)',
  dado: 'há 1 reporte na fila e a conexão cai no meio do envio', quando: 'a internet volta depois',
  entao: 'o reporte continua na fila com 1 tentativa a mais e, na reconexão seguinte, chega ao servidor',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    const { protocolo } = await salvarOffline(ctx, page);
    controlar(srv, { cidadao: 'perde-conexao' });
    await ctx.setOffline(false);
    await aguardar(async () => ((await filaCidadao(page))[0] || {}).tentativas >= 1);
    const [depoisDaFalha] = await filaCidadao(page);
    controlar(srv, { cidadao: 'ok' });
    await ctx.setOffline(true);
    await ctx.setOffline(false);
    await aguardar(async () => (await filaCidadao(page)).length === 0, { timeout: 20000 });
    const registros = registrosDoProtocolo(srv, protocolo);
    return {
      aprovado: Boolean(depoisDaFalha) && depoisDaFalha.tentativas >= 1 && registros === 1,
      obtido: `Após a falha: ${depoisDaFalha ? `na fila, ${depoisDaFalha.tentativas} tentativa(s)` : 'fora da fila'}. Após a nova conexão: ${registros} registro(s) no servidor.`
    };
  }
});

caso({
  id: 'CP-13', titulo: 'Reporte recusado pelo servidor fica na fila com o motivo e o cidadão é avisado',
  requisito: 'UC03-A2', derivacao: 'Fluxo alternativo', tecnica: 'Baseado em requisito (recusa do servidor)',
  dado: 'há 1 reporte na fila e o servidor recusa os dados', quando: 'a internet volta',
  entao: 'o reporte continua na fila com o motivo registrado e a tela avisa que há reporte com problema',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    const { protocolo } = await salvarOffline(ctx, page);
    controlar(srv, { cidadao: 'rejeita' });
    await ctx.setOffline(false);
    await aguardar(async () => ((await filaCidadao(page))[0] || {}).tentativas >= 1);
    const fila = await filaCidadao(page);
    const { banner, toast } = await avisosNaTela(page);
    const avisouProblema = /problema|recusad|rejeit|corrig/i.test(banner + ' ' + toast);
    return {
      aprovado: fila.length === 1 && Boolean(fila[0].motivo) && avisouProblema,
      obtido: `Fila: ${fila.length}${fila[0] ? `, motivo guardado: ${fila[0].motivo}` : ''}. Aviso na tela: "${banner || toast || 'nenhum'}". Recebidos pelo servidor: ${recebidosCidadao(srv, protocolo)}.`
    };
  }
});

caso({
  id: 'CP-14', titulo: 'Reporte recusado várias vezes não pode sumir sem avisar o cidadão',
  requisito: 'UC03 (regra: nenhum reporte descartado sem informar o cidadão)', derivacao: 'Regra de negócio', tecnica: 'Baseado em risco (perda de dados)',
  dado: 'há 1 reporte na fila e o servidor sempre o recusa', quando: 'a internet cai e volta 6 vezes',
  entao: 'o reporte continua no aparelho, ou o cidadão vê um aviso de que ele foi descartado',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    const { protocolo } = await salvarOffline(ctx, page);
    controlar(srv, { cidadao: 'rejeita' });
    for (let i = 0; i < 6; i++) {
      const antes = recebidosCidadao(srv, protocolo);
      await ctx.setOffline(false);
      await aguardar(async () => recebidosCidadao(srv, protocolo) > antes || (await filaCidadao(page)).length === 0, { timeout: 10000 });
      await ctx.setOffline(true);
    }
    const fila = await filaCidadao(page);
    const { banner, toast } = await avisosNaTela(page);
    const avisou = /descart|problema|recusad|não foi enviado/i.test(banner + ' ' + toast);
    return {
      aprovado: fila.length === 1 || avisou,
      obtido: fila.length === 1
        ? `O reporte continua na fila (${fila[0].tentativas} tentativas).`
        : `O reporte ${protocolo} foi apagado do aparelho depois de ${recebidosCidadao(srv, protocolo)} envios recusados. Aviso na tela: "${banner || toast || 'nenhum'}".`
    };
  }
});

caso({
  id: 'CP-15', titulo: 'Fila sobrevive ao fechamento do app e é enviada na próxima abertura com internet',
  requisito: 'UC03-A3', derivacao: 'Fluxo alternativo', tecnica: 'Transição de estado (app fechado)',
  dado: 'há 1 reporte na fila e o app é fechado sem internet', quando: 'o app é aberto de novo, primeiro sem e depois com internet',
  entao: 'o reporte continua na fila enquanto não há internet e chega ao servidor na abertura com internet',
  async executar({ ctx, srv }) {
    let page = await abrirCidadao(ctx, srv);
    const { protocolo } = await salvarOffline(ctx, page);
    await page.close();
    page = await ctx.newPage();
    await page.goto(srv.url + '/');
    const filaOffline = (await filaCidadao(page)).length;
    await page.close();
    await ctx.setOffline(false);
    page = await ctx.newPage();
    await page.goto(srv.url + '/');
    await aguardar(async () => (await filaCidadao(page)).length === 0, { timeout: 20000 });
    const registros = registrosDoProtocolo(srv, protocolo);
    return {
      aprovado: filaOffline === 1 && registros === 1,
      obtido: `Reaberto sem internet: ${filaOffline} item na fila. Reaberto com internet: ${registros} registro(s) no servidor.`
    };
  }
});

caso({
  id: 'CP-16', titulo: 'Resposta perdida: o mesmo protocolo não pode virar dois registros',
  requisito: 'UC03 (regra: mesmo protocolo não gera dois registros); CA03', derivacao: 'Regra de negócio', tecnica: 'Baseado em risco (duplicidade)',
  dado: 'o servidor grava o reporte, mas a resposta não chega ao aparelho', quando: 'o app reenvia o reporte na reconexão',
  entao: 'o servidor tem exatamente 1 registro do protocolo e a fila esvazia',
  variantesAppsScript: true,
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    controlar(srv, { cidadao: 'perde-resposta' });
    await preencherReporte(page);
    const r = await enviar(page);
    controlar(srv, { cidadao: 'ok' });
    await ctx.setOffline(true);
    await ctx.setOffline(false);
    await aguardar(async () => (await filaCidadao(page)).length === 0, { timeout: 20000 });
    const registros = registrosDoProtocolo(srv, r.protocolo);
    const fila = await filaCidadao(page);
    return {
      aprovado: registros === 1 && fila.length === 0,
      obtido: `Tela após a resposta perdida: "${r.titulo}". Envios recebidos: ${recebidosCidadao(srv, r.protocolo)}. Registros no servidor: ${registros}. Fila: ${fila.length}.`
    };
  }
});

caso({
  id: 'CP-17', titulo: 'Gatilhos de sincronização ao mesmo tempo não criam registros repetidos',
  requisito: 'UC03 (gatilho e regra de duplicidade); CA03', derivacao: 'Regra de negócio', tecnica: 'Baseado em risco (concorrência)',
  dado: 'há 1 reporte na fila e a rede está lenta (resposta em 1,5 s)', quando: 'a internet volta e o app volta ao primeiro plano no mesmo instante',
  entao: 'o servidor tem exatamente 1 registro do protocolo',
  variantesAppsScript: true,
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    const { protocolo } = await salvarOffline(ctx, page);
    controlar(srv, { atrasoMs: 1500 });
    await ctx.setOffline(false);
    // O sistema avisa a página que ela voltou ao primeiro plano (evento do navegador).
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
    await aguardar(async () => (await filaCidadao(page)).length === 0, { timeout: 20000 });
    const registros = registrosDoProtocolo(srv, protocolo);
    return {
      aprovado: registros === 1,
      obtido: `Envios recebidos do mesmo protocolo: ${recebidosCidadao(srv, protocolo)}. Registros no servidor: ${registros}.`
    };
  }
});

caso({
  id: 'CP-18', titulo: 'Indicador de conexão mostra "Sem sinal" e "Online"',
  requisito: 'RNF01; RNF04', derivacao: 'Requisito não funcional', tecnica: 'Partição de equivalência (online/offline)',
  dado: 'o app está aberto', quando: 'a internet cai e depois volta',
  entao: 'o indicador mostra "Sem sinal" e depois "Online"',
  async executar({ ctx, srv }) {
    const page = await abrirCidadao(ctx, srv);
    await ctx.setOffline(true);
    const off = await aguardar(async () => ((await page.textContent('#status-text')).trim() === 'Sem sinal' ? 'Sem sinal' : null), { timeout: 5000 });
    await ctx.setOffline(false);
    const on = await aguardar(async () => ((await page.textContent('#status-text')).trim() === 'Online' ? 'Online' : null), { timeout: 5000 });
    return { aprovado: off === 'Sem sinal' && on === 'Online', obtido: `Sem internet: "${off || (await page.textContent('#status-text')).trim()}"; com internet: "${on || (await page.textContent('#status-text')).trim()}".` };
  }
});

caso({
  id: 'CP-19', titulo: 'Link com parâmetros (ex.: compartilhado no WhatsApp) abre sem internet',
  requisito: 'RNF01', derivacao: 'Requisito não funcional', tecnica: 'Partição de equivalência (endereço com/sem parâmetros)',
  dado: 'o app já foi aberto uma vez', quando: 'o cidadão abre /?utm_source=whatsapp sem internet',
  entao: 'o app abre normalmente',
  async executar({ ctx, srv }) {
    await abrirCidadao(ctx, srv);
    await ctx.setOffline(true);
    const page = await ctx.newPage();
    let erro = '';
    try { await page.goto(srv.url + '/?utm_source=whatsapp', { timeout: 10000 }); } catch (e) { erro = e.message.split('\n')[0]; }
    const abriu = await temTelaDeReporte(page);
    return { aprovado: abriu, obtido: abriu ? 'Abriu normalmente.' : `Não abriu: ${erro || 'página de erro do navegador'}.` };
  }
});

caso({
  id: 'CP-20', titulo: 'QR Code do poste lido sem internet segue o reporte com o poste vinculado',
  requisito: 'UC02-A3', derivacao: 'Fluxo alternativo', tecnica: 'Baseado em requisito',
  dado: 'o app já foi aberto uma vez', quando: 'o cidadão lê o QR do poste P-0007 sem internet e faz o reporte',
  entao: 'o app segue o reporte sem a verificação de duplicidade e o reporte fica na fila vinculado ao poste P-0007',
  async executar({ ctx, srv }) {
    await abrirCidadao(ctx, srv);
    await ctx.setOffline(true);
    const page = await ctx.newPage();
    await page.goto(srv.url + '/?poste=P-0007');
    await passarAbertura(page);
    const telas = await page.evaluate(() => [...document.querySelectorAll('.screen.active')].map((s) => s.id).join(', '));
    if (await page.locator('#screen-poste-info.active').count()) {
      await page.locator('#screen-poste-info.active button', { hasText: 'Continuar' }).click({ timeout: 10000 });
    }
    const chegou = await page.waitForSelector('#screen-report.active', { timeout: 8000 }).then(() => true, () => false);
    if (!chegou) return { aprovado: false, obtido: `Depois de ler o QR sem internet o app ficou na tela "${telas}" e não chegou ao formulário.` };
    await preencherReporte(page);
    const r = await enviar(page);
    const [item] = await filaCidadao(page);
    return {
      aprovado: Boolean(item) && item.poste === 'P-0007',
      obtido: `Tela: "${r.titulo}". Item na fila: ${item ? `sim, poste "${item.poste || 'nenhum'}"` : 'não'}.`
    };
  }
});

/* ═════════════════════════ Casos — painel do técnico ═════════════════════════ */

caso({
  id: 'CT-01', titulo: 'Login sem internet informa que não há conexão',
  requisito: 'UC04-A4', derivacao: 'Fluxo alternativo', tecnica: 'Baseado em requisito',
  dado: 'o painel já foi aberto uma vez e o aparelho está sem internet', quando: 'o técnico digita o PIN',
  entao: 'o login não acontece e aparece mensagem de falta de conexão',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await ctx.setOffline(true);
    await digitarPin(page);
    const msg = await aguardar(async () => (await page.textContent('#pin-error')).trim() || null, { timeout: 8000 });
    const entrou = await page.isVisible('#screen-home.active');
    return { aprovado: !entrou && /conex|internet|sinal/i.test(msg || ''), obtido: `Mensagem: "${msg || 'nenhuma'}". Entrou no painel: ${entrou ? 'sim' : 'não'}.` };
  }
});

caso({
  id: 'CT-02', titulo: 'Login com internet abre a lista de chamados',
  requisito: 'UC04 (fluxo principal); RF03', derivacao: 'Fluxo principal', tecnica: 'Baseado em requisito (caso positivo)',
  dado: 'o técnico tem PIN cadastrado e há 20 chamados abertos', quando: 'ele digita o PIN com internet',
  entao: 'o painel mostra a lista com os 20 chamados',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await digitarPin(page);
    const home = await aguardar(() => page.isVisible('#screen-home.active'), { timeout: 15000 });
    const n = await aguardar(async () => { const k = await page.locator('#lista-chamados .js-call-item').count(); return k >= 20 ? k : null; }, { timeout: 10000 });
    const total = await page.locator('#lista-chamados .js-call-item').count();
    return { aprovado: Boolean(home) && n === 20, obtido: `Entrou no painel: ${home ? 'sim' : 'não'}. Chamados na lista: ${total}. Mensagem: "${(await page.textContent('#pin-error')).trim() || '-'}".` };
  }
});

caso({
  id: 'CT-03', titulo: 'Sessão salva abre a lista sem internet e sem pedir PIN',
  requisito: 'UC04-A1; RNF01 (uso em campo)', derivacao: 'Fluxo alternativo', tecnica: 'Transição de estado (online → offline)',
  dado: 'o técnico entrou com internet e a lista foi carregada', quando: 'ele reabre o painel sem internet',
  entao: 'o painel abre direto na lista, com os 20 chamados guardados, sem pedir PIN',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    await ctx.setOffline(true);
    await page.reload();
    const home = await aguardar(() => page.isVisible('#screen-home.active'), { timeout: 10000 });
    const n = await aguardar(async () => { const k = await page.locator('#lista-chamados .js-call-item').count(); return k >= 20 ? k : null; }, { timeout: 8000 });
    const pin = await page.isVisible('#screen-pin.active');
    return { aprovado: Boolean(home) && n === 20 && !pin, obtido: `Abriu na lista: ${home ? 'sim' : 'não'}. Pediu PIN: ${pin ? 'sim' : 'não'}. Chamados visíveis: ${await page.locator('#lista-chamados .js-call-item').count()}.` };
  }
});

caso({
  id: 'CT-04', titulo: 'Fechamento com internet é registrado no servidor',
  requisito: 'UC05 (passos 6 e 7); RF04', derivacao: 'Fluxo principal', tecnica: 'Baseado em requisito (caso positivo)',
  dado: 'o técnico está no painel com internet', quando: 'ele preenche e confirma o fechamento do chamado T01',
  entao: 'a tela mostra "Chamado fechado!" e o servidor registra o fechamento do T01',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    const r = await fecharPelaTela(page, 'IC-261112-T01');
    const fechou = fechadoNoServidor(srv, 'IC-261112-T01');
    const rotas = [...new Set(srv.estado.recebidos.tecnico.map((t) => t.caminho))].join(', ');
    return {
      aprovado: r.titulo === 'Chamado fechado!' && fechou && fechamentosDoProtocolo(srv, 'IC-261112-T01') === 1,
      obtido: `Resultado na tela: ${r.titulo ? `"${r.titulo}"` : `aviso "${r.toast}"`}. Fechado no servidor: ${fechou ? 'sim' : 'não'}. Endereço usado: ${rotas || 'nenhum'}.`
    };
  }
});

caso({
  id: 'CT-05', titulo: 'Fechamento sem internet vai para a fila do aparelho',
  requisito: 'UC05-A5', derivacao: 'Fluxo alternativo', tecnica: 'Baseado em requisito',
  dado: 'o técnico está no painel e perde a internet', quando: 'ele confirma o fechamento do T01',
  entao: 'a tela mostra "Salvo no aparelho" e há 1 fechamento na fila',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    await ctx.setOffline(true);
    const r = await fecharPelaTela(page, 'IC-261112-T01');
    const fila = await filaTecnico(page);
    return { aprovado: r.titulo === 'Salvo no aparelho' && fila.length === 1, obtido: `Tela: "${r.titulo || r.toast}". Fila: ${fila.length}.` };
  }
});

caso({
  id: 'CT-06', titulo: 'Fechamento pendente é enviado quando a internet volta',
  requisito: 'UC05-A5; UC05 (pós-condição)', derivacao: 'Fluxo alternativo', tecnica: 'Transição de estado (offline → online)',
  dado: 'há 1 fechamento na fila do aparelho', quando: 'a internet volta',
  entao: 'o servidor registra o fechamento uma vez e a fila esvazia',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    await ctx.setOffline(true);
    await fecharPelaTela(page, 'IC-261112-T02');
    await ctx.setOffline(false);
    await aguardar(async () => (await filaTecnico(page)).length === 0, { timeout: 20000 });
    const fila = await filaTecnico(page);
    const n = fechamentosDoProtocolo(srv, 'IC-261112-T02');
    return {
      aprovado: n === 1 && fila.length === 0,
      obtido: `Fechamentos registrados no servidor: ${n}. Tentativas recebidas: ${srv.estado.recebidos.tecnico.length} (em ${[...new Set(srv.estado.recebidos.tecnico.map((t) => t.caminho))].join(', ') || '-'}). Fila: ${fila.length}.`
    };
  }
});

caso({
  id: 'CT-07', titulo: 'Com 10 fechamentos na fila, o 11º é bloqueado',
  requisito: 'UC05-A6', derivacao: 'Fluxo alternativo', tecnica: 'Análise de valor limite (10 e 11)',
  dado: 'o técnico está sem internet', quando: 'ele fecha 10 chamados e tenta fechar o 11º',
  entao: 'os 10 primeiros entram na fila; o 11º mostra aviso e não entra',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    await ctx.setOffline(true);
    for (let i = 1; i <= 10; i++) {
      const r = await fecharPelaTela(page, `IC-261112-T${String(i).padStart(2, '0')}`);
      if (r.titulo) await voltarInicio(page);
    }
    const com10 = (await filaTecnico(page)).length;
    const r11 = await fecharPelaTela(page, 'IC-261112-T11');
    const com11 = (await filaTecnico(page)).length;
    return {
      aprovado: com10 === 10 && com11 === 10 && /10 fechamentos na fila/.test(r11.toast),
      obtido: `Fila depois de 10: ${com10}. Depois do 11º: ${com11}. Aviso: "${r11.toast || r11.titulo}".`
    };
  }
});

caso({
  id: 'CT-08', titulo: 'Um fechamento recusado não pode travar o envio dos outros',
  requisito: 'UC05-A5; atributo Confiabilidade', derivacao: 'Fluxo alternativo (risco)', tecnica: 'Baseado em risco (fila travada)',
  dado: 'há 3 fechamentos na fila e o servidor recusa o primeiro', quando: 'a internet volta',
  entao: 'o 2º e o 3º são registrados no servidor',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    await ctx.setOffline(true);
    for (const p of ['IC-261112-T01', 'IC-261112-T02', 'IC-261112-T03']) {
      const r = await fecharPelaTela(page, p);
      if (r.titulo) await voltarInicio(page);
    }
    controlar(srv, { tecnico: 'erro-no-protocolo', protocoloComErro: 'IC-261112-T01' });
    await ctx.setOffline(false);
    await aguardar(() => srv.estado.recebidos.tecnico.length >= 1, { timeout: 10000 });
    await aguardar(() => fechamentosDoProtocolo(srv, 'IC-261112-T02') + fechamentosDoProtocolo(srv, 'IC-261112-T03') === 2, { timeout: 8000 });
    const outros = fechamentosDoProtocolo(srv, 'IC-261112-T02') + fechamentosDoProtocolo(srv, 'IC-261112-T03');
    const fila = await filaTecnico(page);
    return { aprovado: outros === 2, obtido: `Fechamentos 2 e 3 registrados: ${outros}. Itens que continuam na fila: ${fila.length}. Envios recebidos: ${srv.estado.recebidos.tecnico.length}.` };
  }
});

caso({
  id: 'CT-09', titulo: 'Resposta perdida no fechamento: o reenvio não trava a fila nem fecha duas vezes',
  requisito: 'UC05-A5; UC05 (pós-condição: materiais abatidos uma única vez)', derivacao: 'Fluxo alternativo (risco)', tecnica: 'Baseado em risco (resposta perdida)',
  dado: 'o servidor grava o fechamento, mas a resposta não chega', quando: 'o app reenvia o fechamento na reconexão',
  entao: 'o servidor tem 1 fechamento do chamado e a fila do aparelho esvazia',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    controlar(srv, { tecnico: 'perde-resposta' });
    const r = await fecharPelaTela(page, 'IC-261112-T04');
    controlar(srv, { tecnico: 'ok' });
    const antes = srv.estado.recebidos.tecnico.length;
    await ctx.setOffline(true);
    await ctx.setOffline(false);
    await aguardar(() => srv.estado.recebidos.tecnico.length > antes, { timeout: 10000 });
    await aguardar(async () => (await filaTecnico(page)).length === 0, { timeout: 8000 });
    const fila = await filaTecnico(page);
    const n = fechamentosDoProtocolo(srv, 'IC-261112-T04');
    return {
      aprovado: n === 1 && fila.length === 0,
      obtido: `Tela após a resposta perdida: "${r.titulo || r.toast}". Fechamentos no servidor: ${n}. Envios recebidos: ${srv.estado.recebidos.tecnico.length}. Itens presos na fila: ${fila.length}.`
    };
  }
});

caso({
  id: 'CT-10', titulo: 'Sessão expirada com fechamento na fila: nada se perde e o app pede o PIN',
  requisito: 'UC04-A3; UC05-A5', derivacao: 'Fluxo alternativo', tecnica: 'Transição de estado (sessão válida → expirada)',
  dado: 'há 1 fechamento na fila e a sessão expirou no servidor', quando: 'a internet volta e o técnico reabre o painel',
  entao: 'o fechamento continua na fila, o app volta a pedir o PIN e, depois do novo login, o fechamento é registrado',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    await ctx.setOffline(true);
    await fecharPelaTela(page, 'IC-261112-T05');
    controlar(srv, { expirarSessoes: true });
    await ctx.setOffline(false);
    await aguardar(() => srv.estado.recebidos.tecnico.length >= 1, { timeout: 10000 });
    const filaDepois = (await filaTecnico(page)).length;
    const pediuPinNaHora = await page.isVisible('#screen-pin.active');
    await page.reload();
    const pediuPin = await aguardar(() => page.isVisible('#screen-pin.active'), { timeout: 10000 });
    if (pediuPin) {
      await digitarPin(page);
      await aguardar(() => page.isVisible('#screen-home.active'), { timeout: 10000 });
    }
    await aguardar(() => fechamentosDoProtocolo(srv, 'IC-261112-T05') === 1, { timeout: 10000 });
    const n = fechamentosDoProtocolo(srv, 'IC-261112-T05');
    const filaFinal = (await filaTecnico(page)).length;
    return {
      aprovado: filaDepois === 1 && Boolean(pediuPin) && n === 1 && filaFinal === 0,
      obtido: `Depois da recusa por sessão expirada: ${filaDepois} item na fila; pediu PIN na hora: ${pediuPinNaHora ? 'sim' : 'não'}. Ao reabrir, pediu PIN: ${pediuPin ? 'sim' : 'não'}. Depois do novo login: ${n} fechamento(s) no servidor e ${filaFinal} item(ns) na fila.`
    };
  }
});

caso({
  id: 'CT-11', titulo: 'Chamado fechado sem internet não pode ser fechado de novo',
  requisito: 'UC05 (pré-condição: chamado "Aguardando atendimento"); CA03', derivacao: 'Violação de pré-condição', tecnica: 'Baseado em risco (fechamento em dobro)',
  dado: 'o técnico fechou o T06 sem internet', quando: 'ele volta à lista e tenta fechar o T06 outra vez',
  entao: 'o app não deixa abrir o fechamento de novo e a fila tem só 1 fechamento do T06',
  async executar({ ctx, srv }) {
    const page = await abrirTecnico(ctx, srv);
    await entrar(page);
    await ctx.setOffline(true);
    const r1 = await fecharPelaTela(page, 'IC-261112-T06');
    if (r1.titulo) await voltarInicio(page);
    const r2 = await fecharPelaTela(page, 'IC-261112-T06');
    const doT06 = (await filaTecnico(page)).filter((p) => p === 'IC-261112-T06').length;
    return {
      aprovado: doT06 === 1,
      obtido: `Segunda tentativa: ${r2.resultado === 'sem-cartao' ? 'o chamado já não aparece na lista' : r2.titulo ? `fechamento concluído de novo ("${r2.titulo}")` : `aviso "${r2.toast}"`}. Fechamentos do T06 na fila: ${doT06}.`
    };
  }
});

/* ═════════════════════════ Execução ═════════════════════════ */

const VARIANTES_APPS = [
  { sufixo: 'a', opcoes: { deduplicar: false }, nota: 'Planilha sem verificação de protocolo repetido.' },
  { sufixo: 'b', opcoes: { deduplicar: true }, nota: 'Planilha que descarta protocolo repetido.' }
];

async function rodar(browser, servidor, def, opcoes = {}, info = {}) {
  const inicio = Date.now();
  const srv = await criarServidorTeste({ servidor, ...opcoes });
  const ctx = await novoContexto(browser);
  let registro;
  try {
    const { aprovado, obtido, observacao = '' } = await def.executar({ ctx, srv, servidor });
    registro = { obtido, resultado: aprovado ? 'Aprovado' : 'Reprovado', observacao };
  } catch (erro) {
    registro = { obtido: 'Erro ao executar o teste: ' + erro.message.split('\n')[0], resultado: 'Erro de execução', observacao: '' };
  } finally {
    await ctx.close().catch(() => {});
    await srv.fechar();
  }
  const { executar, variantesAppsScript, ...meta } = def;
  return {
    ...meta, ...info, servidor,
    ...registro,
    observacao: [info.nota, registro.observacao].filter(Boolean).join(' '),
    duracaoMs: Date.now() - inicio
  };
}

/**
 * Roda todos os casos contra um servidor e grava o JSON de evidência.
 * `repeticoes` > 1 roda a suíte de novo para detectar teste instável (flaky).
 */
export async function executarCaixaPreta({ servidor, saida, repeticoes = 2, filtro = null }) {
  let chromium;
  try {
    ({ chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'));
  } catch {
    console.error('playwright-core não encontrado. Rode: npm install --no-save playwright-core (ou defina PLAYWRIGHT_CORE).');
    process.exit(1);
  }
  const browser = await chromium.launch({ channel: process.env.NAVEGADOR || 'chrome', headless: true });
  const versaoNavegador = browser.version();
  const execucoes = [];
  const inicio = new Date();
  try {
    for (let rodada = 1; rodada <= repeticoes; rodada++) {
      console.log(`\n── ${servidor} · rodada ${rodada} de ${repeticoes} ──`);
      const resultados = [];
      for (const def of CASOS) {
        if (filtro && !filtro.test(def.id)) continue;
        const variantes = def.variantesAppsScript && servidor === 'apps-script' ? VARIANTES_APPS : [null];
        for (const v of variantes) {
          const r = await rodar(browser, servidor, def, v ? v.opcoes : {}, v ? { id: def.id + v.sufixo, nota: v.nota } : {});
          resultados.push(r);
          console.log(`${r.resultado === 'Aprovado' ? '✔' : '✘'} ${r.id} ${r.titulo} — ${r.resultado}${r.resultado !== 'Aprovado' ? '\n   obtido: ' + r.obtido : ''}`);
        }
      }
      execucoes.push(resultados);
    }
  } finally {
    await browser.close();
  }

  // Estabilidade: um caso é instável se o resultado mudou entre as rodadas.
  const base = execucoes[0];
  const casos = base.map((c) => {
    const resultados = execucoes.map((ex) => (ex.find((x) => x.id === c.id) || {}).resultado);
    return { ...c, resultadosPorRodada: resultados, estavel: resultados.every((r) => r === resultados[0]) };
  });
  const conta = (r) => casos.filter((c) => c.resultado === r).length;
  const resumo = {
    tipo: 'caixa-preta',
    servidor,
    executadoEm: inicio.toISOString(),
    ambiente: {
      node: process.version,
      navegador: `${process.env.NAVEGADOR || 'chrome'} ${versaoNavegador}`,
      playwright: require(require.resolve((process.env.PLAYWRIGHT_CORE || 'playwright-core') + '/package.json')).version,
      sistema: process.platform
    },
    rodadas: repeticoes,
    total: casos.length,
    aprovados: conta('Aprovado'),
    reprovados: conta('Reprovado'),
    errosDeExecucao: conta('Erro de execução'),
    instaveis: casos.filter((c) => !c.estavel).map((c) => c.id),
    casos
  };
  mkdirSync(dirname(saida), { recursive: true });
  writeFileSync(saida, JSON.stringify(resumo, null, 2));
  console.log(`\nTotal ${resumo.total} | aprovados ${resumo.aprovados} | reprovados ${resumo.reprovados} | erros ${resumo.errosDeExecucao} | instáveis ${resumo.instaveis.length}`);
  return resumo;
}
