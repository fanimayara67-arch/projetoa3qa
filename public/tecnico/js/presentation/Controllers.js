/**
 * CAMADA DE APRESENTAÇÃO (TÉCNICO) — Controllers.js
 * Coordena os fluxos de tela do Técnico, Gestor e Almoxarife com os serviços da Camada de Aplicação.
 */

import { fecharChamado } from '../application/FecharChamado.js';
import { sincronizarBaixas } from '../application/SincronizarBaixas.js';
import { gerarRotaOtimizada } from '../application/CarregarRota.js';
import { criarFechamentoAdministrativo } from '../domain/AdminClose.js';
import { fecharAdministrativamente } from '../application/FecharAdministrativamente.js';
import { autenticarPainel, carregarPainel, carregarFechados, carregarTentativas } from '../application/CarregarPainel.js';
import { rotuloTipo, rotuloStatusChamado } from '../domain/Ticket.js';

export class TechnicalControllers {
  constructor({ listView, closeFormView, stockView, ticketCache, closeQueue, photoCache, api }) {
    this.listView = listView;
    this.closeFormView = closeFormView;
    this.stockView = stockView;
    this.ticketCache = ticketCache;
    this.closeQueue = closeQueue;
    this.photoCache = photoCache;
    this.api = api;
  }

  async registrarBaixa(dadosFormulario, token) {
    return fecharChamado(dadosFormulario, {
      queue: this.closeQueue,
      sincronizar: () => this.sincronizarFila(token)
    });
  }

  async sincronizarFila(token) {
    return sincronizarBaixas({
      queue: this.closeQueue,
      api: this.api,
      token
    });
  }

  calcularRotaDoDia(chamados, pontoPartida) {
    return gerarRotaOtimizada(chamados, pontoPartida);
  }

  autenticar(pin) {
    return autenticarPainel(pin, { api: this.api });
  }

  async carregarChamados(token) {
    const dados = await carregarPainel(token, { api: this.api });
    return { ...dados, records: this.listView.prepararRegistros(dados.records) };
  }

  carregarFechadosParaRelatorio(token) {
    return carregarFechados(token, { api: this.api, rotuloTipo });
  }

  carregarTentativasParaRelatorio(token) {
    return carregarTentativas(token, { api: this.api, rotuloTipo, rotuloStatus: rotuloStatusChamado });
  }

  iniciarFechamentoAdministrativo() {
    return criarFechamentoAdministrativo().operacao_id;
  }

  fecharAdministrativamente(dados, token) {
    return fecharAdministrativamente(dados, { api: this.api, token });
  }
}
