/**
 * Telas do painel na API Node | Contrato do adaptador AcoesApiNode.js
 *
 * As telas do almoxarifado, do histórico/relatório de postes, da busca por protocolo
 * e da tentativa ainda montam as mensagens no formato do Apps Script ({ action, ... }).
 * Com a API Node, cada ação precisa ir para a rota REST certa e a resposta precisa voltar
 * no formato que a tela já sabe mostrar. Defeitos de referência: DEF-15 e DEF-16
 * (docs/Relatório de Testes/Integração com Selenium).
 *
 * A rede é um dublê com a mesma saída do ApiClient real: { success, ok, data | error, status }.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const URL_ADAPTADOR = pathToFileURL(path.resolve(__dirname, '../../../public/tecnico/js/infrastructure/AcoesApiNode.js')).href;
const adaptador = () => import(URL_ADAPTADOR);

const ok = (data, status = 200) => ({ success: true, ok: true, data, status });
const falha = (status, codigo, mensagem) => ({ success: false, ok: false, status, error: { codigo, mensagem } });

/** Dublê do ApiClient: grava cada chamada e responde pela rota ("GET /api/estoque"). */
function apiFalsa(respostas = {}) {
  const chamadas = [];
  const api = async (caminho, opcoes = {}) => {
    const chamada = { metodo: opcoes.method || 'GET', caminho, corpo: opcoes.body, token: opcoes.token };
    chamadas.push(chamada);
    const resposta = respostas[`${chamada.metodo} ${caminho}`];
    if (resposta instanceof Error) throw resposta;
    if (typeof resposta === 'function') return resposta(chamada);
    return resposta || falha(404, 'NAO_ENCONTRADO', 'Rota não encontrada.');
  };
  return { api, chamadas };
}

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ─────────────── Quais ações o adaptador atende ─────────────── */

test('TN-01 [caixa-preta | partição] atende as ações das telas que faltavam e deixa as já migradas com a tela', async () => {
  const { atendeAcao } = await adaptador();
  for (const acao of ['almox_login', 'estoque_list', 'estoque_upsert', 'estoque_delete', 'missao_create',
    'missao_list', 'missao_return', 'material_report', 'get_poste_history', 'list_postes', 'search', 'attempt']) {
    assert.equal(atendeAcao(acao), true, acao);
  }
  // login, lista, fechamento e fechamento administrativo já vão para a API Node pela própria tela (UC04, UC05, UC10).
  for (const acao of ['login', 'list', 'close', 'close_admin', 'list_attempts', 'acao_inventada', undefined]) {
    assert.equal(atendeAcao(acao), false, String(acao));
  }
});

/* ─────────────── Almoxarifado (DEF-16) ─────────────── */

test('TN-02 [caixa-preta | fluxo principal] almox_login vai para POST /api/auth/almoxarifado e devolve o token', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({
    'POST /api/auth/almoxarifado': ok({ token: 'tok-almox', expiry: 1, usuario: { id: 3, nome: 'Almoxarife', perfil: 'almoxarife' } })
  });
  const r = await executarAcao({ action: 'almox_login', pin: '5678' }, { api });
  assert.deepEqual(chamadas, [{ metodo: 'POST', caminho: '/api/auth/almoxarifado', corpo: { pin: '5678' }, token: undefined }]);
  assert.equal(r.success, true);
  assert.equal(r.token, 'tok-almox');
});

test('TN-03 [caixa-preta | fluxo alternativo] almox_login recusado devolve a mensagem da API (PIN errado ou bloqueio)', async () => {
  const { executarAcao } = await adaptador();
  const errado = apiFalsa({ 'POST /api/auth/almoxarifado': falha(401, 'NAO_AUTENTICADO', 'PIN incorreto.') });
  assert.deepEqual({ ...(await executarAcao({ action: 'almox_login', pin: '0000' }, { api: errado.api })) },
    { success: false, error: 'PIN incorreto.' });
  const bloqueado = apiFalsa({ 'POST /api/auth/almoxarifado': falha(429, 'MUITAS_TENTATIVAS', 'Muitas tentativas. Aguarde 15 minutos.') });
  const r = await executarAcao({ action: 'almox_login', pin: '0000' }, { api: bloqueado.api });
  assert.equal(r.success, false);
  assert.equal(r.error, 'Muitas tentativas. Aguarde 15 minutos.');
});

