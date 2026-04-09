import dotenv from 'dotenv';
import app, { allowedOrigins } from './app.js';
import { seedInitialAdmin } from './db/seedAdmin.js';
import { startRollingScheduleMaintenance } from './services/rollingScheduleMaintenanceService.js';
import { startWeeklyResetMaintenance } from './services/weeklyResetService.js';

dotenv.config();

const port = Number(process.env.PORT || 3001);

async function bootstrap() {
  await seedInitialAdmin();
  await startRollingScheduleMaintenance();
  await startWeeklyResetMaintenance();

  app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
    console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });
}

bootstrap().catch((error) => {
  console.error('Falha ao iniciar servidor:', error.message);
  process.exit(1);
});
