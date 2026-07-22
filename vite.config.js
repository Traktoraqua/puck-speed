import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// basicSsl serves the dev server over HTTPS with a self-signed cert, so
// getUserMedia (camera/mic) works when testing on a phone over the LAN —
// browsers only allow it in a secure context (HTTPS or localhost).
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true },
});
