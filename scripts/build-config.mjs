/* ══════════════════════════════════════════════════════════════
   Gera public/shared/config.js e public/shared/infrastructure/config.js
   a partir das variáveis de ambiente.

   Suporta tanto a nova API REST em Node.js (ILUMINA_API_URL) quanto
   os endpoints legados do Apps Script durante a transição.
   ══════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destinoLegado = resolve(raiz, 'public/shared/config.js');
const destinoInfra  = resolve(raiz, 'public/shared/infrastructure/config.js');

function carregarDotenv() {
  const caminho = resolve(raiz, '.env');
  if (!existsSync(caminho)) return 'ambiente (sem .env)';
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const corte = limpa.indexOf('=');
    if (corte < 0) continue;
    const chave = limpa.slice(0, corte).trim();
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = limpa.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '.env';
}

const origem = carregarDotenv();

const temApiUrl = Boolean(process.env.ILUMINA_API_URL);
const OBRIGATORIAS = temApiUrl ? [] : ['ILUMINA_ENDPOINT_CIDADAO', 'ILUMINA_ENDPOINT_TECNICO'];
const faltando = OBRIGATORIAS.filter(k => !process.env[k]);
if (faltando.length) {
  console.error('\nBuild abortado — variáveis ausentes: ' + faltando.join(', '));
  console.error('Local:   copie .env.example para .env e preencha (ou defina ILUMINA_API_URL).');
  console.error('Deploy:  cadastre no painel do host e refaça o deploy.\n');
  process.exit(1);
}

const cfg = {
  API_URL: process.env.ILUMINA_API_URL || '',
  ENDPOINT_CIDADAO: temApiUrl ? '/api/chamados' : process.env.ILUMINA_ENDPOINT_CIDADAO,
  ENDPOINT_TECNICO: temApiUrl ? '/api' : process.env.ILUMINA_ENDPOINT_TECNICO,
  HUB_URL: process.env.ILUMINA_HUB_URL || 'https://hubcentralcrp.netlify.app'
};

for (const [k, v] of Object.entries(cfg)) {
  if (String(v).includes('COLE_O_ID_AQUI')) {
    console.error(`\nBuild abortado — ${k} ainda está com o valor de exemplo.\n`);
    process.exit(1);
  }
}

const saida = `/* ══════════════════════════════════════════════════════════════
   GERADO AUTOMATICAMENTE — NÃO EDITE ESTE ARQUIVO À MÃO.
   Origem: scripts/build-config.mjs + variáveis de ambiente.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var API_URL = ${JSON.stringify(cfg.API_URL)};
  var ENDPOINT_CIDADAO = ${JSON.stringify(cfg.ENDPOINT_CIDADAO)};
  var ENDPOINT_TECNICO = ${JSON.stringify(cfg.ENDPOINT_TECNICO)};

  var origin = global.location ? global.location.origin : '';
  var APP_CIDADAO = origin + '/';
  var APP_TECNICO = origin + '/tecnico/';

  global.ILUMINA = {
    API_URL: API_URL,
    ENDPOINT_CIDADAO: ENDPOINT_CIDADAO,
    ENDPOINT_TECNICO: ENDPOINT_TECNICO,
    APP_CIDADAO: APP_CIDADAO,
    APP_TECNICO: APP_TECNICO,
    HUB_URL: ${JSON.stringify(cfg.HUB_URL)}
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;

mkdirSync(dirname(destinoLegado), { recursive: true });
mkdirSync(dirname(destinoInfra), { recursive: true });
writeFileSync(destinoLegado, saida, 'utf8');
writeFileSync(destinoInfra, saida, 'utf8');

const mascara = (u) => String(u).replace(/\/s\/([^/]{6})[^/]*\//, '/s/$1…/');
console.log(`config.js gerado (origem: ${origem})`);
if (cfg.API_URL) console.log(`  api_url: ${cfg.API_URL}`);
console.log(`  cidadao: ${mascara(cfg.ENDPOINT_CIDADAO)}`);
console.log(`  tecnico: ${mascara(cfg.ENDPOINT_TECNICO)}`);
