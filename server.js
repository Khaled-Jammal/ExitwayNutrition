import express from 'express'
import path from 'node:path'
import { randomBytes, randomUUID, createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'

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

const dataDirectory = path.resolve(process.env.EXITWAY_DATA_DIR || path.join(__dirname, 'data'))
const uploadDirectory = path.join(dataDirectory, 'uploads')
const productsFile = path.join(dataDirectory, 'products.json')
const siteSettingsFile = path.join(dataDirectory, 'site-settings.json')
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
const adminIdentifier = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const adminPassword = process.env.ADMIN_PASSWORD || ''
const sessionCookie = 'exitway_session'
const sessionLifetime = 7 * 24 * 60 * 60
const maxPhotoBytes = 500000
const allowedCategories = new Set(['Hairloss', 'Vitamins', 'Supplements', 'Other Products', 'Promotion Products'])
const collectionImageKeys = new Set(['hair', 'vitamins', 'bodybuilder', 'otherProducts'])
let storeWrites = Promise.resolve()

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

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in production.')
}

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not configured; sessions will be invalidated when the server restarts.')
}

const initialProducts = []

async function loadArray(file, fallback) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'))
    if (!Array.isArray(value)) throw new Error(`${path.basename(file)} must contain a JSON array.`)
    return value
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeFile(file, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8')
    return fallback
  }
}

async function loadObject(file, fallback) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${path.basename(file)} must contain a JSON object.`)
    }
    return { ...fallback, ...value }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeFile(file, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8')
    return fallback
  }
}

function persistArray(file, value) {
  storeWrites = storeWrites.catch(() => {}).then(async () => {
    const temporaryFile = `${file}.${randomUUID()}.tmp`
    await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporaryFile, file)
  })
  return storeWrites
}

function persistObject(file, value) {
  storeWrites = storeWrites.catch(() => {}).then(async () => {
    const temporaryFile = `${file}.${randomUUID()}.tmp`
    await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporaryFile, file)
  })
  return storeWrites
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

function setSessionCookie(res, user) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(signSession(user))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifetime}${secure}`)
}

function requireAdmin(req, res, next) {
  const user = readSession(req)
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
  req.authUser = user
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

function managedUploadPath(image) {
  const prefix = '/uploads/'
  if (typeof image !== 'string' || !image.startsWith(prefix)) return null
  const filename = image.slice(prefix.length)
  if (!/^[\da-f-]{36}\.(jpg|png|webp)$/i.test(filename)) return null
  return path.join(uploadDirectory, filename)
}

app.use(express.json({ limit: '12mb' }))

app.get('/api/products', (req, res) => {
  res.set('Cache-Control', 'no-store')
  const { category, search } = req.query
  let result = products
  if (category && category !== 'All') result = result.filter((item) => item.category === category)
  if (search) {
    const query = String(search).toLowerCase()
    result = result.filter((item) => `${item.name} ${item.category} ${item.flavor}`.toLowerCase().includes(query))
  }
  res.json(result)
})

app.get('/api/site-settings', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ heroImage: siteSettings.heroImage, collectionImages: siteSettings.collectionImages })
})

app.put('/api/admin/site-settings/hero-image', requireAdmin, async (req, res) => {
  const decoded = decodePhoto(req.body?.photo)
  if (decoded.error) return res.status(400).json({ error: decoded.error })

  const imageName = `${randomUUID()}.${decoded.extension}`
  const imagePath = path.join(uploadDirectory, imageName)
  await writeFile(imagePath, decoded.image, { flag: 'wx' })

  const previousSettings = siteSettings
  const updatedSettings = { ...siteSettings, heroImage: `/uploads/${imageName}` }
  siteSettings = updatedSettings
  try {
    await persistObject(siteSettingsFile, updatedSettings)
  } catch (error) {
    siteSettings = previousSettings
    await unlink(imagePath)
    throw error
  }

  let warning
  const oldImagePath = managedUploadPath(previousSettings.heroImage)
  if (oldImagePath) {
    try {
      await unlink(oldImagePath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Updated homepage photo, but could not remove the previous photo:', error)
        warning = 'Homepage photo updated, but the previous photo could not be removed.'
      }
    }
  }
  res.json({ heroImage: updatedSettings.heroImage, warning })
})

app.put('/api/admin/site-settings/collection-images/:key', requireAdmin, async (req, res) => {
  const { key } = req.params
  if (!collectionImageKeys.has(key)) return res.status(400).json({ error: 'Choose a valid home page collection.' })

  const decoded = decodePhoto(req.body?.photo)
  if (decoded.error) return res.status(400).json({ error: decoded.error })

  const imageName = `${randomUUID()}.${decoded.extension}`
  const imagePath = path.join(uploadDirectory, imageName)
  await writeFile(imagePath, decoded.image, { flag: 'wx' })

  const previousSettings = siteSettings
  const previousImage = siteSettings.collectionImages[key]
  const updatedImage = `/uploads/${imageName}`
  const updatedSettings = {
    ...siteSettings,
    collectionImages: { ...siteSettings.collectionImages, [key]: updatedImage },
  }
  siteSettings = updatedSettings
  try {
    await persistObject(siteSettingsFile, updatedSettings)
  } catch (error) {
    siteSettings = previousSettings
    await unlink(imagePath)
    throw error
  }

  let warning
  const oldImagePath = managedUploadPath(previousImage)
  if (oldImagePath) {
    try {
      await unlink(oldImagePath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Updated collection photo, but could not remove the previous photo:', error)
        warning = 'Collection photo updated, but the previous photo could not be removed.'
      }
    }
  }
  res.json({ key, image: updatedImage, warning })
})