test('TN-04 [caixa-preta | fluxo principal] estoque_list converte os itens da API para a lista da tela', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({
    'GET /api/estoque': ok([
      { id: 1, nome: 'Lâmpada LED 100W', unidade: 'un', saldo: '12.00', minimo: '5.00', atualizado_em: '2026-11-20T15:05:00.000Z', alertaMinimo: false },
      { id: 2, nome: 'Cabo 2,5mm', unidade: 'm', saldo: '3.50', minimo: '10.00', atualizado_em: null, alertaMinimo: true }
    ])
  });
  const r = await executarAcao({ action: 'estoque_list', token: 'tok-almox' }, { api });
  assert.deepEqual(chamadas, [{ metodo: 'GET', caminho: '/api/estoque', corpo: undefined, token: 'tok-almox' }]);
  assert.equal(r.success, true);
  assert.deepEqual(r.itens.map(({ atualizado, ...resto }) => resto), [
    { item: 'Lâmpada LED 100W', unidade: 'un', saldo: 12, minimo: 5 },
    { item: 'Cabo 2,5mm', unidade: 'm', saldo: 3.5, minimo: 10 }
  ], 'saldo e mínimo viram número (o MySQL devolve DECIMAL como texto)');
  assert.match(r.itens[0].atualizado, /^\d{2}\/\d{2}\/\d{4}/);
  assert.equal(r.itens[1].atualizado, '');
  assert.ok(Array.isArray(r.sugeridos) && r.sugeridos.length > 0, 'a tela mostra sugestões de materiais');
  assert.ok(!r.sugeridos.includes('Lâmpada LED 100W'), 'não sugere o que já está cadastrado');
});

test('TN-05 [caixa-preta | fluxo principal] estoque_upsert e estoque_delete usam a rota do item, com o nome codificado', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({
    'PUT /api/estoque/Cabo%202%2C5mm': ok({ id: 2 }),
    'DELETE /api/estoque/Cabo%202%2C5mm': ok({ id: 2 })
  });
  const salvo = await executarAcao({ action: 'estoque_upsert', token: 't', item: 'Cabo 2,5mm', unidade: 'm', saldo: '40', minimo: '10' }, { api });
  const removido = await executarAcao({ action: 'estoque_delete', token: 't', item: 'Cabo 2,5mm' }, { api });
  assert.equal(salvo.success, true);
  assert.equal(removido.success, true);
  assert.deepEqual(chamadas, [
    { metodo: 'PUT', caminho: '/api/estoque/Cabo%202%2C5mm', corpo: { unidade: 'm', saldo: 40, minimo: 10 }, token: 't' },
    { metodo: 'DELETE', caminho: '/api/estoque/Cabo%202%2C5mm', corpo: undefined, token: 't' }
  ]);
});

test('TN-06 [caixa-preta | fluxo de exceção] estoque_upsert recusado devolve a mensagem de validação da API', async () => {
  const { executarAcao } = await adaptador();
  const { api } = apiFalsa({ 'PUT /api/estoque/Fita': falha(400, 'DADO_INVALIDO', 'Unidade inválida (pç). Use: un, m, cx, rolo, kg, par.') });
  const r = await executarAcao({ action: 'estoque_upsert', token: 't', item: 'Fita', unidade: 'pç', saldo: '1', minimo: '0' }, { api });
  assert.deepEqual({ ...r }, { success: false, error: 'Unidade inválida (pç). Use: un, m, cx, rolo, kg, par.' });
});

