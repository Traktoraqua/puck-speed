import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// basicSsl serves the dev server over HTTPS with a self-signed cert, so
// getUserMedia (camera/mic) works when testing on a phone over the LAN —
// browsers only allow it in a secure context (HTTPS or localhost).
export default defineConfig({
  // Relative base so the build works under any path, incl. the GitHub Pages
  // project subpath (traktoraqua.github.io/puck-speed/) as well as at root.
  base: './',
  plugins: [basicSsl()],
  server: { host: true },
});
