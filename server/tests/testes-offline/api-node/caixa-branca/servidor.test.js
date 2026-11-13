/**
 * CAIXA-BRANCA — Lado servidor da sincronização offline na API Node
 *
 * O que a API faz quando o aparelho reenvia um reporte ou um fechamento:
 * validação da mensagem, idempotência (mesmo id / mesmo operacao_id não
 * duplica) e a tradução de erros para HTTP. Os serviços recebem os
 * repositórios por injeção de dependência (parâmetro `deps`), então os testes
 * usam Fakes em memória sem alterar nenhum módulo.
 *
 * CBN-60 a CBN-79. Padrão: Preparação → Ação → Verificação.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../../../../src');
const Chamado = require(`${SRC}/domain/Chamado`);
const Fechamento = require(`${SRC}/domain/Fechamento`);
const ChamadoService = require(`${SRC}/application/services/ChamadoService`);
const FechamentoService = require(`${SRC}/application/services/FechamentoService`);
const tratarErros = require(`${SRC}/presentation/middlewares/tratarErros`);
const { criarServidorTeste, PIN_TESTE } = require('../../apoio/servidor-teste');

/* ───────────── Fakes em memória ───────────── */

function fakes(chamadosIniciais = []) {
  const chamados = chamadosIniciais.map((c) => ({ ...c }));
  const fechamentos = [];
  const baixas = [];
  const fotos = [];
  const dup = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
  return {
    chamados, fechamentos, baixas, fotos,
    deps: {
      emTransacao: async (op) => op({}),
      FotoStorage: { salvar: async (f) => { if (f) fotos.push(f); return f ? '/fotos/x.jpg' : null; } },
      PosteRepo: {
        garantirExistencia: async (_tx, id) => ({ id, latitude: -10.2, longitude: -36.2, endereco: 'Rua do Poste' }),
        atualizarConfiguracao: async () => {}
      },
      ChamadoRepo: {
        async criarOuRetornarExistente(_tx, dd) {
          const porId = chamados.find((c) => c.id === dd.id);
          if (porId) return porId;
          if (chamados.some((c) => c.protocolo === dd.protocolo)) throw dup();
          const novo = { ...dd, status: 'aberto' };
          chamados.push(novo);
          return novo;
        },
        buscarParaAtualizar: async (_tx, p) => chamados.find((c) => c.protocolo === p) || null,
        mudarStatus: async (_tx, id, s) => { const c = chamados.find((x) => x.id === id); if (c) c.status = s; }
      },
      FechamentoRepo: {
        buscarPorOperacaoId: async (_tx, op) => fechamentos.find((f) => f.operacao_id === op) || null,
        inserir: async (_tx, dd) => { const f = { id: fechamentos.length + 1, operacao_id: dd.operacaoId, chamado_id: dd.chamadoId, status: dd.status }; fechamentos.push(f); return f; }
      },
      EstoqueRepo: { baixarMateriais: async (_tx, id, mats) => { baixas.push({ id, mats }); } }
    }
  };
}

// A foto é obrigatória desde o UC01 (D-01), então o reporte de exemplo leva uma foto pequena.
const reporte = (extra = {}) => ({ id: crypto.randomUUID(), protocolo: 'IC-261112-AAAAA', tipo: 'apagado', lat: -10.12, lng: -36.17, foto_base64: 'data:image/jpeg;base64,AAAA', ...extra });
// UC05: o fechamento de exemplo leva foto do reparo e GPS com precisão, obrigatórios desde o PR do UC05.
const fechamento = (extra = {}) => ({ operacao_id: crypto.randomUUID(), status: 'Concluído', servico: 'Troca de lâmpada', foto_reparo_base64: 'data:image/jpeg;base64,AAAA', lat: -10.1253, lng: -36.1756, precisao_m: 8, ...extra });

/* ───────────── Domínio: Chamado.coordenadasValidas (valor limite) ───────────── */

