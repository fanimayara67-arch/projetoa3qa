/* ══════════════════════════════════════════════════════════════
   Verifica os arquivos de texto alterados num PR.

   Barra documentação corrompida ou inchada, como aconteceu no PR #14:
   o teste-pin/README.md passou de 5 KB para 1,5 MB porque uma
   substituição com texto de busca vazio repetiu um bloco entre cada
   caractere do arquivo. Os testes não pegam isso, porque não leem o README.

   Regras (só para .md e .txt adicionados ou alterados):
     1. Nenhum arquivo pode passar de 300 KB.
        (O maior da main hoje tem 27 KB.)
     2. Um arquivo que já existia não pode crescer mais de 10 vezes
        e terminar acima de 50 KB.

   Uso:  node scripts/ci/verificar-arquivos-pr.mjs <base> <head>
   Ex.:  node scripts/ci/verificar-arquivos-pr.mjs origin/main HEAD
   ══════════════════════════════════════════════════════════════ */
import { execFileSync } from 'node:child_process';

const LIMITE_BYTES = 300 * 1024;
const FATOR_CRESCIMENTO = 10;
const PISO_CRESCIMENTO_BYTES = 50 * 1024;
const EXTENSOES = /\.(md|txt)$/i;

const [base = 'origin/main', head = 'HEAD'] = process.argv.slice(2);

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function tamanho(ref, caminho) {
  return Number(git('cat-file', '-s', `${ref}:${caminho}`).trim());
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// A = adicionado, M = alterado. Renomeações contam como adicionadas.
const alterados = git('diff', '--name-status', '--no-renames', '-z', '--diff-filter=AM', `${base}...${head}`)
  .split('\0')
  .filter(Boolean)
  .reduce((lista, item, i, partes) => (i % 2 === 0 ? [...lista, { status: item, caminho: partes[i + 1] }] : lista), [])
  .filter(({ caminho }) => EXTENSOES.test(caminho));

const pontoDeBase = git('merge-base', base, head).trim();
const problemas = [];

for (const { status, caminho } of alterados) {
  const depois = tamanho(head, caminho);
  const antes = status === 'M' ? tamanho(pontoDeBase, caminho) : 0;

  if (depois > LIMITE_BYTES) {
    problemas.push(`${caminho}: tem ${kb(depois)}, acima do limite de ${kb(LIMITE_BYTES)}.`);
  } else if (antes > 0 && depois > antes * FATOR_CRESCIMENTO && depois > PISO_CRESCIMENTO_BYTES) {
    problemas.push(`${caminho}: cresceu de ${kb(antes)} para ${kb(depois)} (${Math.round(depois / antes)}x).`);
  }
  console.log(`${status} ${caminho}: ${antes ? kb(antes) + ' -> ' : ''}${kb(depois)}`);
}

if (problemas.length) {
  console.error('\nArquivo de texto suspeito de corrupção:');
  for (const p of problemas) console.error('  - ' + p);
  console.error('\nConfira o arquivo no PR. Se ele estiver corrompido, restaure a versão da main');
  console.error('(git checkout origin/main -- <arquivo>) e refaça a edição à mão.');
  process.exit(1);
}

console.log(`\nOK: ${alterados.length} arquivo(s) .md/.txt verificados, nenhum suspeito.`);
