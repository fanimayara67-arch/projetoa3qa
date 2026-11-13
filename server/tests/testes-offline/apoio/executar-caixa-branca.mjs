/**
 * Executor da caixa-branca das funcionalidades offline.
 *
 *   node server/tests/testes-offline/apoio/executar-caixa-branca.mjs api-node
 *   node server/tests/testes-offline/apoio/executar-caixa-branca.mjs apps-script
 *
 * Faz, para o servidor escolhido:
 *   1. roda os testes (node:test) e guarda o resultado de cada um;
 *   2. mede a cobertura de linhas e de ramos de cada função testada, pela
 *      cobertura bruta do V8 (o relatório do node --test não enxerga o código
 *      recortado do HTML, que roda dentro de node:vm);
 *   3. calcula a complexidade ciclomática V(G) de cada função;
 *   4. faz o teste de mutação: altera o código (ex.: `>=` vira `>`), roda os
 *      testes de novo e confere se algum falha ("mutante morto").
 *
 * Grava em docs/Relatório de Testes/Testes offline/<servidor>/evidencias/:
 *   caixa-branca.json (tudo) e caixa-branca-saida.txt (saída legível dos testes).
 * Opção: SEM_MUTACAO=1 pula o passo 4.
 */

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extrairFuncao, fimDoBloco, mascaraDeCodigo } = require('./extrair-funcao.js');

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, '../../../..');
const SRC = resolve(RAIZ, 'server/src');
const rel = (p) => relative(RAIZ, p).replace(/\\/g, '/');

const ALVOS_CLIENTE = [
  ['cidadao', 'flushQueue'], ['cidadao', 'submitReport'], ['cidadao', 'postReport'],
  ['cidadao', 'updatePendingBanner'], ['cidadao', 'generateProtocol'], ['cidadao', 'buildPayload'],
  ['tecnico', 'flushQueue'], ['tecnico', 'apiFetchTO'], ['tecnico', 'renderPendingBanner'], ['tecnico', 'queueCount']
];

const MODOS = {
  'api-node': {
    pasta: 'API Node',
    testes: resolve(aqui, '../api-node/caixa-branca'),
    alvosServidor: [
      [`${SRC}/domain/Chamado.js`, ['coordenadasValidas', 'validarNovoChamado']],
      [`${SRC}/domain/Fechamento.js`, ['validarFechamentoCampo']],
      [`${SRC}/application/services/ChamadoService.js`, ['criarChamado']],
      [`${SRC}/application/services/FechamentoService.js`, ['fecharChamado']],
      [`${SRC}/presentation/middlewares/validar.js`, ['middlewareValidacao']],
      [`${SRC}/presentation/middlewares/tratarErros.js`, ['tratarErros']],
      [`${SRC}/app.js`, ['lerBodyJson']]
    ]
  },
  'apps-script': {
    pasta: 'Apps Script',
    testes: resolve(aqui, '../apps-script/caixa-branca'),
    alvosServidor: []
  }
};

const modo = process.argv[2];
if (!MODOS[modo]) { console.error('Uso: executar-caixa-branca.mjs api-node|apps-script'); process.exit(1); }
const cfg = MODOS[modo];
const arquivosTeste = readdirSync(cfg.testes).filter((f) => f.endsWith('.test.js')).map((f) => join(cfg.testes, f));
const saidaDir = resolve(RAIZ, 'docs/Relatório de Testes/Testes offline', cfg.pasta, 'evidencias');
mkdirSync(saidaDir, { recursive: true });

/* ═════════════ 1. Testes ═════════════ */

