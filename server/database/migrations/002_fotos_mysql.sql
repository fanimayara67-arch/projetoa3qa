-- ============================================================================
-- ILUMINA CORURIPE — Migration 002: fotos guardadas no MySQL
-- Usada quando o servidor roda com STORAGE_DRIVER=mysql (ex.: Render, cujo disco é
-- apagado a cada deploy). As tabelas de negócio continuam guardando só o endereço
-- (/uploads/fotos/<nome>); a foto fica aqui e a rota GET /uploads/fotos/:arquivo a entrega.
-- MySQL 8+ compatível. Rodar depois da 001.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fotos (
  nome       VARCHAR(64)  NOT NULL PRIMARY KEY,
  tipo       VARCHAR(20)  NOT NULL,
  dados      MEDIUMBLOB   NOT NULL,
  criado_em  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