test('CBN-60 coordenadasValidas: limites do globo (±90 e ±180) são aceitos; um passo além é recusado', () => {
  assert.equal(Chamado.coordenadasValidas(90, 180), true);
  assert.equal(Chamado.coordenadasValidas(-90, -180), true);
  assert.equal(Chamado.coordenadasValidas(90.0001, 0.5), false);
  assert.equal(Chamado.coordenadasValidas(0.5, -180.0001), false);
});

test('CBN-61 coordenadasValidas: o ponto (0,0) é recusado; 0,0001 já é aceito', () => {
  assert.equal(Chamado.coordenadasValidas(0.00009, 0.00009), false);
  assert.equal(Chamado.coordenadasValidas(0.0001, 0), true);
});

test('CBN-62 coordenadasValidas: valores vazios, nulos ou não numéricos são recusados', () => {
  for (const [la, ln] of [[null, 1], [1, null], ['', 1], [1, ''], ['abc', 1], [1, NaN], [Infinity, 1]]) {
    assert.equal(Chamado.coordenadasValidas(la, ln), false, `${la}, ${ln}`);
  }
  assert.equal(Chamado.coordenadasValidas('-10.12', '-36.17'), true, 'texto numérico é aceito');
});

/* ───────────── Domínio: Chamado.validarNovoChamado ───────────── */

test('CBN-63 validarNovoChamado: reporte completo é válido', () => {
  assert.deepEqual(Chamado.validarNovoChamado(reporte()), { valido: true, erros: [] });
});

test('CBN-64 validarNovoChamado: sem id (como o app envia hoje) é inválido', () => {
  const { id, ...semId } = reporte();
  const r = Chamado.validarNovoChamado(semId);
  assert.equal(r.valido, false);
  assert.match(r.erros.join(' '), /id\) do chamado é obrigatório/);
});

test('CBN-65 validarNovoChamado: id que não é texto, sem protocolo e tipo em branco geram um erro cada', () => {
  const r = Chamado.validarNovoChamado({ id: 123, tipo: '   ', lat: -10.12, lng: -36.17, foto_base64: 'data:image/jpeg;base64,AAAA' });
  assert.equal(r.erros.length, 3);
});

test('CBN-66 validarNovoChamado: sem GPS válido só é aceito com o poste do QR', () => {
  assert.equal(Chamado.validarNovoChamado(reporte({ lat: null, lng: null })).valido, false);
  assert.equal(Chamado.validarNovoChamado(reporte({ lat: null, lng: null, poste_id: 'P-0007' })).valido, true);
  assert.equal(Chamado.validarNovoChamado(reporte({ lat: null, lng: null, poste_id: '   ' })).valido, false);
});

/* ───────────── Aplicação: ChamadoService.criarChamado ───────────── */

test('CBN-67 criarChamado: dados inválidos são recusados antes de salvar foto ou gravar', async () => {
  const f = fakes();
  await assert.rejects(ChamadoService.criarChamado({ protocolo: 'IC-1', tipo: 'apagado', foto_base64: 'x' }, f.deps), { name: 'DadoInvalido', status: 400 });
  assert.equal(f.fotos.length, 0);
  assert.equal(f.chamados.length, 0);
});

test('CBN-68 criarChamado: o mesmo reporte enviado duas vezes (mesmo id) gera um único chamado', async () => {
  const f = fakes();
  const r = reporte();
  const primeiro = await ChamadoService.criarChamado(r, f.deps);
  const segundo = await ChamadoService.criarChamado(r, f.deps);
  assert.equal(f.chamados.length, 1);
  assert.equal(segundo, primeiro);
});

test('CBN-69 criarChamado: mesmo protocolo com outro id é conflito (409) e não duplica', async () => {
  const f = fakes();
  await ChamadoService.criarChamado(reporte(), f.deps);
  let erro;
  await ChamadoService.criarChamado(reporte(), f.deps).catch((e) => { erro = e; });
  assert.equal(erro && erro.code, 'ER_DUP_ENTRY');
  const res = respostaFalsa();
  tratarErros(erro, {}, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error.codigo, 'CONFLITO');
  assert.equal(f.chamados.length, 1);
});

