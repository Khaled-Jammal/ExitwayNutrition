import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const app = express()
const port = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const storageBucket = 'product-images'
const collectionImageKeys = ['hair', 'vitamins', 'bodybuilder', 'otherProducts']

async function loadEnvironmentFile() {
  try {
    const contents = await readFile(path.join(__dirname, '.env'), 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!entry || entry[1].startsWith('#') || process.env[entry[1]] !== undefined) continue
      process.env[entry[1]] = entry[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

await loadEnvironmentFile()

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseApiKey = process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseApiKey) {
  throw new Error('Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the server environment.')
}

const supabase = createClient(supabaseUrl, supabaseApiKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function throwSupabaseError(error, operation) {
  if (!error) return
  const failure = new Error(`${operation}: ${error.message}`)
  failure.cause = error
  throw failure
}

function publicImageUrl(imagePath) {
  if (!imagePath) return null
  if (/^https?:\/\//i.test(imagePath)) return imagePath
  return supabase.storage.from(storageBucket).getPublicUrl(imagePath).data.publicUrl
}

function publicProduct(row) {
  return {
    ...row,
    price: Number(row.price),
    oldPrice: row.old_price == null ? null : Number(row.old_price),
    discountPercent: Number(row.discount_percent),
    rating: Number(row.rating),
    reviews: Number(row.reviews),
    image: publicImageUrl(row.image),
  }
}

async function getSiteSettingsRow() {
  const { data, error } = await supabase
    .from('site_settings')
    .select('hero_image, collection_images')
    .eq('id', 'main')
    .single()
  throwSupabaseError(error, 'Unable to load site settings')
  return data
}

app.get('/api/health', async (req, res) => {
  const [productsResult, settingsResult] = await Promise.all([
    supabase.from('products').select('id').limit(1),
    supabase.from('site_settings').select('id').eq('id', 'main').maybeSingle(),
  ])
  throwSupabaseError(productsResult.error, 'Supabase products check failed')
  throwSupabaseError(settingsResult.error, 'Supabase settings check failed')
  if (!settingsResult.data) throw new Error('Supabase site_settings is missing the required main row.')
  res.json({ database: 'connected' })
})

app.get('/api/products', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false })
  throwSupabaseError(error, 'Unable to load products from Supabase')
  const { category, search } = req.query
  let result = data.map(publicProduct)
  if (category && category !== 'All') result = result.filter((item) => item.category === category)
  if (search) {
    const query = String(search).toLowerCase()
    result = result.filter((item) => `${item.name} ${item.category} ${item.flavor}`.toLowerCase().includes(query))
  }
  res.json(result)
})

app.get('/api/site-settings', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const settings = await getSiteSettingsRow()
  res.json({
    heroImage: publicImageUrl(settings.hero_image),
    collectionImages: Object.fromEntries(
      collectionImageKeys.map((key) => [key, publicImageUrl(settings.collection_images?.[key])]),
    ),
  })
})

if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  console.error('Request failed:', error)
  res.status(500).json({ error: 'The server could not complete the request.' })
})

async function verifySupabaseConnection() {
  const [productsResult, settingsResult] = await Promise.all([
    supabase.from('products').select('id').limit(1),
    supabase.from('site_settings').select('id').eq('id', 'main').maybeSingle(),
  ])
  throwSupabaseError(productsResult.error, 'Supabase connection check failed for public.products')
  throwSupabaseError(settingsResult.error, 'Supabase connection check failed for public.site_settings')
  if (!settingsResult.data) {
    throw new Error('Supabase public.site_settings is missing the required main row. Run supabase/setup.sql.')
  }
}

if (!process.env.VERCEL) {
  await verifySupabaseConnection()
  app.listen(port, () => console.log(`ExitWay API running at http://localhost:${port} (public read-only access)`))
}

export default app
