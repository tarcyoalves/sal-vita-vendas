module.exports = {
  apps: [
    {
      name: 'sal-vita-leads',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
    },
  ],
};
