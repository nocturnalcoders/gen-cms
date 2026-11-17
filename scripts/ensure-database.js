'use strict';

// Creates the Postgres database Strapi is configured to use, if it does not exist yet.
// Runs before `strapi start` in the container, where the CMS shares a Postgres server
// with the API and only the API's database is created by default.

const { Client } = require('pg');

async function main() {
  if (process.env.DATABASE_CLIENT !== 'postgres') return;

  const name = process.env.DATABASE_NAME || 'strapi';
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`DATABASE_NAME "${name}" must be lowercase letters, digits and underscores`);
  }

  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USERNAME || 'strapi',
    password: process.env.DATABASE_PASSWORD,
    // The maintenance database every Postgres server has.
    database: 'postgres',
  });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE ${name}`);
      console.log(`Created database ${name}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Could not prepare the database: ${error.message}`);
  process.exit(1);
});
