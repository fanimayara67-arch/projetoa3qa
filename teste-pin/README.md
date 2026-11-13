# Documentação de Testes - Tarefas de Estabilização Login PIN Técnico

## Visão Geral

Este documento registra todos os testes executados ao longo das 6 tarefas de estabilização e validação do fluxo de login via PIN do painel do técnico.

### Contador de Testes

| Total Planejado | Total Executado | Status |
|-----------------|-----------------|-----------|
| 28              | 28              | Concluído |

---

## Tarefa 1 - Verificar a tela do PIN após a separação do CSS

### Casos de Teste (CT-01 a CT-06)

| CT-# | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **CT-01** | Carregamento do `design-tokens.css` | Aprovado | Todos os tokens CSS carregam sem erro 404 |
| **CT-02** | Carregamento do `tecnico.css` | Aprovado | Tokens `var(--brand-*)`, `var(--surface-*)`, `var(--radius-lg: 22px)` presentes |
| **CT-03** | Carregamento do `utilities.css` | Aprovado | Classes utilitárias `.u-border-1px-solid-brand-blue`, `.u-color-brand-blue` etc. carregam |
| **CT-04** | Renderização dos 4 indicadores (dots) PIN | Aprovado | 4 dots (`id="d0"`, `id="d1"`, `id="d2"`, `id="d3"`) aparecem na tela |
| **CT-05** | Preenchimento numérico do PIN | Aprovado | Digitar números 1-4 preenche os dots visualmente |
| **CT-06** | Botão apagar (⌫) do PIN | Aprovado | Botão limpa o PIN e zera os dots |

---

## Tarefa 2 - Conferir a configuração antes de mudar a lógica do login

### Casos de Teste (CT-07 a CT-12)

| CT-# | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **CT-07** | Verificar se `/shared/config.js` existe após `npm run build` | Aprovado | Build gera config.js com `ILUMINA_API_URL=http://localhost:3001` |
| **CT-08** | Confirmar que `window.ILUMINA.API_URL` está definido | Aprovado | `API_URL: http://localhost:3001` no config.js gerado |
| **CT-09** | Proteção contra `window.ILUMINA` ausente | Aprovado | Optional chaining (`?.`) adicionado em 3 locais no HTML |
| **CT-10** | Disparo de `POST /api/auth/login` no 4º dígito | Aprovado | Conexão com backend Node.js validada |
| **CT-11** | Verificar fallback quando `USA_API_NODE = false` | Aprovado | Testado com ILUMINA_API_URL vazia |
| **CT-12** | Acesso seguro a variáveis globais de ambiente | Aprovado | Variáveis protegidas com optional chaining |

---

## Tarefa 3 - Manter o requisito de PIN com quatro dígitos

### Casos de Teste (CT-13 a CT-17)

| CT-# | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **CT-13** | Validação de PIN exato de 4 dígitos | Aprovado | O sistema aceita a entrada corretamente |
| **CT-14** | Rejeição de PIN com menos de 4 dígitos | Aprovado | Retorna erro antes de enviar requisição |
| **CT-15** | Rejeição de PIN com mais de 4 dígitos | Aprovado | Bloqueio de digitação excedente |
| **CT-16** | Rejeição de caracteres não numéricos | Aprovado | Apenas números (0-9) são aceitos na regex |
| **CT-17** | Atualização da regra regex no AuthService | Aprovado | Regex alterada de `/^\d{4,8}$/` para `/^\d{4}$/` |

---

## Tarefa 4 - Preparar e validar o banco da autenticação no MySQL

### Casos de Teste (CT-18 a CT-22)

| CT-# | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **CT-18** | Conexão com o banco `db_iluminacao` | Aprovado | Conexão via `mysql2` validada |
| **CT-19** | Criação das tabelas e migrações | Aprovado | Tabelas `usuarios`, `sessoes` e `tentativas_login` criadas |
| **CT-20** | Cadastro de técnico ativo via Seed | Aprovado | Técnico cadastrado com PIN '0123' |
| **CT-21** | Verificação de hash Scrypt | Aprovado | PIN armazenado com segurança (`scrypt$...`) |
| **CT-22** | Autenticação backend (Login Correto / Incorreto) | Aprovado | Retorno de token na API ou erro 401 |

---

## Tarefa 5 - Testar o bloqueio e regras de segurança

### Casos de Teste (CT-23 a CT-28)

| CT-# | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **CT-23** | Registro de tentativas falhas de login | Aprovado | Contabiliza erro no banco a cada falha |
| **CT-24** | Bloqueio após 5 tentativas incorretas (Força Bruta) | Aprovado | Retorna HTTP 429 após 5 falhas no PIN |
| **CT-25** | 8 req/min consecutivas geram HTTP 429 no Rate Limiter | Aprovado | Middleware de Rate Limit atuando corretamente |
| **CT-26** | Liberação do rate limit após janela de tempo | Aprovado | Requisições liberadas após 1 minuto |
| **CT-27** | Tempo de espera (Lockout) de 15 minutos | Aprovado | Usuário impedido de logar durante a punição |
| **CT-28** | Recuperação de acesso após bloqueio | Aprovado | Acesso concedido após expirado o tempo de bloqueio |

---

## Tarefa 6 - Validar o fluxo completo e atualizar o PWA

### Validações Manuais e de Integração

| Item | Descrição | Status | Observação |
|------|-----------|--------|------------|
| **01** | Integração Frontend/Backend | Aprovado | Comunicação estabelecida sem erro "Sem conexão" |
| **02** | Manifesto PWA (`manifest.json`) | Aprovado | `start_url`, `scope` e ícones referenciados corretamente |
| **03** | Service Worker (`sw.js`) | Aprovado | Rotas `/api/` e `/tecnico/` não sofrem interferência |
| **04** | Fluxo de Autenticação Real | Aprovado | Login no frontend gerando sessão no banco MySQL com sucesso |

---