test('CBN-70 criarChamado: pelo QR sem GPS, usa as coordenadas e o endereço do poste', async () => {
  const f = fakes();
  const c = await ChamadoService.criarChamado(reporte({ lat: null, lng: null, poste_id: 'p-0007' }), f.deps);
  assert.equal(c.latitude, -10.2);
  assert.equal(c.endereco, 'Rua do Poste');
  assert.ok(c.posteId, 'poste vinculado na mesma transação');
});

/* ───────────── Aplicação: FechamentoService.fecharChamado ───────────── */

const aberto = () => ({ id: 'c1', protocolo: 'IC-261112-T01', status: 'aberto', latitude: -10.1, longitude: -36.1, poste_id: null });

test('CBN-71 fecharChamado: reenvio com o mesmo operacao_id não fecha de novo nem baixa o estoque duas vezes (CA04)', async () => {
  const f = fakes([aberto()]);
  const dados = fechamento({ materiais_os: [{ nome: 'Lâmpada', quantidade: 1 }] });
  const a = await FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados }, f.deps);
  const b = await FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados }, f.deps);
  assert.equal(b, a);
  assert.equal(f.fechamentos.length, 1);
  assert.equal(f.baixas.length, 1);
});

test('CBN-72 fecharChamado: chamado já fechado por outra operação é conflito (409)', async () => {
  const f = fakes([{ ...aberto(), status: 'fechado' }]);
  await assert.rejects(FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados: fechamento() }, f.deps), { name: 'Conflito' });
});

test('CBN-73 fecharChamado: chamado inexistente é 404', async () => {
  const f = fakes([]);
  await assert.rejects(FechamentoService.fecharChamado({ protocolo: 'IC-X', tecnicoId: 1, dados: fechamento() }, f.deps), { name: 'NaoEncontrado' });
});

test('CBN-74 fecharChamado: sem operacao_id (como o app envia hoje) é recusado', async () => {
  const f = fakes([aberto()]);
  await assert.rejects(FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados: fechamento({ operacao_id: undefined }) }, f.deps), { status: 400 });
  assert.equal(f.fechamentos.length, 0);
});

test('CBN-75 validarFechamentoCampo: valor limite da quantidade de material (0 recusa, 1 aceita)', () => {
  assert.equal(Fechamento.validarFechamentoCampo(fechamento({ materiais_os: [{ nome: 'Relé', quantidade: 0 }] })).valido, false);
  assert.equal(Fechamento.validarFechamentoCampo(fechamento({ materiais_os: [{ nome: 'Relé', quantidade: 1 }] })).valido, true);
  assert.equal(Fechamento.validarFechamentoCampo(fechamento({ materiais_os: [{ quantidade: 1 }] })).valido, false, 'material sem identificação');
  const porCodigo = Fechamento.validarFechamentoCampo(fechamento({ materiais_os: [{ item_id: 'REL-01', quantidade: -1 }] }));
  assert.match(porCodigo.erros.join(' '), /material REL-01/, 'a mensagem usa o código quando não há nome');
});

/* ───────────── Apresentação: a API recebendo o que o app manda ───────────── */

async function comApi(fn) {
  const srv = await criarServidorTeste({ servidor: 'api-node' });
  try { return await fn(srv); } finally { await srv.fechar(); }
}

test('CBN-76 API: corpo em formulário (como o app do cidadão envia) é recusado com 400 JSON_INVALIDO', () => comApi(async (srv) => {
  const r = await fetch(srv.url + '/api/chamados', { method: 'POST', body: new URLSearchParams({ payload: JSON.stringify(reporte()) }) });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.codigo, 'JSON_INVALIDO');
}));

