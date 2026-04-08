import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query, pool } from './pool.js';

async function runMigration() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const sqlDir = path.resolve(currentDir, '../../sql');
  const entries = await fs.readdir(sqlDir, { withFileTypes: true });

  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of migrationFiles) {
    const sqlPath = path.join(sqlDir, fileName);
    const sql = await fs.readFile(sqlPath, 'utf-8');
    await query(sql);
    console.log(`Migracao aplicada: ${fileName}`);
  }

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