test('TN-07 [caixa-preta | valor limite] missao_create converte a data dd/mm/aaaa e os itens; sem data usa hoje', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({ 'POST /api/missoes': ok({ id: 9 }, 201) });
  const itens = [{ item: 'Lâmpada LED 100W', qtd: 4, unidade: 'un' }, { item: 'Cabo 2,5mm', qtd: 12.5, unidade: 'm' }];
  const r = await executarAcao({ action: 'missao_create', token: 't', data: '27/11/2026', equipe: 'Equipe A', obs: 'Centro', itens }, { api });
  await executarAcao({ action: 'missao_create', token: 't', data: '', equipe: 'Equipe B', obs: '', itens }, { api });
  assert.equal(r.success, true);
  assert.deepEqual(chamadas[0], {
    metodo: 'POST', caminho: '/api/missoes', token: 't',
    corpo: { data: '2026-11-27', equipe: 'Equipe A', obs: 'Centro', itens: [{ nome: 'Lâmpada LED 100W', qtd_saida: 4 }, { nome: 'Cabo 2,5mm', qtd_saida: 12.5 }] }
  });
  assert.equal(chamadas[1].corpo.data, hojeIso());
});

test('TN-08 [caixa-preta | fluxo principal] missao_list mostra situação, saída, retorno e consumo de cada missão', async () => {
  const { executarAcao } = await adaptador();
  const { api } = apiFalsa({
    'GET /api/missoes': ok([
      { id: 3, data: '2026-11-27', equipe: 'Equipe A', obs: 'Centro', itens: [
        { item_id: 1, nome: 'Lâmpada LED 100W', unidade: 'un', qtd_saida: '4.00', qtd_retorno: null }] },
      { id: 2, data: '2026-11-20T03:00:00.000Z', equipe: 'Equipe B', obs: null, itens: [
        { item_id: 1, nome: 'Lâmpada LED 100W', unidade: 'un', qtd_saida: '2.00', qtd_retorno: '1.00' },
        { item_id: 2, nome: 'Cabo 2,5mm', unidade: 'm', qtd_saida: '10.00', qtd_retorno: '0.00' }] }
    ])
  });
  const r = await executarAcao({ action: 'missao_list', token: 't' }, { api });
  assert.equal(r.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.missoes)), [
    { id: 3, data: '27/11/2026', equipe: 'Equipe A', obs: 'Centro', status: 'Aberta',
      itens: [{ item: 'Lâmpada LED 100W', unidade: 'un', saida: 4, retorno: 0, consumo: 4 }] },
    { id: 2, data: '20/11/2026', equipe: 'Equipe B', obs: '', status: 'Fechada',
      itens: [{ item: 'Lâmpada LED 100W', unidade: 'un', saida: 2, retorno: 1, consumo: 1 },
        { item: 'Cabo 2,5mm', unidade: 'm', saida: 10, retorno: 0, consumo: 10 }] }
  ]);
});

test('TN-09 [caixa-preta | fluxo principal] missao_return envia o retorno de cada item para a missão', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({ 'POST /api/missoes/3/retorno': ok({ missao_id: 3 }) });
  const r = await executarAcao({ action: 'missao_return', token: 't', id_missao: 3,
    retornos: [{ item: 'Lâmpada LED 100W', qtd: 1 }, { item: 'Cabo 2,5mm', qtd: 0 }] }, { api });
  assert.equal(r.success, true);
  assert.deepEqual(chamadas[0], { metodo: 'POST', caminho: '/api/missoes/3/retorno', token: 't',
    corpo: { itens: [{ nome: 'Lâmpada LED 100W', qtd_retorno: 1 }, { nome: 'Cabo 2,5mm', qtd_retorno: 0 }] } });
});

