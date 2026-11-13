/**
 * TESTES DE CAIXA-PRETA — Funcionalidades offline (navegador real)
 *
 * Abre o app do cidadão e o painel do técnico num Chrome controlado pelo Playwright,
 * liga e desliga a internet e confere apenas o que o usuário vê e o que chega no servidor.
 *
 * Como executar (na raiz do projeto):
 *   npm install --no-save playwright-core
 *   node server/tests/testes-offline/caixa-preta.navegador.mjs
 *
 * Usa o Google Chrome instalado na máquina (canal "chrome"). Para usar o Edge:
 *   set NAVEGADOR=msedge   (Windows)   |   NAVEGADOR=msedge node ...   (bash)
 *
 * O resultado é gravado em:
 *   docs/Relatório de Testes/Testes offline/evidencias/resultado-caixa-preta.json
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '../../..');
const { criarServidorTeste } = require('./apoio/servidor-teste.js');

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'));
} catch {
  console.error('playwright-core não encontrado. Rode: npm install --no-save playwright-core');
  process.exit(1);
}

const FOTO = readFileSync(resolve(raiz, 'public/icon-192.png'));
const CORURIPE = { latitude: -10.1251, longitude: -36.1752, accuracy: 6 };
const resultados = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function aguardar(condicao, { timeout = 15000, intervalo = 200 } = {}) {
  const fim = Date.now() + timeout;
  let ultimo;
  while (Date.now() < fim) {
    ultimo = await condicao();
    if (ultimo) return ultimo;
    await espera(intervalo);
  }
  return ultimo;
}

async function estado(srv) { return (await fetch(srv.url + '/__estado')).json(); }
async function controlar(srv, valores) {
  await fetch(srv.url + '/__controle', { method: 'POST', body: JSON.stringify(valores) });
}

async function caso(info, executar) {
  const inicio = Date.now();
  let registro;
  try {
    const { obtido, aprovado, observacao = '' } = await executar();
    registro = { ...info, obtido, resultado: aprovado ? 'Aprovado' : 'Reprovado', observacao };
  } catch (erro) {
    registro = { ...info, obtido: 'Erro ao executar o teste: ' + erro.message, resultado: 'Erro', observacao: '' };
  }
  registro.duracaoMs = Date.now() - inicio;
  resultados.push(registro);
  console.log(`${registro.resultado === 'Aprovado' ? '✔' : '✘'} ${registro.id} ${registro.titulo} — ${registro.resultado}`);
  if (registro.resultado !== 'Aprovado') console.log('   obtido:', registro.obtido);
}

/* ─────────────── Ajudantes do app do cidadão ─────────────── */

async function novoContexto(browser) {
  return browser.newContext({
    geolocation: CORURIPE,
    permissions: ['geolocation'],
    serviceWorkers: 'allow',
    viewport: { width: 390, height: 844 }
  });
}

async function abrirCidadao(contexto, srv, caminho = '/') {
  const page = await contexto.newPage();
  await page.goto(srv.url + caminho);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
    .catch(async () => { await page.reload(); });
  await pularSplash(page);
  return page;
}

async function pularSplash(page) {
  await page.waitForSelector('#screen-splash, #screen-report', { state: 'attached' });
  await page.evaluate(() => window.finishSplash && window.finishSplash());
  await page.waitForSelector('#screen-report.active', { timeout: 10000 });
}

async function preencherReporte(page, { descricao = 'Teste offline' } = {}) {
  await page.click('#gps-btn');
  await page.waitForSelector('#gps-result.show', { timeout: 15000 });
  await page.click('#type-chips .chip[data-value="apagado"]');
  await page.setInputFiles('#photo-input', { name: 'poste.png', mimeType: 'image/png', buffer: FOTO });
  await page.waitForSelector('#photo-preview-wrap.show', { timeout: 10000 });
  await page.fill('#descricao', descricao);
  await page.waitForFunction(() => !document.getElementById('submit-btn').disabled);
}

async function enviar(page) {
  await page.click('#submit-btn');
  await page.waitForSelector('#screen-success.active', { timeout: 70000 });
  return {
    titulo: (await page.textContent('#success-title')).trim(),
    protocolo: (await page.textContent('#success-protocol')).trim()
  };
}

