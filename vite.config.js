import { defineConfig } from 'vite';

// Dev server only: a page opened with ?perf=<seconds> posts its frame-time numbers here when it is done,
// and they are printed in the server's log; so are the numbers saved from the lighting bench (?tune).
// Nothing of this is in the built game.
const perfLog = {
  name: 'perf-log',
  configureServer(server) {
    server.middlewares.use('/__perf', (req, res) => {
      console.log('[perf] ' + decodeURIComponent((req.url || '').replace(/^\/?\??/, '')));
      res.end('ok');
    });
    // the lighting bench (?tune): its SAVE button posts the numbers here
    server.middlewares.use('/__tune', (req, res) => {
      console.log('[tune] ' + decodeURIComponent((req.url || '').replace(/^\/?\??/, '')));
      res.end('ok');
    });
  },
};

export default defineConfig({ base: './', build: { outDir: 'dist', chunkSizeWarningLimit: 1500 }, plugins: [perfLog] });
