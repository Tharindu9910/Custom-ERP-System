// Runs before each spec file is loaded: tests log in many users and fire many
// requests, so lift the rate limits before AppModule validates the env.
process.env.THROTTLE_LIMIT = '1000000';
process.env.THROTTLE_AUTH_LIMIT = '1000000';
