/**
 * TESTES UNITÁRIOS — Camada de Domínio (Servidor e Cliente PWA)
 * Executa em milissegundos com `node --test`, sem depender de banco SQL, rede ou navegador.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Chamado = require('../src/domain/Chamado');
const Poste = require('../src/domain/Poste');
const Fechamento = require('../src/domain/Fechamento');
const ItemEstoque = require('../src/domain/ItemEstoque');
const Missao = require('../src/domain/Missao');

test('Domínio Chamado: permite fechar apenas chamados abertos ou em_atendimento', () => {
  assert.equal(Chamado.podeFechar({ status: 'aberto' }), true);
  assert.equal(Chamado.podeFechar({ status: 'em_atendimento' }), true);
  assert.equal(Chamado.podeFechar({ status: 'fechado' }), false);
  assert.equal(Chamado.podeFechar({ status: 'cancelado' }), false);
  assert.equal(Chamado.podeFechar(null), false);
});

test('Domínio Chamado: rejeita coordenada (0,0) e exige GPS válido ou poste_id do QR', () => {
  assert.equal(Chamado.coordenadasValidas(0, 0), false);
  assert.equal(Chamado.coordenadasValidas(-10.1254, -36.1759), true);

  const semLocalizacao = Chamado.validarNovoChamado({
    id: '6f1c2b0e-8d6a-4a57-9e0b-3c1f8a2d7e44',
    protocolo: 'IC-261104-ABCDE',
    tipo: 'apagado',
    lat: null,
    lng: null
  });
  assert.equal(semLocalizacao.valido, false);

  const comQrSemGps = Chamado.validarNovoChamado({
    id: '6f1c2b0e-8d6a-4a57-9e0b-3c1f8a2d7e44',
    protocolo: 'IC-261104-ABCDE',
    tipo: 'apagado',
    poste_id: 'P-0001',
    foto_base64: 'data:image/jpeg;base64,/9j/4AAQ' // a foto passou a ser obrigatória (D-01)
  });
  assert.equal(comQrSemGps.valido, true);
});

test('Domínio Poste: normaliza códigos de QR Code mantendo compatibilidade com placas físicas', () => {
  assert.equal(Poste.normalizarPosteId('p0001'), 'P-0001');
  assert.equal(Poste.normalizarPosteId('P-0042'), 'P-0042');
  assert.equal(Poste.normalizarPosteId('https://iluminacoruripe.netlify.app/?poste=P-0105'), 'P-0105');
  assert.equal(Poste.normalizarPosteId('invalido'), '');
});

test('Domínio ItemEstoque e Missao: valida saldo suficiente e impede retorno maior que saída', () => {
  const reator = { id: 1, nome: 'Reator 100W', saldo: 5, minimo: 2 };
  assert.equal(ItemEstoque.temSaldoSuficiente(reator, 3), true);
  assert.equal(ItemEstoque.temSaldoSuficiente(reator, 6), false);
  assert.equal(ItemEstoque.abaixoDoMinimo({ saldo: 1, minimo: 2 }), true);

  const retornoInvalido = Missao.validarRetornoMissao(
    [{ item_id: 1, qtd_saida: 4 }],
    [{ item_id: 1, qtd_retorno: 6 }]
  );
  assert.equal(retornoInvalido.valido, false);
});

test('Domínio Fechamento: exige operacao_id, status e serviço na baixa em campo', () => {
  const invalido = Fechamento.validarFechamentoCampo({ status: 'Resolvido' });
  assert.equal(invalido.valido, false);

  const valido = Fechamento.validarFechamentoCampo({
    operacao_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    status: 'Concluído',
    servico: 'Substituição de luminária LED 100W',
    // Passo 6 do UC05: foto do reparo e GPS (com precisão) são obrigatórios.
    foto_reparo_base64: 'data:image/jpeg;base64,AAAA', lat: -10.1253, lng: -36.1756, precisao_m: 8
  });
  assert.equal(valido.valido, true);
});

test('Arquitetura: garante isolamento das camadas (Domínio sem banco/HTTP e Apresentação sem SQL)', () => {
  const pastaDomain = path.resolve(__dirname, '../src/domain');
  for (const arq of fs.readdirSync(pastaDomain)) {
    const conteudo = fs.readFileSync(path.join(pastaDomain, arq), 'utf8');
    assert.equal(/require\(['"](pg|express|http|node:http|\.\.\/infrastructure)/.test(conteudo), false,
      `Violação de camada em domain/${arq}: o domínio não pode importar banco ou HTTP.`);
  }

  const pastaControllers = path.resolve(__dirname, '../src/presentation/controllers');
  for (const arq of fs.readdirSync(pastaControllers)) {
    const conteudo = fs.readFileSync(path.join(pastaControllers, arq), 'utf8');
    assert.equal(/require\(['"](pg|\.\.\/\.\.\/infrastructure\/repositories)/.test(conteudo), false,
      `Violação de camada em controllers/${arq}: controllers não podem acessar repositórios SQL diretamente.`);
  }
});