async function novoReporte(page) {
  await page.evaluate(() => window.resetForm());
  await page.waitForSelector('#screen-report.active');
}

async function filaCidadao(page) {
  return page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open('ilumina_v2', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('reports')) db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => {
      const g = req.result.transaction('reports', 'readonly').objectStore('reports').getAll();
      g.onsuccess = () => ok(g.result.map((r) => ({ id: r.id, protocolo: r.payload && r.payload.protocolo, attempts: r.attempts || 0, lastError: r.lastError || null })));
    };
  }));
}

async function textoBanner(page) {
  return page.evaluate(() => {
    const b = document.getElementById('pending-banner');
    return b && b.classList.contains('show') ? b.textContent.replace(/\s+/g, ' ').trim() : '';
  });
}

/* ─────────────── Ajudantes do painel do técnico ─────────────── */

async function abrirTecnico(contexto, srv, sessao) {
  if (sessao) {
    await contexto.addInitScript((s) => {
      if (!localStorage.getItem('ilu_tech_session')) localStorage.setItem('ilu_tech_session', JSON.stringify(s));
    }, sessao);
  }
  const page = await contexto.newPage();
  await page.goto(srv.url + '/tecnico/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
    .catch(async () => { await page.reload(); });
  return page;
}

async function loginTecnico(page) {
  for (const d of '1234') await page.evaluate((k) => window.pinKey ? window.pinKey(k) : pinKey(k), d);
  await page.waitForSelector('#screen-home.active', { timeout: 15000 });
}

/** Preenche o formulário de fechamento com dados válidos e chama o fechamento da tela. */
async function fecharChamadoTecnico(page, protocolo) {
  await page.evaluate((p) => {
    currentCall = { protocolo: p, status: 'Aguardando atendimento', candidatos: [] };
    statusSel = 'Concluído';
    techGPS = { lat: -10.1249, lng: -36.1748, acc: 8 };
    techFoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    Object.keys(posteConfig).forEach((k) => { posteConfig[k] = 'Teste'; });
    document.getElementById('f-tecnico').value = 'Técnico Teste';
    document.getElementById('f-servico').value = 'Troca de lâmpada (teste)';
    document.getElementById('f-referencia').value = 'Em frente à praça (teste)';
  }, protocolo);
  await page.evaluate(() => fecharChamado());
  await espera(400);
}

async function filaTecnico(page) {
  return page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open('ilumina_tec', 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('close_queue')) return ok([]);
      const g = db.transaction('close_queue', 'readonly').objectStore('close_queue').getAll();
      g.onsuccess = () => ok(g.result.map((r) => ({ id: r.id, protocolo: r.payload && r.payload.protocolo })));
    };
  }));
}

/* ═════════════════════════ CENÁRIOS ═════════════════════════ */

