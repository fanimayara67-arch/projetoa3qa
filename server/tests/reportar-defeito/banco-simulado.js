/**
 * Banco simulado para os testes de serviço e de API do UC01.
 * Reproduz as duas restrições da tabela `chamados` que importam para a idempotência:
 * `id` é chave primária e `protocolo` é único. Uma violação devolve o mesmo erro do MySQL
 * (`ER_DUP_ENTRY`), então o `ChamadoRepository` real roda sem alteração.
 */

function criarBancoSimulado() {
  const chamados = new Map();
  const eventos = [];

  const tx = {
    async query(sql, valores = []) {
      const comando = sql.trim().split(/\s+/)[0].toUpperCase();
      eventos.push(comando);

      if (comando === 'INSERT' && /INTO chamados/i.test(sql)) {
        const [id, protocolo, tipo, latitude, longitude, precisao_m, descricao, nome,
          telefone, endereco, foto_url, poste_id, user_agent, criado_em] = valores;
        const protocoloRepetido = [...chamados.values()].some(c => c.protocolo === protocolo);
        if (chamados.has(id) || protocoloRepetido) {
          throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
        }
        chamados.set(id, {
          id, protocolo, tipo, status: 'aberto', latitude, longitude, precisao_m, descricao,
          nome, telefone, endereco, foto_url, poste_id, user_agent, criado_em
        });
        return { rows: { affectedRows: 1 } };
      }

      if (comando === 'SELECT' && /FROM chamados WHERE id = \?/i.test(sql)) {
        const registro = chamados.get(valores[0]);
        return { rows: registro ? [{ ...registro }] : [] };
      }

      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(comando)) return { rows: [] };
      throw new Error(`Consulta não prevista no banco simulado: ${sql}`);
    },
    release() { eventos.push('RELEASE'); }
  };

  return {
    chamados,
    eventos,
    tx,
    /** Pool no formato de `infrastructure/database/pool` (usado pelo teste de API). */
    pool: { async connect() { return tx; } },
    /** Substituto de `emTransacao` para os testes de serviço. */
    async emTransacao(operacao) {
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
  };
}

module.exports = { criarBancoSimulado };
