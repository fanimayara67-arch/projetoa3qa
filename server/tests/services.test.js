/**
 * TESTES DE APLICAÇÃO E INTEGRAÇÃO — Transações ACID, Concorrência (409),
 * Rate Limit de PIN (429) e Fila Offline do Cidadão (Backoff Exponencial)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { emTransacao } = require('../src/infrastructure/database/transacao');
const { gerarHashPin, verificarPin } = require('../src/infrastructure/security/hashPin');
const FechamentoService = require('../src/application/services/FechamentoService');
const AuthService = require('../src/application/services/AuthService');
const { Conflito, MuitasTentativas } = require('../src/application/errors');

test('Infraestrutura SQL: emTransacao executa BEGIN e COMMIT quando a operação tem sucesso', async () => {
  const comandos = [];
  const mockPool = {
    async connect() {
      return {
        async query(sql) { comandos.push(sql); return { rows: [] }; },
        release() { comandos.push('RELEASE'); }
      };
    }
  };

  const res = await emTransacao(async (tx) => {
    await tx.query('UPDATE chamados SET status = $1');
    return 'ok';
  }, mockPool);

  assert.equal(res, 'ok');
  assert.deepEqual(comandos, ['BEGIN', 'UPDATE chamados SET status = $1', 'COMMIT', 'RELEASE']);
});

test('Infraestrutura SQL: emTransacao executa ROLLBACK automaticamente se ocorrer qualquer falha', async () => {
  const comandos = [];
  const mockPool = {
    async connect() {
      return {
        async query(sql) { comandos.push(sql); return { rows: [] }; },
        release() { comandos.push('RELEASE'); }
      };
    }
  };

  await assert.rejects(
    () =>
      emTransacao(async (tx) => {
        await tx.query('INSERT INTO fechamentos ...');
        throw new Error('Falha de saldo no almoxarifado (CHECK saldo >= 0)');
      }, mockPool),
    /Falha de saldo/
  );

  assert.deepEqual(comandos, ['BEGIN', 'INSERT INTO fechamentos ...', 'ROLLBACK', 'RELEASE']);
});

test('Aplicação FechamentoService: fecha chamado, debita estoque e atualiza poste na mesma transação', async () => {
  const passosExecutados = [];
  const deps = {
    emTransacao: async (fn) => fn({ idTransacao: 'tx-1' }),
    FotoStorage: {
      salvar: async () => '/uploads/fotos/reparo-1.jpg'
    },
    FechamentoRepo: {
      buscarPorOperacaoId: async () => null,
      inserir: async (_tx, dados) => {
        passosExecutados.push('inserir_fechamento');
        return { id: 99, ...dados };
      }
    },
    ChamadoRepo: {
      buscarParaAtualizar: async (_tx, protocolo) => {
        passosExecutados.push(`lock_${protocolo}`);
        return { id: 'uuid-chamado-1', protocolo, status: 'aberto', poste_id: 'P-0001' };
      },
      mudarStatus: async (_tx, _id, novoStatus) => {
        passosExecutados.push(`status_${novoStatus}`);
      }
    },
    PosteRepo: {
      atualizarConfiguracao: async (_tx, posteId) => {
        passosExecutados.push(`atualizar_poste_${posteId}`);
      }
    },
    EstoqueRepo: {
      baixarMateriais: async (_tx, fechamentoId, materiais) => {
        passosExecutados.push(`baixar_estoque_${fechamentoId}_${materiais.length}`);
      }
    }
  };

  const resultado = await FechamentoService.fecharChamado(
    {
      protocolo: 'IC-261104-0001',
      tecnicoId: 7,
      dados: {
        operacao_id: 'op-uuid-123',
        status: 'Concluído',
        servico: 'Troca de reator e lâmpada',
        foto_reparo_base64: 'data:image/jpeg;base64,AAAA', lat: -10.1253, lng: -36.1756, precisao_m: 8,
        materiais_os: [{ nome: 'Reator 100W', quantidade: 1 }],
        config: { luminaria: 'LED 100W' }
      }
    },
    deps
  );

  assert.equal(resultado.id, 99);
  assert.equal(resultado.fotoUrl, '/uploads/fotos/reparo-1.jpg');
  assert.deepEqual(passosExecutados, [
    'lock_IC-261104-0001',
    'atualizar_poste_P-0001',
    'inserir_fechamento',
    'baixar_estoque_99_1',
    'status_fechado'
  ]);
});

test('Aplicação FechamentoService: bloqueia segundo técnico com 409 Conflito se chamado já estiver fechado', async () => {
  const deps = {
    emTransacao: async (fn) => fn({}),
    FotoStorage: { salvar: async () => null },
    FechamentoRepo: { buscarPorOperacaoId: async () => null },
    ChamadoRepo: {
      buscarParaAtualizar: async () => ({
        id: 'uuid-chamado-1',
        protocolo: 'IC-261104-0001',
        status: 'fechado'
      })
    }
  };

  await assert.rejects(
    () =>
      FechamentoService.fecharChamado(
        {
          protocolo: 'IC-261104-0001',
          tecnicoId: 8,
          dados: {
            operacao_id: 'op-uuid-segundo-tecnico',
            status: 'Concluído',
            servico: 'Tentativa duplicada',
            foto_reparo_base64: 'data:image/jpeg;base64,AAAA', lat: -10.1253, lng: -36.1756, precisao_m: 8
          }
        },
        deps
      ),
    (err) => {
      assert.equal(err instanceof Conflito, true);
      assert.equal(err.status, 409);
      return true;
    }
  );
});

test('Segurança e AuthService: gera hash scrypt de PIN e bloqueia força bruta com HTTP 429', async () => {
  const hash = await gerarHashPin('4829');
  assert.equal(await verificarPin('4829', hash), true);
  assert.equal(await verificarPin('0000', hash), false);

  await assert.rejects(
    () =>
      AuthService.autenticarPorPin(
        { pin: '1234', ip: '192.168.1.50' },
        {
          SessaoRepo: {
            contarFalhasRecentesPorIp: async () => 5
          }
        }
      ),
    (err) => {
      assert.equal(err instanceof MuitasTentativas, true);
      assert.equal(err.status, 429);
      return true;
    }
  );
});

test('PWA Cidadão (Camada de Aplicação): SincronizarFila aplica backoff exponencial em falha de rede', async () => {
  const { sincronizarFila } = await import('../../public/js/cidadao/application/SincronizarFila.js');

  const estadoMock = [
    {
      id: 'uuid-offline-1',
      protocolo: 'IC-261104-OFF01',
      tipo: 'apagado',
      lat: -10.125,
      lng: -36.175,
      sync: { estado: 'pending', attempts: 1, lastError: null, nextRetryAt: null }
    }
  ];

  const repoFalso = {
    async listarPendentes() { return estadoMock; },
    async marcar(id, novoEstado, meta = {}) {
      const item = estadoMock.find((x) => x.id === id);
      item.sync.estado = novoEstado;
      if (meta.incrementarTentativa) item.sync.attempts += 1;
      if (meta.nextRetryAt) item.sync.nextRetryAt = meta.nextRetryAt;
      if (meta.erro) item.sync.lastError = meta.erro;
    }
  };

  const apiComFalhaRede = async () => {
    throw new Error('Failed to fetch');
  };

  const agora = 1_700_000_000_000;
  const res = await sincronizarFila({ repo: repoFalso, api: apiComFalhaRede, agora });

  assert.equal(res.sincronizados, 0);
  assert.equal(res.falhas, 1);
  assert.equal(estadoMock[0].sync.estado, 'pending');
  assert.equal(estadoMock[0].sync.attempts, 2);
  // 2^1 * 30_000 = 60_000 ms de espera
  assert.equal(estadoMock[0].sync.nextRetryAt, agora + 60_000);
});
