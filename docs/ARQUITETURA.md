# Arquitetura — Ilumina Coruripe

## Visão geral

```
     CIDADÃO (/)                         TÉCNICO (/tecnico/)
  ┌──────────────────┐                ┌─────────────────────────┐
  │ GPS + foto       │                │ PIN → token de sessão   │
  │ tipo de defeito  │                │ lista de chamados       │
  │ leitura de QR    │                │ rota do dia (Leaflet)   │
  │ fila IndexedDB   │                │ fechamento + foto       │
  └────────┬─────────┘                │ almoxarifado (PIN 2)    │
           │                          │ relatórios + QR de poste│
           │                          └───────────┬─────────────┘
           │                                      │
           │        public/shared/config.js       │
           └──────────────┬───────────────────────┘
                          │
        ┌─────────────────┴──────────────────┐
        │                                    │
  ENDPOINT_CIDADAO                   ENDPOINT_TECNICO
  (Apps Script)                      (Apps Script)
        └─────────────────┬──────────────────┘
                          │
                   Google Sheets
```

## Os dois pontos onde os apps se tocam

1. **QR do poste.** O painel técnico gera folhas de QR (`gerarRelatorioPostes`).
   Cada QR codifica `CIDADAO_URL + '/?poste=' + id`. `CIDADAO_URL` sai de
   `window.ILUMINA.APP_CIDADAO`, que é `location.origin` — mesmo deploy, sempre coerente.
   Atalho equivalente e mais curto: `/p/P-0001` (redirect no `netlify.toml`).

2. **`link_poste`.** O app do cidadão chama `ENDPOINT_TECNICO` — não o dele próprio —
   logo após enviar um reporte que veio de QR, para amarrar protocolo ↔ poste na planilha.
   É fire-and-forget: se falhar, o reporte já está salvo, só fica sem o vínculo.

O cidadão também chama `check_poste` antes de abrir o formulário, para avisar
"esse poste já tem chamado aberto" e evitar duplicata.

## Contrato da API

Tudo é `POST` com JSON. O app do cidadão manda `application/x-www-form-urlencoded`
com o campo `payload`; o técnico manda `text/plain` com o JSON no corpo
(driblando o preflight de CORS do Apps Script). Resposta sempre `{ success: bool, ... }`.

### ENDPOINT_CIDADAO
| action | payload | retorno |
|---|---|---|
| *(envio de reporte)* | `protocolo, tipo, gps, foto, ...` | confirmação do protocolo |

### ENDPOINT_TECNICO — público (sem token)
| action | payload |
|---|---|
| `check_poste` | `poste_id` |
| `link_poste` | `protocolo, poste_id` |
| `login` | `pin` → `{ token, expiry }` |
| `almox_login` | `pin` → `{ token }` |

### ENDPOINT_TECNICO — sessão do técnico (`token`)
| action | payload |
|---|---|
| `list` | `escopo` (`abertos` ou tudo) |
| `search` | `protocolo` |
| `get_poste_history` | `poste_id` |
| `list_postes` | — |
| `list_attempts` | — |
| `attempt` | `protocolo, ...` (visita sem resolução) |
| `close` | `protocolo, ...` (fechamento em campo) |
| `close_admin` | `protocolo, informante, justificativa, status` |

### ENDPOINT_TECNICO — sessão do almoxarife (`token` do `almox_login`)
| action | payload |
|---|---|
| `estoque_list` | — |
| `estoque_upsert` | `item, unidade, saldo, minimo` |
| `estoque_delete` | `item` |
| `missao_create` | `data, equipe, obs, itens` |
| `missao_list` | — |
| `missao_return` | `id_missao, retornos` |
| `material_report` | — |

## Estado no cliente

| Onde | Chave | Conteúdo |
|---|---|---|
| localStorage | `ilu_tech_session` | `{ token, expiry }` do técnico |
| localStorage | `ilu_tech_list_cache` | última lista de chamados, para abrir offline |
| IndexedDB | `ilumina_v2` / `reports` | reportes do cidadão aguardando envio |
| IndexedDB | `ilumina_tec` / `close_queue` | fechamentos pendentes (máx. 10) |
| IndexedDB | `ilumina_tec` / `citizen_photos` | fotos do cidadão em base64, para ver offline |

## Service workers

Dois SWs na mesma origem. O escopo mais específico ganha, então `/tecnico/` é servido
pelo SW do técnico. Mesmo assim o SW do cidadão tem um `return` explícito para
`/tecnico/*` — sem ele, na primeira visita ao painel (antes do SW do técnico instalar),
o cidadão serviria um `index.html` errado do cache.

Os dois usam `cache.add` item a item em vez de `cache.addAll`. `addAll` é atômico:
um único 404 rejeita a promise inteira e o app fica **sem nenhum** cache offline —
era exatamente o que acontecia, por causa de ícones e marcadores do Leaflet
listados no shell mas que nunca existiram no repositório.

## Pendências conhecidas

- PIN de 4 dígitos sem limite de tentativas no cliente. Rate limit precisa existir
  no Apps Script, senão são 10 mil combinações testáveis por força bruta.
- `apps-script/` está vazio: o código do backend só existe dentro do editor do
  Google. Enquanto não for exportado pra cá, não há histórico nem rollback dele.
