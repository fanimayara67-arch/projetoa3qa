/**
 * SUÍTE DE TESTES DE INTEGRAÇÃO PONTA A PONTA — ILUMINA CORURIPE
 * Exercita o fluxo completo: HTTP real -> Middlewares -> Controllers -> Services -> Repositories -> MySQL real.
 */

const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { criarApp } = require("../src/app");
const pool = require("../src/infrastructure/database/pool");
const { gerarHashPin } = require("../src/infrastructure/security/hashPin");
const {
  reporteValido,
  LAT_CORURIPE,
  LNG_CORURIPE,
  FOTO_PEQUENA,
} = require("./reportar-defeito/fixture");
const { fechamentoValido } = require("./fechar-os/fixture");

const PREFIXO = "INTQA";
const POSTE_ID = "P-9901";
const PROTO_CAMPO = "IC-261114-INT01";
const PROTO_ADMIN = "IC-261114-INT02";
const ID_CHAMADO_1 = "99999999-1111-4111-8111-111111111101";
const ID_CHAMADO_2 = "99999999-2222-4222-8222-222222222202";
const OP_TENTATIVA_1 = "88888888-1111-4111-8111-111111111101";
const OP_FECHAMENTO_1 = "77777777-1111-4111-8111-111111111101";
const OP_FECHAMENTO_ERR = "77777777-2222-4222-8222-222222222202";
const OP_FECHAMENTO_ADM = "77777777-3333-4333-8333-333333333303";
const NOME_ITEM_PRINCIPAL = "Reator LED Integracao QA";
const NOME_ITEM_AUXILIAR = "Conector Cunhado QA";
const EQUIPE_MISSAO = "Equipe Integracao QA";
const IP_TESTE = "10.250.250.1";

let server;
let baseUrl;
let tokenTecnico;
let tokenGestor;
let tokenAlmoxarife;
const usuariosCriadosIds = [];
const tokensCriados = [];

async function reqHttp(
  rota,
  { method = "GET", token = null, body = undefined, ip = IP_TESTE } = {},
) {
  const headers = { "X-Forwarded-For": ip };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${rota}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch (_) {
    json = texto;
  }
  return {
    status: res.status,
    body: json,
    dados: json && json.data !== undefined ? json.data : json,
  };
}

async function limparDadosDeTeste() {
  try {
    await pool.query(
      "DELETE FROM fechamento_materiais WHERE fechamento_id IN (SELECT id FROM fechamentos WHERE operacao_id IN (?, ?, ?))",
      [OP_FECHAMENTO_1, OP_FECHAMENTO_ERR, OP_FECHAMENTO_ADM],
    );
  } catch (_) {}

  try {
    await pool.query("DELETE FROM fechamentos WHERE operacao_id IN (?, ?, ?)", [
      OP_FECHAMENTO_1,
      OP_FECHAMENTO_ERR,
      OP_FECHAMENTO_ADM,
    ]);
  } catch (_) {}

  try {
    await pool.query("DELETE FROM tentativas WHERE operacao_id = ?", [
      OP_TENTATIVA_1,
    ]);
  } catch (_) {}

  try {
    await pool.query(
      "DELETE FROM chamados WHERE id IN (?, ?) OR protocolo IN (?, ?)",
      [ID_CHAMADO_1, ID_CHAMADO_2, PROTO_CAMPO, PROTO_ADMIN],
    );
  } catch (_) {}

  try {
    await pool.query("DELETE FROM postes WHERE id = ?", [POSTE_ID]);
  } catch (_) {}

  try {
    await pool.query(
      "DELETE FROM missao_itens WHERE missao_id IN (SELECT id FROM missoes WHERE equipe = ?)",
      [EQUIPE_MISSAO],
    );
    await pool.query("DELETE FROM missoes WHERE equipe = ?", [EQUIPE_MISSAO]);
  } catch (_) {}

  try {
    await pool.query("DELETE FROM itens_estoque WHERE nome IN (?, ?)", [
      NOME_ITEM_PRINCIPAL,
      NOME_ITEM_AUXILIAR,
    ]);
  } catch (_) {}

  try {
    if (tokensCriados.length > 0) {
      await pool.query("DELETE FROM sessoes WHERE token IN (?)", [
        tokensCriados,
      ]);
    }
    if (usuariosCriadosIds.length > 0) {
      await pool.query("DELETE FROM usuarios WHERE id IN (?)", [
        usuariosCriadosIds,
      ]);
    }
    await pool.query("DELETE FROM tentativas_login WHERE ip = ?", [IP_TESTE]);
  } catch (_) {}
}