async function cenariosCidadaoLegado(browser) {
  const srv = await criarServidorTeste({ modo: 'legado' });
  try {
    await caso({ id: 'CP-01', titulo: 'App do cidadão abre sem internet depois do primeiro acesso', requisito: 'RNF01; UC01 (pré-condição)', tecnica: 'Partição de equivalência (com/sem internet)', esperado: 'Com o aparelho offline, ao reabrir o app a tela de reporte aparece normalmente.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await ctx.setOffline(true);
      await page.reload();
      await pularSplash(page);
      const ok = await page.isVisible('#screen-report.active');
      await ctx.close();
      return { aprovado: ok, obtido: ok ? 'A tela de reporte abriu offline (arquivos vieram do cache do service worker).' : 'A tela não abriu offline.' };
    });

    await caso({ id: 'CP-02', titulo: 'Reporte feito sem internet fica salvo no aparelho com protocolo', requisito: 'RF02; UC01-A1', tecnica: 'Baseado em requisito (fluxo alternativo)', esperado: 'Tela "Salvo sem sinal", protocolo no formato IC-AAMMDD-XXXXX, 1 item na fila local e aviso de pendente.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await ctx.setOffline(true);
      await preencherReporte(page);
      const r = await enviar(page);
      const fila = await filaCidadao(page);
      const banner = await textoBanner(page);
      await ctx.close();
      const formatoOk = /^Protocolo: IC-\d{6}-[A-Z0-9]{5}$/.test(r.protocolo);
      return {
        aprovado: r.titulo === 'Salvo sem sinal' && formatoOk && fila.length === 1 && /1 reporte pendente/.test(banner),
        obtido: `Título "${r.titulo}", ${r.protocolo}, ${fila.length} item na fila, aviso: "${banner}".`
      };
    });

    await caso({ id: 'CP-03', titulo: 'Reporte pendente é enviado sozinho quando a internet volta', requisito: 'RF02; UC03 (fluxo principal); CA03', tecnica: 'Transição de estado (offline → online)', esperado: 'Ao voltar a internet, o servidor recebe o reporte uma vez, a fila esvazia e o aviso some.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      const antes = (await estado(srv)).recebidosCidadao.length;
      await ctx.setOffline(true);
      await preencherReporte(page);
      const { protocolo } = await enviar(page);
      await ctx.setOffline(false);
      await aguardar(async () => (await filaCidadao(page)).length === 0);
      const recebidos = (await estado(srv)).recebidosCidadao.slice(antes).filter((p) => 'Protocolo: ' + p.protocolo === protocolo);
      const fila = await filaCidadao(page);
      const banner = await textoBanner(page);
      await ctx.close();
      return {
        aprovado: recebidos.length === 1 && fila.length === 0 && banner === '',
        obtido: `Servidor recebeu ${recebidos.length} cópia(s); fila com ${fila.length} item(ns); aviso: "${banner || 'oculto'}".`
      };
    });

    await caso({ id: 'CP-04', titulo: 'Três reportes offline são enviados sem perda e sem duplicidade', requisito: 'UC03; CA03', tecnica: 'Valor limite (vários itens na fila)', esperado: 'O servidor recebe exatamente 3 reportes, cada protocolo uma única vez.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      const antes = (await estado(srv)).recebidosCidadao.length;
      await ctx.setOffline(true);
      const protocolos = [];
      for (let i = 0; i < 3; i++) {
        await preencherReporte(page, { descricao: 'Lote ' + i });
        protocolos.push((await enviar(page)).protocolo.replace('Protocolo: ', ''));
        await novoReporte(page);
      }
      await ctx.setOffline(false);
      await aguardar(async () => (await filaCidadao(page)).length === 0);
      await espera(1500);
      const recebidos = (await estado(srv)).recebidosCidadao.slice(antes).map((p) => p.protocolo);
      await ctx.close();
      const contagem = protocolos.map((p) => recebidos.filter((x) => x === p).length);
      return {
        aprovado: contagem.every((c) => c === 1) && recebidos.length === 3,
        obtido: `Recebidos ${recebidos.length} envios; cópias por protocolo: ${contagem.join(', ')}.`
      };
    });

    await caso({ id: 'CP-05', titulo: 'Fila sobrevive ao fechamento do app e é enviada na próxima abertura com internet', requisito: 'UC03-A3; Confiabilidade', tecnica: 'Transição de estado (app fechado)', esperado: 'Depois de fechar o app offline, o reporte continua na fila e é enviado quando o app é aberto com internet.' }, async () => {
      const ctx = await novoContexto(browser);
      let page = await abrirCidadao(ctx, srv);
      await ctx.setOffline(true);
      await preencherReporte(page);
      const { protocolo } = await enviar(page);
      await page.close();
      page = await ctx.newPage();
      await page.goto(srv.url + '/');
      await pularSplash(page);
      const filaOffline = (await filaCidadao(page)).length;
      await page.close();
      await ctx.setOffline(false);
      page = await ctx.newPage();
      await page.goto(srv.url + '/');
      await aguardar(async () => (await filaCidadao(page)).length === 0);
      const recebido = (await estado(srv)).recebidosCidadao.some((p) => 'Protocolo: ' + p.protocolo === protocolo);
      await ctx.close();
      return { aprovado: filaOffline === 1 && recebido, obtido: `Após reabrir offline havia ${filaOffline} item na fila; após abrir online, servidor recebeu: ${recebido ? 'sim' : 'não'}.` };
    });

    await caso({ id: 'CP-06', titulo: 'Com internet, erro do servidor no envio guarda o reporte na fila', requisito: 'UC01-A2', tecnica: 'Baseado em requisito (falha no envio)', esperado: 'Servidor responde erro 500: o app mostra o protocolo, informa envio pendente e guarda o reporte na fila.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await controlar(srv, { cidadao: 'erro500' });
      await preencherReporte(page);
      const r = await enviar(page);
      const fila = await filaCidadao(page);
      await controlar(srv, { cidadao: 'ok' });
      await page.evaluate(() => window.flushQueue && window.flushQueue());
      await aguardar(async () => (await filaCidadao(page)).length === 0);
      await ctx.close();
      return { aprovado: r.titulo === 'Salvo sem sinal' && fila.length === 1, obtido: `Título "${r.titulo}", ${r.protocolo}, ${fila.length} item na fila.`, observacao: 'O título diz "Salvo sem sinal" mesmo havendo sinal; a mensagem é imprecisa, mas o comportamento atende ao requisito.' };
    });

    await caso({ id: 'CP-07', titulo: 'Falha de servidor durante a sincronização mantém o reporte na fila', requisito: 'UC03-A1', tecnica: 'Baseado em requisito (falha na sincronização)', esperado: 'O reporte continua na fila com uma tentativa a mais e o aviso continua aparecendo; depois é enviado.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await ctx.setOffline(true);
      await preencherReporte(page);
      await enviar(page);
      await controlar(srv, { cidadao: 'erro500' });
      await ctx.setOffline(false);
      await aguardar(async () => (await filaCidadao(page))[0]?.attempts >= 1);
      const fila = await filaCidadao(page);
      const banner = await textoBanner(page);
      await controlar(srv, { cidadao: 'ok' });
      await page.evaluate(() => window.flushQueue());
      const enviado = await aguardar(async () => (await filaCidadao(page)).length === 0);
      await ctx.close();
      return {
        aprovado: fila.length === 1 && fila[0].attempts >= 1 && banner !== '' && enviado,
        obtido: `Após a falha: ${fila.length} item, tentativas = ${fila[0]?.attempts}, aviso "${banner}". Após o servidor voltar: ${enviado ? 'enviado' : 'não enviado'}.`
      };
    });

    await caso({ id: 'CP-08', titulo: 'Reporte rejeitado pelo servidor não pode sumir sem avisar o cidadão', requisito: 'UC03-A2; regra "nenhum reporte pode ser descartado sem que o cidadão seja informado"', tecnica: 'Baseado em risco (perda de dados)', esperado: 'O reporte fica na fila com o motivo e o cidadão vê um aviso de reporte com problema.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await ctx.setOffline(true);
      await preencherReporte(page);
      const { protocolo } = await enviar(page);
      await controlar(srv, { cidadao: 'rejeita' });
      await ctx.setOffline(false);
      for (let i = 0; i < 6; i++) { await page.evaluate(() => window.flushQueue()); await espera(300); }
      const fila = await filaCidadao(page);
      const banner = await textoBanner(page);
      const toast = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
      await controlar(srv, { cidadao: 'ok' });
      await ctx.close();
      const sumiu = fila.length === 0;
      return {
        aprovado: !sumiu || /problema|rejeit|erro/i.test(banner + toast),
        obtido: sumiu
          ? `Depois de 6 tentativas o reporte ${protocolo.replace('Protocolo: ', '')} foi APAGADO da fila. Aviso na tela: "${banner || 'nenhum'}". O cidadão não foi informado.`
          : `Reporte permanece na fila (${fila.length}).`
      };
    });

    await caso({ id: 'CP-09', titulo: 'Resposta perdida: o mesmo reporte não pode virar dois registros', requisito: 'UC03 regra de negócio; CA03 (sem duplicidade)', tecnica: 'Baseado em risco (duplicidade)', esperado: 'Mesmo que a resposta do servidor se perca, o protocolo é gravado uma única vez.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      const antes = (await estado(srv)).recebidosCidadao.length;
      await controlar(srv, { cidadao: 'perde-resposta' });
      await preencherReporte(page);
      const { protocolo } = await enviar(page);
      await controlar(srv, { cidadao: 'ok' });
      await page.evaluate(() => window.flushQueue());
      await aguardar(async () => (await filaCidadao(page)).length === 0);
      const copias = (await estado(srv)).recebidosCidadao.slice(antes).filter((p) => 'Protocolo: ' + p.protocolo === protocolo).length;
      await ctx.close();
      return {
        aprovado: copias === 1,
        obtido: `O servidor recebeu ${copias} envios do mesmo protocolo. O app não manda identificador único (id) e reenvia o reporte inteiro.`,
        observacao: 'No modo Apps Script a deduplicação depende do script do servidor, que não está no repositório. Se ele não descartar protocolos repetidos, haverá chamado duplicado.'
      };
    });

    await caso({ id: 'CP-10', titulo: 'Sincronizações simultâneas não podem enviar o mesmo reporte duas vezes', requisito: 'CA03 (sem duplicidade)', tecnica: 'Baseado em risco (concorrência)', esperado: 'Mesmo com vários gatilhos ao mesmo tempo (internet volta, app volta ao primeiro plano, timer), o reporte é enviado uma vez.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      const antes = (await estado(srv)).recebidosCidadao.length;
      await ctx.setOffline(true);
      await preencherReporte(page);
      const { protocolo } = await enviar(page);
      await ctx.setOffline(false);
      await page.evaluate(() => Promise.all([window.flushQueue(), window.flushQueue(), window.flushQueue()]));
      await aguardar(async () => (await filaCidadao(page)).length === 0);
      await espera(1000);
      const copias = (await estado(srv)).recebidosCidadao.slice(antes).filter((p) => 'Protocolo: ' + p.protocolo === protocolo).length;
      await ctx.close();
      return { aprovado: copias === 1, obtido: `O mesmo protocolo foi enviado ${copias} vez(es) ao servidor.` };
    });

    await caso({ id: 'CP-11', titulo: 'Internet cai no meio do preenchimento e o reporte ainda é concluído', requisito: 'CA02; UC01-A1', tecnica: 'Transição de estado (online → offline durante o uso)', esperado: 'Os dados já preenchidos continuam na tela e o reporte é salvo com eles.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await page.click('#gps-btn');
      await page.waitForSelector('#gps-result.show');
      await page.click('#type-chips .chip[data-value="piscando"]');
      await page.fill('#descricao', 'Preenchido antes de cair');
      await ctx.setOffline(true);
      await page.setInputFiles('#photo-input', { name: 'poste.png', mimeType: 'image/png', buffer: FOTO });
      await page.waitForFunction(() => !document.getElementById('submit-btn').disabled);
      const r = await enviar(page);
      const fila = await page.evaluate(() => new Promise((ok) => {
        const q = indexedDB.open('ilumina_v2', 1);
        q.onsuccess = () => { const g = q.result.transaction('reports').objectStore('reports').getAll(); g.onsuccess = () => ok(g.result.map((x) => x.payload)); };
      }));
      await ctx.close();
      const p = fila[0] || {};
      return { aprovado: r.titulo === 'Salvo sem sinal' && p.tipo === 'piscando' && p.descricao === 'Preenchido antes de cair' && p.lat != null, obtido: `Salvo com tipo "${p.tipo}", descrição "${p.descricao}", GPS ${p.lat != null ? 'presente' : 'ausente'}.` };
    });

    await caso({ id: 'CP-12', titulo: 'Rascunho do formulário é guardado no aparelho se o app for fechado sem internet', requisito: 'CA02', tecnica: 'Baseado em requisito / risco (perda do preenchimento)', esperado: 'Ao reabrir o app, o que já havia sido preenchido (tipo, descrição, localização) continua lá.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await page.click('#gps-btn');
      await page.waitForSelector('#gps-result.show');
      await page.click('#type-chips .chip[data-value="quebrado"]');
      await page.fill('#descricao', 'Rascunho que não pode se perder');
      await ctx.setOffline(true);
      await page.reload();
      await pularSplash(page);
      const desc = await page.inputValue('#descricao');
      const tipo = await page.evaluate(() => document.querySelector('#type-chips .chip[aria-pressed="true"]')?.dataset.value || '');
      const gps = await page.isVisible('#gps-result.show');
      await ctx.close();
      const mantido = desc === 'Rascunho que não pode se perder' && tipo === 'quebrado';
      return { aprovado: mantido, obtido: `Após reabrir: descrição "${desc}", tipo "${tipo || 'nenhum'}", GPS ${gps ? 'mantido' : 'perdido'}.`, observacao: 'Enquanto a página fica aberta, a queda de conexão não apaga nada (ver CP-11). O problema aparece só quando o app é fechado ou recarregado.' };
    });

    await caso({ id: 'CP-13', titulo: 'Indicador mostra quando o aparelho está sem sinal', requisito: 'RNF01; RNF04 (usabilidade)', tecnica: 'Partição de equivalência (online/offline)', esperado: 'Offline o indicador mostra "Sem sinal"; online mostra "Online".' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await ctx.setOffline(true);
      await espera(300);
      const off = await page.textContent('#status-text');
      await ctx.setOffline(false);
      await espera(300);
      const on = await page.textContent('#status-text');
      await ctx.close();
      return { aprovado: off.trim() === 'Sem sinal' && on.trim() === 'Online', obtido: `Offline: "${off.trim()}"; online: "${on.trim()}".` };
    });

    await caso({ id: 'CP-14', titulo: 'App abre sem internet quando o link tem parâmetros', requisito: 'RNF01', tecnica: 'Partição de equivalência (endereço com/sem parâmetros)', esperado: 'Um link como /?utm_source=whatsapp, já usado antes, também abre offline.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await ctx.setOffline(true);
      let abriu = false;
      let erro = '';
      try {
        await page.goto(srv.url + '/?utm_source=whatsapp', { timeout: 10000 });
        abriu = await page.$('#screen-report') !== null;
      } catch (e) { erro = e.message.split('\n')[0]; }
      await ctx.close();
      return { aprovado: abriu, obtido: abriu ? 'Abriu normalmente.' : `Não abriu: ${erro || 'página de erro do navegador'}.` };
    });
  } finally {
    await srv.fechar();
  }
}

