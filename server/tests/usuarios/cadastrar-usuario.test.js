/**
 * Usuários | Script para cadastrar técnico, gestor e almoxarife com PIN (server/scripts/cadastrar-usuario.js)
 *
 * O setup-auth-mysql.js só cria um técnico com PIN 0123. Não havia script, tela nem rota para
 * cadastrar gestor e almoxarife: no banco real, só dava para inserir o hash do PIN à mão.
 *
 * Risco tratado: o login testa o PIN digitado contra todos os usuários ativos dos perfis da tela
 * e entra com o primeiro que bater. Dois usuários com o mesmo PIN fariam um técnico entrar como
 * gestor. Por isso o script recusa PIN que outro usuário ativo já usa.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarHashPin, verificarPin } = require('../../src/infrastructure/security/hashPin');
const { analisarArgumentos, cadastrarUsuario, desativarUsuario } = require('../../scripts/cadastrar-usuario');

/** Tabela usuarios em memória, com a mesma interface do pool ({ rows }). */
async function bancoFalso(usuarios = []) {
  const linhas = [];
  for (const u of usuarios) linhas.push({ id: linhas.length + 1, ativo: 1, ...u, pin_hash: await gerarHashPin(u.pin) });
  const consultas = [];
  return {
    linhas,
    consultas,
    async query(sql, v = []) {
      consultas.push({ sql, valores: v });
      if (/^\s*SELECT id, nome, perfil, pin_hash FROM usuarios WHERE ativo = 1/i.test(sql)) return { rows: linhas.filter((l) => l.ativo === 1) };
      if (/^\s*SELECT id FROM usuarios WHERE nome = \? AND perfil = \?/i.test(sql)) return { rows: linhas.filter((l) => l.nome === v[0] && l.perfil === v[1]) };
      if (/^\s*INSERT INTO usuarios \(nome, perfil, pin_hash, ativo\) VALUES \(\?, \?, \?, 1\)/i.test(sql)) {
        const id = linhas.length + 1; linhas.push({ id, nome: v[0], perfil: v[1], pin_hash: v[2], ativo: 1 }); return { rows: { insertId: id } };
      }
      if (/^\s*UPDATE usuarios SET pin_hash = \?, ativo = 1 WHERE id = \?/i.test(sql)) {
        Object.assign(linhas.find((l) => l.id === v[1]), { pin_hash: v[0], ativo: 1 }); return { rows: { affectedRows: 1 } };
      }
      if (/^\s*UPDATE usuarios SET ativo = 0 WHERE id = \?/i.test(sql)) { linhas.find((l) => l.id === v[0]).ativo = 0; return { rows: { affectedRows: 1 } }; }
      throw new Error('SQL inesperado: ' + sql);
    }
  };
}

test('CU-01 [caixa-preta | fluxo principal] cadastra um gestor com o PIN guardado só como hash, que o login reconhece', async () => {
  const banco = await bancoFalso();
  const r = await cadastrarUsuario({ nome: 'Maria Gestora', perfil: 'gestor', pin: '0456' }, { banco });
  assert.equal(r.acao, 'criado');
  const linha = banco.linhas[0];
  assert.deepEqual([linha.nome, linha.perfil, linha.ativo], ['Maria Gestora', 'gestor', 1]);
  assert.match(linha.pin_hash, /^scrypt\$/);
  assert.equal(await verificarPin('0456', linha.pin_hash), true);
  assert.doesNotMatch(JSON.stringify(banco.consultas), /"0456"/, 'o PIN em texto não vai para o banco');
  assert.doesNotMatch(r.mensagem, /0456/, 'nem para a tela');
});

test('CU-02 [caixa-preta | fluxo alternativo] mesmo nome e perfil troca o PIN e reativa, sem duplicar', async () => {
  const banco = await bancoFalso([{ nome: 'João Almox', perfil: 'almoxarife', pin: '0789', ativo: 0 }]);
  const r = await cadastrarUsuario({ nome: 'João Almox', perfil: 'almoxarife', pin: '0790' }, { banco });
  assert.equal(r.acao, 'atualizado');
  assert.equal(banco.linhas.length, 1);
  assert.equal(banco.linhas[0].ativo, 1);
  assert.equal(await verificarPin('0790', banco.linhas[0].pin_hash), true);
});

test('CU-03 [caixa-preta | partição inválida e valor limite] perfil, PIN e nome inválidos são recusados antes de tocar no banco', async () => {
  const invalidos = [
    [{ nome: 'X', perfil: 'admin', pin: '1234' }, /perfil/i],
    [{ nome: 'X', perfil: 'gestor', pin: '123' }, /4 dígitos/],
    [{ nome: 'X', perfil: 'gestor', pin: '12345' }, /4 dígitos/],
    [{ nome: 'X', perfil: 'gestor', pin: '12a4' }, /4 dígitos/],
    [{ nome: '   ', perfil: 'gestor', pin: '1234' }, /nome/i],
    [{ nome: 'N'.repeat(121), perfil: 'gestor', pin: '1234' }, /120/]
  ];
  for (const [dados, erro] of invalidos) {
    const banco = await bancoFalso();
    await assert.rejects(cadastrarUsuario(dados, { banco }), erro, JSON.stringify(dados));
    assert.deepEqual(banco.consultas, [], JSON.stringify(dados));
  }
  const limite = await bancoFalso();
  assert.equal((await cadastrarUsuario({ nome: 'N'.repeat(120), perfil: 'tecnico', pin: '0000' }, { banco: limite })).acao, 'criado');
});

test('CU-04 [caixa-preta | risco: login com o usuário errado] PIN já usado por outro usuário ativo é recusado', async () => {
  const banco = await bancoFalso([{ nome: 'Carlos', perfil: 'tecnico', pin: '0123' }]);
  await assert.rejects(
    cadastrarUsuario({ nome: 'Maria Gestora', perfil: 'gestor', pin: '0123' }, { banco }),
    /já é usado por outro usuário/
  );
  assert.equal(banco.linhas.length, 1);
  // O próprio usuário pode repetir o PIN que já tem (reenvio do mesmo cadastro).
  assert.equal((await cadastrarUsuario({ nome: 'Carlos', perfil: 'tecnico', pin: '0123' }, { banco })).acao, 'atualizado');
});

test('CU-05 [caixa-preta | fluxo principal e exceção] desativar tira o acesso; usuário inexistente é avisado', async () => {
  const banco = await bancoFalso([{ nome: 'Carlos', perfil: 'tecnico', pin: '0123' }]);
  const r = await desativarUsuario({ nome: 'Carlos', perfil: 'tecnico' }, { banco });
  assert.equal(r.acao, 'desativado');
  assert.equal(banco.linhas[0].ativo, 0);
  await assert.rejects(desativarUsuario({ nome: 'Ninguém', perfil: 'tecnico' }, { banco }), /não encontrado/);
});

test('CU-06 [caixa-preta | partição] argumentos da linha de comando; o PIN mantém o zero à esquerda', () => {
  assert.deepEqual(analisarArgumentos(['--nome', 'Maria Gestora', '--perfil', 'gestor', '--pin', '0456']),
    { nome: 'Maria Gestora', perfil: 'gestor', pin: '0456', desativar: false });
  assert.deepEqual(analisarArgumentos(['--perfil=tecnico', '--nome=Carlos', '--desativar']),
    { nome: 'Carlos', perfil: 'tecnico', pin: undefined, desativar: true });
  assert.throws(() => analisarArgumentos(['--nome', 'X', '--cargo', 'gestor']), /--cargo/);
});
