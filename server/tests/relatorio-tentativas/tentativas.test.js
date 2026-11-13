const test = require('node:test');
const assert = require('node:assert/strict');
const TentativaRepository = require('../../src/infrastructure/repositories/TentativaRepository');
const formatarTentativa = require('../../src/presentation/views/tentativa.view');

const modulos = Promise.all([
  import('../../../public/tecnico/js/application/CarregarPainel.js'),
  import('../../../public/tecnico/js/domain/Ticket.js')
]);

const dadosTentativa = {
  operacaoId: '11111111-1111-4111-8111-111111111111',
  chamadoId: 'c1',
  tecnicoId: 1,
  motivo: 'Sem acesso ao poste'
};

test('Tentativas: inserir usa SQL do MySQL (placeholders ?) e devolve a linha salva', async () => {
  const consultas = [];
  const tx = {
    query: async (sql, valores) => {
      consultas.push({ sql, valores });
      return { rows: sql.startsWith('SELECT') ? [{ id: 7, operacao_id: dadosTentativa.operacaoId }] : [] };
    }
  };
  const salvo = await TentativaRepository.inserir(tx, dadosTentativa);
  assert.equal(salvo.id, 7);
  assert.doesNotMatch(consultas[0].sql, /\$1|RETURNING|ON CONFLICT/);
  assert.match(consultas[0].sql, /VALUES \(\?,\?,\?,\?,\?,\?,\?\)/);
  assert.deepEqual(consultas[1].valores, [dadosTentativa.operacaoId]);
});

test('Tentativas: reenvio com a mesma operacao_id devolve o registro existente sem erro', async () => {
  const tx = {
    query: async (sql) => {
      if (sql.includes('INSERT')) {
        const erro = new Error('Duplicate entry');
        erro.code = 'ER_DUP_ENTRY';
        throw erro;
      }
      return { rows: [{ id: 3, operacao_id: dadosTentativa.operacaoId }] };
    }
  };
  const salvo = await TentativaRepository.inserir(tx, dadosTentativa);
  assert.equal(salvo.id, 3);
});

test('Tentativas: outros erros do banco não são engolidos', async () => {
  const tx = { query: async () => { const e = new Error('falha'); e.code = 'ER_NO_REFERENCED_ROW_2'; throw e; } };
  await assert.rejects(TentativaRepository.inserir(tx, dadosTentativa), /falha/);
});

test('Tentativas: listagem do relatório junta chamado e técnico', async () => {
  let sqlUsado;
  await TentativaRepository.listarParaRelatorio({ query: async (sql) => { sqlUsado = sql; return { rows: [] }; } });
  assert.match(sqlUsado, /JOIN chamados c ON c\.id = t\.chamado_id/);
  assert.match(sqlUsado, /LEFT JOIN usuarios u ON u\.id = t\.tecnico_id/);
});

test('Tentativas: a view expõe só os campos usados pelo relatório', () => {
  const v = formatarTentativa({
    id: 1, protocolo: 'IC-1', tipo: 'apagado', chamado_status: 'em_atendimento', endereco: null,
    descricao: 'Rua A', motivo: 'Sem acesso', latitude: '-10.1', longitude: '-36.1', foto_url: null,
    chamado_foto_url: '/d.jpg', tecnico_nome: 'Técnico Teste', criado_em: '2026-11-05T12:00:00Z', tecnico_id: 9
  });
  assert.equal(v.endereco, 'Rua A');
  assert.equal(v.lat, -10.1);
  assert.equal(v.fotoDefeitoUrl, '/d.jpg');
  assert.equal(v.tecnico_id, undefined);
});

test('Tentativas: carregarTentativas converte para o formato da tela', async () => {
  const [{ carregarTentativas }, { rotuloTipo, rotuloStatusChamado }] = await modulos;
  let caminho;
  const api = async (c) => {
    caminho = c;
    return { ok: true, data: { tentativas: [{ protocolo: 'IC-2', tipo: 'piscando', statusChamado: 'fechado', criadoEm: '2026-11-05T15:30:00Z', tecnico: 'Gestor Teste', motivo: 'Chuva', fotoUrl: '/o.jpg', fotoDefeitoUrl: null, lat: -10, lng: -36 }] } };
  };
  const [t] = await carregarTentativas('tok', { api, rotuloTipo, rotuloStatus: rotuloStatusChamado });
  assert.equal(caminho, '/api/tentativas');
  assert.equal(t.tipo, 'Luz piscando');
  assert.equal(t.status_atual, 'Concluído');
  assert.equal(t.foto, '/o.jpg');
  assert.match(t.data, /^\d{2}\/11\/2026/);
});

test('Tentativas: rotuloStatusChamado traduz os status do banco', async () => {
  const [, { rotuloStatusChamado }] = await modulos;
  assert.equal(rotuloStatusChamado('aberto'), 'Aguardando atendimento');
  assert.equal(rotuloStatusChamado('em_atendimento'), 'Em atendimento');
  assert.equal(rotuloStatusChamado(''), 'Aguardando atendimento');
});