async function cenariosCidadaoNode(browser) {
  const srv = await criarServidorTeste({ modo: 'node' });
  try {
    await caso({ id: 'CP-15', titulo: 'Com a API Node, reporte com internet chega ao servidor', requisito: 'RF01; UC01 (passo 7); integração com a API', tecnica: 'Baseado em requisito (fluxo principal)', esperado: 'O chamado é criado na API e o app mostra "Reporte enviado".' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      await preencherReporte(page);
      const r = await enviar(page);
      await espera(500);
      const est = await estado(srv);
      const post = est.requisicoesApi.filter((q) => q.metodo === 'POST' && q.caminho === '/api/chamados');
      await ctx.close();
      return {
        aprovado: r.titulo === 'Reporte enviado' && est.chamados.length === 1,
        obtido: `Tela: "${r.titulo}". A API recebeu ${post.length} POST em formato "${post[0]?.tipo || '-'}" e criou ${est.chamados.length} chamado(s).`,
        observacao: 'A tela do cidadão envia o reporte como formulário (payload=...) e sem o campo id. A API só aceita JSON com id e responde 400 (JSON_INVALIDO).'
      };
    });

    await caso({ id: 'CP-16', titulo: 'Com a API Node, reporte offline é entregue quando a internet volta', requisito: 'RF02; UC03; CA03', tecnica: 'Transição de estado (offline → online)', esperado: 'Ao voltar a internet, o chamado é criado na API e a fila esvazia.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirCidadao(ctx, srv);
      const antes = (await estado(srv)).chamados.length;
      await ctx.setOffline(true);
      await preencherReporte(page);
      await enviar(page);
      await ctx.setOffline(false);
      for (let i = 0; i < 6; i++) { await page.evaluate(() => window.flushQueue()); await espera(300); }
      const est = await estado(srv);
      const fila = await filaCidadao(page);
      await ctx.close();
      const criados = est.chamados.length - antes;
      return {
        aprovado: criados === 1,
        obtido: `Chamados criados na API: ${criados}. Itens na fila do aparelho depois de 6 tentativas: ${fila.length}.`,
        observacao: criados === 0 && fila.length === 0 ? 'O reporte não chegou ao servidor e foi apagado do aparelho: perda total do reporte.' : ''
      };
    });
  } finally {
    await srv.fechar();
  }
}

