module.exports = {
  apps: [
    {
      name: "pawn-dev-6002",
      cwd: "./apps/api/backend",
      script: "src/server.js",
      interpreter: "node",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      env: {
        APP_ENV: "development",
        NODE_ENV: "development",
        PORT: "6002",
        PAWN_PORT: "6002",
        DOTENV_CONFIG_PATH: ".env.development",
        PAWN_ENV_OVERRIDE: "1",
        TRUST_PROXY: "0",
      },
    },
  ],
};
