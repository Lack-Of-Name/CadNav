import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resolveHttpsConfig = (env) => {
  if (env.VITE_DEV_HTTPS !== 'true') return undefined;

  const keyPath = resolve(process.cwd(), env.VITE_DEV_SSL_KEY ?? './certs/dev-key.pem');
  const certPath = resolve(process.cwd(), env.VITE_DEV_SSL_CERT ?? './certs/dev-cert.pem');

  if (!existsSync(keyPath) || !existsSync(certPath)) {
    console.warn('[vite] HTTPS requested but SSL files not found. Falling back to HTTP.');
    return undefined;
  }

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    base: './',
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https: resolveHttpsConfig(env),
      hmr: {
        protocol: env.VITE_DEV_HTTPS === 'true' ? 'wss' : 'ws',
        host: env.VITE_DEV_HMR_HOST || undefined,
        clientPort: env.VITE_DEV_HMR_CLIENT_PORT
          ? Number(env.VITE_DEV_HMR_CLIENT_PORT)
          : undefined
      }
    },
    preview: {
      host: '0.0.0.0',
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      https: resolveHttpsConfig(env)
    }
  };
});
