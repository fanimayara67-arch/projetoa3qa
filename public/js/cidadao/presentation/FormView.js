/**
 * CAMADA DE APRESENTAÇÃO (CIDADÃO) — FormView.js
 * Manipula exclusivamente o DOM do formulário do cidadão, banner de pendentes e telas de sucesso.
 * Não contém lógica de rede (`fetch`) nem acesso direto ao IndexedDB.
 */

export class FormView {
  constructor(doc = typeof document !== 'undefined' ? document : null) {
    this.doc = doc;
  }

  $(id) {
    return this.doc ? this.doc.getElementById(id) : null;
  }

  lerFormulario(estadoExtra = {}) {
    return {
      tipo: estadoExtra.tipo || null,
      gps: estadoExtra.gps || null,
      foto: estadoExtra.foto || null,
      descricao: (this.$('descricao') && this.$('descricao').value) || '',
      nome: (this.$('nome') && this.$('nome').value) || '',
      tel: (this.$('tel') && this.$('tel').value) || '',
      endereco: (this.$('endereco') && this.$('endereco').value) || '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
    };
  }

  atualizarBotaoEnvio({ habilitado, enviando = false }) {
    const btn = this.$('submit-btn');
    const txt = this.$('submit-btn-text');
    if (btn) btn.disabled = !habilitado || enviando;
    if (txt) txt.textContent = enviando ? 'Enviando…' : 'Enviar reporte';
  }

  atualizarBannerFila(quantidadePendentes) {
    const banner = this.$('pending-banner');
    const txt = this.$('pending-text');
    if (!banner || !txt) return;

    if (quantidadePendentes > 0) {
      const plural = quantidadePendentes > 1;
      txt.innerHTML = `<span class="pending-count">${quantidadePendentes}</span> ${plural ? 'reportes pendentes' : 'reporte pendente'} — ${plural ? 'serão enviados' : 'será enviado'} quando houver sinal`;
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }

  mostrarResultadoEnvio(protocolo, modo = 'sent') {
    const icon = this.$('success-icon');
    const title = this.$('success-title');
    const text = this.$('success-text');
    const protoEl = this.$('success-protocol');
    const alertBox = this.$('iphone-alert');

    if (icon) {
      icon.classList.remove('sent', 'queued');
      icon.classList.add(modo === 'sent' ? 'sent' : 'queued');
    }

    if (modo === 'sent') {
      if (title) title.textContent = 'Reporte enviado';
      if (text) text.textContent = 'A equipe técnica da Prefeitura recebeu seu reporte e vai verificar o local.';
      if (alertBox) alertBox.classList.remove('show');
    } else {
      if (title) title.textContent = 'Salvo neste aparelho';
      if (text) text.textContent = 'Seu reporte foi salvo no aparelho e será enviado automaticamente quando houver internet.';
    }

    if (protoEl) protoEl.textContent = `Protocolo: ${protocolo}`;
  }
}
