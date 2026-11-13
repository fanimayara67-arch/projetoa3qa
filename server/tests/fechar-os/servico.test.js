/**
 * UC05 — Atender e encerrar chamado (fechar OS) | FechamentoService.fecharChamado
 * com os repositórios reais sobre o banco simulado (chamados, fechamentos, estoque,
 * materiais da OS e postes). Só a gravação da foto é substituída.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { fecharChamado } = require('../../src/application/services/FechamentoService');
const { fechamentoValido, chamadoAberto, PROTOCOLO } = require('./fixture');
const { criarBancoSimulado } = require('./banco-simulado');

const TECNICO = 3;

function deps(banco) {
  return {
    emTransacao: banco.emTransacao,
    FotoStorage: { salvar: async (foto) => (foto ? '/uploads/fotos/reparo.jpg' : null) }
  };
}

const fechar = (banco, alterar, protocolo = PROTOCOLO) =>
  fecharChamado({ protocolo, tecnicoId: TECNICO, dados: fechamentoValido(alterar) }, deps(banco));

/* ── Fluxo principal (passos 6 e 7) ── */

test('FO-12 [caixa-preta | partição válida | passo 7] grava o fechamento, fecha o chamado, baixa o estoque e atualiza o poste', async () => {
  const banco = criarBancoSimulado();
  const f = await fechar(banco);

  const { fechamentos, chamados, materiaisOS, postes } = banco.tabelas;
  assert.equal(fechamentos.length, 1);
  assert.equal(f.status, 'Concluído');
  assert.equal(f.tecnico_id, TECNICO);
  assert.equal(f.foto_url, '/uploads/fotos/reparo.jpg');
  assert.equal(chamados[0].status, 'fechado');
  assert.equal(chamados[0].poste_id, 'P-0001', 'o chamado fica ligado ao poste atendido');
  assert.equal(banco.saldo('Reator'), 9, 'CA04: 1 reator abatido do estoque');
  assert.deepEqual(materiaisOS, [{ fechamento_id: f.id, item_id: 1, quantidade: 1 }]);
  assert.equal(postes[0].reator, 'Eletrônico', 'passo 4: configuração do poste registrada');
  assert.equal(postes[0].latitude, fechamentoValido().lat);
});

/* ── Riscos de duplicidade e concorrência ── */

test('FO-13 [baseada em risco | CA04 "uma única vez"] reenvio da mesma operação devolve o mesmo fechamento sem baixar o estoque de novo', async () => {
  const banco = criarBancoSimulado();
  const primeiro = await fechar(banco);
  const reenvio = await fechar(banco);

  assert.equal(reenvio.id, primeiro.id);
  assert.equal(banco.tabelas.fechamentos.length, 1);
  assert.equal(banco.saldo('Reator'), 9);
});

test('FO-14 [baseada em risco | concorrência] chamado já fechado gera 409; chamado inexistente gera 404', async () => {
  const fechado = criarBancoSimulado({ chamados: [chamadoAberto({ status: 'fechado' })] });
  await assert.rejects(fechar(fechado), { status: 409 });
  assert.equal(fechado.saldo('Reator'), 10, 'nada foi abatido');

  await assert.rejects(fechar(criarBancoSimulado(), {}, 'IC-000000-XXXXX'), { status: 404 });
});

test('FO-15 [baseada em risco | idempotência] operacao_id já usada em outro chamado não fecha este nem finge sucesso', async () => {
  const outro = chamadoAberto({ id: '33333333-3333-4333-8333-333333333333', protocolo: 'IC-261110-OUTRO' });
  const banco = criarBancoSimulado({ chamados: [chamadoAberto(), outro] });
  await fechar(banco); // fecha IC-261110-FECHA com a operação OPERACAO

  // Mesma operacao_id enviada para outro chamado (ex.: formulário reaproveitado).
  await assert.rejects(fechar(banco, {}, 'IC-261110-OUTRO'), { status: 409 });
  assert.equal(banco.tabelas.chamados[1].status, 'aberto');
});

test('FO-16 [baseada em risco | CA04] material repetido na lista: o estoque e a OS registram a mesma quantidade', async () => {
  const banco = criarBancoSimulado();
  const f = await fechar(banco, { materiais_os: [{ nome: 'Cabo (m)', quantidade: 2 }, { nome: 'Cabo (m)', quantidade: 3 }] });

  const registrado = banco.tabelas.materiaisOS.filter((m) => m.fechamento_id === f.id && m.item_id === 3);
  const abatido = 50 - banco.saldo('Cabo (m)');
  assert.equal(abatido, 5);
  assert.equal(registrado.reduce((s, m) => s + m.quantidade, 0), abatido, 'a OS precisa mostrar o que saiu do estoque');
});

test('FO-17 [baseada em risco | atomicidade] saldo insuficiente: 409 e nada fica gravado', async () => {
  const banco = criarBancoSimulado();
  await assert.rejects(fechar(banco, { materiais_os: [{ nome: 'Reator', quantidade: 11 }] }), { status: 409 });

  const { fechamentos, chamados, postes, materiaisOS } = banco.tabelas;
  assert.equal(fechamentos.length, 0);
  assert.equal(chamados[0].status, 'aberto');
  assert.equal(postes.length, 0, 'o poste não pode ficar atualizado com a OS desfeita');
  assert.equal(materiaisOS.length, 0);
  assert.equal(banco.saldo('Reator'), 10);
});

test('FO-18 [baseada em risco | atomicidade] material que não existe no almoxarifado: 404 e nada fica gravado', async () => {
  const banco = criarBancoSimulado();
  await assert.rejects(fechar(banco, { materiais_os: [{ nome: 'Reator', quantidade: 1 }, { nome: 'Braço', quantidade: 1 }] }), { status: 404 });
  assert.equal(banco.tabelas.fechamentos.length, 0);
  assert.equal(banco.saldo('Reator'), 10, 'o reator abatido antes do erro volta');
});

/* ── Caixa-branca: ramos do poste ── */

test('FO-19 [caixa-branca | cobertura de ramos] poste: o informado pelo técnico, o do chamado ou nenhum', async () => {
  const informado = criarBancoSimulado();
  await fechar(informado, { poste_id: 'p0007' });
  assert.equal(informado.tabelas.postes[0].id, 'P-0007', 'ID normalizado');

  const doChamado = criarBancoSimulado({ chamados: [chamadoAberto({ poste_id: 'P-0042' })] });
  await fechar(doChamado, { poste_id: '' });
  assert.equal(doChamado.tabelas.postes[0].id, 'P-0042');

  const nenhum = criarBancoSimulado();
  await fechar(nenhum, { poste_id: '' });
  assert.equal(nenhum.tabelas.postes.length, 0);
  assert.equal(nenhum.tabelas.chamados[0].poste_id, null);
  assert.equal(nenhum.tabelas.chamados[0].status, 'fechado');
});

test('FO-20 [caixa-branca | cobertura de ramos] dados inválidos não abrem transação nem gravam a foto', async () => {
  const banco = criarBancoSimulado();
  let fotos = 0;
  const d = { emTransacao: banco.emTransacao, FotoStorage: { salvar: async () => { fotos++; return '/x.jpg'; } } };
  await assert.rejects(fecharChamado({ protocolo: PROTOCOLO, tecnicoId: TECNICO, dados: fechamentoValido({ status: '' }) }, d), { status: 400 });
  assert.equal(fotos, 0);
  assert.deepEqual(banco.eventos, []);
});
