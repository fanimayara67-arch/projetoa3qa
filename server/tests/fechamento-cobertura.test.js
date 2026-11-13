/**
 * UC03 — Caixa-branca do fechamento (FechamentoController, FechamentoService e ApiClient).
 *
 * Os casos foram escolhidos a partir do relatório de cobertura: cada um exercita
 * linhas ou ramos que a suíte do grupo ainda não alcançava. Todos chamam o código
 * real do projeto; só o banco (repositórios) e a rede (fetch) são simulados.
 *
 * Linhas/ramos alvo (antes deste arquivo):
 * - FechamentoController.js: linhas 9-20 (fechar) sem cobertura;
 * - FechamentoService.js: 34-35 (dados inválidos) e 43-44 (reenvio da mesma operação);
 * - ApiClient.js: 22-23 (token) e 38-39 (resposta que não é JSON), 18% dos ramos.
 */

const test = require('node:test');
const { describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const FechamentoController = require('../src/presentation/controllers/FechamentoController');
const FechamentoService = require('../src/application/services/FechamentoService');

const URL_API_CLIENT = pathToFileURL(path.resolve(__dirname, '../../public/shared/infrastructure/ApiClient.js')).href;
const OPERACAO = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

/* ─── apoio ─── */

function respostaFalsa() {
  return {
    statusCode: null,
    corpo: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(corpo) { this.corpo = corpo; return this; }
  };
}

/** Repositórios em memória para o FechamentoService (injeção pelo parâmetro deps). */
function bancoFalso({ fechamentoExistente = null, chamado = { id: 10, protocolo: 'IC-1', status: 'aberto', poste_id: null } } = {}) {
  const chamadas = [];
  return {
    chamadas,
    deps: {
      emTransacao: async (operacao) => operacao({ tx: true }),
      FotoStorage: { salvar: async (foto) => (foto ? '/fotos/reparo.jpg' : null) },
      FechamentoRepo: {
        buscarPorOperacaoId: async (_tx, id) => { chamadas.push(['buscarPorOperacaoId', id]); return fechamentoExistente; },
        inserir: async (_tx, dados) => { chamadas.push(['inserir', dados.operacaoId]); return { id: 1, operacao_id: dados.operacaoId }; }
      },
      ChamadoRepo: {
        buscarParaAtualizar: async () => { chamadas.push(['buscarParaAtualizar']); return chamado; },
        mudarStatus: async (_tx, id, status) => { chamadas.push(['mudarStatus', status]); }
      },
      EstoqueRepo: { baixarMateriais: async () => { chamadas.push(['baixarMateriais']); } },
      PosteRepo: { atualizarConfiguracao: async () => { chamadas.push(['atualizarConfiguracao']); } }
    }
  };
}

const fechamentoValido = (extra = {}) => ({ operacao_id: OPERACAO, status: 'Resolvido', servico: 'Troca de lâmpada', ...extra });

/** fetch falso: devolve o texto e o status pedidos e guarda o que recebeu. */
function fetchFalso({ status = 200, texto = '{"ok":true,"data":{}}' } = {}) {
  const recebido = {};
  const impl = async (url, opcoes) => {
    recebido.url = url;
    recebido.opcoes = opcoes;
    return { ok: status >= 200 && status < 300, status, text: async () => texto };
  };
  return { impl, recebido };
}

/* ─── FechamentoController ─── */

describe('UC03 - Caixa-branca: FechamentoController', () => {
  test('FA-CB01: fechar repassa protocolo, técnico e corpo ao serviço e responde 201 no formato padrão', async (t) => {
    const servico = t.mock.method(FechamentoService, 'fecharChamado', async () => ({ id: 5, status: 'Resolvido' }));
    const req = { params: { protocolo: 'IC-1' }, usuario: { id: 3 }, body: fechamentoValido() };
    const res = respostaFalsa();
    let erro;

    await FechamentoController.fechar(req, res, (e) => { erro = e; });

    assert.equal(erro, undefined);
    assert.deepEqual(servico.mock.calls[0].arguments[0], { protocolo: 'IC-1', tecnicoId: 3, dados: req.body });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.corpo, { success: true, ok: true, data: { id: 5, status: 'Resolvido' } });
  });

  test('FA-CB02: fechar entrega ao next o erro do serviço e não escreve resposta', async (t) => {
    const falha = new Error('Chamado já foi fechado por outro técnico.');
    t.mock.method(FechamentoService, 'fecharChamado', async () => { throw falha; });
    const res = respostaFalsa();
    let erro;

    await FechamentoController.fechar({ params: { protocolo: 'IC-1' }, usuario: { id: 3 }, body: {} }, res, (e) => { erro = e; });

    assert.equal(erro, falha);
    assert.equal(res.statusCode, null);
  });

  test('FA-CB03: fecharAdmin repassa o gestor como gestorId e entrega o erro ao next', async (t) => {
    const servico = t.mock.method(FechamentoService, 'fecharChamadoAdmin', async () => ({ id: 9 }));
    const res = respostaFalsa();
    await FechamentoController.fecharAdmin({ params: { protocolo: 'IC-2' }, usuario: { id: 7 }, body: { status: 'Concluído' } }, res, () => {});
    assert.deepEqual(servico.mock.calls[0].arguments[0], { protocolo: 'IC-2', gestorId: 7, dados: { status: 'Concluído' } });
    assert.equal(res.statusCode, 201);

    const falha = new Error('negado');
    servico.mock.mockImplementation(async () => { throw falha; });
    let erro;
    await FechamentoController.fecharAdmin({ params: { protocolo: 'IC-2' }, usuario: { id: 7 }, body: {} }, respostaFalsa(), (e) => { erro = e; });
    assert.equal(erro, falha);
  });
});

