import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query, pool } from './pool.js';

async function runMigration() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const sqlPath = path.resolve(currentDir, '../../sql/001_init.sql');

  const sql = await fs.readFile(sqlPath, 'utf-8');
  await query(sql);

  console.log('Migracao executada com sucesso.');
}

runMigration()
  .catch((error) => {
    console.error('Erro ao executar migracao:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