test('TN-10 [caixa-preta | fluxo principal] material_report junta estoque e missões e marca o que precisa repor', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({
    'GET /api/estoque': ok([
      { nome: 'Lâmpada LED 100W', unidade: 'un', saldo: '5.00', minimo: '5.00' },
      { nome: 'Reator', unidade: 'un', saldo: '8.00', minimo: '2.00' },
      { nome: 'Fita isolante', unidade: 'rolo', saldo: '0.00', minimo: '0.00' }
    ]),
    'GET /api/missoes': ok([{ id: 1, data: '2026-11-27', equipe: 'A', itens: [{ nome: 'Reator', unidade: 'un', qtd_saida: '1.00', qtd_retorno: null }] }])
  });
  const r = await executarAcao({ action: 'material_report', token: 't' }, { api });
  assert.equal(r.success, true);
  assert.deepEqual(chamadas.map((c) => `${c.metodo} ${c.caminho}`).sort(), ['GET /api/estoque', 'GET /api/missoes']);
  assert.deepEqual(r.estoque.map((it) => [it.item, it.baixo]), [['Lâmpada LED 100W', true], ['Reator', false], ['Fita isolante', false]],
    'mesma regra da tela: repor quando há mínimo e o saldo chegou nele');
  assert.equal(r.missoes[0].status, 'Aberta');
});

/* ─────────────── Postes (DEF-15) ─────────────── */

test('TN-11 [caixa-preta | fluxo principal] get_poste_history converte o poste e separa chamados abertos e atendidos', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({
    'GET /api/postes/P-0007/historico': ok({
      poste: { id: 'P-0007', codigo: 'CRP-7', bairro: 'Centro', rua: 'Rua A', referencia: 'Praça', foto_ref_url: '/fotos/p7.jpg', latitude: '-10.125000', longitude: '-36.175000', qtd: 2 },
      chamados: [
        { protocolo: 'IC-2', tipo: 'apagado', status: 'aberto', criado_em: '2026-11-25T12:00:00.000Z', foto_url: null, servico: null, data_fechamento: null, foto_reparo_url: null, tecnico: null },
        { protocolo: 'IC-1', tipo: 'piscando', status: 'fechado', criado_em: '2026-11-10T12:00:00.000Z', servico: 'Troca do reator', data_fechamento: '2026-11-11T15:00:00.000Z', foto_reparo_url: '/fotos/r1.jpg', tecnico: 'Carlos' }
      ]
    })
  });
  const r = await executarAcao({ action: 'get_poste_history', token: 'tok', poste_id: 'P-0007' }, { api });
  assert.deepEqual(chamadas[0], { metodo: 'GET', caminho: '/api/postes/P-0007/historico', corpo: undefined, token: 'tok' });
  assert.equal(r.success, true);
  const { data_ult, ...poste } = r.poste;
  assert.deepEqual(poste, { id: 'P-0007', codigo: 'CRP-7', bairro: 'Centro', rua: 'Rua A', referencia: 'Praça', foto_ref: '/fotos/p7.jpg', lat: -10.125, lng: -36.175, qtd: 2 });
  assert.match(data_ult, /^\d{2}\/\d{2}\/\d{4}/, 'data do último atendimento');
  assert.deepEqual(r.chamados.map((c) => [c.protocolo, c.status, c.tipo]), [
    ['IC-2', 'Aguardando atendimento', 'Poste apagado'],
    ['IC-1', 'Concluído', 'Luz piscando']
  ], 'a tela separa abertos e atendidos pelo texto "Aguardando atendimento"');
  assert.equal(r.chamados[1].servico, 'Troca do reator');
  assert.equal(r.chamados[1].tecnico, 'Carlos');
  assert.equal(r.chamados[1].foto_reparo, '/fotos/r1.jpg');
  assert.match(r.chamados[1].data_fechamento, /^\d{2}\/\d{2}\/\d{4}/);
});

