/**
 * CAIXA-PRETA — Funcionalidades offline com o servidor Google Apps Script
 *
 * Abre o app do cidadão e o painel do técnico no Google Chrome (Playwright),
 * liga e desliga a internet e confere a tela, o que chegou ao dublê do Apps
 * Script (planilha em memória) e a fila do aparelho.
 *
 * O script real não está no repositório. Nos casos de duplicidade (CP-16 e
 * CP-17) cada caso roda duas vezes: com uma planilha que aceita protocolo
 * repetido (a) e com uma que o descarta (b).
 *
 * Como executar (na raiz do projeto):
 *   npm install --no-save playwright-core
 *   node server/tests/testes-offline/apps-script/caixa-preta.navegador.mjs
 *
 * Opções: NAVEGADOR=msedge · REPETICOES=1 · FILTRO=CT-0
 * Resultado: docs/Relatório de Testes/Testes offline/Apps Script/evidencias/caixa-preta.json
 */

import { resolve } from 'node:path';
import { executarCaixaPreta, RAIZ } from '../apoio/caixa-preta.mjs';

await executarCaixaPreta({
  servidor: 'apps-script',
  saida: resolve(RAIZ, 'docs/Relatório de Testes/Testes offline/Apps Script/evidencias/caixa-preta.json'),
  repeticoes: Number(process.env.REPETICOES || 2),
  filtro: process.env.FILTRO ? new RegExp(process.env.FILTRO) : null
});
