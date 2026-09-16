import type { Plugin } from 'vite';
import { generateImage, validateRequest } from '../src/generation/provider';

/** Development-only, same-origin loopback relay. No credentials or content are persisted. */
export function imageGenerationPlugin(): Plugin {
  return {
    name: 'local-image-generation',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/generate-image', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const reply = (status: number, body: unknown) => {
          if (res.destroyed) return;
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const host = req.headers.host ?? '';
        const origin = req.headers.origin;
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || origin !== `http://${host}`) {
          reply(403, { error: 'Image generation is available only from this local app.' }); return;
        }
        if (req.method !== 'POST') { reply(405, { error: 'Use POST.' }); return; }
        if (!req.headers['content-type']?.startsWith('application/json')) { reply(415, { error: 'Use JSON.' }); return; }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 180_000);
        const disconnect = () => controller.abort();
        res.on('close', disconnect);
        try {
          let body = '';
          let length = 0;
          const decoder = new TextDecoder();
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 8_100_000) { reply(413, { error: 'Selection is too large. Select a smaller area.' }); return; }
            body += decoder.decode(chunk, { stream: true });
          }
          body += decoder.decode();
          let input;
          try { input = validateRequest(JSON.parse(body)); }
          catch (error) { reply(400, { error: error instanceof SyntaxError ? 'Invalid request.' : (error as Error).message }); return; }
          try {
            const image = await generateImage(input, controller.signal);
            reply(200, { image });
          } catch (error) {
            const message = controller.signal.aborted ? 'Generation stopped or timed out. Your provider may still charge for the request.'
              : error instanceof TypeError ? 'Could not reach the provider. Check your internet connection.'
              : (error as Error).message;
            reply(502, { error: message });
          }
        } catch {
          reply(400, { error: 'Could not read the request. Try again.' });
        } finally {
          clearTimeout(timer);
          res.off('close', disconnect);
        }
      });
    },
  };
}