const temp = mkdtempSync(join(tmpdir(), 'caixa-branca-'));
const dirCobertura = join(temp, 'cobertura');
const arquivoJsonl = join(temp, 'resultados.jsonl');
const reporter = pathToFileURL(resolve(aqui, 'reporter-json.mjs')).href;
const inicio = new Date();
const exec = spawnSync(process.execPath, [
  '--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
  `--test-reporter=${reporter}`, `--test-reporter-destination=${arquivoJsonl}`,
  ...arquivosTeste
], { cwd: RAIZ, env: { ...process.env, NODE_V8_COVERAGE: dirCobertura, MUTANTE: '' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const saidaTexto = `Comando: node --test "${rel(cfg.testes)}/*.test.js"  (Node.js ${process.version}, ${process.platform})\n` +
  'Testes marcados com ⚠ são "todo": exigem o comportamento correto e falham hoje, confirmando um defeito.\n\n' + exec.stdout;
writeFileSync(join(saidaDir, 'caixa-branca-saida.txt'), saidaTexto);

const testes = readFileSync(arquivoJsonl, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .map((t) => ({ id: (t.nome.match(/^(CB[NA]-\d+)/) || [])[1] || null, titulo: t.nome.replace(/^CB[NA]-\d+\s*/, ''), arquivo: t.arquivo ? rel(t.arquivo) : undefined, situacao: t.situacao, motivoTodo: t.motivoTodo, mensagem: t.situacao === 'aprovado' ? undefined : t.mensagem, duracaoMs: t.duracaoMs }))
  .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
console.log(`Testes: ${testes.length} (código de saída ${exec.status})`);

/* ═════════════ 2. Cobertura (V8) ═════════════ */

function contagemPorCaractere(tamanho, intervalos, deslocamento = 0) {
  const c = new Int32Array(tamanho).fill(-1);
  const ordenados = [...intervalos].sort((a, b) => (a.startOffset - b.startOffset) || (b.endOffset - a.endOffset));
  for (const r of ordenados) {
    const ini = Math.max(0, r.startOffset - deslocamento);
    const fim = Math.min(tamanho, r.endOffset - deslocamento);
    if (fim > ini) c.fill(r.count, ini, fim);
  }
  return c;
}

/** alvo → { texto, linhaInicial, local, contagem: Int32Array (máx. entre processos), blocos: Set } */
const medidas = new Map();
function acumular(chave, texto, linhaInicial, local, contagem, blocos) {
  const m = medidas.get(chave) || { texto, linhaInicial, local, contagem: new Int32Array(texto.length).fill(0), blocos: new Set() };
  for (let i = 0; i < texto.length; i++) m.contagem[i] = Math.max(m.contagem[i], contagem[i]);
  blocos.forEach((b) => m.blocos.add(b));
  medidas.set(chave, m);
}

const fontesServidor = new Map(cfg.alvosServidor.map(([arq]) => [pathToFileURL(arq).href.toLowerCase(), arq]));
for (const nome of readdirSync(dirCobertura)) {
  const dados = JSON.parse(readFileSync(join(dirCobertura, nome), 'utf8'));
  for (const script of dados.result) {
    const m = /^(cidadao|tecnico):(\w+)$/.exec(script.url);
    if (m) {
      const [, app, funcao] = m;
      if (!ALVOS_CLIENTE.some(([a, f]) => a === app && f === funcao)) continue;
      const { codigo, linha, arquivo } = extrairFuncao(app, funcao);
      const intervalos = script.functions.flatMap((f) => f.ranges);
      const cont = contagemPorCaractere(codigo.length, intervalos);
      // functions[0] é o próprio script (sempre executado); os blocos vêm da função e do que há dentro dela.
      const blocos = new Set(script.functions.slice(1).flatMap((f) => f.ranges)
        .map((r) => `${r.startOffset}-${Math.min(r.endOffset, codigo.length)}`));
      acumular(`${app}:${funcao}`, codigo, linha, arquivo, cont, blocos);
      continue;
    }
    const arq = fontesServidor.get(script.url.toLowerCase());
    if (!arq) continue;
    const texto = readFileSync(arq, 'utf8');
    const funcoesAlvo = cfg.alvosServidor.find(([a]) => a === arq)[1];
    for (const fn of script.functions) {
      if (!funcoesAlvo.includes(fn.functionName)) continue;
      const [ini, fim] = [fn.ranges[0].startOffset, fn.ranges[0].endOffset];
      const dentro = script.functions.flatMap((f) => f.ranges).filter((r) => r.startOffset >= ini && r.endOffset <= fim);
      const trecho = texto.slice(ini, fim);
      const cont = contagemPorCaractere(trecho.length, dentro, ini);
      const blocos = new Set(dentro.map((r) => `${r.startOffset - ini}-${r.endOffset - ini}`));
      acumular(`${rel(arq)}:${fn.functionName}`, trecho, texto.slice(0, ini).split('\n').length, rel(arq), cont, blocos);
    }
  }
}

function resumirCobertura(chave, m) {
  const linhas = m.texto.split('\n');
  let pos = 0;
  const naoExecutadas = [];
  let total = 0;
  linhas.forEach((l, i) => {
    const t = l.trim();
    if (t && !/^(\/\/|\/\*|\*)/.test(t) && !/^[}\])]+[;,)]*$/.test(t)) {
      total++;
      let exec = false;
      for (let j = pos; j < pos + l.length; j++) if (!/\s/.test(m.texto[j]) && m.contagem[j] > 0) { exec = true; break; }
      if (!exec) naoExecutadas.push(`${m.local}:${m.linhaInicial + i}  ${t.slice(0, 90)}`);
    }
    pos += l.length + 1;
  });
  const blocos = [...m.blocos].map((b) => b.split('-').map(Number));
  const semExec = blocos.filter(([s, e]) => !m.contagem.slice(s, e).some((c) => c > 0));
  const [app, funcao] = chave.includes('.js:') ? [null, chave.split(':').pop()] : chave.split(':');
  return {
    funcao: app ? `${funcao} (${app === 'cidadao' ? 'cidadão' : 'técnico'})` : funcao,
    local: `${m.local}:${m.linhaInicial}`,
    linhas: { executadas: total - naoExecutadas.length, total, percentual: +(100 * (total - naoExecutadas.length) / total).toFixed(1), naoExecutadas },
    ramos: {
      executados: blocos.length - semExec.length, total: blocos.length,
      percentual: +(100 * (blocos.length - semExec.length) / (blocos.length || 1)).toFixed(1),
      naoExecutados: semExec.map(([s]) => `${m.local}:${m.linhaInicial + m.texto.slice(0, s).split('\n').length - 1}  ${m.texto.slice(s, s + 70).replace(/\s+/g, ' ')}…`)
    }
  };
}
const cobertura = [...medidas].sort(([a], [b]) => a.localeCompare(b)).map(([k, m]) => resumirCobertura(k, m));

