// Unit tests never open a connection, but the environment check wants a DATABASE_URL to exist.
// `??=` keeps the real value that tests/setup/global.ts sets for the database tests.
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