async function cenariosTecnicoLegado(browser) {
  const srv = await criarServidorTeste({ modo: 'legado' });
  try {
    await caso({ id: 'CP-17', titulo: 'Login do técnico sem internet informa que não há conexão', requisito: 'UC04-A4', tecnica: 'Baseado em requisito (fluxo alternativo)', esperado: 'O login não acontece e aparece uma mensagem de falta de conexão.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirTecnico(ctx, srv);
      await ctx.setOffline(true);
      for (const d of '1234') await page.evaluate((k) => pinKey(k), d);
      await espera(1500);
      const msg = (await page.textContent('#pin-error')).trim();
      const home = await page.isVisible('#screen-home.active');
      await ctx.close();
      return { aprovado: !home && /conex/i.test(msg), obtido: `Mensagem: "${msg}"; entrou no painel: ${home ? 'sim' : 'não'}.` };
    });

    await caso({ id: 'CP-18', titulo: 'Lista de chamados continua disponível offline', requisito: 'RNF01; UC05 (Portabilidade, uso em campo)', tecnica: 'Transição de estado (online → offline)', esperado: 'Depois de carregar a lista com internet, ao reabrir offline os chamados aparecem a partir do cache.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirTecnico(ctx, srv);
      await loginTecnico(page);
      await page.waitForFunction(() => document.querySelectorAll('#lista-chamados .call-card, #lista-chamados [data-protocolo], #lista-chamados > div').length > 0);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('#screen-home.active', { timeout: 10000 });
      await espera(800);
      const texto = await page.textContent('#lista-chamados');
      await ctx.close();
      const n = (texto.match(/IC-261112-TST0/g) || []).length;
      return { aprovado: n >= 3, obtido: `Chamados visíveis offline: ${n}.` };
    });

    await caso({ id: 'CP-19', titulo: 'Fechamento sem internet vai para a fila do aparelho', requisito: 'UC05-A5', tecnica: 'Baseado em requisito (fluxo alternativo)', esperado: 'Tela "Salvo no aparelho" e 1 fechamento na fila local.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirTecnico(ctx, srv);
      await loginTecnico(page);
      await ctx.setOffline(true);
      await fecharChamadoTecnico(page, 'IC-261112-TST01');
      const titulo = (await page.textContent('#success-title')).trim();
      const fila = await filaTecnico(page);
      await ctx.close();
      return { aprovado: titulo === 'Salvo no aparelho' && fila.length === 1, obtido: `Título "${titulo}"; ${fila.length} fechamento(s) na fila.` };
    });

    await caso({ id: 'CP-20', titulo: 'Fechamento pendente é enviado quando a internet volta', requisito: 'UC05-A5', tecnica: 'Transição de estado (offline → online)', esperado: 'O servidor recebe o fechamento e a fila esvazia.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirTecnico(ctx, srv);
      await loginTecnico(page);
      const antes = (await estado(srv)).recebidosTecnico.length;
      await ctx.setOffline(true);
      await fecharChamadoTecnico(page, 'IC-261112-TST02');
      await ctx.setOffline(false);
      await aguardar(async () => (await filaTecnico(page)).length === 0);
      const recebidos = (await estado(srv)).recebidosTecnico.slice(antes).filter((p) => p.protocolo === 'IC-261112-TST02').length;
      const fila = await filaTecnico(page);
      await ctx.close();
      return { aprovado: recebidos === 1 && fila.length === 0, obtido: `Servidor recebeu ${recebidos} fechamento(s); fila com ${fila.length}.` };
    });

    await caso({ id: 'CP-21', titulo: 'Com 10 fechamentos na fila, o 11º é bloqueado', requisito: 'UC05-A6', tecnica: 'Análise de valor limite (10 e 11)', esperado: 'Os 10 primeiros entram na fila; o 11º mostra aviso e não entra.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirTecnico(ctx, srv);
      await loginTecnico(page);
      await ctx.setOffline(true);
      for (let i = 1; i <= 10; i++) await fecharChamadoTecnico(page, `IC-261112-LIM${String(i).padStart(2, '0')}`);
      const com10 = (await filaTecnico(page)).length;
      await fecharChamadoTecnico(page, 'IC-261112-LIM11');
      const toast = (await page.textContent('#toast')).trim();
      const com11 = (await filaTecnico(page)).length;
      await ctx.close();
      return { aprovado: com10 === 10 && com11 === 10 && /10 fechamentos na fila/.test(toast), obtido: `Fila após 10: ${com10}; após o 11º: ${com11}. Aviso: "${toast}".` };
    });

    await caso({ id: 'CP-22', titulo: 'Um fechamento com erro não pode travar o envio dos outros', requisito: 'UC05-A5; Confiabilidade', tecnica: 'Baseado em risco (fila travada)', esperado: 'Se o servidor recusar o 1º fechamento, os demais da fila ainda são enviados.' }, async () => {
      const ctx = await novoContexto(browser);
      const page = await abrirTecnico(ctx, srv);
      await loginTecnico(page);
      await controlar(srv, { tecnico: 'erro-no-primeiro', protocoloComErro: 'IC-261112-HOL01' });
      await ctx.setOffline(true);
      for (const p of ['IC-261112-HOL01', 'IC-261112-HOL02', 'IC-261112-HOL03']) await fecharChamadoTecnico(page, p);
      await ctx.setOffline(false);
      await espera(2500);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => flushQueue()); await espera(400); }
      const fila = await filaTecnico(page);
      const recebidos = (await estado(srv)).recebidosTecnico.filter((p) => /HOL0[23]/.test(p.protocolo)).length;
      await controlar(srv, { tecnico: 'ok', protocoloComErro: null });
      await ctx.close();
      return { aprovado: recebidos >= 2, obtido: `Fechamentos 2 e 3 enviados: ${recebidos}. Itens que continuam presos na fila: ${fila.length}.` };
    });
  } finally {
    await srv.fechar();
  }
}

