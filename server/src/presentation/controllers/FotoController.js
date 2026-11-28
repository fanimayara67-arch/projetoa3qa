/**
 * CAMADA DE APRESENTAÇÃO — FotoController
 * Entrega as fotos gravadas pela API (reporte, reparo e tentativa).
 *
 * A rota é pública: a tela mostra a foto com <img src="/uploads/fotos/...">, que não manda o
 * token. O nome do arquivo é gerado pela API (data + 8 caracteres aleatórios) e nunca muda,
 * por isso o cache pode ser longo.
 */

const FotoStorage = require('../../infrastructure/storage/FotoStorage');
const { NaoEncontrado } = require('../../application/errors');

async function servir(req, res, next) {
  try {
    const foto = await FotoStorage.ler(req.params.arquivo);
    if (!foto) throw new NaoEncontrado('Foto não encontrada.');

    res.statusCode = 200;
    res.setHeader('Content-Type', foto.tipo);
    res.setHeader('Content-Length', foto.conteudo.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(foto.conteudo);
  } catch (err) {
    next(err);
  }
}

module.exports = { servir };
