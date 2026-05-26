import { migrateDown, migrateUp } from '../src/infrastructure/migrations/migrate-runner.js';

const cmd = process.argv[2];
if (cmd === 'up') {
  const applied = await migrateUp();
  for (const name of applied) console.log(`Applied: ${name}`);
} else if (cmd === 'down') {
  const rolled = await migrateDown();
  console.log(rolled ? `Rolled back: ${rolled}` : 'No migrations to roll back');
} else {
  console.error('Usage: migrate.ts up|down');
  process.exit(1);
}
