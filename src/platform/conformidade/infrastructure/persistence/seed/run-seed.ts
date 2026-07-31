/**
 * Execução manual (T010, tasks.md): popular `platform.contextos_com_dado_pessoal`.
 * Requer DATABASE_URL apontando para o ambiente destino.
 *
 *   DATABASE_URL=postgres://... npx tsx src/platform/conformidade/infrastructure/persistence/seed/run-seed.ts
 */
import { db } from '../../../../../shared-kernel/database/client.js';
import { seedContextosComDadoPessoal } from './contextos-com-dado-pessoal.seed.js';

seedContextosComDadoPessoal(db)
  .then(() => {
    console.log('[seed] platform.contextos_com_dado_pessoal populada.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('[seed] falhou:', error);
    process.exit(1);
  });