test('TN-12 [caixa-preta | fluxo alternativo] get_poste_history de poste não cadastrado mostra "Poste não cadastrado" (404 vira poste nulo)', async () => {
  const { executarAcao } = await adaptador();
  const { api } = apiFalsa({ 'GET /api/postes/P-9999/historico': falha(404, 'NAO_ENCONTRADO', 'Poste P-9999 não encontrado.') });
  const r = await executarAcao({ action: 'get_poste_history', token: 'tok', poste_id: 'P-9999' }, { api });
  assert.equal(r.success, true);
  assert.equal(r.poste, null);
});

test('TN-13 [caixa-preta | fluxo principal] list_postes converte coordenadas, foto e contagem de atendimentos', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({
    'GET /api/postes': ok([
      { id: 'P-0002', codigo: null, bairro: 'Centro', rua: 'Rua B', referencia: null, foto_ref_url: null, latitude: '-10.120000', longitude: '-36.170000', qtd: 3, data_ult: '2026-11-26T12:00:00.000Z' },
      { id: 'P-0001', codigo: 'CRP-1', bairro: 'Pontal', rua: 'Rua C', referencia: 'Igreja', foto_ref_url: '/fotos/p1.jpg', latitude: null, longitude: null, qtd: 0, data_ult: null }
    ])
  });
  const r = await executarAcao({ action: 'list_postes', token: 'tok' }, { api });
  assert.deepEqual(chamadas[0], { metodo: 'GET', caminho: '/api/postes', corpo: undefined, token: 'tok' });
  assert.equal(r.success, true);
  assert.deepEqual(r.postes.map(({ data_ult, ...p }) => p), [
    { id: 'P-0002', codigo: '', bairro: 'Centro', rua: 'Rua B', referencia: '', foto_ref: '', lat: -10.12, lng: -36.17, qtd: 3 },
    { id: 'P-0001', codigo: 'CRP-1', bairro: 'Pontal', rua: 'Rua C', referencia: 'Igreja', foto_ref: '/fotos/p1.jpg', lat: null, lng: null, qtd: 0 }
  ]);
  assert.match(r.postes[0].data_ult, /^\d{2}\/\d{2}\/\d{4}/);
  assert.equal(r.postes[1].data_ult, '');
});

/* ─────────────── Busca por protocolo e tentativa ─────────────── */

test('TN-14 [caixa-preta | fluxo principal] search busca o protocolo e devolve o registro no formato da lista', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({
    'GET /api/chamados/IC-261127-AB12C': ok({ protocolo: 'IC-261127-AB12C', tipo: 'apagado', status: 'em_atendimento', lat: -10.1, lng: -36.1, fotoUrl: '/fotos/c.jpg', criadoEm: '2026-11-27T12:00:00.000Z' })
  });
  const r = await executarAcao({ action: 'search', token: 'tok', protocolo: 'IC-261127-AB12C' }, { api });
  assert.deepEqual(chamadas[0], { metodo: 'GET', caminho: '/api/chamados/IC-261127-AB12C', corpo: undefined, token: 'tok' });
  assert.equal(r.success, true);
  assert.equal(r.record.protocolo, 'IC-261127-AB12C');
  assert.equal(r.record.status, 'Aguardando atendimento', 'em atendimento ainda pode ser fechado pela tela');
  assert.equal(r.record.foto, '/fotos/c.jpg');
  assert.match(r.record.data, /^\d{2}\/\d{2}\/\d{4}/);
});

test('TN-15 [caixa-preta | fluxo alternativo] search: protocolo inexistente dá registro nulo; sessão vencida avisa a tela', async () => {
  const { executarAcao } = await adaptador();
  const { api } = apiFalsa({
    'GET /api/chamados/IC-X': falha(404, 'NAO_ENCONTRADO', "Chamado 'IC-X' não encontrado."),
    'GET /api/chamados/IC-Y': falha(401, 'NAO_AUTENTICADO', 'Sessão inválida ou expirada.')
  });
  const inexistente = await executarAcao({ action: 'search', token: 'tok', protocolo: 'IC-X' }, { api });
  assert.equal(inexistente.success, true);
  assert.equal(inexistente.record, null);
  const vencida = await executarAcao({ action: 'search', token: 'tok', protocolo: 'IC-Y' }, { api });
  assert.deepEqual({ ...vencida }, { success: false, error: 'sessao_expirada' });
});

