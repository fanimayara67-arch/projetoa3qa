/**
 * UC01 — Reportar defeito em poste | Testes de unidade do app do cidadão
 * (public/js/cidadao: domain/Report.js, application/EnviarReporte.js,
 * infrastructure/GeolocationService.js). Os módulos são ES Modules, por isso o import dinâmico.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const importar = caminho => import(`../../../public/js/cidadao/${caminho}`);

const formulario = (alterar = {}) => ({
  tipo: 'apagado',
  gps: { lat: -10.1253, lng: -36.1756, acc: 8 },
  foto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
  ...alterar
});

test('RP-02 (cliente) [caixa-preta | tabela de decisão] envio só é liberado com GPS, tipo e foto (passo 6, A4, A5)', async () => {
  const { criarReport, validarReport } = await importar('domain/Report.js');
  for (const temGps of [true, false]) {
    for (const temTipo of [true, false]) {
      for (const temFoto of [true, false]) {
        const report = criarReport(formulario({
          gps: temGps ? formulario().gps : null,
          tipo: temTipo ? 'apagado' : null,
          foto: temFoto ? formulario().foto : null
        }));
        const liberado = validarReport(report).length === 0;
        assert.equal(liberado, temGps && temTipo && temFoto, `GPS=${temGps}, tipo=${temTipo}, foto=${temFoto}`);
      }
    }
  }
});

test('RP-12 [caixa-preta | partição válida] protocolo no formato IC-AAMMDD-XXXXX com a data do aparelho', async () => {
  const { gerarProtocolo } = await importar('domain/Report.js');
  // 06/11/2026 às 23h30 no horário local: a data do protocolo é a do aparelho.
  const data = new Date(2026, 10, 6, 23, 30);
  for (let i = 0; i < 1000; i += 1) {
    assert.match(gerarProtocolo(data), /^IC-261106-[0-9A-Z]{5}$/);
  }
});

test('RP-13 [baseada em risco | perda de reporte] grava na fila antes de enviar; sem rede fica pendente (A1)', async () => {
  const { enviarReporte } = await importar('application/EnviarReporte.js');
  const eventos = [];
  const repo = { async salvar(report) { eventos.push(['salvar', report.protocolo]); } };

  const semRede = await enviarReporte(formulario(), {
    repo,
    sincronizar: async () => { eventos.push(['sincronizar']); return { sincronizados: 0, falhas: 1 }; }
  });
  assert.equal(semRede.sucesso, true);
  assert.equal(semRede.modo, 'queued');
  assert.match(semRede.report.protocolo, /^IC-\d{6}-[0-9A-Z]{5}$/, 'o cidadão recebe o protocolo mesmo sem rede');
  assert.deepEqual(eventos.map(e => e[0]), ['salvar', 'sincronizar'], 'a gravação local vem antes do envio');

  const comRede = await enviarReporte(formulario(), { repo, sincronizar: async () => ({ sincronizados: 1, falhas: 0 }) });
  assert.equal(comRede.modo, 'sent');

  eventos.length = 0;
  const incompleto = await enviarReporte(formulario({ foto: null }), { repo, sincronizar: async () => assert.fail('não pode sincronizar') });
  assert.equal(incompleto.sucesso, false);
  assert.equal(eventos.length, 0, 'reporte inválido não vai para a fila');
});

test('RP-16 [caixa-preta | valor-limite] classificação da precisão do GPS: 10 m e 25 m (passo 2)', async () => {
  const { classificarPrecisao } = await importar('infrastructure/GeolocationService.js');
  const casos = [[0, 'excellent'], [10, 'excellent'], [10.01, 'good'], [25, 'good'], [25.01, 'poor'], [500, 'poor']];
  for (const [metros, esperado] of casos) {
    assert.equal(classificarPrecisao(metros), esperado, `${metros} m`);
  }
});

test('RP-16 [suposição de erro] precisão desconhecida ou negativa não é exibida como "Excelente" (passo 2, A3)', async () => {
  const { classificarPrecisao } = await importar('infrastructure/GeolocationService.js');
  for (const valor of [null, undefined, NaN, -1, 'abc']) {
    assert.equal(classificarPrecisao(valor), 'poor', `precisão ${String(valor)}`);
  }
});
