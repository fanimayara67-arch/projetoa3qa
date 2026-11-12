# Documentação de Testes - Tarefas de Estabilização Login PIN Técnico

## Visão Geral

Este documento registra todos os testes executados ao longo das 6 tarefas de estabilização e validação do fluxo de login via PIN do painel do técnico.

### Contador de Testes

| Total Planejado | Total Executado | Status |
|-----------------|-----------------|--------|
| 28              | 20              | ⏳ Em andamento |

---

## Tarefa 1 - Verificar a tela do PIN após a separação do CSS

### Casos de Teste (CT-01 a CT-06)

| CT-# | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **CT-01** | Carregamento do `design-tokens.css` | ✅ Aprovado | Todos os tokens CSS carregam sem erro 404 |
| **CT-02** | Carregamento do `tecnico.css` | ✅ Aprovado | Tokens `var(--brand-*)`, `var(--surface-*)`, `var(--radius-lg: 22px)` presentes |
| **CT-03** | Carregamento do `utilities.css` | ✅ Aprovado | Classes utilitárias `.u-border-1px-solid-brand-blue`, `.u-color-brand-blue` etc. carregam |
| **CT-04** | Renderização dos 4 indicadores (dots) PIN | ✅ Aprovado | 4 dots (`id="d0"`, `id="d1"`, `id="d2"`, `id="d3"`) aparecem na tela |
| **CT-05** | Preenchimento numérico do PIN | ✅ Aprovado | Digitar números 1-4 preenche os dots visualmente |
| **CT-06** | Botão apagar (⌫) do PIN | ✅ Aprovado | Botão limpa o PIN e zera os dots |

### URL de Teste
- `http://localhost:3000/tecnico/`

---

## Tarefa 2 - Conferir a configuração antes de mudar a lógica do login

### Casos de Teste (CT-07 a CT-12)

| CT-# | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **CT-07** | Verificar se `/shared/config.js` existe após `npm run build` | ✅ Aprovado | Build gera config.js com `ILUMINA_API_URL=http://localhost:3001` |
| **CT-08** | Confirmar que `window.ILUMINA.API_URL` está definido quando configuração presente | ✅ Aprovado | `API_URL: http://localhost:3001` no config.js gerado |
| **CT-09** | Proteção contra `window.ILUMINA` ausente | ✅ Aprovado | Optional chaining (`window.ILUMINA?.`) adicionado em 3 locais no HTML |
| **CT-10** | Disparo de `POST /api/auth/login` no 4º dígito | ⏳ Pendente | Requer backend Node.js rodando na porta 3001 |
| **CT-11** | Verificar fallback quando `USA_API_NODE = false` | ⏳ Pendente | Testar com ILUMINA_API_URL vazia - usa apiFetchTO com action 'login' |
| **CT-12** | Acesso seguro a `window.ILUMINA.ENDPOINT_TECNICO` e `window.ILUMINA.APP_CIDADAO` | ✅ Aprovado | As 3 variáveis agora usam optional chaining |

### Mudanças Realizadas

1. **`public/tecnico/index.html`** - Protegido acesso a `window.ILUMINA` com optional chaining:
   - Linha 782: `window.ILUMINA.ENDPOINT_TECNICO` → `window.ILUMINA?.ENDPOINT_TECNICO`
   - Linha 783: `window.ILUMINA.API_URL` → `window.ILUMINA?.API_URL`
   - Linha 2501: `window.ILUMINA.APP_CIDADAO` → `window.ILUMINA?.APP_CIDADAO?.`

2. **`.env`** - Já contém `ILUMINA_API_URL=http://localhost:3001`

3. **`public/shared/config.js`** - Gerado com sucesso contendo `API_URL: http://localhost:3001`

---

## Próximas Tarefas (3-6)

- **Tarefa 3**: Concluída - Manter o requisito de PIN com quatro dígitos (validada alteração da regex `/^\d{4,8}$/` para `/^\d{4}$/` no AuthService.js e 5 novos testes unitários aprovados).
- **Tarefa 4**: Preparar e validar o banco da autenticação no MySQL (`usuarios`, `sessoes`, `tentativas_login`, migration e cadastro de técnico ativo).
- **Tarefa 5**: Testar o bloqueio já implementado (5 tentativas incorretas -> 429 e limite de 8 req/min).
- **Tarefa 6**: Validar o fluxo completo e atualizar o PWA (service worker).

---

**Documentação gerada automaticamente pelo assistente Cline.**