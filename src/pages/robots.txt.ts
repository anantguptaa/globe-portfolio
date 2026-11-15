/**
 * robots.txt, built at build time. Allows every crawler on every page and points to the
 * sitemap. It's a code file (not a static file in public/) so the sitemap address follows the
 * site address set in astro.config.mjs (SITE_URL).
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error('Set `site` in astro.config.mjs: robots.txt needs it for the sitemap address');
  const sitemap = new URL('sitemap-index.xml', site).href;
  const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
