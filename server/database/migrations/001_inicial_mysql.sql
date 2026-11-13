-- ============================================================================
-- ILUMINA CORURIPE — Migration 001: Esquema Inicial MySQL
-- MySQL 8+ compatível
-- ============================================================================

-- 1. USUÁRIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nome        VARCHAR(120) NOT NULL,
  perfil      VARCHAR(20)  NOT NULL CHECK (perfil IN ('tecnico', 'gestor', 'almoxarife')),
  pin_hash    VARCHAR(255) NOT NULL,
  ativo       TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. SESSÕES
CREATE TABLE IF NOT EXISTS sessoes (
  token       CHAR(64) PRIMARY KEY,
  usuario_id  INT          NOT NULL,
  expira_em   TIMESTAMP    NOT NULL,
  criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);
CREATE INDEX idx_sessoes_expira ON sessoes (expira_em);

-- 3. TENTATIVAS DE LOGIN
CREATE TABLE IF NOT EXISTS tentativas_login (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ip          VARCHAR(45)  NOT NULL,
  perfil      VARCHAR(20),
  sucesso     TINYINT(1)   NOT NULL,
  criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tentativas_login_ip_tempo ON tentativas_login (ip, criado_em);

-- 4. POSTES
CREATE TABLE IF NOT EXISTS postes (
  id             VARCHAR(20) PRIMARY KEY,
  codigo         VARCHAR(60),
  bairro         VARCHAR(120),
  rua            VARCHAR(200),
  referencia     VARCHAR(255),
  endereco     VARCHAR(255),
  latitude     NUMERIC(9,6),
  longitude    NUMERIC(9,6),
  braco        VARCHAR(60),
  luminaria    VARCHAR(60),
  reator       VARCHAR(60),
  fotosensor   VARCHAR(60),
  porta_fusivel VARCHAR(60),
  fusivel      VARCHAR(60),
  cabo         VARCHAR(60),
  conector     VARCHAR(60),
  foto_ref_url  VARCHAR(500),
  obs          TEXT,
  atualizado_em TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. CHAMADOS
CREATE TABLE IF NOT EXISTS chamados (
  id           UUID PRIMARY KEY,
  protocolo    VARCHAR(30) UNIQUE NOT NULL,
  tipo         VARCHAR(40) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'aberto'
               CHECK (status IN ('aberto', 'em_atendimento', 'fechado', 'cancelado')),
  latitude     NUMERIC(9,6),
  longitude    NUMERIC(9,6),
  precisao_m   INT,
  descricao    TEXT,
  nome         VARCHAR(120),
  telefone     VARCHAR(30),
  endereco     VARCHAR(255),
  foto_url     VARCHAR(500),
  poste_id     VARCHAR(20) REFERENCES postes (id),
  user_agent   VARCHAR(180),
  criado_em    TIMESTAMP NOT NULL,
  recebido_em  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chamados_status ON chamados (status);
CREATE INDEX IF NOT EXISTS idx_chamados_poste  ON chamados (poste_id);

-- 6. TENTATIVAS DE ATENDIMENTO
CREATE TABLE IF NOT EXISTS tentativas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  operacao_id  CHAR(36) UNIQUE NOT NULL,
  chamado_id   CHAR(36)  NOT NULL REFERENCES chamados (id) ON DELETE CASCADE,
  tecnico_id   INT           NOT NULL REFERENCES usuarios (id),
  motivo       TEXT          NOT NULL,
  latitude     NUMERIC(9,6),
  longitude    NUMERIC(9,6),
  foto_url     VARCHAR(500),
  criado_em    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tentativas_chamado ON tentativas (chamado_id);

-- 7. FECHAMENTOS
CREATE TABLE IF NOT EXISTS fechamentos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  operacao_id     CHAR(36) UNIQUE NOT NULL,
  chamado_id      CHAR(36)  UNIQUE NOT NULL REFERENCES chamados (id) ON DELETE CASCADE,
  tecnico_id      INT REFERENCES usuarios (id),
  status          VARCHAR(40) NOT NULL,
  servico         TEXT,
  referencia      VARCHAR(255),
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  foto_url        VARCHAR(500),
  administrativo  TINYINT(1)  NOT NULL DEFAULT 0,
  informante      VARCHAR(120),
  justificativa   TEXT,
  data_fechamento TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. ITENS DE ESTOQUE
CREATE TABLE IF NOT EXISTS itens_estoque (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(120) UNIQUE NOT NULL,
  unidade       VARCHAR(20)  NOT NULL DEFAULT 'un',
  saldo         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  minimo        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (minimo >= 0),
  atualizado_em TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. MATERIAIS USADOS NO FECHAMENTO
CREATE TABLE IF NOT EXISTS fechamento_materiais (
  fechamento_id INT NOT NULL REFERENCES fechamentos (id) ON DELETE CASCADE,
  item_id       INT           NOT NULL REFERENCES itens_estoque (id),
  quantidade    NUMERIC(10,2) NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (fechamento_id, item_id)
);

-- 10. MISSÕES
CREATE TABLE IF NOT EXISTS missoes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  data       DATE          NOT NULL,
  equipe     VARCHAR(120)  NOT NULL,
  obs        TEXT,
  criado_por  INT REFERENCES usuarios (id),
  criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS missao_itens (
  missao_id   INT NOT NULL REFERENCES missoes (id) ON DELETE CASCADE,
  item_id     INT           NOT NULL REFERENCES itens_estoque (id),
  qtd_saida   NUMERIC(10,2) NOT NULL CHECK (qtd_saida > 0),
  qtd_retorno NUMERIC(10,2) CHECK (qtd_retorno IS NULL OR qtd_retorno >= 0),
  PRIMARY KEY (missao_id, item_id)
);

COMMIT;