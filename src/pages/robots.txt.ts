/**
 * robots.txt, built at build time. Allows every crawler on every page.
 * It's a code file (not a static file in public/) so it can use the site address from
 * astro.config.mjs when a Sitemap line is added.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const body = ['User-agent: *', 'Allow: /', ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