test('TN-16 [caixa-preta | risco: reenvio] attempt envia a tentativa com um operacao_id que se mantém no reenvio', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa({ 'POST /api/chamados/IC-1/tentativas': ok({ id: 1 }, 201) });
  const payload = { action: 'attempt', token: 'tok', protocolo: 'IC-1', tecnico: 'Carlos', motivo: 'Poste sem acesso, portão fechado',
    latitude: '-10.125300', longitude: '-36.175600', foto_base64: 'data:image/jpeg;base64,AAAA' };
  const r = await executarAcao(payload, { api });
  await executarAcao(payload, { api });
  assert.equal(r.success, true);
  const corpo = chamadas[0].corpo;
  assert.match(corpo.operacao_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(corpo, { operacao_id: corpo.operacao_id, motivo: 'Poste sem acesso, portão fechado',
    latitude: -10.1253, longitude: -36.1756, foto_base64: 'data:image/jpeg;base64,AAAA' });
  assert.equal(chamadas[1].corpo.operacao_id, corpo.operacao_id, 'o mesmo envio não pode virar duas tentativas');
  assert.equal(chamadas[0].token, 'tok');
});

test('TN-17 [caixa-preta | fluxo de exceção] attempt com sessão vencida avisa a tela; chamado fechado mostra o motivo', async () => {
  const { executarAcao } = await adaptador();
  const { api } = apiFalsa({
    'POST /api/chamados/IC-1/tentativas': falha(401, 'NAO_AUTENTICADO', 'Sessão inválida ou expirada.'),
    'POST /api/chamados/IC-2/tentativas': falha(409, 'CONFLITO', 'Chamado já foi fechado e não aceita novas tentativas.')
  });
  assert.equal((await executarAcao({ action: 'attempt', protocolo: 'IC-1', motivo: 'Sem acesso ao poste' }, { api })).error, 'sessao_expirada');
  assert.equal((await executarAcao({ action: 'attempt', protocolo: 'IC-2', motivo: 'Sem acesso ao poste' }, { api })).error,
    'Chamado já foi fechado e não aceita novas tentativas.');
});

/* ─────────────── Rede e ações desconhecidas ─────────────── */

test('TN-18 [caixa-preta | risco: rede] sem conexão o erro chega à tela, que mostra "Sem conexão"', async () => {
  const { executarAcao } = await adaptador();
  const { api } = apiFalsa({ 'GET /api/estoque': new TypeError('Failed to fetch') });
  await assert.rejects(executarAcao({ action: 'estoque_list', token: 't' }, { api }), /Failed to fetch/);
});

test('TN-19 [caixa-preta | partição inválida] ação desconhecida não chama a rede e responde que não está disponível', async () => {
  const { executarAcao } = await adaptador();
  const { api, chamadas } = apiFalsa();
  const r = await executarAcao({ action: 'acao_inventada' }, { api });
  assert.equal(r.success, false);
  assert.match(r.error, /não disponível/i);
  assert.deepEqual(chamadas, []);
});

test('TN-20 [caixa-branca] o tempo limite pedido pela tela chega ao ApiClient', async () => {
  const { executarAcao } = await adaptador();
  const recebidos = [];
  const api = async (caminho, opcoes) => { recebidos.push(opcoes.timeout); return ok([]); };
  await executarAcao({ action: 'estoque_list', token: 't' }, { api, timeout: 30000 });
  assert.deepEqual(recebidos, [30000]);
});