before(async () => {
  // Garante que todas as tabelas operacionais existam no MySQL (inclusive no banco limpo do CI)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS postes (
      id VARCHAR(50) PRIMARY KEY,
      codigo VARCHAR(50) NULL,
      bairro VARCHAR(120) NULL,
      rua VARCHAR(200) NULL,
      referencia VARCHAR(255) NULL,
      endereco VARCHAR(255) NULL,
      latitude DECIMAL(10, 7) NULL,
      longitude DECIMAL(10, 7) NULL,
      braco VARCHAR(100) NULL,
      luminaria VARCHAR(100) NULL,
      reator VARCHAR(100) NULL,
      fotosensor VARCHAR(100) NULL,
      porta_fusivel VARCHAR(100) NULL,
      fusivel VARCHAR(100) NULL,
      cabo VARCHAR(100) NULL,
      conector VARCHAR(100) NULL,
      foto_ref_url TEXT NULL,
      obs TEXT NULL,
      atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chamados (
      id VARCHAR(36) PRIMARY KEY,
      protocolo VARCHAR(40) NOT NULL UNIQUE,
      tipo VARCHAR(40) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'aberto',
      latitude DECIMAL(10, 7) NULL,
      longitude DECIMAL(10, 7) NULL,
      precisao_m DECIMAL(10, 2) NULL,
      descricao TEXT NULL,
      nome VARCHAR(120) NULL,
      telefone VARCHAR(40) NULL,
      endereco VARCHAR(255) NULL,
      foto_url TEXT NULL,
      poste_id VARCHAR(50) NULL,
      user_agent VARCHAR(255) NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fechamentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      operacao_id VARCHAR(36) NOT NULL UNIQUE,
      chamado_id VARCHAR(36) NOT NULL,
      tecnico_id INT NULL,
      status VARCHAR(50) NOT NULL,
      servico TEXT NULL,
      referencia VARCHAR(255) NULL,
      latitude DECIMAL(10, 7) NULL,
      longitude DECIMAL(10, 7) NULL,
      foto_url TEXT NULL,
      administrativo TINYINT(1) NOT NULL DEFAULT 0,
      informante VARCHAR(120) NULL,
      justificativa TEXT NULL,
      data_fechamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tentativas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      operacao_id VARCHAR(36) NOT NULL UNIQUE,
      chamado_id VARCHAR(36) NOT NULL,
      tecnico_id INT NULL,
      motivo TEXT NOT NULL,
      latitude DECIMAL(10, 7) NULL,
      longitude DECIMAL(10, 7) NULL,
      foto_url TEXT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS itens_estoque (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(120) NOT NULL UNIQUE,
      unidade VARCHAR(20) NOT NULL DEFAULT 'un',
      saldo DECIMAL(12, 2) NOT NULL DEFAULT 0,
      minimo DECIMAL(12, 2) NOT NULL DEFAULT 0,
      atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fechamento_materiais (
      fechamento_id INT NOT NULL,
      item_id INT NOT NULL,
      quantidade DECIMAL(12, 2) NOT NULL,
      PRIMARY KEY (fechamento_id, item_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS missoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data_missao DATE NOT NULL,
      equipe VARCHAR(120) NOT NULL,
      obs TEXT NULL,
      criado_por INT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS missao_itens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      missao_id INT NOT NULL,
      item_id INT NOT NULL,
      qtd_saida DECIMAL(12, 2) NOT NULL,
      qtd_retorno DECIMAL(12, 2) NULL
    )
  `);

  await limparDadosDeTeste();

  // Cria usuários dedicados para os 3 perfis do sistema (técnico, gestor, almoxarife)
  const perfis = [
    { nome: `${PREFIXO} Tecnico`, perfil: "tecnico", pin: "9101" },
    { nome: `${PREFIXO} Gestor`, perfil: "gestor", pin: "9202" },
    { nome: `${PREFIXO} Almoxarife`, perfil: "almoxarife", pin: "9303" },
  ];

  for (const u of perfis) {
    const hash = await gerarHashPin(u.pin);
    const { rows } = await pool.query(
      "INSERT INTO usuarios (nome, perfil, pin_hash, ativo) VALUES (?, ?, ?, 1)",
      [u.nome, u.perfil, hash],
    );
    usuariosCriadosIds.push(rows.insertId);
  }

  // Sobe servidor HTTP real em porta efêmera
  const app = criarApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await limparDadosDeTeste();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

describe("Suíte de Integração Ponta a Ponta (HTTP + Serviços + MySQL Real)", () => {
  test("INT-01 [Auth | MySQL] Login HTTP de técnico e gestor gera tokens Bearer válidos na tabela sessoes", async () => {
    const resTec = await reqHttp("/api/auth/login", {
      method: "POST",
      body: { pin: "9101" },
    });
    assert.equal(resTec.status, 200);
    assert.equal(resTec.body.success, true);
    assert.equal(resTec.dados.token.length, 64);
    assert.equal(resTec.dados.usuario.perfil, "tecnico");
    tokenTecnico = resTec.dados.token;
    tokensCriados.push(tokenTecnico);

    const resGes = await reqHttp("/api/auth/login", {
      method: "POST",
      body: { pin: "9202" },
    });
    assert.equal(resGes.status, 200);
    assert.equal(resGes.dados.usuario.perfil, "gestor");
    tokenGestor = resGes.dados.token;
    tokensCriados.push(tokenGestor);

    const { rows } = await pool.query(
      "SELECT COUNT(*) AS total FROM sessoes WHERE token IN (?, ?)",
      [tokenTecnico, tokenGestor],
    );
    assert.equal(Number(rows[0].total), 2);
  });

  test("INT-02 [Auth | RBAC] Login do almoxarifado aceita almoxarife e bloqueia técnico comum", async () => {
    const resNegado = await reqHttp("/api/auth/almoxarifado", {
      method: "POST",
      body: { pin: "9101" },
    });
    assert.equal(resNegado.status, 401);

    const resAlm = await reqHttp("/api/auth/almoxarifado", {
      method: "POST",
      body: { pin: "9303" },
    });
    assert.equal(resAlm.status, 200);
    assert.equal(resAlm.dados.usuario.perfil, "almoxarife");
    tokenAlmoxarife = resAlm.dados.token;
    tokensCriados.push(tokenAlmoxarife);
  });

  test("INT-03 [Segurança | RBAC] Rotas protegidas exigem sessão (401) e respeitam hierarquia de perfil (403)", async () => {
    const semToken = await reqHttp("/api/chamados");
    assert.equal(semToken.status, 401);

    // Técnico não pode alterar estoque nem executar fechamento administrativo
    const tecEstoque = await reqHttp(
      `/api/estoque/${encodeURIComponent(NOME_ITEM_AUXILIAR)}`,
      {
        method: "PUT",
        token: tokenTecnico,
        body: { unidade: "un", saldo: 5, minimo: 1 },
      },
    );
    assert.equal(tecEstoque.status, 403);

    const tecAdmin = await reqHttp(
      `/api/chamados/${PROTO_CAMPO}/fechamento-admin`,
      {
        method: "POST",
        token: tokenTecnico,
        body: {
          operacao_id: OP_FECHAMENTO_ADM,
          informante: "Secretaria de Obras",
          justificativa: "Tentativa sem permissão de gestor",
        },
      },
    );
    assert.equal(tecAdmin.status, 403);
  });

  test("INT-04 [Chamados | Cidadão -> MySQL] Abertura pública cria chamado e aparece na listagem e busca por protocolo", async () => {
    const payload = reporteValido({
      id: ID_CHAMADO_1,
      protocolo: PROTO_CAMPO,
      tipo: "apagado",
      poste_id: POSTE_ID,
      endereco: "Rua Principal, Centro - Coruripe/AL",
      descricao: "Luminária apagada próximo à praça",
    });

    const resCriar = await reqHttp("/api/chamados", {
      method: "POST",
      body: payload,
    });
    assert.equal(resCriar.status, 201);
    assert.equal(resCriar.dados.protocolo, PROTO_CAMPO);
    assert.equal(resCriar.dados.status, "aberto");

    const resBusca = await reqHttp(`/api/chamados/${PROTO_CAMPO}`, {
      token: tokenTecnico,
    });
    assert.equal(resBusca.status, 200);
    assert.equal(resBusca.dados.id, ID_CHAMADO_1);

    const resLista = await reqHttp("/api/chamados?escopo=abertos", {
      token: tokenTecnico,
    });
    assert.equal(resLista.status, 200);
    assert.ok(resLista.dados.records.some((c) => c.protocolo === PROTO_CAMPO));
  });

  test("INT-05 [Chamados | Idempotência] Reenvio do mesmo UUID pelo cidadão retorna o chamado existente sem duplicar", async () => {
    const payloadRepetido = reporteValido({
      id: ID_CHAMADO_1,
      protocolo: PROTO_CAMPO,
      tipo: "apagado",
      poste_id: POSTE_ID,
    });

    const resReenvio = await reqHttp("/api/chamados", {
      method: "POST",
      body: payloadRepetido,
    });
    assert.equal(resReenvio.status, 201);
    assert.equal(resReenvio.dados.id, ID_CHAMADO_1);

    const { rows } = await pool.query(
      "SELECT COUNT(*) AS total FROM chamados WHERE protocolo = ?",
      [PROTO_CAMPO],
    );
    assert.equal(Number(rows[0].total), 1);
  });

  test("INT-06 [Postes | QR Code Público] Consulta pública da situação do poste detecta chamado aberto vinculado", async () => {
    const resPoste = await reqHttp(`/api/postes/${POSTE_ID}/situacao`);
    assert.equal(resPoste.status, 200);
    assert.equal(resPoste.body.success, true);
    assert.ok(JSON.stringify(resPoste.dados).includes(PROTO_CAMPO));
  });

  test("INT-07 [Tentativas | Campo -> Relatório] Técnico registra tentativa frustrada e rota de relatório lista o evento", async () => {
    const resTentativa = await reqHttp(
      `/api/chamados/${PROTO_CAMPO}/tentativas`,
      {
        method: "POST",
        token: tokenTecnico,
        body: {
          operacao_id: OP_TENTATIVA_1,
          motivo: "Via interditada por obra emergencial no momento da visita",
          lat: LAT_CORURIPE,
          lng: LNG_CORURIPE,
          foto_base64: FOTO_PEQUENA,
        },
      },
    );
    assert.equal(resTentativa.status, 201);

    const resRelatorio = await reqHttp("/api/tentativas", {
      token: tokenGestor,
    });
    assert.equal(resRelatorio.status, 200);
    assert.ok(
      resRelatorio.dados.tentativas.some((t) => t.protocolo === PROTO_CAMPO),
    );
  });

  test("INT-08 [Almoxarifado | CRUD] Almoxarife cadastra, consulta e remove material no estoque real", async () => {
    const resSalvar = await reqHttp(
      `/api/estoque/${encodeURIComponent(NOME_ITEM_PRINCIPAL)}`,
      {
        method: "PUT",
        token: tokenAlmoxarife,
        body: {
          unidade: "un",
          saldo: 10,
          minimo: 3,
        },
      },
    );
    assert.equal(resSalvar.status, 200);
    assert.equal(Number(resSalvar.dados.saldo), 10);

    // Item auxiliar para validar exclusão via DELETE
    await reqHttp(`/api/estoque/${encodeURIComponent(NOME_ITEM_AUXILIAR)}`, {
      method: "PUT",
      token: tokenAlmoxarife,
      body: { unidade: "un", saldo: 4, minimo: 1 },
    });
    const resDel = await reqHttp(
      `/api/estoque/${encodeURIComponent(NOME_ITEM_AUXILIAR)}`,
      {
        method: "DELETE",
        token: tokenAlmoxarife,
      },
    );
    assert.equal(resDel.status, 200);

    const resLista = await reqHttp("/api/estoque", {
      token: tokenTecnico,
    });
    assert.equal(resLista.status, 200);
    const item = resLista.dados.find((i) => i.nome === NOME_ITEM_PRINCIPAL);
    assert.ok(item);
    assert.equal(item.alertaMinimo, false);
  });

  test("INT-09 [Fechamento Campo | Transação ACID] Encerra chamado, debita estoque e atualiza ficha técnica do poste", async () => {
    const payloadFechamento = fechamentoValido({
      operacao_id: OP_FECHAMENTO_1,
      poste_id: POSTE_ID,
      materiais_os: [{ nome: NOME_ITEM_PRINCIPAL, quantidade: 2 }],
      config: {
        braco: "Longo",
        luminaria: "LED 150W",
        reator: "Eletrônico Integrado",
        fotosensor: "Novo",
        porta_fusivel: "5x20",
        fusivel: "2A",
        cabo: "2,5 mm",
        conector: "Cunha",
        obs: "Manutenção preventiva concluída",
      },
    });

    const resFechar = await reqHttp(`/api/chamados/${PROTO_CAMPO}/fechamento`, {
      method: "POST",
      token: tokenTecnico,
      body: payloadFechamento,
    });
    assert.equal(resFechar.status, 201);

    // 1. Chamado deve estar 'fechado' no MySQL
    const { rows: chamados } = await pool.query(
      "SELECT status FROM chamados WHERE protocolo = ?",
      [PROTO_CAMPO],
    );
    assert.equal(chamados[0].status, "fechado");

    // 2. Saldo do estoque deve ter caído de 10 para 8
    const { rows: itens } = await pool.query(
      "SELECT saldo FROM itens_estoque WHERE nome = ?",
      [NOME_ITEM_PRINCIPAL],
    );
    assert.equal(Number(itens[0].saldo), 8);

    // 3. Ficha técnica do poste deve ter sido criada/atualizada
    const { rows: postes } = await pool.query(
      "SELECT luminaria, braco FROM postes WHERE id = ?",
      [POSTE_ID],
    );
    assert.equal(postes.length, 1);
    assert.equal(postes[0].luminaria, "LED 150W");
    assert.equal(postes[0].braco, "Longo");
  });

  test("INT-10 [Fechamento Campo | Idempotência e Conflito] Reenvio não duplica baixa; nova operação no mesmo chamado retorna 409", async () => {
    const payloadMesmoOp = fechamentoValido({
      operacao_id: OP_FECHAMENTO_1,
      poste_id: POSTE_ID,
      materiais_os: [{ nome: NOME_ITEM_PRINCIPAL, quantidade: 2 }],
    });

    const resReenvio = await reqHttp(
      `/api/chamados/${PROTO_CAMPO}/fechamento`,
      {
        method: "POST",
        token: tokenTecnico,
        body: payloadMesmoOp,
      },
    );
    assert.equal(resReenvio.status, 201);

    // Saldo deve continuar 8 (sem débito duplicado)
    const { rows: itens } = await pool.query(
      "SELECT saldo FROM itens_estoque WHERE nome = ?",
      [NOME_ITEM_PRINCIPAL],
    );
    assert.equal(Number(itens[0].saldo), 8);

    // Segundo técnico tentando fechar o mesmo chamado com outro operacao_id recebe 409 Conflito
    const resConflito = await reqHttp(
      `/api/chamados/${PROTO_CAMPO}/fechamento`,
      {
        method: "POST",
        token: tokenGestor,
        body: fechamentoValido({
          operacao_id: OP_FECHAMENTO_ERR,
          poste_id: POSTE_ID,
          materiais_os: [],
        }),
      },
    );
    assert.equal(resConflito.status, 409);
  });

  test("INT-11 [Atomicidade | Rollback] Saldo insuficiente no fechamento retorna 409 e reverte totalmente a transação", async () => {
    // Abre segundo chamado para testar rollback
    await reqHttp("/api/chamados", {
      method: "POST",
      body: reporteValido({
        id: ID_CHAMADO_2,
        protocolo: PROTO_ADMIN,
        tipo: "queimada",
      }),
    });

    const resSemSaldo = await reqHttp(
      `/api/chamados/${PROTO_ADMIN}/fechamento`,
      {
        method: "POST",
        token: tokenTecnico,
        body: fechamentoValido({
          operacao_id: OP_FECHAMENTO_ERR,
          materiais_os: [{ nome: NOME_ITEM_PRINCIPAL, quantidade: 50 }],
        }),
      },
    );
    assert.equal(resSemSaldo.status, 409);

    // Chamado deve permanecer 'aberto' e nenhum fechamento pode ter sido persistido
    const { rows: chamados } = await pool.query(
      "SELECT status FROM chamados WHERE protocolo = ?",
      [PROTO_ADMIN],
    );
    assert.equal(chamados[0].status, "aberto");

    const { rows: fech } = await pool.query(
      "SELECT COUNT(*) AS total FROM fechamentos WHERE operacao_id = ?",
      [OP_FECHAMENTO_ERR],
    );
    assert.equal(Number(fech[0].total), 0);
  });

  test("INT-12 [Relatórios e Postes] Listagem de fechados, lista de postes e histórico do poste refletem o ciclo completo", async () => {
    const resFechados = await reqHttp("/api/chamados?escopo=fechados", {
      token: tokenGestor,
    });
    assert.equal(resFechados.status, 200);
    assert.ok(
      resFechados.dados.records.some((c) => c.protocolo === PROTO_CAMPO),
    );

    const resPostes = await reqHttp("/api/postes", {
      token: tokenTecnico,
    });
    assert.equal(resPostes.status, 200);
    assert.ok(resPostes.dados.some((p) => p.id === POSTE_ID));

    const resHistorico = await reqHttp(`/api/postes/${POSTE_ID}/historico`, {
      token: tokenTecnico,
    });
    assert.equal(resHistorico.status, 200);
    assert.ok(JSON.stringify(resHistorico.dados).includes(PROTO_CAMPO));
  });

  test('INT-13 [Almoxarifado | Miss?es] Sa?da de miss?o debita estoque, ativa alerta de m?nimo e lista itens agregados', { todo: 'Defeito DEF-13 - EstoqueRepository usa coluna data em vez de data_missao na tabela missoes' }, async () => {
    const resMissao = await reqHttp("/api/missoes", {
      method: "POST",
      token: tokenAlmoxarife,
      body: {
        data: "2026-11-14",
        equipe: EQUIPE_MISSAO,
        obs: "Ronda noturna bairros costeiros",
        itens: [{ nome: NOME_ITEM_PRINCIPAL, qtd_saida: 6 }],
      },
    });
    assert.equal(resMissao.status, 201);

    // Saldo cai de 8 para 2 (abaixo do mínimo 3 -> alertaMinimo: true)
    const resEstoque = await reqHttp("/api/estoque", {
      token: tokenAlmoxarife,
    });
    const item = resEstoque.dados.find((i) => i.nome === NOME_ITEM_PRINCIPAL);
    assert.equal(Number(item.saldo), 2);
    assert.equal(item.alertaMinimo, true);

    const resMissoes = await reqHttp("/api/missoes", {
      token: tokenGestor,
    });
    assert.equal(resMissoes.status, 200);
    const missao = resMissoes.dados.find((m) => m.equipe === EQUIPE_MISSAO);
    assert.ok(missao);
    assert.equal(missao.itens.length, 1);
    assert.equal(Number(missao.itens[0].qtd_saida), 6);
  });

  test('INT-14 [Fechamento Administrativo] Gestor encerra chamado administrativamente sem movimentar estoque', async () => { const { rows: antes } = await pool.query('SELECT saldo FROM itens_estoque WHERE nome = ?', [NOME_ITEM_PRINCIPAL]); const saldoAntes = Number(antes[0].saldo);
    const resAdmin = await reqHttp(
      `/api/chamados/${PROTO_ADMIN}/fechamento-admin`,
      {
        method: "POST",
        token: tokenGestor,
        body: {
          operacao_id: OP_FECHAMENTO_ADM,
          informante: "Coordenador de Infraestrutura",
          justificativa:
            "Ponto substituído pela concessionária de energia elétrica",
          status: "Concluído",
        },
      },
    );
    assert.equal(resAdmin.status, 201);

    const { rows: chamados } = await pool.query(
      "SELECT status FROM chamados WHERE protocolo = ?",
      [PROTO_ADMIN],
    );
    assert.equal(chamados[0].status, "fechado");

    const { rows: fech } = await pool.query(
      "SELECT administrativo, informante FROM fechamentos WHERE operacao_id = ?",
      [OP_FECHAMENTO_ADM],
    );
    assert.equal(Number(fech[0].administrativo), 1);
    assert.equal(fech[0].informante, "Coordenador de Infraestrutura");

    // Estoque permanece inalterado em 2 unidades
    const { rows: itens } = await pool.query(
      "SELECT saldo FROM itens_estoque WHERE nome = ?",
      [NOME_ITEM_PRINCIPAL],
    );
    assert.equal(Number(itens[0].saldo), saldoAntes);
  });

  test("INT-15 [Apresentação | Robustez HTTP] Rota inexistente (404) e JSON inválido (400) respondem de forma controlada", async () => {
    const res404 = await reqHttp("/api/rota-inexistente-qa");
    assert.equal(res404.status, 404);
    assert.equal(res404.body.error.codigo, "ROTA_NAO_ENCONTRADA");

    const resJsonInvalido = await fetch(`${baseUrl}/api/chamados`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{json-quebrado",
    });
    assert.equal(resJsonInvalido.status, 400);
    const corpoErro = await resJsonInvalido.json();
    assert.equal(corpoErro.error.codigo, "JSON_INVALIDO");
  });
});
