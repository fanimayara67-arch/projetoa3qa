/**
 * CT-29 — Logout do técnico limpa o PIN e os indicadores visuais.
 * Roda as funções REAIS de public/tecnico/index.html com a tela trocada por dublês.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregar } = require('./testes-offline/apoio/extrair-funcao');

function montarTela() {
    const pontos = {};
    for (let i = 0; i < 4; i++) pontos['d' + i] = { className: 'pin-dot' };
    const chamadas = { telas: [], toasts: [], sessaoLimpa: 0 };
    const ctx = carregar(
        'tecnico',
        ['updateDots', 'logoutTecnico'],
        {
            document: { getElementById: id => pontos[id] },
            limparSessao: () => { chamadas.sessaoLimpa++; },
            showScreen: nome => chamadas.telas.push(nome),
            showToast: (msg, tipo) => chamadas.toasts.push({ msg, tipo })
        },
        ["var pinBuffer = '';"]
    );
    const preenchidos = () => Object.values(pontos).filter(p => p.className.includes('filled')).length;
    return { ctx, chamadas, preenchidos };
}

test('CT-29 [Caixa Branca] Logout do técnico limpa PIN e indicadores visuais', () => {
    const { ctx, chamadas, preenchidos } = montarTela();
    ctx.pinBuffer = '0123';
    ctx.updateDots();
    assert.equal(preenchidos(), 4, 'os 4 pontos devem estar preenchidos antes do logout');

    ctx.logoutTecnico();

    assert.equal(ctx.pinBuffer, '', 'pinBuffer deve ficar vazio após o logout');
    assert.equal(preenchidos(), 0, 'nenhum ponto deve continuar preenchido após o logout');
    assert.equal(chamadas.sessaoLimpa, 1, 'a sessão deve ser limpa');
    assert.deepEqual(chamadas.telas, ['pin'], 'deve voltar para a tela do PIN');
});