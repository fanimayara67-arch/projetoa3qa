/**
 * Dados de apoio dos testes do UC01 — Reportar defeito em poste.
 * `reporteValido()` devolve um reporte que atende a todos os requisitos do UC01;
 * cada caso de teste altera apenas o campo que quer exercitar.
 */

// Coordenadas no centro de Coruripe/AL.
const LAT_CORURIPE = -10.1253;
const LNG_CORURIPE = -36.1756;

// JPEG mínimo em Data URL (apenas o cabeçalho; suficiente para os testes de validação).
const FOTO_PEQUENA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

function reporteValido(alterar = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    protocolo: 'IC-261106-ABCDE',
    timestamp: '2026-11-06T15:00:00.000Z',
    tipo: 'apagado',
    lat: LAT_CORURIPE,
    lng: LNG_CORURIPE,
    acc: 8,
    foto_base64: FOTO_PEQUENA,
    descricao: '',
    nome: '',
    tel: '',
    endereco: '',
    ...alterar
  };
}

/** Foto em Data URL com exatamente `bytes` bytes de imagem. */
function fotoComBytes(bytes) {
  return `data:image/jpeg;base64,${Buffer.alloc(bytes, 0xff).toString('base64')}`;
}

/** Os seis tipos de problema listados no passo 3 do UC01. */
const TIPOS_DO_UC01 = ['apagado', 'queimada', 'piscando', 'aceso_dia', 'quebrado', 'outro'];

const UM_MEGABYTE = 1024 * 1024;

module.exports = { reporteValido, fotoComBytes, TIPOS_DO_UC01, UM_MEGABYTE, LAT_CORURIPE, LNG_CORURIPE };
