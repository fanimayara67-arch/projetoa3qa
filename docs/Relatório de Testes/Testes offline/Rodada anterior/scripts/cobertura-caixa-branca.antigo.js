/**
 * Mede a cobertura das funções offline exercitadas pelos testes de caixa-branca.
 *
 * O relatório de cobertura do `node --test` só enxerga arquivos .js; as funções
 * recortadas do HTML rodam dentro de node:vm e ficam de fora. Este script roda
 * os testes com NODE_V8_COVERAGE, junta as medições de cada função recortada
 * e lista os trechos que nenhum teste executou.
 *
 * Como executar (na raiz do projeto):
 *   node server/tests/testes-offline/apoio/cobertura-caixa-branca.js
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extrairFuncao } = require('./extrair-funcao');

const PASTA_TESTES = path.resolve(__dirname, '../caixa-branca');
const SAIDA = path.resolve(__dirname, '../../../../docs/Relatório de Testes/Testes offline/evidencias/cobertura-caixa-branca.txt');

const dirCobertura = fs.mkdtempSync(path.join(os.tmpdir(), 'cobertura-offline-'));
const arquivos = fs.readdirSync(PASTA_TESTES).filter((f) => f.endsWith('.test.js')).map((f) => path.join(PASTA_TESTES, f));
const filtro = process.argv[2] ? ['--test-name-pattern', process.argv[2]] : [];
execFileSync(process.execPath, ['--test', ...filtro, ...arquivos], {
  env: { ...process.env, NODE_V8_COVERAGE: dirCobertura },
  stdio: 'ignore'
});

// Junta, por função recortada, quantas vezes cada caractere foi executado.
const contagens = new Map(); // "app:funcao" -> Int32Array (máximo entre execuções)
const blocos = new Map();    // "app:funcao" -> Set("inicio-fim") dos blocos vistos pelo V8
for (const nomeArq of fs.readdirSync(dirCobertura)) {
  const dados = JSON.parse(fs.readFileSync(path.join(dirCobertura, nomeArq), 'utf8'));
  for (const script of dados.result) {
    if (!/^(cidadao|tecnico):/.test(script.url)) continue;
    const [app, lista] = script.url.split(':');
    const nomes = lista.split(',');
    if (nomes.length !== 1) continue; // cada teste carrega uma função por vez
    const chave = `${app}:${nomes[0]}`;
    const { codigo } = extrairFuncao(app, nomes[0]);
    // O script pode ter declarações antes da função (ex.: let flushInFlight).
    const deslocamento = Math.max(0, script.functions[0].ranges[0].endOffset - codigo.length);
    const local = new Int32Array(script.functions[0].ranges[0].endOffset).fill(-1);
    // Intervalos vêm do mais externo para o mais interno: o interno sobrescreve.
    const intervalos = script.functions.flatMap((f) => f.ranges)
      .sort((a, b) => (a.startOffset - b.startOffset) || (b.endOffset - a.endOffset));
    for (const r of intervalos) local.fill(r.count, r.startOffset, r.endOffset);
    const atual = contagens.get(chave) || new Int32Array(codigo.length).fill(0);
    for (let i = 0; i < codigo.length; i++) atual[i] = Math.max(atual[i], local[i + deslocamento] || 0);
    contagens.set(chave, atual);
    // Blocos: cada intervalo que o V8 separa é um ramo (then/else, catch, resto após return…).
    const conjunto = blocos.get(chave) || new Set();
    for (const r of intervalos) {
      if (r.startOffset < deslocamento) continue;
      conjunto.add(`${r.startOffset - deslocamento}-${r.endOffset - deslocamento}`);
    }
    blocos.set(chave, conjunto);
  }
}
fs.rmSync(dirCobertura, { recursive: true, force: true });

const linhasSaida = ['Cobertura das funções offline (testes de caixa-branca)', `Gerado em: ${new Date().toISOString()}`, ''];
for (const [chave, contagem] of [...contagens].sort()) {
  const [app, nome] = chave.split(':');
  const { codigo, linha, arquivo } = extrairFuncao(app, nome);
  const linhas = codigo.split('\n');
  let pos = 0;
  const naoExecutadas = [];
  let comCodigo = 0;
  linhas.forEach((texto, i) => {
    const relevante = texto.trim() && !/^\s*(\/\/|\/\*|\*)/.test(texto) && texto.trim() !== '}';
    if (relevante) {
      comCodigo++;
      let executada = false;
      for (let j = pos; j < pos + texto.length; j++) if (!/\s/.test(codigo[j]) && contagem[j] > 0) { executada = true; break; }
      if (!executada) naoExecutadas.push(`    ${arquivo}:${linha + i}  ${texto.trim()}`);
    }
    pos += texto.length + 1;
  });
  const pct = (((comCodigo - naoExecutadas.length) / comCodigo) * 100).toFixed(1);
  const listaBlocos = [...(blocos.get(chave) || [])].map((b) => b.split('-').map(Number));
  const blocosSemExecucao = listaBlocos.filter(([s, e]) => !contagem.slice(s, e).some((c) => c > 0));
  const pctBlocos = ((1 - blocosSemExecucao.length / listaBlocos.length) * 100).toFixed(1);
  linhasSaida.push(`${arquivo}:${linha}  ${nome}`);
  linhasSaida.push(`  linhas executadas: ${comCodigo - naoExecutadas.length}/${comCodigo} (${pct}%)`);
  linhasSaida.push(`  blocos (ramos) executados: ${listaBlocos.length - blocosSemExecucao.length}/${listaBlocos.length} (${pctBlocos}%)`);
  linhasSaida.push(...(naoExecutadas.length ? ['  Linhas não executadas:', ...naoExecutadas] : []));
  for (const [s] of blocosSemExecucao) {
    const l = codigo.slice(0, s).split('\n').length;
    linhasSaida.push(`  Bloco não executado em ${arquivo}:${linha + l - 1}: ${codigo.slice(s, s + 60).replace(/\s+/g, ' ')}…`);
  }
  linhasSaida.push('');
}

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, linhasSaida.join('\n'));
console.log(linhasSaida.join('\n'));
