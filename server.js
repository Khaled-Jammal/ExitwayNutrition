import express from 'express'
import path from 'node:path'
import { randomBytes, randomUUID, createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const app = express()
const port = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

const sessionSecretConfigured = Boolean(process.env.SESSION_SECRET)
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
const adminIdentifier = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const adminPassword = process.env.ADMIN_PASSWORD || ''
const adminAuthConfigured = Boolean(sessionSecretConfigured && adminIdentifier && adminPassword)
const localAdminBypassEnabled = process.env.LOCAL_ADMIN_BYPASS === 'true'
  && process.env.NODE_ENV !== 'production'
  && !process.env.VERCEL
const localDevelopmentAdmin = { id: 'exitway-local-admin', email: 'local-development@localhost', role: 'admin' }
const sessionCookie = 'exitway_session'
const sessionLifetime = 7 * 24 * 60 * 60
const maxPhotoBytes = 500000
const storageBucket = 'product-images'
const allowedCategories = new Set(['Hairloss', 'Vitamins', 'Supplements', 'Other Products', 'Promotion Products'])
const collectionImageKeys = new Set(['hair', 'vitamins', 'bodybuilder', 'otherProducts'])
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseApiKey = supabaseSecretKey
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseApiKey) {
  throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_PUBLISHABLE_KEY for read-only access) in the server environment.')
}

const supabase = createClient(supabaseUrl, supabaseApiKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseWritesEnabled = Boolean(supabaseSecretKey)

function getProductPricing(price, category, discountPercent) {
  const percentage = category === 'Promotion Products' ? Number(discountPercent ?? 0) : 0
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null

  if (percentage === 0) return { price, oldPrice: null, discountPercent: 0 }

  const oldPrice = Math.round(price * 100) / 100
  return {
    price: Math.round(oldPrice * (1 - percentage / 100) * 100) / 100,
    oldPrice,
    discountPercent: percentage,
  }
}

if (!adminAuthConfigured) {
  console.warn('Admin sign-in is disabled; configure SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD.')
}

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

async function uploadImage(decoded, folder) {
  const imagePath = `${folder}/${randomUUID()}.${decoded.extension}`
  const contentType = decoded.extension === 'jpg' ? 'image/jpeg' : `image/${decoded.extension}`
  const { error } = await supabase.storage.from(storageBucket).upload(imagePath, decoded.image, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  })
  throwSupabaseError(error, 'Unable to upload image to Supabase Storage')
  return imagePath
}

async function removeImage(imagePath) {
  if (typeof imagePath !== 'string' || !/^(products|site)\/[\da-f-]{36}\.(jpg|png|webp)$/i.test(imagePath)) return
  const { error } = await supabase.storage.from(storageBucket).remove([imagePath])
  throwSupabaseError(error, 'Unable to remove image from Supabase Storage')
}

async function cleanupImage(imagePath, context) {
  try {
    await removeImage(imagePath)
    return null
  } catch (error) {
    console.error(context, error)
    return 'The record was saved, but an unused image could not be removed from Supabase Storage.'
  }
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role }
}

function safeEqual(left, right) {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    email: user.email,
    role: user.role,
    expiresAt: Date.now() + sessionLifetime * 1000,
  })).toString('base64url')
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readSession(req) {
  if (!adminAuthConfigured) return null
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))
  if (!cookie) return null

  let token
  try {
    token = decodeURIComponent(cookie.slice(sessionCookie.length + 1))
  } catch {
    return null
  }
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  if (!safeEqual(signature, expected)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!session.id || !session.email || session.role !== 'admin' || session.email !== adminIdentifier || session.expiresAt <= Date.now()) return null
    return { id: session.id, email: session.email, role: session.role }
  } catch {
    return null
  }
}

function isLoopbackRequest(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
}

function getRequestUser(req) {
  if (localAdminBypassEnabled && isLoopbackRequest(req)) return localDevelopmentAdmin
  return readSession(req)
}