async function cenariosTecnicoNode(browser) {
  const srv = await criarServidorTeste({ modo: 'node' });
  try {
    await caso({ id: 'CP-23', titulo: 'Com a API Node, fechamento feito offline é entregue quando a internet volta', requisito: 'UC05-A5; integração com a API', tecnica: 'Transição de estado (offline → online)', esperado: 'Ao voltar a internet, o fechamento chega em POST /api/chamados/{protocolo}/fechamento e sai da fila.' }, async () => {
      const ctx = await novoContexto(browser);
      const sessao = { token: 'tok-teste', expiry: Date.now() + 3600e3, usuario: { id: 1, nome: 'Técnico Teste', perfil: 'tecnico' }, apiNode: true };
      const page = await abrirTecnico(ctx, srv, sessao);
      await ctx.setOffline(true);
      await fecharChamadoTecnico(page, 'IC-261112-NODE1');
      const titulo = (await page.textContent('#success-title')).trim();
      await ctx.setOffline(false);
      await espera(1500);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => flushQueue()); await espera(400); }
      const est = await estado(srv);
      const fila = await filaTecnico(page);
      const posts = est.requisicoesApi.filter((q) => q.metodo === 'POST').map((q) => q.caminho);
      await ctx.close();
      const certo = posts.some((c) => /\/api\/chamados\/.+\/fechamento$/.test(c));
      return {
        aprovado: certo && fila.length === 0,
        obtido: `Tela offline: "${titulo}". Caminhos chamados ao reconectar: ${[...new Set(posts)].join(', ') || 'nenhum'}. Itens presos na fila: ${fila.length}.`,
        observacao: 'A tela do técnico ainda envia o formato do Apps Script (action: "close") para /api, rota que não existe na API Node.'
      };
    });
  } finally {
    await srv.fechar();
  }
}

