require('dotenv').config();

type PgPool = import('pg').Pool;
type PgPoolCtor = typeof import('pg').Pool;

const { Pool } = require('pg') as { Pool: PgPoolCtor };

const pool: PgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = { pool };
