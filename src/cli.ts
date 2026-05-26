#!/usr/bin/env node
import { migrateDown, migrateUp } from './infrastructure/migrations/migrate-runner.js';

const [command] = process.argv.slice(2);

async function main(): Promise<void> {
  if (command === 'migrate' || command === 'up') {
    const applied = await migrateUp();
    for (const name of applied) {
      console.log(`Applied: ${name}`);
    }
    if (applied.length === 0) {
      console.log('No pending migrations.');
    }
    return;
  }

  if (command === 'down') {
    const rolled = await migrateDown();
    if (!rolled) {
      console.log('No migrations to roll back.');
      return;
    }
    console.log(`Rolled back: ${rolled}`);
    return;
  }

  console.log(`
MariaBoss CLI

  npx mariaboss migrate     Apply pending SQL migrations
  npx mariaboss up          Alias for migrate
  npx mariaboss down        Roll back last migration batch

Environment: MARIABOSS_HOST, MARIABOSS_PORT, MARIABOSS_USER,
             MARIABOSS_PASSWORD, MARIABOSS_DATABASE
`);
  process.exit(command ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
