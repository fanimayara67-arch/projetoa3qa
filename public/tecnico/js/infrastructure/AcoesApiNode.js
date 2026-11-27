/**
 * CAMADA DE INFRAESTRUTURA (TÉCNICO / ALMOXARIFADO) — AcoesApiNode.js
 *
 * As telas do almoxarifado, do histórico e relatório de postes, da busca por protocolo e da
 * tentativa montam as mensagens no formato do Apps Script: { action, token, ... }.
 * Com a API Node, este adaptador leva cada ação para a rota REST certa e devolve a resposta
 * no formato que a tela já sabe mostrar ({ success, ... } ou { success: false, error }).
 * Assim a mesma tela funciona com os dois servidores (DEF-15 e DEF-16).
 *
 * Login, lista de chamados, fechamento e fechamento administrativo já vão para a API Node
 * pela própria tela (UC04, UC05 e UC10) e não passam por aqui.
 */

import { api as apiPadrao } from '../../../shared/infrastructure/ApiClient.js';
import { gerarOperacaoId } from '../domain/Close.js';
import { rotuloTipo, statusParaTela, registroParaTela } from '../domain/Ticket.js';

/* ─────────────── Conversões ─────────────── */

const numero = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const texto = (v) => (v === null || v === undefined ? '' : String(v));

