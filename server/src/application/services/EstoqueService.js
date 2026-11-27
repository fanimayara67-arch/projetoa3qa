/**
 * CAMADA DE APLICAÇÃO — EstoqueService
 * Casos de uso do almoxarifado: gestão de itens, saída de missões e relatórios de materiais.
 */

const { emTransacao: defaultEmTransacao } = require('../../infrastructure/database/transacao');
const EstoqueRepoDefault = require('../../infrastructure/repositories/EstoqueRepository');
const ItemEstoque = require('../../domain/ItemEstoque');
const Missao = require('../../domain/Missao');
const { DadoInvalido, NaoEncontrado } = require('../errors');

async function listarEstoque(deps = {}) {
  const EstoqueRepo = deps.EstoqueRepo || EstoqueRepoDefault;
  const itens = await EstoqueRepo.listarItens();
  return itens.map(item => ({
    ...item,
    alertaMinimo: ItemEstoque.abaixoDoMinimo(item)
  }));
}

async function salvarItemEstoque(dados, deps = {}) {
  const EstoqueRepo = deps.EstoqueRepo || EstoqueRepoDefault;
  const validacao = ItemEstoque.validarItemEstoque(dados);
  if (!validacao.valido) {
    throw new DadoInvalido(validacao.erros.join(' '), validacao.erros);
  }
  return EstoqueRepo.salvarItem(dados);
}

async function excluirItemEstoque(nomeOuId, deps = {}) {
  const EstoqueRepo = deps.EstoqueRepo || EstoqueRepoDefault;
  const removido = await EstoqueRepo.removerItem(nomeOuId);
  if (!removido) throw new NaoEncontrado('Item de estoque não encontrado.');
  return removido;
}

async function registrarSaidaMissao(dados, usuarioId, deps = {}) {
  const emTransacao = deps.emTransacao || defaultEmTransacao;
  const EstoqueRepo = deps.EstoqueRepo || EstoqueRepoDefault;

  const validacao = Missao.validarMissao(dados);
  if (!validacao.valido) {
    throw new DadoInvalido(validacao.erros.join(' '), validacao.erros);
  }

  return emTransacao(async (tx) => {
    return EstoqueRepo.criarMissaoComItens(tx, {
      data: dados.data,
      equipe: dados.equipe,
      obs: dados.obs,
      criadoPor: usuarioId,
      itens: dados.itens
    });
  });
}

async function listarMissoes(deps = {}) {
  const EstoqueRepo = deps.EstoqueRepo || EstoqueRepoDefault;
  return EstoqueRepo.listarMissoes();
}

/**
 * Registra o material que voltou de uma missão e devolve ao estoque (UC07).
 * `retornos`: [{ nome | item_id, qtd_retorno }]. Um retorno já registrado pode ser corrigido:
 * só a diferença entra no saldo, então reenviar o mesmo retorno não credita de novo.
 */
async function registrarRetornoMissao(missaoId, retornos, deps = {}) {
  const emTransacao = deps.emTransacao || defaultEmTransacao;
  const EstoqueRepo = deps.EstoqueRepo || EstoqueRepoDefault;

  if (!Array.isArray(retornos) || retornos.length === 0) {
    throw new DadoInvalido('Informe o retorno de pelo menos um item da missão.');
  }

  return emTransacao(async (tx) => {
    const missao = await EstoqueRepo.buscarMissaoParaAtualizar(tx, missaoId);
    if (!missao) throw new NaoEncontrado('Missão não encontrada.');

    const itensMissao = await EstoqueRepo.listarItensDaMissao(tx, missaoId);
    const pares = parearRetornos(itensMissao, retornos);

    // O domínio compara pela mesma chave dos dois lados: o id do item no estoque.
    const validacao = Missao.validarRetornoMissao(
      itensMissao.map(i => ({ item_id: i.item_id, qtd_saida: i.qtd_saida })),
      pares.map(({ item, ret }) => ({ item_id: item.item_id, qtd_retorno: ret.qtd_retorno }))
    );
    if (!validacao.valido) {
      throw new DadoInvalido(trocarIdPorNome(validacao.erros.join(' '), itensMissao), validacao.erros);
    }

    for (const { item, ret } of pares) {
      const qtd = Number(ret.qtd_retorno);
      const diferenca = qtd - (Number(item.qtd_retorno) || 0);
      if (diferenca !== 0) await EstoqueRepo.creditarSaldo(tx, item.item_id, diferenca);
      await EstoqueRepo.registrarRetornoItem(tx, missaoId, item.item_id, qtd);
    }
    return { missao_id: Number(missaoId), itens: pares.length };
  });
}

/** Liga cada retorno ao item da missão (pelo id ou pelo nome). Item que não saiu é recusado. */
function parearRetornos(itensMissao, retornos) {
  return retornos.map(ret => {
    const item = itensMissao.find(i =>
      (ret.item_id != null && String(i.item_id) === String(ret.item_id)) || (ret.nome && i.nome === ret.nome));
    if (!item) {
      throw new DadoInvalido(`O item '${ret.nome || ret.item_id}' não saiu nesta missão.`);
    }
    return { item, ret };
  });
}

/** Mensagem do domínio cita o id do item; para quem usa a tela, o nome é o que importa. */
function trocarIdPorNome(mensagem, itensMissao) {
  return itensMissao.reduce(
    (texto, i) => texto.split(`do item ${i.item_id}.`).join(`do item ${i.nome}.`),
    mensagem
  );
}

module.exports = {
  registrarRetornoMissao,
  listarEstoque,
  salvarItemEstoque,
  excluirItemEstoque,
  registrarSaidaMissao,
  listarMissoes
};
