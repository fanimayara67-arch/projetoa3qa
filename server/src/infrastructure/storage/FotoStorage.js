/**
 * CAMADA DE INFRAESTRUTURA — Armazenamento de Fotos (FotoStorage)
 * Retira os blobs base64 de dentro das tabelas de negócio: a foto é guardada à parte e a
 * coluna `foto_url` recebe só o endereço /uploads/fotos/<arquivo>, que a rota
 * GET /uploads/fotos/:arquivo entrega.
 *
 * Onde a foto fica (variável STORAGE_DRIVER):
 * - disco  (padrão): pasta UPLOAD_DIR. Bom para rodar local; no Render o disco é apagado a
 *                    cada deploy ou reinício, então as fotos se perdem.
 * - mysql          : tabela `fotos` (migração 002). Sobrevive ao deploy sem outro serviço.
 * - memory         : não guarda nada (testes); só devolve o endereço.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB
const DRIVERS = ['disco', 'mysql', 'memory'];
const TIPOS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Nome que a própria API gera: <timestamp>-<8 hex>.<ext>. Qualquer outra coisa é recusada. */
const NOME_VALIDO = /^\d{10,16}-[0-9a-f]{8}\.(jpg|png|webp)$/;

function driverAtual() {
  const driver = String(process.env.STORAGE_DRIVER || 'disco').trim().toLowerCase();
  if (!DRIVERS.includes(driver)) {
    throw new Error(`STORAGE_DRIVER inválido (${driver}). Use: ${DRIVERS.join(', ')}.`);
  }
  return driver;
}

const pastaDe = (opcoes) => opcoes.diretorio || process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads/fotos');
const bancoDe = (opcoes) => opcoes.banco || require('../database/pool');

/**
 * Salva uma imagem codificada em Data URL / Base64 e retorna a URL do arquivo.
 * Se nenhuma foto for enviada, retorna `null`.
 */
async function salvar(fotoBase64, opcoes = {}) {
  if (!fotoBase64 || typeof fotoBase64 !== 'string') return null;

  // Caso já seja uma URL HTTP/relativa, preserva
  if (/^https?:\/\//i.test(fotoBase64) || fotoBase64.startsWith('/uploads/')) {
    return fotoBase64;
  }

  const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(fotoBase64.trim());
  const ext = match ? (match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()) : 'jpg';
  const base64Limpo = match ? match[2] : fotoBase64.replace(/^data:[^;]+;base64,/, '');

  const buffer = Buffer.from(base64Limpo, 'base64');
  if (buffer.length > LIMITE_BYTES) {
    const err = new Error('Foto excede o tamanho máximo permitido (5 MB).');
    err.status = 413;
    err.codigo = 'FOTO_MUITO_GRANDE';
    throw err;
  }

  const nomeArquivo = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const driver = opcoes.apenasSimular ? 'memory' : (opcoes.driver || driverAtual());

  if (driver === 'mysql') {
    await bancoDe(opcoes).query('INSERT INTO fotos (nome, tipo, dados) VALUES (?, ?, ?)', [nomeArquivo, TIPOS[ext], buffer]);
  } else if (driver === 'disco') {
    const pastaDestino = pastaDe(opcoes);
    await fs.mkdir(pastaDestino, { recursive: true });
    await fs.writeFile(path.join(pastaDestino, nomeArquivo), buffer);
  }

  return `/uploads/fotos/${nomeArquivo}`;
}

/**
 * Lê uma foto pelo nome do arquivo. Devolve { conteudo: Buffer, tipo } ou null quando não
 * existe ou o nome não é um nome gerado pela API (bloqueia ../ e outros caminhos).
 */
async function ler(nomeArquivo, opcoes = {}) {
  if (typeof nomeArquivo !== 'string' || !NOME_VALIDO.test(nomeArquivo)) return null;
  const tipo = TIPOS[nomeArquivo.split('.').pop()];
  const driver = opcoes.driver || driverAtual();

  if (driver === 'mysql') {
    const { rows } = await bancoDe(opcoes).query('SELECT tipo, dados FROM fotos WHERE nome = ?', [nomeArquivo]);
    return rows[0] ? { conteudo: rows[0].dados, tipo: rows[0].tipo || tipo } : null;
  }
  if (driver === 'memory') return null;

  try {
    return { conteudo: await fs.readFile(path.join(pastaDe(opcoes), nomeArquivo)), tipo };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

module.exports = {
  salvar,
  ler,
  driverAtual,
  LIMITE_BYTES
};