test('CBN-77 API: JSON sem id é recusado com 400 e o campo é apontado', () => comApi(async (srv) => {
  const { id, ...semId } = reporte();
  const r = await fetch(srv.url + '/api/chamados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(semId) });
  const corpo = await r.json();
  assert.equal(r.status, 400);
  assert.match(corpo.error.mensagem, /id/);
}));

test('CBN-78 API: JSON com id é aceito (201) e o reenvio devolve o mesmo chamado sem duplicar', () => comApi(async (srv) => {
  const dados = reporte({ protocolo: 'IC-261112-REENV' });
  const enviar = () => fetch(srv.url + '/api/chamados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
  const r1 = await enviar();
  const r2 = await enviar();
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  assert.equal(srv.estado.chamados.filter((c) => c.protocolo === 'IC-261112-REENV').length, 1);
}));

test('CBN-79 API: POST /api (para onde o técnico envia) não existe; a rota certa exige Bearer', () => comApi(async (srv) => {
  const errada = await fetch(srv.url + '/api', { method: 'POST', body: JSON.stringify({ action: 'close', protocolo: 'IC-261112-T01' }) });
  assert.equal(errada.status, 404);
  assert.equal((await errada.json()).error.codigo, 'ROTA_NAO_ENCONTRADA');
  const semToken = await fetch(srv.url + '/api/chamados/IC-261112-T01/fechamento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fechamento()) });
  assert.equal(semToken.status, 401);
  const login = await fetch(srv.url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN_TESTE }) }).then((r) => r.json());
  const certa = await fetch(srv.url + '/api/chamados/IC-261112-T01/fechamento', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.data.token }, body: JSON.stringify(fechamento())
  });
  assert.equal(certa.status, 201);
}));

test('CBN-80 API: corpo vazio vira {} e a validação aponta os campos que faltam', () => comApi(async (srv) => {
  const r = await fetch(srv.url + '/api/chamados', { method: 'POST' });
  const corpo = await r.json();
  assert.equal(r.status, 400);
  assert.match(corpo.error.mensagem, /id, protocolo, tipo/);
}));

test('CBN-81 API: corpo acima de 8 MB (ex.: foto sem compressão) é recusado com 413', () => comApi(async (srv) => {
  const grande = JSON.stringify(reporte({ foto_base64: 'A'.repeat(8 * 1024 * 1024 + 10) }));
  const r = await fetch(srv.url + '/api/chamados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: grande });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error.codigo, 'PAYLOAD_MUITO_GRANDE');
}));

test('CBN-82 middlewareValidacao: sem corpo nenhum (req.body ausente) aponta todos os campos', () => {
  const validar = require(`${SRC}/presentation/middlewares/validar`);
  let erro;
  validar(['id', 'protocolo'])({}, {}, (e) => { erro = e; });
  assert.equal(erro.status, 400);
  assert.deepEqual(erro.detalhes, ["O campo 'id' é obrigatório.", "O campo 'protocolo' é obrigatório."]);
});

test('CBN-83 tratarErros: banco fora do ar vira 503; erro inesperado vira 500 sem expor detalhes', () => {
  const r1 = respostaFalsa();
  tratarErros(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), {}, r1);
  assert.equal(r1.statusCode, 503);
  assert.equal(r1.body.error.codigo, 'SERVICO_INDISPONIVEL');
  const r2 = respostaFalsa();
  tratarErros(new Error('detalhe interno do SQL'), {}, r2);
  assert.equal(r2.statusCode, 500);
  assert.equal(r2.body.error.mensagem, 'Erro interno no servidor.');
  const r3 = respostaFalsa();
  tratarErros(Object.assign(new Error(''), { status: 422 }), {}, r3);
  assert.deepEqual([r3.statusCode, r3.body.error.codigo, r3.body.error.mensagem], [422, 'ERRO_INTERNO', 'Erro ao processar requisição.']);
});

