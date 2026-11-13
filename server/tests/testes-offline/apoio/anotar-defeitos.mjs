/**
 * Anota nas evidências (caixa-preta.json e caixa-branca.json de cada servidor)
 * quais defeitos do catálogo cada caso evidencia. Não altera resultados: só
 * acrescenta o campo `defeitos` a partir de docs/.../Testes offline/defeitos.json.
 *
 *   node server/tests/testes-offline/apoio/anotar-defeitos.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const BASE = resolve(RAIZ, 'docs/Relatório de Testes/Testes offline');
const catalogo = JSON.parse(readFileSync(resolve(BASE, 'defeitos.json'), 'utf8'));

for (const [servidor, pasta] of [['api-node', 'API Node'], ['apps-script', 'Apps Script']]) {
  const porCaso = {};
  for (const d of catalogo.defeitos) for (const c of (d.casos[servidor] || [])) (porCaso[c] ||= []).push(d.id);
  for (const [arquivo, lista] of [['caixa-preta.json', 'casos'], ['caixa-branca.json', 'testes']]) {
    const caminho = resolve(BASE, pasta, 'evidencias', arquivo);
    if (!existsSync(caminho)) continue;
    const dados = JSON.parse(readFileSync(caminho, 'utf8'));
    for (const item of dados[lista]) {
      const ids = porCaso[item.id];
      if (ids) item.defeitos = ids; else delete item.defeitos;
    }
    writeFileSync(caminho, JSON.stringify(dados, null, 2));
    console.log(`${pasta}/${arquivo}: ${dados[lista].filter((i) => i.defeitos).length} itens ligados a defeitos`);
  }
}
