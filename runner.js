// Este script inicializa o dotenv antes de usar o pool de conexão e cria o banco se ele nao existir.
require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
const { gerarHashPin } = require('../src/infrastructure/security/hashPin');

async function main() {
  console.log('=== Setup Auth MySQL ===\n');

  // 1. Conectar sem banco definido para criar o banco
  const poolSemBanco = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 5000
  });

  try {
    // Criar banco de dados se nao existir
    const dbName = process.env.DB_NAME || 'db_iluminacao';
    await poolSemBanco.query('CREATE DATABASE IF NOT EXISTS ' + dbName + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('Banco de dados ' + dbName + ' criado/confirmado.\n');
    
    // Agora usar o banco criado
    await poolSemBanco.changeUser({ database: dbName });
  } catch (erro) {
    console.error('Erro ao criar/conectar ao banco de dados:', erro.message);
    await poolSemBanco.end();
    process.exitCode = 1;
    return;
  }

  // 2. Pool com banco definido
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 5000
  });

  try {
    // 1. Verificar conexao
    const [rows] = await pool.query('SELECT 1 AS conectado');
    console.log('Conexao MySQL confirmada.\n');
  } catch (erro) {
    console.error('Falha na conexao MySQL:', erro.message);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  // 2. Executar migration
  console.log('Executando migration 001_inicial_mysql.sql...');
  const migrationPath = path.join(__dirname, '../database/migrations/001_inicial_mysql.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  
  try {
    await pool.query(migrationSQL);
    console.log('Migration executada com sucesso!\n');
  } catch (erro) {
    console.error('Erro ao executar migration:', erro.message);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  // 3. Gerar hash do PIN '0123'
  console.log('Gerando hash do PIN \"0123\"...');
  let hashPin;
  try {
    hashPin = await gerarHashPin('0123');
    console.log('Hash gerado com sucesso.');
  } catch (erro) {
    console.error('Erro ao gerar hash do PIN:', erro.message);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  // 4. Cadastro de tecnico ativo
  console.log('Cadastrando tecnico ativo no MySQL...');
  const checkSql = 'SELECT id FROM usuarios WHERE perfil = ? LIMIT 1';
  const [existing] = await pool.query(checkSql, ['tecnico']);
  
  if (existing.length > 0) {
    console.log('Ja existe tecnico ativo no banco. Atualizando hash do PIN...');
    await pool.query(
      'UPDATE usuarios SET pin_hash = ?, ativo = 1 WHERE perfil = ? LIMIT 1',
      [hashPin, 'tecnico']
    );
    console.log('Hash do PIN atualizado com sucesso!');
  } else {
    await pool.query(
      'INSERT INTO usuarios (nome, perfil, pin_hash, ativo) VALUES (?, "tecnico", ?, 1)',
      ['Tecnico Padrão', hashPin]
    );
    console.log('Tecnico ativo cadastrado com sucesso!');
  }

  // 3. Verificacao final
  console.log('\n=== Verificacao Final ===');
  const [users] = await pool.query('SELECT id, nome, perfil, ativo FROM usuarios WHERE perfil = ?', ['tecnico']);
  console.log('Total de tecnicos no banco: ' + users.length);
  users.forEach(function(u) { console.log('  - ID: ' + u.id + ', Nome: ' + u.nome + ', Ativo: ' + u.ativo); });

  console.log('\n=== Setup Concluido com Sucesso ===');
  console.log('Voce pode testar o login com PIN \"0123\" no frontend.');
  
  await pool.end();
}

main();