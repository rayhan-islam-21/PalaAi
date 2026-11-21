process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/pala_test?schema=public";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.PALA_DEMO_MODE = "false";