/* ═════════════════════════ EXECUÇÃO ═════════════════════════ */

const browser = await chromium.launch({ channel: process.env.NAVEGADOR || 'chrome', headless: true });
const inicio = new Date();
try {
  await cenariosCidadaoLegado(browser);
  await cenariosCidadaoNode(browser);
  await cenariosTecnicoLegado(browser);
  await cenariosTecnicoNode(browser);
} finally {
  await browser.close();
}

const saida = resolve(raiz, 'docs/Relatório de Testes/Testes offline/evidencias');
mkdirSync(saida, { recursive: true });
const resumo = {
  executadoEm: inicio.toISOString(),
  ambiente: { node: process.version, navegador: process.env.NAVEGADOR || 'chrome', sistema: process.platform },
  total: resultados.length,
  aprovados: resultados.filter((r) => r.resultado === 'Aprovado').length,
  reprovados: resultados.filter((r) => r.resultado === 'Reprovado').length,
  erros: resultados.filter((r) => r.resultado === 'Erro').length,
  casos: resultados
};
writeFileSync(resolve(saida, 'resultado-caixa-preta.json'), JSON.stringify(resumo, null, 2));
console.log(`\nTotal ${resumo.total} | aprovados ${resumo.aprovados} | reprovados ${resumo.reprovados} | erros ${resumo.erros}`);
