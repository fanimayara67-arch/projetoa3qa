/**
 * Pré-carregado com --require durante o teste de mutação do servidor Node.
 * Quando a variável MUTANTE aponta um arquivo de server/src, o texto desse
 * arquivo é alterado na memória antes de ser compilado. Nenhum arquivo em
 * disco é modificado.
 */
const Module = require('node:module');
const path = require('node:path');

const m = process.env.MUTANTE ? JSON.parse(process.env.MUTANTE) : null;
if (m && m.alvo === 'servidor') {
  const alvo = path.resolve(m.arquivo);
  const compilarOriginal = Module.prototype._compile;
  Module.prototype._compile = function (conteudo, arquivo) {
    if (path.resolve(arquivo) === alvo) {
      if (conteudo.slice(m.indice, m.indice + m.de.length) !== m.de) {
        throw new Error(`Mutante inválido em ${arquivo}: "${m.de}" não está na posição ${m.indice}`);
      }
      conteudo = conteudo.slice(0, m.indice) + m.para + conteudo.slice(m.indice + m.de.length);
    }
    return compilarOriginal.call(this, conteudo, arquivo);
  };
}
