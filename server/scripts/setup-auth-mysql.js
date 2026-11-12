const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const { gerarHashPin } = require('../src/infrastructure/security/hashPin');

async function main() {
  const dbName = process.env.DB_NAME || 'db_iluminacao';
  const baseConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
  };

  // 1. Garante que o banco existe
  const initConn = await mysql.createConnection(baseConfig);
  await initConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await initConn.end();

  // 2. Conecta no banco e cria as 3 tabelas da autenticacao
  const conn = await mysql.createConnection({ ...baseConfig, database: dbName });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      perfil VARCHAR(20) NOT NULL,
      pin_hash VARCHAR(255) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sessoes (
      token CHAR(64) PRIMARY KEY,
      usuario_id INT NOT NULL,
      expira_em TIMESTAMP NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sessoes_expira (expira_em),
      FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS tentativas_login (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip VARCHAR(45) NOT NULL,
      perfil VARCHAR(20),
      sucesso TINYINT(1) NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tentativas_login_ip_tempo (ip, criado_em)
    )
  `);

  // 3. Cadastra ou atualiza o tecnico ativo com PIN '0123'
  const pinHash = await gerarHashPin('0123');
  const [rows] = await conn.query(
    "SELECT id FROM usuarios WHERE perfil = 'tecnico' AND ativo = 1 LIMIT 1"
  );

  if (rows.length === 0) {
    await conn.query(
      "INSERT INTO usuarios (nome, perfil, pin_hash, ativo) VALUES (?, 'tecnico', ?, 1)",
      ['Tecnico Padrao QA', pinHash]
    );
    console.log('OK: Tabelas criadas e tecnico ativo cadastrado com PIN 0123.');
  } else {
    await conn.query('UPDATE usuarios SET pin_hash = ? WHERE id = ?', [pinHash, rows[0].id]);
    console.log('OK: Tabelas conferidas e PIN 0123 atualizado no tecnico id=' + rows[0].id);
  }

  await conn.end();
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});