function setSessionCookie(res, user) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(signSession(user))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifetime}${secure}`)
}

function requireAdmin(req, res, next) {
  const user = getRequestUser(req)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
  req.authUser = user
  next()
}

function requireSupabaseWrite(req, res, next) {
  if (!supabaseWritesEnabled) {
    return res.status(503).json({ error: 'Supabase is connected in read-only mode. Configure SUPABASE_SECRET_KEY on the server to enable admin changes.' })
  }
  next()
}

function decodePhoto(dataUrl) {
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) return { error: 'Upload a JPEG, PNG, or WebP product photo.' }

  const image = Buffer.from(match[2], 'base64')
  if (!image.length || image.length > maxPhotoBytes || image.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, '')) {
    return { error: 'Photos must be valid images no larger than 500 KB after compression.' }
  }

  const validSignature = match[1] === 'jpeg'
    ? image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
    : match[1] === 'png'
      ? image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'

  if (!validSignature) return { error: 'The uploaded file does not match its image type.' }
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
  return { image, extension }
}

app.use(express.json({ limit: '12mb' }))

app.get('/api/health', async (req, res) => {
  const [productsResult, settingsResult] = await Promise.all([
    supabase.from('products').select('id').limit(1),
    supabase.from('site_settings').select('id').eq('id', 'main').maybeSingle(),
  ])
  throwSupabaseError(productsResult.error, 'Supabase products check failed')
  throwSupabaseError(settingsResult.error, 'Supabase settings check failed')
  if (!settingsResult.data) throw new Error('Supabase site_settings is missing the required main row.')
  res.json({ database: 'connected', writesEnabled: supabaseWritesEnabled })
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
      [...collectionImageKeys].map((key) => [key, publicImageUrl(settings.collection_images?.[key])]),
    ),
  })
})

app.put('/api/admin/site-settings/hero-image', requireAdmin, requireSupabaseWrite, async (req, res) => {
  const decoded = decodePhoto(req.body?.photo)
  if (decoded.error) return res.status(400).json({ error: decoded.error })

  const settings = await getSiteSettingsRow()
  const imagePath = await uploadImage(decoded, 'site')
  const { data, error } = await supabase
    .from('site_settings')
    .update({ hero_image: imagePath, updated_at: new Date().toISOString() })
    .eq('id', 'main')
    .select('hero_image')
    .single()
  if (error) {
    await cleanupImage(imagePath, 'Could not remove homepage image after a failed settings update:')
    throwSupabaseError(error, 'Unable to save homepage image settings')
  }

  const warning = await cleanupImage(settings.hero_image, 'Could not remove the previous homepage image:')
  res.json({ heroImage: publicImageUrl(data.hero_image), warning })
})

app.put('/api/admin/site-settings/collection-images/:key', requireAdmin, requireSupabaseWrite, async (req, res) => {
  const { key } = req.params
  if (!collectionImageKeys.has(key)) return res.status(400).json({ error: 'Choose a valid home page collection.' })

  const decoded = decodePhoto(req.body?.photo)
  if (decoded.error) return res.status(400).json({ error: decoded.error })

  const settings = await getSiteSettingsRow()
  const imagePath = await uploadImage(decoded, 'site')
  const previousImage = settings.collection_images?.[key]
  const collectionImages = { ...settings.collection_images, [key]: imagePath }
  const { data, error } = await supabase
    .from('site_settings')
    .update({ collection_images: collectionImages, updated_at: new Date().toISOString() })
    .eq('id', 'main')
    .select('collection_images')
    .single()
  if (error) {
    await cleanupImage(imagePath, 'Could not remove collection image after a failed settings update:')
    throwSupabaseError(error, 'Unable to save collection image settings')
  }

  const warning = await cleanupImage(previousImage, 'Could not remove the previous collection image:')
  res.json({ key, image: publicImageUrl(data.collection_images[key]), warning })
})

app.get('/api/auth/me', (req, res) => {
  const localAccess = localAdminBypassEnabled && isLoopbackRequest(req)
  const user = getRequestUser(req)
  res.json({
    user,
    adminConfigured: adminAuthConfigured || localAccess,
    localAdminBypass: localAccess,
    supabaseWritesEnabled,
  })
})

app.post('/api/auth/register', (req, res) => {
  res.status(403).json({ error: 'Customer registration is disabled. Only the admin can sign in.' })
})

app.post('/api/auth/login', (req, res) => {
  const identifier = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!adminAuthConfigured) return res.status(503).json({ error: 'Admin sign-in requires SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD to be configured on the server.' })
  if (!identifier || !password || password.length > 128) return res.status(400).json({ error: 'Enter the admin username and password.' })
  if (identifier !== adminIdentifier || !safeEqual(password, adminPassword)) {
    return res.status(401).json({ error: 'Admin username or password is incorrect.' })
  }

  const admin = { id: 'exitway-admin', email: adminIdentifier, role: 'admin' }
  setSessionCookie(res, admin)
  res.json({ user: publicUser(admin) })
})

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
  res.status(204).end()
})

app.post('/api/admin/products', requireAdmin, requireSupabaseWrite, async (req, res) => {
  const { name, description, photo, amount, unit, price, category, discountPercent } = req.body
  const parsedAmount = Number(amount)
  const parsedPrice = Number(price)

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    return res.status(400).json({ error: 'Product name is required and must be 120 characters or fewer.' })
  }
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 2000) {
    return res.status(400).json({ error: 'Enter a description of 2,000 characters or fewer.' })
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100000 || !['g', 'ml', 'tablets'].includes(unit)) {
    return res.status(400).json({ error: 'Enter a valid amount and choose grams, ml, or tablets.' })
  }
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 1000000) {
    return res.status(400).json({ error: 'Enter a valid price greater than zero.' })
  }
  if (!allowedCategories.has(category)) return res.status(400).json({ error: 'Choose a valid product section.' })
  const pricing = getProductPricing(parsedPrice, category, discountPercent)
  if (!pricing) return res.status(400).json({ error: 'Enter a discount percentage from 0 to 100.' })

  const decoded = decodePhoto(photo)
  if (decoded.error) return res.status(400).json({ error: decoded.error })

  const imagePath = await uploadImage(decoded, 'products')
  const productRow = {
    name: name.trim(),
    description: description.trim(),
    category,
    amount: `${parsedAmount} ${unit}`,
    format: `${parsedAmount} ${unit}`,
    price: pricing.price,
    old_price: pricing.oldPrice,
    discount_percent: pricing.discountPercent,
    rating: 0,
    reviews: 0,
    badge: null,
    flavor: '',
    image: imagePath,
  }

  const { data, error } = await supabase.from('products').insert(productRow).select('*').single()
  if (error) {
    await cleanupImage(imagePath, 'Could not remove product image after a failed product insert:')
    throwSupabaseError(error, 'Unable to save product to Supabase')
  }
  res.status(201).json({ product: publicProduct(data) })
})

app.put('/api/admin/products/:id', requireAdmin, requireSupabaseWrite, async (req, res) => {
  const { data: current, error: loadError } = await supabase
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle()
  throwSupabaseError(loadError, 'Unable to load product from Supabase')
  if (!current) return res.status(404).json({ error: 'Product not found.' })

  const { name, description, photo, amount, unit, price, category, discountPercent } = req.body
  const parsedPrice = Number(price)
  const parsedAmount = amount === undefined || amount === '' ? null : Number(amount)
  const nextCategory = category === undefined ? current.category : category

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    return res.status(400).json({ error: 'Product name is required and must be 120 characters or fewer.' })
  }
  if (typeof description !== 'string' || description.length > 2000) {
    return res.status(400).json({ error: 'Description must be 2,000 characters or fewer.' })
  }
  if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100000 || !['g', 'ml', 'tablets'].includes(unit))) {
    return res.status(400).json({ error: 'Enter a valid amount and choose grams, ml, or tablets.' })
  }
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 1000000) {
    return res.status(400).json({ error: 'Enter a valid price greater than zero.' })
  }
  if (!allowedCategories.has(nextCategory)) return res.status(400).json({ error: 'Choose a valid product section.' })
  const pricing = getProductPricing(parsedPrice, nextCategory, discountPercent)
  if (!pricing) return res.status(400).json({ error: 'Enter a discount percentage from 0 to 100.' })

  let newImagePath
  if (photo !== undefined && photo !== '') {
    const decoded = decodePhoto(photo)
    if (decoded.error) return res.status(400).json({ error: decoded.error })
    newImagePath = await uploadImage(decoded, 'products')
  }

  const productUpdate = {
    name: name.trim(),
    description: description.trim(),
    category: nextCategory,
    amount: parsedAmount === null ? current.amount : `${parsedAmount} ${unit}`,
    format: parsedAmount === null ? current.format : `${parsedAmount} ${unit}`,
    price: pricing.price,
    old_price: pricing.oldPrice,
    discount_percent: pricing.discountPercent,
    image: newImagePath || current.image,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('products')
    .update(productUpdate)
    .eq('id', req.params.id)
    .select('*')
    .single()
  if (error) {
    if (newImagePath) await cleanupImage(newImagePath, 'Could not remove new product image after a failed update:')
    throwSupabaseError(error, 'Unable to update product in Supabase')
  }

  const warning = newImagePath
    ? await cleanupImage(current.image, 'Could not remove the previous product image:')
    : null
  res.json({ product: publicProduct(data), warning })
})

app.delete('/api/admin/products/:id', requireAdmin, requireSupabaseWrite, async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', req.params.id)
    .select('id, image')
    .maybeSingle()
  throwSupabaseError(error, 'Unable to delete product from Supabase')
  if (!data) return res.status(404).json({ error: 'Product not found.' })

  const warning = await cleanupImage(data.image, 'Product deleted, but its image could not be removed:')
  res.json({ deletedId: req.params.id, warning })
})

app.post('/api/orders', (req, res) => {
  const { items = [], customer = {} } = req.body
  if (!items.length) return res.status(400).json({ error: 'Cart is empty' })
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  res.status(201).json({
    id: `EW-${Date.now().toString().slice(-8)}`,
    status: 'confirmed',
    customer,
    items,
    subtotal,
    shipping: subtotal >= 60 ? 0 : 6,
  })
})

app.post('/api/newsletter', (req, res) => {
  if (!req.body.email?.includes('@')) return res.status(400).json({ error: 'Valid email required' })
  res.status(201).json({ message: 'Welcome to ExitWay' })
})

if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.status === 413) return res.status(413).json({ error: 'Request is too large.' })
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
  if (supabaseWritesEnabled) {
    const { error } = await supabase.storage.getBucket(storageBucket)
    if (error) {
      throw new Error(`Supabase Storage bucket "${storageBucket}" is unavailable. Run supabase/setup.sql. ${error.message}`)
    }
  }
}

if (!process.env.VERCEL) {
  await verifySupabaseConnection()
  const onListening = () => console.log(`ExitWay API running at http://localhost:${port} (Supabase connected${supabaseWritesEnabled ? '' : ', read-only'}${localAdminBypassEnabled ? ', local admin access enabled' : ''})`)
  if (localAdminBypassEnabled) {
    app.listen(port, '127.0.0.1', onListening)
  } else {
    app.listen(port, onListening)
  }
}

export default app
