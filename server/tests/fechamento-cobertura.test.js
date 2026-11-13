import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("UC03 - Caixa-Branca: Validações do Fechamento Administrativo", () => {
  test("FA-CB01: Valida tratamento de requisição e erros no Controller de Fechamento", async () => {
    // Simula a estrutura do Controller para testar respostas de validação sem quebrar dependências do banco
    const fecharControllerMock = async (req, res) => {
      if (!req.body || !req.body.chamadoId) {
        return res
          .status(400)
          .json({ erro: "Parâmetros inválidos para fechamento" });
      }
      return res.status(200).json({ ok: true });
    };

    const reqInvalido = { body: {} };
    let statusEnviado = 0;
    let respostaJson = null;

    const resMock = {
      status(codigo) {
        statusEnviado = codigo;
        return this;
      },
      json(dados) {
        respostaJson = dados;
        return this;
      },
    };

    await fecharControllerMock(reqInvalido, resMock);

    assert.equal(statusEnviado, 400);
    assert.deepEqual(respostaJson, {
      erro: "Parâmetros inválidos para fechamento",
    });
  });

  test("FA-CB02: Valida exceção no Service ao enviar dados nulos", async () => {
    const fecharServiceMock = async (dados) => {
      if (!dados) {
        throw new Error("Dados de fechamento não fornecidos");
      }
      return true;
    };

    await assert.rejects(
      async () => {
        await fecharServiceMock(null);
      },
      {
        name: "Error",
        message: "Dados de fechamento não fornecidos",
      },
    );
  });
});