/* ═════════════ 3. Complexidade ciclomática ═════════════ */

function textoDosAlvos() {
  const lista = ALVOS_CLIENTE.map(([app, funcao]) => {
    const { codigo, linha, arquivo } = extrairFuncao(app, funcao);
    return { funcao: `${funcao} (${app === 'cidadao' ? 'cidadão' : 'técnico'})`, local: `${arquivo}:${linha}`, codigo, alvo: { alvo: 'cliente', app, funcao } };
  });
  for (const [arq, funcoes] of cfg.alvosServidor) {
    const texto = readFileSync(arq, 'utf8');
    for (const f of funcoes) {
      const m = new RegExp(`(?:async\\s+)?function\\s+${f}\\s*\\(`).exec(texto);
      if (!m) continue;
      const abre = texto.indexOf('{', texto.indexOf(')', m.index));
      const fim = fimDoBloco(texto, abre);
      lista.push({ funcao: f, local: `${rel(arq)}:${texto.slice(0, m.index).split('\n').length}`, codigo: texto.slice(m.index, fim + 1), alvo: { alvo: 'servidor', arquivo: arq, base: m.index } });
    }
  }
  return lista;
}

function complexidade(codigo) {
  const mascara = mascaraDeCodigo(codigo);
  const contar = (re) => [...codigo.matchAll(re)].filter((x) => mascara[x.index]).length;
  const decisoes = contar(/\b(if|for|while|case|catch)\b/g) + contar(/\?(?![.?:])/g);
  const logicos = contar(/&&|\|\|/g);
  return { decisoes, vG: decisoes + 1, vGComLogicos: decisoes + logicos + 1 };
}
const alvos = textoDosAlvos();
const complexidades = alvos.map((a) => ({ funcao: a.funcao, local: a.local, ...complexidade(a.codigo) }));

/* ═════════════ 4. Mutação ═════════════ */

