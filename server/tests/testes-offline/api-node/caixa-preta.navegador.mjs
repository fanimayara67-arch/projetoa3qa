/**
 * CAIXA-PRETA — Funcionalidades offline com o servidor API Node
 *
 * Abre o app do cidadão e o painel do técnico no Google Chrome (Playwright),
 * liga e desliga a internet e confere a tela, o que a API Node real gravou e a
 * fila do aparelho. O banco MySQL é trocado por repositórios em memória.
 *
 * Como executar (na raiz do projeto):
 *   npm install --no-save playwright-core
 *   node server/tests/testes-offline/api-node/caixa-preta.navegador.mjs
 *
 * Opções: NAVEGADOR=msedge (usa o Edge) · REPETICOES=1 (uma rodada só)
 *         FILTRO=CP-1 (só os casos cujo id contém o texto)
 * Resultado: docs/Relatório de Testes/Testes offline/API Node/evidencias/caixa-preta.json
 */

import { resolve } from 'node:path';
import { executarCaixaPreta, RAIZ } from '../apoio/caixa-preta.mjs';

await executarCaixaPreta({
  servidor: 'api-node',
  saida: resolve(RAIZ, 'docs/Relatório de Testes/Testes offline/API Node/evidencias/caixa-preta.json'),
  repeticoes: Number(process.env.REPETICOES || 2),
  filtro: process.env.FILTRO ? new RegExp(process.env.FILTRO) : null
});
