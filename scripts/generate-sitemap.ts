#!/usr/bin/env tsx
/**
 * Sitemap generator for STAIJA
 * Runs at build time to generate sitemap.xml with all public routes.
 * Excludes authenticated/admin/staff routes.
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'

// Public routes that should be indexed
const PUBLIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/programs/stepup-scholars', changefreq: 'monthly', priority: 0.8 },
  { path: '/programs/dynamerge', changefreq: 'monthly', priority: 0.8 },
  { path: '/get-involved', changefreq: 'monthly', priority: 0.6 },
  { path: '/donate', changefreq: 'monthly', priority: 0.6 },
  { path: '/stay-connected', changefreq: 'monthly', priority: 0.5 },
  { path: '/about', changefreq: 'yearly', priority: 0.5 },
  { path: '/press', changefreq: 'monthly', priority: 0.4 },
  { path: '/blog', changefreq: 'weekly', priority: 0.7 },
  { path: '/contact', changefreq: 'yearly', priority: 0.4 },
  { path: '/events', changefreq: 'weekly', priority: 0.7 },
  { path: '/login', changefreq: 'yearly', priority: 0.3 },
  { path: '/signup', changefreq: 'yearly', priority: 0.3 },
]

// Static base URL - replace with actual production URL
const BASE_URL = 'https://staija.org'

function generateSitemap(): string {
  const today = new Date().toISOString().split('T')[0]

  const urls = PUBLIC_ROUTES.map(route => `  <url>
    <loc>${BASE_URL}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
}

function main() {
  const sitemap = generateSitemap()
  const outputPath = resolve(process.cwd(), 'public/sitemap.xml')
  writeFileSync(outputPath, sitemap)
  console.log(`✅ Generated sitemap.xml at ${outputPath}`)
  console.log(`   ${PUBLIC_ROUTES.length} URLs included`)
}

main()