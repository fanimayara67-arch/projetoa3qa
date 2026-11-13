/** Acesso à API existente necessário para carregar os chamados dos itens 4 e 6. */
function exigirSucesso(resposta) {
  if (!resposta.ok) {
    const erro = new Error(resposta.error?.mensagem || 'Não foi possível acessar o serviço.');
    erro.status = resposta.status;
    throw erro;
  }
  return resposta.data;
}

export async function autenticarPainel(pin, { api }) {
  return exigirSucesso(await api('/api/auth/login', { method: 'POST', body: { pin } }));
}

export async function carregarPainel(token, { api }) {
  return exigirSucesso(await api('/api/chamados?escopo=abertos', { token }));
}

function formatarDataHoraBR(valor) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Carrega os chamados fechados (com dados do fechamento) para o relatório de atendimentos
 * e devolve no formato de registro que a tela de relatório já usa.
 */
export async function carregarFechados(token, { api, rotuloTipo = t => t }) {
  const dados = exigirSucesso(await api('/api/chamados?escopo=fechados', { token, timeout: 40000 }));
  return (dados.records || []).map(chamado => {
    const f = chamado.fechamento || {};
    return {
      protocolo: chamado.protocolo,
      tipo: rotuloTipo(chamado.tipo),
      status: f.status || 'Fechado',
      data_fechamento: formatarDataHoraBR(f.data),
      tecnico: f.tecnico || '—',
      endereco: chamado.endereco || chamado.descricao || '',
      servico: f.servico || '',
      administrativo: Boolean(f.administrativo),
      foto_thumb: chamado.fotoUrl || null,
      foto_reparo: f.fotoUrl || null,
      config: {}
    };
  });
}

/**
 * Carrega as tentativas (visitas sem resolução) para o relatório de tentativas
 * e devolve no formato de registro que a tela de relatório já usa.
 */
export async function carregarTentativas(token, { api, rotuloTipo = t => t, rotuloStatus = s => s }) {
  const dados = exigirSucesso(await api('/api/tentativas', { token, timeout: 40000 }));
  return (dados.tentativas || []).map(t => ({
    protocolo: t.protocolo,
    tipo: rotuloTipo(t.tipo),
    status_atual: rotuloStatus(t.statusChamado),
    data: formatarDataHoraBR(t.criadoEm),
    tecnico: t.tecnico || '—',
    endereco: t.endereco || '',
    motivo: t.motivo || '',
    lat: t.lat,
    lng: t.lng,
    foto: t.fotoUrl || null,
    foto_defeito: t.fotoDefeitoUrl || null
  }));
}