/** 'AAAA-MM-DD' ou data/hora ISO → 'dd/mm/aaaa' (a data pura não passa pelo fuso). */
function dataBR(valor) {
  if (!valor) return '';
  const pura = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
  if (pura) return `${pura[3]}/${pura[2]}/${pura[1]}`;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

function dataHoraBR(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 'dd/mm/aaaa' do campo da tela → 'AAAA-MM-DD'; vazio vira a data de hoje. */
function dataIso(valorBR) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valorBR || '').trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Materiais comuns de iluminação pública, sugeridos na tela de estoque. */
const MATERIAIS_SUGERIDOS = Object.freeze([
  'Lâmpada LED 100W', 'Lâmpada LED 150W', 'Luminária LED', 'Reator', 'Relé fotoelétrico',
  'Base para relé', 'Braço curto', 'Braço longo', 'Porta-fusível', 'Fusível', 'Cabo 2,5mm',
  'Conector de perfuração', 'Fita isolante'
]);

function itemDeEstoque(i) {
  return {
    item: i.nome,
    unidade: i.unidade || 'un',
    saldo: Number(i.saldo) || 0,
    minimo: Number(i.minimo) || 0,
    atualizado: dataHoraBR(i.atualizado_em)
  };
}

function missaoParaTela(m) {
  const itens = (m.itens || []).map(i => {
    const saida = Number(i.qtd_saida) || 0;
    const retorno = Number(i.qtd_retorno) || 0;
    return { item: i.nome, unidade: i.unidade || 'un', saida, retorno, consumo: saida - retorno };
  });
  const aberta = (m.itens || []).some(i => i.qtd_retorno === null || i.qtd_retorno === undefined);
  return { id: m.id, data: dataBR(m.data), equipe: m.equipe || '', obs: m.obs || '', status: aberta ? 'Aberta' : 'Fechada', itens };
}

function posteParaTela(p, extra = {}) {
  return {
    id: p.id,
    codigo: texto(p.codigo),
    bairro: texto(p.bairro),
    rua: texto(p.rua),
    referencia: texto(p.referencia),
    foto_ref: texto(p.foto_ref_url),
    lat: numero(p.latitude),
    lng: numero(p.longitude),
    qtd: Number(p.qtd) || 0,
    data_ult: dataHoraBR(p.data_ult),
    ...extra
  };
}

function chamadoDoPosteParaTela(c) {
  return {
    protocolo: c.protocolo,
    tipo: rotuloTipo(c.tipo),
    status: statusParaTela(c.status),
    data: dataHoraBR(c.criado_em),
    descricao: c.descricao || '',
    foto: c.foto_url || '',
    servico: c.servico || '',
    tecnico: c.tecnico || '',
    data_fechamento: dataHoraBR(c.data_fechamento),
    foto_reparo: c.foto_reparo_url || ''
  };
}

/* ─────────────── Respostas ─────────────── */

/** Recusa da API → formato da tela. Sessão vencida usa o código que a tela já trata. */
function recusa(resposta) {
  const erro = (resposta && resposta.error) || {};
  if (resposta && (resposta.status === 401 || erro.codigo === 'NAO_AUTENTICADO')) return { success: false, error: 'sessao_expirada' };
  return { success: false, error: (typeof erro === 'string' ? erro : erro.mensagem) || 'Não foi possível concluir.' };
}

const naoEncontrado = (resposta) => resposta && resposta.status === 404;

/* ─────────────── Ações ─────────────── */

const ACOES = {
  async almox_login(p, chamar) {
    const r = await chamar('/api/auth/almoxarifado', { method: 'POST', body: { pin: p.pin } });
    if (!r.ok) {
      // Aqui o 401 é PIN errado, não sessão vencida.
      const erro = r.error || {};
      return { success: false, error: erro.mensagem || 'PIN incorreto.' };
    }
    return { success: true, token: r.data.token, usuario: r.data.usuario };
  },

  async estoque_list(p, chamar) {
    const r = await chamar('/api/estoque', { token: p.token });
    if (!r.ok) return recusa(r);
    const itens = (r.data || []).map(itemDeEstoque);
    const cadastrados = new Set(itens.map(i => i.item.toLowerCase()));
    return { success: true, itens, sugeridos: MATERIAIS_SUGERIDOS.filter(s => !cadastrados.has(s.toLowerCase())) };
  },

  async estoque_upsert(p, chamar) {
    const r = await chamar('/api/estoque/' + encodeURIComponent(p.item), {
      method: 'PUT', token: p.token,
      body: { unidade: p.unidade, saldo: Number(p.saldo || 0), minimo: Number(p.minimo || 0) }
    });
    return r.ok ? { success: true } : recusa(r);
  },

  async estoque_delete(p, chamar) {
    const r = await chamar('/api/estoque/' + encodeURIComponent(p.item), { method: 'DELETE', token: p.token });
    return r.ok ? { success: true } : recusa(r);
  },

  async missao_create(p, chamar) {
    const r = await chamar('/api/missoes', {
      method: 'POST', token: p.token,
      body: {
        data: dataIso(p.data),
        equipe: p.equipe,
        obs: p.obs,
        itens: (p.itens || []).map(i => ({ nome: i.item, qtd_saida: Number(i.qtd) }))
      }
    });
    return r.ok ? { success: true, missao: r.data } : recusa(r);
  },

  async missao_list(p, chamar) {
    const r = await chamar('/api/missoes', { token: p.token });
    return r.ok ? { success: true, missoes: (r.data || []).map(missaoParaTela) } : recusa(r);
  },

  async missao_return(p, chamar) {
    const r = await chamar('/api/missoes/' + encodeURIComponent(p.id_missao) + '/retorno', {
      method: 'POST', token: p.token,
      body: { itens: (p.retornos || []).map(i => ({ nome: i.item, qtd_retorno: Number(i.qtd) })) }
    });
    return r.ok ? { success: true } : recusa(r);
  },

  async material_report(p, chamar) {
    const [estoque, missoes] = await Promise.all([
      chamar('/api/estoque', { token: p.token }),
      chamar('/api/missoes', { token: p.token })
    ]);
    if (!estoque.ok) return recusa(estoque);
    if (!missoes.ok) return recusa(missoes);
    return {
      success: true,
      // Mesma regra da lista de estoque da tela: repor quando há mínimo e o saldo chegou nele.
      estoque: (estoque.data || []).map(itemDeEstoque).map(i => ({ ...i, baixo: i.minimo > 0 && i.saldo <= i.minimo })),
      missoes: (missoes.data || []).map(missaoParaTela)
    };
  },

  async get_poste_history(p, chamar) {
    const r = await chamar('/api/postes/' + encodeURIComponent(p.poste_id) + '/historico', { token: p.token });
    if (naoEncontrado(r)) return { success: true, poste: null, chamados: [] };
    if (!r.ok) return recusa(r);
    const chamados = r.data.chamados || [];
    const ultimo = chamados.reduce((max, c) => (c.criado_em && (!max || c.criado_em > max) ? c.criado_em : max), null);
    const poste = posteParaTela(r.data.poste, { qtd: Number(r.data.poste.qtd ?? chamados.length) || 0, data_ult: dataHoraBR(ultimo) });
    return { success: true, poste, chamados: chamados.map(chamadoDoPosteParaTela) };
  },

  async list_postes(p, chamar) {
    const r = await chamar('/api/postes', { token: p.token });
    return r.ok ? { success: true, postes: (r.data || []).map(x => posteParaTela(x)) } : recusa(r);
  },

  async search(p, chamar) {
    const r = await chamar('/api/chamados/' + encodeURIComponent(p.protocolo), { token: p.token });
    if (naoEncontrado(r)) return { success: true, record: null };
    return r.ok ? { success: true, record: registroParaTela(r.data) } : recusa(r);
  },

  async attempt(p, chamar) {
    // O id fica no próprio payload: se a resposta se perder e a tela reenviar, a API não duplica.
    if (!p.operacao_id) p.operacao_id = gerarOperacaoId();
    const r = await chamar('/api/chamados/' + encodeURIComponent(p.protocolo) + '/tentativas', {
      method: 'POST', token: p.token,
      body: {
        operacao_id: p.operacao_id,
        motivo: p.motivo,
        latitude: numero(p.latitude),
        longitude: numero(p.longitude),
        foto_base64: p.foto_base64 || null
      }
    });
    return r.ok ? { success: true, tentativa: r.data } : recusa(r);
  }
};

/** A ação da tela tem rota na API Node por este adaptador? */
export function atendeAcao(acao) {
  return typeof acao === 'string' && Object.prototype.hasOwnProperty.call(ACOES, acao);
}

/**
 * Executa uma ação da tela na API Node.
 * Erro de rede não é tratado aqui: chega à tela, que mostra "Sem conexão".
 */
export async function executarAcao(payload, { api = apiPadrao, timeout } = {}) {
  const acao = payload && payload.action;
  if (!atendeAcao(acao)) return { success: false, error: `Ação "${acao}" não disponível na API Node.` };
  const chamar = (caminho, opcoes = {}) => api(caminho, timeout ? { ...opcoes, timeout } : opcoes);
  return ACOES[acao](payload, chamar);
}