test('CBN-84 criarChamado: pelo QR com GPS do aparelho, mantém o GPS e completa o endereço pelo poste', async () => {
  const f = fakes();
  const c = await ChamadoService.criarChamado(reporte({ poste_id: 'P-0007' }), f.deps);
  assert.equal(c.latitude, -10.12);
  assert.equal(c.endereco, 'Rua do Poste');
  const comEndereco = await ChamadoService.criarChamado(reporte({ id: crypto.randomUUID(), protocolo: 'IC-261112-BBBBB', poste_id: 'P-0008', endereco: 'Rua Informada' }), f.deps);
  assert.equal(comEndereco.endereco, 'Rua Informada');
});

test('CBN-85 fecharChamado: com poste identificado, atualiza a ficha do poste na mesma transação', async () => {
  const f = fakes([aberto()]);
  const atualizados = [];
  f.deps.PosteRepo.atualizarConfiguracao = async (_tx, id, cfg) => { atualizados.push({ id, cfg }); };
  await FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados: fechamento({ poste_id: 'p-0007', config: { braco: '1m' } }) }, f.deps);
  assert.equal(atualizados.length, 1);
  assert.equal(atualizados[0].cfg.braco, '1m');
  // Revisado no UC05: o GPS do fechamento é obrigatório (passo 6), então o poste recebe as coordenadas do técnico.
  assert.equal(atualizados[0].cfg.latitude, -10.1253, 'usa o GPS do fechamento');
  const outro = fakes([{ ...aberto(), poste_id: 'P-0009' }]);
  const vistos = [];
  outro.deps.PosteRepo.atualizarConfiguracao = async (_tx, id, cfg) => { vistos.push({ id, cfg }); };
  await FechamentoService.fecharChamado({ protocolo: 'IC-261112-T01', tecnicoId: 1, dados: fechamento({ lat: -10.3 }) }, outro.deps);
  assert.equal(vistos[0].id, 'P-0009', 'sem poste no fechamento, usa o poste do chamado');
  assert.equal(vistos[0].cfg.latitude, -10.3);
  assert.equal(vistos[0].cfg.braco, undefined, 'sem configuração informada, nada é inventado');
});

test('CBN-86 validarFechamentoCampo: sem status e sem serviço gera um erro para cada', () => {
  const r = Fechamento.validarFechamentoCampo(fechamento({ operacao_id: 'op-1', status: '  ', servico: '' }));
  assert.equal(r.valido, false);
  assert.equal(r.erros.length, 2);
  assert.match(r.erros.join(' '), /Status de resolução/);
  assert.match(r.erros.join(' '), /Descrição do serviço/);
});

/* ── Testes acrescentados depois da 1ª rodada de mutação (mutantes sobreviventes) ── */

test('CBN-87 coordenadasValidas: valor limite dos dois lados de cada eixo e perto do zero', () => {
  assert.equal(Chamado.coordenadasValidas(-90.0001, 0.5), false);
  assert.equal(Chamado.coordenadasValidas(0.5, 180.0001), false);
  assert.equal(Chamado.coordenadasValidas(0, 0.0001), true, 'só a longitude fora do zero');
  assert.equal(Chamado.coordenadasValidas(0.1, 0.1), true);
  assert.equal(Chamado.coordenadasValidas(0.5, 0.5), true);
});

test('CBN-88 validações recusam campos com tipo errado (número no lugar de texto)', () => {
  assert.equal(Chamado.validarNovoChamado(reporte({ protocolo: 123 })).valido, false);
  assert.equal(Chamado.validarNovoChamado(reporte({ tipo: 5 })).valido, false);
  for (const campo of ['operacao_id', 'status', 'servico']) {
    assert.equal(Fechamento.validarFechamentoCampo(fechamento({ [campo]: 7 })).valido, false, campo);
  }
  assert.equal(Fechamento.validarFechamentoCampo(fechamento({ servico: '   ' })).valido, false, 'serviço só com espaços');
});

