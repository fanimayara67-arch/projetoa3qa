/**
 * Apoio dos testes de caixa-branca das funcionalidades offline.
 *
 * A lógica offline das telas (fila, envio, sincronização) está escrita dentro
 * de public/index.html e public/tecnico/index.html, e não em módulos separados.
 * Para testar o código que realmente roda no app, sem alterar nenhum arquivo,
 * este apoio:
 *
 *   1. lê o HTML e recorta o texto exato de uma função pelo nome;
 *   2. executa esse texto num contexto isolado (node:vm), onde o banco do
 *      navegador (IndexedDB), a rede (fetch) e a tela são trocados por dublês
 *      controlados pelo teste.
 *
 * Se alguém mudar a função no HTML, o teste passa a exercitar a versão nova.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '../../../..');
const ARQUIVOS = {
  cidadao: path.join(RAIZ, 'public/index.html'),
  tecnico: path.join(RAIZ, 'public/tecnico/index.html')
};

const cache = {};
function lerHtml(app) {
  if (!cache[app]) cache[app] = fs.readFileSync(ARQUIVOS[app], 'utf8');
  return cache[app];
}

/**
 * Acha o fim de um bloco `{ ... }` a partir da chave de abertura, ignorando
 * chaves dentro de strings, template literals (inclusive `${...}`) e comentários.
 */
function fimDoBloco(texto, inicio) {
  const pilha = [{ tipo: 'codigo', profundidade: 0, expressao: false }];
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    const prox = texto[i + 1];
    const topo = pilha[pilha.length - 1];

    if (topo.tipo === 'template') {
      if (c === '\\') i++;
      else if (c === '`') pilha.pop();
      else if (c === '$' && prox === '{') { pilha.push({ tipo: 'codigo', profundidade: 0, expressao: true }); i++; }
      continue;
    }

    if (c === '/' && prox === '/') { i = texto.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && prox === '*') { i = texto.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'") {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '`') { pilha.push({ tipo: 'template' }); continue; }
    if (c === '{') { topo.profundidade++; continue; }
    if (c === '}') {
      if (topo.expressao && topo.profundidade === 0) { pilha.pop(); continue; }
      topo.profundidade--;
      if (pilha.length === 1 && topo.profundidade === 0) return i;
    }
  }
  throw new Error('Bloco sem fechamento a partir da posição ' + inicio);
}

/** Recorta o texto de `function nome(...) { ... }` (ou `async function`). */
function extrairFuncao(app, nome) {
  const html = lerHtml(app);
  const re = new RegExp(`(?:^|\\n)[ \\t]*((?:async\\s+)?function\\s+${nome}\\s*\\()`);
  const achado = re.exec(html);
  if (!achado) throw new Error(`Função ${nome} não encontrada em ${ARQUIVOS[app]}`);
  const inicio = achado.index + achado[0].indexOf(achado[1]);
  const abre = html.indexOf('{', html.indexOf(')', inicio));
  const fim = fimDoBloco(html, abre);
  return {
    codigo: html.slice(inicio, fim + 1),
    linha: html.slice(0, inicio).split('\n').length,
    arquivo: path.relative(RAIZ, ARQUIVOS[app]).replace(/\\/g, '/')
  };
}

/** Recorta uma linha de declaração de estado (ex.: `let flushInFlight = false;`). */
function extrairDeclaracao(app, padrao) {
  const achado = padrao.exec(lerHtml(app));
  if (!achado) throw new Error(`Declaração ${padrao} não encontrada`);
  return achado[0];
}

/**
 * Executa funções recortadas do HTML num contexto isolado.
 * `globais` são os dublês (navigator, fetch, banco, tela…). O teste pode
 * trocá-los depois pelo objeto devolvido, porque as funções leem os nomes
 * livres do contexto a cada chamada.
 */
function carregar(app, nomes, globais = {}, declaracoes = []) {
  const contexto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, ...globais });
  if (declaracoes.length) vm.runInContext(declaracoes.join('\n'), contexto, { filename: `${app}:__declaracoes` });
  // Cada função roda como um script próprio: a medição de cobertura fica por função.
  for (const nome of nomes) {
    const codigo = aplicarMutante(app, nome, extrairFuncao(app, nome).codigo);
    vm.runInContext(codigo, contexto, { filename: `${app}:${nome}` });
  }
  return contexto;
}

/**
 * Teste de mutação: quando a variável MUTANTE descreve uma troca nesta função,
 * o código recortado é alterado antes de rodar (ex.: `>=` vira `>`).
 * Os testes devem falhar com o mutante; se passarem, o mutante "sobreviveu".
 */
function aplicarMutante(app, nome, codigo) {
  if (!process.env.MUTANTE) return codigo;
  const m = JSON.parse(process.env.MUTANTE);
  if (m.alvo !== 'cliente' || m.app !== app || m.funcao !== nome) return codigo;
  if (codigo.slice(m.indice, m.indice + m.de.length) !== m.de) {
    throw new Error(`Mutante inválido: "${m.de}" não está na posição ${m.indice} de ${nome}`);
  }
  return codigo.slice(0, m.indice) + m.para + codigo.slice(m.indice + m.de.length);
}

/** Marca, para cada caractere do código, se ele é código (true) ou string/comentário (false). */
function mascaraDeCodigo(texto) {
  const mascara = new Array(texto.length).fill(true);
  const pilha = ['codigo'];
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const prox = texto[i + 1];
    const topo = pilha[pilha.length - 1];
    if (topo === 'template') {
      mascara[i] = false;
      if (c === '\\') { mascara[i + 1] = false; i++; } else if (c === '`') pilha.pop();
      else if (c === '$' && prox === '{') { pilha.push('expressao'); i++; }
      continue;
    }
    if (c === '/' && prox === '/') { const f = texto.indexOf('\n', i); const fim = f < 0 ? texto.length : f; for (let j = i; j < fim; j++) mascara[j] = false; i = fim; continue; }
    if (c === '/' && prox === '*') { const fim = texto.indexOf('*/', i + 2) + 2; for (let j = i; j < fim; j++) mascara[j] = false; i = fim - 1; continue; }
    if (c === '"' || c === "'") {
      const ini = i;
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      for (let j = ini; j <= i; j++) mascara[j] = false;
      continue;
    }
    if (c === '`') { mascara[i] = false; pilha.push('template'); continue; }
    if (topo === 'expressao' && c === '}') { pilha.pop(); continue; }
    if (topo === 'expressao' && c === '{') { pilha.push('expressao'); continue; }
  }
  return mascara;
}

module.exports = { extrairFuncao, extrairDeclaracao, carregar, fimDoBloco, mascaraDeCodigo, aplicarMutante };