app.get('/api/auth/me', (req, res) => {
  const user = readSession(req)
  res.json({ user, adminConfigured: Boolean(adminIdentifier && adminPassword) })
})

app.post('/api/auth/register', (req, res) => {
  res.status(403).json({ error: 'Customer registration is disabled. Only the admin can sign in.' })
})

app.post('/api/auth/login', (req, res) => {
  const identifier = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!adminIdentifier || !adminPassword) return res.status(503).json({ error: 'Admin credentials have not been configured on the server.' })
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

app.post('/api/admin/products', requireAdmin, async (req, res) => {
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

  const imageName = `${randomUUID()}.${decoded.extension}`
  const imagePath = path.join(uploadDirectory, imageName)
  await writeFile(imagePath, decoded.image, { flag: 'wx' })
  const product = {
    id: randomUUID(),
    name: name.trim(),
    description: description.trim(),
    category,
    amount: `${parsedAmount} ${unit}`,
    format: `${parsedAmount} ${unit}`,
    price: pricing.price,
    oldPrice: pricing.oldPrice,
    discountPercent: pricing.discountPercent,
    rating: 0,
    reviews: 0,
    badge: null,
    flavor: '',
    image: `/uploads/${imageName}`,
  }

  products.push(product)
  try {
    await persistArray(productsFile, products)
  } catch (error) {
    products = products.filter((entry) => entry.id !== product.id)
    await unlink(imagePath)
    throw error
  }

  res.status(201).json({ product })
})

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const productIndex = products.findIndex((item) => String(item.id) === req.params.id)
  if (productIndex === -1) return res.status(404).json({ error: 'Product not found.' })

  const current = products[productIndex]
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

  let newImagePath = null
  let nextImage = current.image
  if (photo !== undefined && photo !== '') {
    const decoded = decodePhoto(photo)
    if (decoded.error) return res.status(400).json({ error: decoded.error })
    const imageName = `${randomUUID()}.${decoded.extension}`
    newImagePath = path.join(uploadDirectory, imageName)
    await writeFile(newImagePath, decoded.image, { flag: 'wx' })
    nextImage = `/uploads/${imageName}`
  }

  const updatedProduct = {
    ...current,
    name: name.trim(),
    description: description.trim(),
    category: nextCategory,
    amount: parsedAmount === null ? current.amount : `${parsedAmount} ${unit}`,
    format: parsedAmount === null ? current.format : `${parsedAmount} ${unit}`,
    price: pricing.price,
    oldPrice: pricing.oldPrice,
    discountPercent: pricing.discountPercent,
    image: nextImage,
  }
  products[productIndex] = updatedProduct
  try {
    await persistArray(productsFile, products)
  } catch (error) {
    products[productIndex] = current
    if (newImagePath) await unlink(newImagePath)
    throw error
  }

  let warning
  if (newImagePath) {
    const oldImagePath = managedUploadPath(current.image)
    if (oldImagePath) {
      try {
        await unlink(oldImagePath)
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Updated product, but could not remove its previous photo:', error)
          warning = 'Product updated, but its previous photo could not be removed.'
        }
      }
    }
  }
  res.json({ product: updatedProduct, warning })
})

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const productIndex = products.findIndex((item) => String(item.id) === req.params.id)
  if (productIndex === -1) return res.status(404).json({ error: 'Product not found.' })

  const [deletedProduct] = products.splice(productIndex, 1)
  try {
    await persistArray(productsFile, products)
  } catch (error) {
    products.splice(productIndex, 0, deletedProduct)
    throw error
  }

  let warning
  const imagePath = managedUploadPath(deletedProduct.image)
  if (imagePath) {
    try {
      await unlink(imagePath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Deleted product, but could not remove its photo:', error)
        warning = 'Product deleted, but its uploaded photo could not be removed.'
      }
    }
  }
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

app.use('/uploads', express.static(uploadDirectory, { index: false }))
app.use(express.static(path.join(__dirname, 'dist')))
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.status === 413) return res.status(413).json({ error: 'Request is too large.' })
  console.error('Request failed:', error)
  res.status(500).json({ error: 'The server could not complete the request.' })
})

await mkdir(uploadDirectory, { recursive: true })
let products = await loadArray(productsFile, initialProducts)
const loadedSiteSettings = await loadObject(siteSettingsFile, { heroImage: null, collectionImages: {} })
const loadedCollectionImages = loadedSiteSettings.collectionImages && typeof loadedSiteSettings.collectionImages === 'object' && !Array.isArray(loadedSiteSettings.collectionImages)
  ? loadedSiteSettings.collectionImages
  : {}
let siteSettings = {
  ...loadedSiteSettings,
  collectionImages: {
    hair: null,
    vitamins: null,
    bodybuilder: null,
    otherProducts: null,
    ...loadedCollectionImages,
  },
}

app.listen(port, () => console.log(`ExitWay API running at http://localhost:${port}`))