test('CBN-89 criarChamado: repassa foto, telefone, navegador e horário que o app envia', async () => {
  const f = fakes();
  const c = await ChamadoService.criarChamado(reporte({
    foto_base64: 'data:image/jpeg;base64,AAAA', tel: '82999990000', user_agent: 'Chrome teste', timestamp: '2026-11-12T10:00:00.000Z'
  }), f.deps);
  assert.deepEqual(f.fotos, ['data:image/jpeg;base64,AAAA']);
  assert.equal(c.fotoUrl, '/fotos/x.jpg');
  assert.equal(c.telefone, '82999990000');
  assert.equal(c.userAgent, 'Chrome teste');
  assert.equal(c.criadoEm, '2026-11-12T10:00:00.000Z');
});

test('CBN-90 criarChamado: pelo QR com só a latitude, completa as coordenadas pelo poste', async () => {
  const f = fakes();
  const c = await ChamadoService.criarChamado(reporte({ lng: null, poste_id: 'P-0007' }), f.deps);
  assert.deepEqual([c.latitude, c.longitude], [-10.2, -36.2]);
});

test('CBN-91 fecharChamado: grava foto, data e materiais informados e marca o poste no chamado', async () => {
  const f = fakes([aberto()]);
  const inseridos = [];
  const status = [];
  const postes = [];
  const inserirOriginal = f.deps.FechamentoRepo.inserir;
  f.deps.FechamentoRepo.inserir = async (tx, dd) => { inseridos.push(dd); return inserirOriginal(tx, dd); };
  f.deps.ChamadoRepo.mudarStatus = async (_tx, id, s, poste) => { status.push({ s, poste }); };
  f.deps.PosteRepo.atualizarConfiguracao = async (_tx, id, cfg) => { postes.push(cfg); };
  const mats = [{ nome: 'Lâmpada', quantidade: 2 }];
  await FechamentoService.fecharChamado({
    protocolo: 'IC-261112-T01', tecnicoId: 1,
    dados: fechamento({ poste_id: 'P-0007', foto_reparo_base64: 'data:image/jpeg;base64,BBBB', data_fechamento: '2026-11-12T11:00:00.000Z', materiais_os: mats })
  }, f.deps);
  assert.deepEqual(f.fotos, ['data:image/jpeg;base64,BBBB']);
  assert.equal(postes[0].foto_ref_url, '/fotos/x.jpg');
  assert.equal(inseridos[0].dataFechamento, '2026-11-12T11:00:00.000Z');
  assert.equal(inseridos[0].administrativo, false, 'fechamento de campo não é administrativo');
  assert.deepEqual(f.baixas[0].mats, mats);
  assert.deepEqual(status, [{ s: 'fechado', poste: 'P-0007' }]);
});

test('CBN-92 API: um único campo faltando (ou vazio, ou nulo) já é recusado', () => comApi(async (srv) => {
  for (const valor of [undefined, '', null]) {
    const dados = reporte({ protocolo: valor });
    const r = await fetch(srv.url + '/api/chamados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
    assert.equal(r.status, 400, `protocolo = ${JSON.stringify(valor)}`);
    assert.match((await r.json()).error.mensagem, /protocolo/);
  }
}));

test('CBN-93 API: valor limite do corpo — exatamente 8 MB é aceito', () => comApi(async (srv) => {
  const limite = 8 * 1024 * 1024;
  // O limite testado aqui é o do corpo HTTP (8 MB). A foto em si é limitada a 2 MB pelo UC01 (D-04),
  // então o volume vai num campo que a API ignora, para o teste continuar medindo só o limite do corpo.
  const base = JSON.stringify(reporte({ protocolo: 'IC-261112-LIMIT', preenchimento: '' }));
  const corpo = base.replace('"preenchimento":""', `"preenchimento":"${'A'.repeat(limite - Buffer.byteLength(base))}"`);
  assert.equal(Buffer.byteLength(corpo), limite);
  const r = await fetch(srv.url + '/api/chamados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo });
  assert.equal(r.status, 201);
}));

function respostaFalsa() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