/* ─── FechamentoService ─── */

describe('UC03 - Caixa-branca: FechamentoService.fecharChamado', () => {
  test('FA-CB04: dados de fechamento nulos ou incompletos geram DadoInvalido (400) antes de abrir a transação', async () => {
    const banco = bancoFalso();
    for (const dados of [null, {}, { status: 'Resolvido' }]) {
      await assert.rejects(
        FechamentoService.fecharChamado({ protocolo: 'IC-1', tecnicoId: 3, dados }, banco.deps),
        { name: 'DadoInvalido', status: 400 }
      );
    }
    assert.deepEqual(banco.chamadas, [], 'nenhum acesso ao banco com dados inválidos');
  });

  test('FA-CB05: reenvio da mesma operacao_id devolve o fechamento existente sem inserir nem baixar estoque', async () => {
    const existente = { id: 1, operacao_id: OPERACAO, status: 'Resolvido' };
    const banco = bancoFalso({ fechamentoExistente: existente });

    const resultado = await FechamentoService.fecharChamado({ protocolo: 'IC-1', tecnicoId: 3, dados: fechamentoValido() }, banco.deps);

    assert.equal(resultado, existente);
    assert.deepEqual(banco.chamadas, [['buscarPorOperacaoId', OPERACAO]]);
  });

  test('FA-CB06: chamado inexistente gera NaoEncontrado (404) e chamado já fechado gera Conflito (409)', async () => {
    await assert.rejects(
      FechamentoService.fecharChamado({ protocolo: 'IC-X', tecnicoId: 3, dados: fechamentoValido() }, bancoFalso({ chamado: null }).deps),
      { name: 'NaoEncontrado', status: 404 }
    );
    await assert.rejects(
      FechamentoService.fecharChamado({ protocolo: 'IC-1', tecnicoId: 3, dados: fechamentoValido() }, bancoFalso({ chamado: { id: 10, status: 'fechado' } }).deps),
      { name: 'Conflito', status: 409 }
    );
  });
});

/* ─── ApiClient ─── */

describe('UC03 - Caixa-branca: ApiClient (envio do fechamento pelo aparelho)', () => {
  test('FA-CB07: com token, envia Authorization Bearer; o corpo vai em JSON e o método é respeitado', async () => {
    const { api } = await import(URL_API_CLIENT);
    const { impl, recebido } = fetchFalso();

    const resposta = await api('/api/chamados/IC-1/fechamento', { method: 'POST', body: fechamentoValido(), token: 'abc', fetchImpl: impl });

    assert.equal(recebido.opcoes.method, 'POST');
    assert.equal(recebido.opcoes.headers.Authorization, 'Bearer abc');
    assert.deepEqual(JSON.parse(recebido.opcoes.body), fechamentoValido());
    assert.equal(resposta.ok, true);
    assert.equal(resposta.status, 200);
  });

  test('FA-CB08: sem token não envia Authorization e sem corpo não envia body', async () => {
    const { api } = await import(URL_API_CLIENT);
    const { impl, recebido } = fetchFalso();
    await api('/api/chamados', { fetchImpl: impl });
    assert.equal('Authorization' in recebido.opcoes.headers, false);
    assert.equal(recebido.opcoes.body, undefined);
    assert.equal(recebido.opcoes.method, 'GET');
  });

  test('FA-CB09: resposta que não é JSON vira erro RESPOSTA_INVALIDA com ok=false', async () => {
    const { api } = await import(URL_API_CLIENT);
    const { impl } = fetchFalso({ status: 502, texto: '<html>Bad Gateway</html>' });
    const resposta = await api('/api/chamados', { fetchImpl: impl });
    assert.equal(resposta.ok, false);
    assert.equal(resposta.status, 502);
    assert.equal(resposta.error.codigo, 'RESPOSTA_INVALIDA');
  });

  test('FA-CB10: HTTP 200 com ok=false ou success=false no corpo não é tratado como sucesso; corpo vazio vira {}', async () => {
    const { api } = await import(URL_API_CLIENT);
    assert.equal((await api('/x', { fetchImpl: fetchFalso({ texto: '{"ok":false}' }).impl })).ok, false);
    assert.equal((await api('/x', { fetchImpl: fetchFalso({ texto: '{"success":false}' }).impl })).ok, false);
    const vazio = await api('/x', { fetchImpl: fetchFalso({ status: 204, texto: '' }).impl });
    assert.equal(vazio.ok, true);
    assert.equal(vazio.status, 204);
  });

  test('FA-CB11: usa window.ILUMINA.API_URL como base (sem barra dupla) e mantém endereço absoluto como está', async (t) => {
    const { api } = await import(URL_API_CLIENT);
    globalThis.window = { ILUMINA: { API_URL: 'https://api.exemplo.test/' } };
    t.after(() => { delete globalThis.window; });

    const relativo = fetchFalso();
    await api('/api/chamados', { fetchImpl: relativo.impl });
    assert.equal(relativo.recebido.url, 'https://api.exemplo.test/api/chamados');

    const absoluto = fetchFalso();
    await api('https://outro.test/api/x', { fetchImpl: absoluto.impl });
    assert.equal(absoluto.recebido.url, 'https://outro.test/api/x');
  });

  test('FA-CB12: sem resposta dentro do timeout, a requisição é abortada', async () => {
    const { api } = await import(URL_API_CLIENT);
    const nuncaResponde = (_url, { signal }) => new Promise((_ok, falha) => {
      signal.addEventListener('abort', () => falha(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    await assert.rejects(api('/api/chamados', { timeout: 20, fetchImpl: nuncaResponde }), { name: 'AbortError' });
  });
});
