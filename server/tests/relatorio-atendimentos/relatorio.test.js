const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../../src/infrastructure/database/pool');
const ChamadoRepository = require('../../src/infrastructure/repositories/ChamadoRepository');
const formatarChamado = require('../../src/presentation/views/chamado.view');

const modulos = Promise.all([
  import('../../../public/tecnico/js/application/CarregarPainel.js'),
  import('../../../public/tecnico/js/domain/Ticket.js')
]);

test('Relatório: escopo "fechados" junta fechamento e técnico, só de chamados fechados', async () => {
  const consultas = [];
  pool.setPool({ query: async (sql) => { consultas.push(sql); return { rows: [] }; } });
  try {
    await ChamadoRepository.listar('fechados');
  } finally {
    pool.setPool(null);
  }
  const sql = consultas[0];
  assert.match(sql, /JOIN fechamentos f ON f\.chamado_id = c\.id/);
  assert.match(sql, /LEFT JOIN usuarios u ON u\.id = f\.tecnico_id/);
  assert.match(sql, /WHERE c\.status = 'fechado'/);
});

test('Relatório: a view inclui o fechamento só quando a consulta trouxe esses campos', () => {
  const base = { id: 'x', protocolo: 'IC-1', tipo: 'apagado', status: 'fechado' };
  assert.equal(formatarChamado(base).fechamento, undefined);

  const comFechamento = formatarChamado({
    ...base,
    fechamento_status: 'Concluído',
    fechamento_servico: 'Troca de lâmpada',
    fechamento_data: '2026-11-05T12:00:00Z',
    fechamento_administrativo: 1,
    fechamento_informante: 'Secretaria',
    fechamento_foto_url: null,
    fechamento_tecnico: 'Gestor Teste'
  });
  assert.deepEqual(comFechamento.fechamento, {
    status: 'Concluído',
    servico: 'Troca de lâmpada',
    data: '2026-11-05T12:00:00Z',
    administrativo: true,
    informante: 'Secretaria',
    tecnico: 'Gestor Teste',
    fotoUrl: null
  });
});

test('Relatório: carregarFechados devolve registros no formato da tela, com data em pt-BR', async () => {
  const [{ carregarFechados }, { rotuloTipo }] = await modulos;
  let chamada;
  const api = async (caminho, opcoes) => {
    chamada = { caminho, opcoes };
    return {
      ok: true,
      data: {
        records: [{
          protocolo: 'IC-9', tipo: 'aceso_dia', endereco: 'Praça da Matriz', fotoUrl: '/defeito.jpg',
          fechamento: { status: 'Concluído', servico: 'Troca do fotosensor', data: '2026-11-05T15:30:00Z', administrativo: false, tecnico: 'Técnico Teste', fotoUrl: '/reparo.jpg' }
        }]
      }
    };
  };

  const [registro] = await carregarFechados('tok', { api, rotuloTipo });
  assert.equal(chamada.caminho, '/api/chamados?escopo=fechados');
  assert.equal(chamada.opcoes.token, 'tok');
  assert.equal(registro.tipo, 'Aceso durante o dia');
  assert.equal(registro.status, 'Concluído');
  assert.equal(registro.tecnico, 'Técnico Teste');
  assert.equal(registro.foto_thumb, '/defeito.jpg');
  assert.equal(registro.foto_reparo, '/reparo.jpg');
  assert.match(registro.data_fechamento, /^\d{2}\/11\/2026/);
});

test('Relatório: carregarFechados propaga o status HTTP quando a API recusa (sessão expirada)', async () => {
  const [{ carregarFechados }] = await modulos;
  const api = async () => ({ ok: false, status: 401, error: { mensagem: 'Sessão expirada ou inválida.' } });
  await assert.rejects(carregarFechados('tok', { api }), erro => erro.status === 401);
});

test('Relatório: rotuloTipo traduz códigos conhecidos e preserva textos livres', async () => {
  const [, { rotuloTipo }] = await modulos;
  assert.equal(rotuloTipo('fios_soltos'), 'Fios soltos');
  assert.equal(rotuloTipo('Poste apagado'), 'Poste apagado');
  assert.equal(rotuloTipo(''), 'Não informado');
});
