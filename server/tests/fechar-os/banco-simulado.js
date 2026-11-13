/**
 * Banco simulado para os testes de serviço e de API do UC05.
 *
 * Responde às consultas SQL que os repositórios reais fazem no fechamento (chamados,
 * fechamentos, itens_estoque, fechamento_materiais e postes), com as restrições que
 * importam para o caso de uso:
 * - `fechamentos.operacao_id` e `fechamentos.chamado_id` são únicos (ER_DUP_ENTRY);
 * - `fechamento_materiais` tem chave (fechamento_id, item_id) e o INSERT usa
 *   `ON DUPLICATE KEY UPDATE quantidade = novo.quantidade`, como no MySQL;
 * - BEGIN guarda uma cópia das tabelas e ROLLBACK a restaura, então dá para verificar
 *   que nada fica gravado quando o fechamento falha no meio.
 *
 * Os repositórios rodam sem alteração; só o pool é trocado.
 */

const { chamadoAberto, estoqueInicial } = require('./fixture');

function copiar(tabelas) {
  return JSON.parse(JSON.stringify(tabelas));
}

function criarBancoSimulado({ chamados = [chamadoAberto()], estoque = estoqueInicial() } = {}) {
  let t = {
    chamados: chamados.map((c) => ({ ...c })),
    fechamentos: [],
    itens: estoque.map((i) => ({ ...i })),
    materiaisOS: [],
    postes: []
  };
  let copia = null;
  const eventos = [];

  const duplicado = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });

  const consultas = [
    [/^SELECT \* FROM chamados WHERE protocolo = \? FOR UPDATE/i, ([protocolo]) =>
      t.chamados.filter((c) => c.protocolo === protocolo).map((c) => ({ ...c }))],
    [/^UPDATE chamados SET status = \?, poste_id = COALESCE\(poste_id, \?\) WHERE id = \?/i, ([status, posteId, id]) => {
      const c = t.chamados.find((x) => x.id === id);
      if (c) { c.status = status; c.poste_id = c.poste_id || posteId; }
      return { affectedRows: c ? 1 : 0 };
    }],
    [/^UPDATE chamados SET status = \? WHERE id = \?/i, ([status, id]) => {
      const c = t.chamados.find((x) => x.id === id);
      if (c) c.status = status;
      return { affectedRows: c ? 1 : 0 };
    }],
    [/^SELECT \* FROM fechamentos WHERE operacao_id = \?/i, ([op]) =>
      t.fechamentos.filter((f) => f.operacao_id === op).map((f) => ({ ...f }))],
    [/^SELECT \* FROM fechamentos WHERE id = \?/i, ([id]) =>
      t.fechamentos.filter((f) => f.id === id).map((f) => ({ ...f }))],
    [/^INSERT INTO fechamentos/i, (v) => {
      const [operacao_id, chamado_id, tecnico_id, status, servico, referencia, latitude, longitude,
        foto_url, administrativo, informante, justificativa, data_fechamento] = v;
      if (t.fechamentos.some((f) => f.operacao_id === operacao_id || f.chamado_id === chamado_id)) throw duplicado();
      if (Number.isNaN(new Date(data_fechamento).getTime())) {
        // Mesmo comportamento do mysql2: data inválida não é aceita pela coluna DATETIME.
        throw Object.assign(new Error("Incorrect datetime value: 'Invalid date'"), { code: 'ER_TRUNCATED_WRONG_VALUE' });
      }
      if (referencia && referencia.length > 255) {
        throw Object.assign(new Error("Data too long for column 'referencia'"), { code: 'ER_DATA_TOO_LONG' });
      }
      const id = t.fechamentos.length + 1;
      t.fechamentos.push({
        id, operacao_id, chamado_id, tecnico_id, status, servico, referencia, latitude, longitude,
        foto_url, administrativo, informante, justificativa, data_fechamento: new Date(data_fechamento).toISOString()
      });
      return { insertId: id, affectedRows: 1 };
    }],
    [/^SELECT \* FROM itens_estoque WHERE id = \? FOR UPDATE/i, ([id]) =>
      t.itens.filter((i) => String(i.id) === String(id)).map((i) => ({ ...i }))],
    [/^SELECT \* FROM itens_estoque WHERE nome = \? FOR UPDATE/i, ([nome]) =>
      t.itens.filter((i) => i.nome === nome).map((i) => ({ ...i }))],
    [/^UPDATE itens_estoque SET saldo = saldo - \?/i, ([qtd, id]) => {
      const item = t.itens.find((i) => i.id === id);
      item.saldo -= qtd;
      return { affectedRows: 1 };
    }],
    [/^INSERT INTO fechamento_materiais/i, ([fechamento_id, item_id, quantidade]) => {
      const linha = t.materiaisOS.find((m) => m.fechamento_id === fechamento_id && m.item_id === item_id);
      if (linha) linha.quantidade = quantidade; // ON DUPLICATE KEY UPDATE quantidade = novo.quantidade
      else t.materiaisOS.push({ fechamento_id, item_id, quantidade });
      return { affectedRows: 1 };
    }],
    [/^INSERT INTO postes/i, (v) => {
      const campos = ['id', 'codigo', 'bairro', 'rua', 'referencia', 'endereco', 'latitude', 'longitude', 'braco',
        'luminaria', 'reator', 'fotosensor', 'porta_fusivel', 'fusivel', 'cabo', 'conector', 'foto_ref_url', 'obs'];
      const novo = Object.fromEntries(campos.map((c, i) => [c, v[i]]));
      const atual = t.postes.find((p) => p.id === novo.id);
      if (atual) for (const c of campos) atual[c] = novo[c] ?? atual[c];
      else t.postes.push(novo);
      return { affectedRows: 1 };
    }],
    [/^SELECT \* FROM postes WHERE id = \?/i, ([id]) => t.postes.filter((p) => p.id === id).map((p) => ({ ...p }))]
  ];

  const tx = {
    async query(sql, valores = []) {
      const texto = sql.trim().replace(/\s+/g, ' ');
      const comando = texto.split(' ')[0].toUpperCase();
      eventos.push(comando);
      if (comando === 'BEGIN') { copia = copiar(t); return { rows: [] }; }
      if (comando === 'COMMIT') { copia = null; return { rows: [] }; }
      if (comando === 'ROLLBACK') { if (copia) t = copia; copia = null; return { rows: [] }; }
      for (const [padrao, executar] of consultas) {
        if (padrao.test(texto)) return { rows: executar(valores) };
      }
      throw new Error(`Consulta não prevista no banco simulado: ${texto.slice(0, 120)}`);
    },
    release() { eventos.push('RELEASE'); }
  };

  async function emTransacao(operacao) {
    await tx.query('BEGIN');
    try {
      const resultado = await operacao(tx);
      await tx.query('COMMIT');
      return resultado;
    } catch (erro) {
      await tx.query('ROLLBACK');
      throw erro;
    }
  }

  return {
    get tabelas() { return t; },
    eventos,
    tx,
    /** Pool no formato de `infrastructure/database/pool` (usado pelo teste de API). */
    pool: { async connect() { return tx; } },
    /** Substituto de `emTransacao` para os testes de serviço. */
    emTransacao,
    saldo(nome) { return t.itens.find((i) => i.nome === nome).saldo; }
  };
}

module.exports = { criarBancoSimulado };
