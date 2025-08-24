module.exports = {
  apps: [{
    name: 'ems-insight',
    script: 'npm',
    args: 'start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      DATABASE_URL: 'postgresql://neondb_owner:YOUR_PASSWORD_HERE@ep-nameless-bonus-aegajrzu-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    
    // Restart delay configuration
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 4000,
    
    // Crash handling
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};