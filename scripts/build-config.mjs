/* ══════════════════════════════════════════════════════════════
   Gera public/shared/config.js a partir das variáveis de ambiente.

   O site é estático — não há runtime de servidor para ler process.env.
   Este script roda no build e materializa os valores dentro do JS
   que vai para o navegador.

   Local:    node scripts/build-config.mjs   (lê o .env da raiz)
   Deploy:   mesmo comando; o host injeta as variáveis no ambiente.
   ══════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destino = resolve(raiz, 'public/shared/config.js');

// .env só existe no ambiente local; em produção as variáveis já vêm do host.
function carregarDotenv() {
  const caminho = resolve(raiz, '.env');
  if (!existsSync(caminho)) return 'ambiente (sem .env)';
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const corte = limpa.indexOf('=');
    if (corte < 0) continue;
    const chave = limpa.slice(0, corte).trim();
    // Variável já definida no ambiente vence o .env — é assim que o host manda.
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = limpa.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '.env';
}

const origem = carregarDotenv();

const OBRIGATORIAS = ['ILUMINA_ENDPOINT_CIDADAO', 'ILUMINA_ENDPOINT_TECNICO'];
const faltando = OBRIGATORIAS.filter(k => !process.env[k]);
if (faltando.length) {
  console.error('\nBuild abortado — variáveis ausentes: ' + faltando.join(', '));
  console.error('Local:   copie .env.example para .env e preencha.');
  console.error('Deploy:  cadastre no painel do host e refaça o deploy.\n');
  process.exit(1);
}

const cfg = {
  ENDPOINT_CIDADAO: process.env.ILUMINA_ENDPOINT_CIDADAO,
  ENDPOINT_TECNICO: process.env.ILUMINA_ENDPOINT_TECNICO,
  HUB_URL: process.env.ILUMINA_HUB_URL || 'https://hubcentralcrp.netlify.app'
};

// Aborta cedo se alguém colar o placeholder do .env.example em produção.
for (const [k, v] of Object.entries(cfg)) {
  if (String(v).includes('COLE_O_ID_AQUI')) {
    console.error(`\nBuild abortado — ${k} ainda está com o valor de exemplo.\n`);
    process.exit(1);
  }
}

const saida = `/* ══════════════════════════════════════════════════════════════
   GERADO AUTOMATICAMENTE — NÃO EDITE ESTE ARQUIVO À MÃO.
   Origem: scripts/build-config.mjs + variáveis de ambiente.
   Para mudar um endpoint, edite o .env (local) ou o painel do host
   (produção) e rode o build de novo.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ENDPOINT_CIDADAO = ${JSON.stringify(cfg.ENDPOINT_CIDADAO)};
  var ENDPOINT_TECNICO = ${JSON.stringify(cfg.ENDPOINT_TECNICO)};

  // Os dois apps rodam na mesma origem, então o QR do poste e o link entre
  // os painéis são resolvidos em runtime — sem domínio fixo no código.
  var origin = global.location.origin;
  var APP_CIDADAO = origin + '/';
  var APP_TECNICO = origin + '/tecnico/';

  global.ILUMINA = {
    ENDPOINT_CIDADAO: ENDPOINT_CIDADAO,
    ENDPOINT_TECNICO: ENDPOINT_TECNICO,
    APP_CIDADAO: APP_CIDADAO,
    APP_TECNICO: APP_TECNICO,
    HUB_URL: ${JSON.stringify(cfg.HUB_URL)},

    // URL do QR colado no poste: abre o app do cidadão já com o poste preenchido
    qrPoste: function (posteId) {
      return APP_CIDADAO + '?poste=' + encodeURIComponent(String(posteId || '').toUpperCase());
    }
  };
})(window);
`;

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, saida, 'utf8');

const mascara = (u) => String(u).replace(/\/s\/([^/]{6})[^/]*\//, '/s/$1…/');
console.log(`config.js gerado (origem: ${origem})`);
console.log(`  cidadao: ${mascara(cfg.ENDPOINT_CIDADAO)}`);
console.log(`  tecnico: ${mascara(cfg.ENDPOINT_TECNICO)}`);
