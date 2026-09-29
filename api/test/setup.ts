// Runs before every test file (before the app modules are imported and read their config).
process.env['NODE_ENV'] = 'test';
if (process.env['TEST_DATABASE_URL']) process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['GATE_API_KEY'] = 'test-gate-key';
process.env['ADMIN_EMAIL'] = 'admin@test.local';
process.env['ADMIN_PASSWORD'] = 'test-admin-password';
process.env['ADMIN_NAME'] = 'Test Admin';
process.env['APP_TIMEZONE'] = 'Europe/Zurich';
process.env['PUBLIC_APP_URL'] = 'http://parklens.test/';
process.env['SEED_DEMO_DATA'] = 'false';
process.env['WEBHOOK_URL'] = '';
process.env['WEBHOOK_FORMAT'] = 'generic';
