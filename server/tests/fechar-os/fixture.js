/**
 * Dados de apoio dos testes do UC05 — Atender e encerrar chamado (fechar OS).
 * `fechamentoValido()` devolve um fechamento que atende a todos os requisitos do UC05;
 * cada caso de teste altera apenas o campo que quer exercitar.
 */

// Coordenadas no centro de Coruripe/AL.
const LAT_CORURIPE = -10.1253;
const LNG_CORURIPE = -36.1756;

// JPEG mínimo em Data URL (apenas o cabeçalho; suficiente para os testes de validação).
const FOTO_PEQUENA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

// Os quatro status de resolução do passo 3 do UC05.
const STATUS_UC05 = ['Concluído', 'Parcialmente resolvido', 'Requer material', 'Ponto não localizado'];

const OPERACAO = '22222222-2222-4222-8222-222222222222';
const PROTOCOLO = 'IC-261110-FECHA';

function fechamentoValido(alterar = {}) {
  return {
    operacao_id: OPERACAO,
    status: 'Concluído',
    servico: 'Troca do reator e do fotossensor',
    referencia: 'Em frente à escola municipal',
    lat: LAT_CORURIPE,
    lng: LNG_CORURIPE,
    precisao_m: 8,
    foto_reparo_base64: FOTO_PEQUENA,
    poste_id: 'P-0001',
    config: {
      braco: 'Curto', luminaria: 'LED 100W', reator: 'Eletrônico', fotosensor: 'Novo',
      porta_fusivel: '5x20', fusivel: '2A', cabo: '2,5 mm', conector: 'Cunha', obs: ''
    },
    materiais_os: [{ nome: 'Reator', quantidade: 1 }],
    data_fechamento: '2026-11-13T12:00:00.000Z',
    ...alterar
  };
}

/** Chamado aberto pelo cidadão (UC01), pronto para ser atendido. */
function chamadoAberto(alterar = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    protocolo: PROTOCOLO,
    tipo: 'apagado',
    status: 'aberto',
    latitude: LAT_CORURIPE,
    longitude: LNG_CORURIPE,
    poste_id: null,
    ...alterar
  };
}

/** Itens do almoxarifado usados nos testes de baixa de materiais (CA04). */
function estoqueInicial() {
  return [
    { id: 1, nome: 'Reator', unidade: 'un', saldo: 10, minimo: 2 },
    { id: 2, nome: 'Fotosensor', unidade: 'un', saldo: 5, minimo: 1 },
    { id: 3, nome: 'Cabo (m)', unidade: 'm', saldo: 50, minimo: 10 }
  ];
}

module.exports = {
  LAT_CORURIPE,
  LNG_CORURIPE,
  FOTO_PEQUENA,
  STATUS_UC05,
  OPERACAO,
  PROTOCOLO,
  fechamentoValido,
  chamadoAberto,
  estoqueInicial
};