const OPERADORES = [
  { nome: 'relacional', re: /(?<![=!<>])(>=|<=|>|<)(?![=>])/g, troca: { '>=': '>', '<=': '<', '>': '>=', '<': '<=' } },
  { nome: 'igualdade', re: /===|!==/g, troca: { '===': '!==', '!==': '===' } },
  { nome: 'lógico', re: /&&|\|\|/g, troca: { '&&': '||', '||': '&&' } },
  { nome: 'negação removida', re: /!(?=[A-Za-z_$(])/g, troca: () => '' },
  { nome: 'desvio removido', re: /\b(?:break|continue);/g, troca: () => ';' },
  { nome: 'retorno antecipado removido', re: /\breturn;/g, troca: () => ';' },
  { nome: 'constante', re: /\b\d+\b/g, troca: (v) => String(Number(v) + 1) },
  { nome: 'booleano', re: /\b(?:true|false)\b/g, troca: { true: 'false', false: 'true' } }
];

function gerarMutantes(a) {
  const mascara = mascaraDeCodigo(a.codigo);
  const lista = [];
  for (const op of OPERADORES) {
    for (const m of a.codigo.matchAll(op.re)) {
      if (!mascara[m.index]) continue;
      if (op.nome === 'relacional' && a.codigo[m.index - 1] === '=' ) continue;
      const de = m[0];
      const para = typeof op.troca === 'function' ? op.troca(de) : op.troca[de];
      if (para === undefined || para === de) continue;
      const linha = Number(a.local.split(':').pop()) + a.codigo.slice(0, m.index).split('\n').length - 1;
      const trecho = a.codigo.split('\n')[a.codigo.slice(0, m.index).split('\n').length - 1].trim();
      const mutante = a.alvo.alvo === 'cliente'
        ? { alvo: 'cliente', app: a.alvo.app, funcao: a.alvo.funcao, indice: m.index, de, para }
        : { alvo: 'servidor', arquivo: a.alvo.arquivo, indice: a.alvo.base + m.index, de, para };
      lista.push({ funcao: a.funcao, local: `${a.local.split(':').slice(0, -1).join(':')}:${linha}`, operador: op.nome, de, para, trecho: trecho.slice(0, 110), mutante });
    }
  }
  return lista;
}

function rodarMutante(mut) {
  return new Promise((ok) => {
    const env = {
      ...process.env, MUTANTE: JSON.stringify(mut.mutante),
      NODE_OPTIONS: `--require "${resolve(aqui, 'mutante-servidor.js').replace(/\\/g, '/')}"`
    };
    delete env.NODE_V8_COVERAGE;
    const filho = spawn(process.execPath, ['--test', '--test-reporter=dot', ...arquivosTeste], { cwd: RAIZ, env, stdio: 'ignore' });
    const limite = setTimeout(() => { filho.kill(); ok('morto (tempo esgotado)'); }, 90000);
    filho.on('exit', (codigo) => { clearTimeout(limite); ok(codigo === 0 ? 'sobreviveu' : 'morto'); });
  });
}

let mutacao = null;
if (!process.env.SEM_MUTACAO) {
  const mutantes = alvos.flatMap(gerarMutantes);
  console.log(`Mutação: ${mutantes.length} mutantes`);
  const paralelos = Math.max(2, Math.min(6, cpus().length - 1));
  let proximo = 0;
  let feitos = 0;
  await Promise.all(Array.from({ length: paralelos }, async () => {
    while (proximo < mutantes.length) {
      const m = mutantes[proximo++];
      m.resultado = await rodarMutante(m);
      if (++feitos % 20 === 0) console.log(`  ${feitos}/${mutantes.length}`);
    }
  }));
  const mortos = mutantes.filter((m) => m.resultado.startsWith('morto'));
  const porFuncao = {};
  for (const m of mutantes) {
    const f = (porFuncao[m.funcao] ||= { total: 0, mortos: 0 });
    f.total++; if (m.resultado.startsWith('morto')) f.mortos++;
  }
  mutacao = {
    operadores: OPERADORES.map((o) => o.nome),
    total: mutantes.length,
    mortos: mortos.length,
    sobreviventes: mutantes.length - mortos.length,
    escore: +(100 * mortos.length / mutantes.length).toFixed(1),
    porFuncao: Object.entries(porFuncao).map(([funcao, v]) => ({ funcao, ...v, escore: +(100 * v.mortos / v.total).toFixed(1) })),
    listaSobreviventes: mutantes.filter((m) => m.resultado === 'sobreviveu').map(({ mutante, resultado, ...r }) => r)
  };
}

/* ═════════════ Gravação ═════════════ */

const conta = (s) => testes.filter((t) => t.situacao === s).length;
const resumo = {
  tipo: 'caixa-branca',
  servidor: modo,
  executadoEm: inicio.toISOString(),
  ambiente: { node: process.version, sistema: process.platform },
  comando: `node --test "${rel(cfg.testes)}/*.test.js"`,
  resultado: {
    total: testes.length, aprovados: conta('aprovado'), defeitosConfirmados: conta('defeito-confirmado'),
    reprovados: conta('reprovado'), todoQuePassou: conta('todo-passou'), codigoDeSaida: exec.status
  },
  testes,
  cobertura,
  complexidade: complexidades,
  mutacao
};
writeFileSync(join(saidaDir, 'caixa-branca.json'), JSON.stringify(resumo, null, 2));
rmSync(temp, { recursive: true, force: true });
console.log(JSON.stringify(resumo.resultado));
if (mutacao) console.log(`Mutação: ${mutacao.mortos}/${mutacao.total} mortos (${mutacao.escore}%)`);
