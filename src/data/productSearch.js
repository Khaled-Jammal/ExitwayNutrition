const aliases = {
  har: 'hair',
  harr: 'hair',
  hairs: 'hair',
  lass: 'loss',
  los: 'loss',
  fall: 'loss',
  hairloss: 'hair loss',
  hairfall: 'hair loss',
  vitamins: 'vitamin',
  supplements: 'supplement',
  bodybuilder: 'supplement',
  bodybuilders: 'supplement',
  bestsellers: 'other products',
}

function normalizeTokens(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (aliases[token] || token).split(' '))
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]
}

function scoreToken(query, candidate) {
  if (query === candidate) return 5
  if (candidate.startsWith(query)) return 4
  if (query.length > 1 && candidate.includes(query)) return 3
  if (query.length < 3) return 0

  const distance = editDistance(query, candidate)
  const maxDistance = query.length >= 6 ? 2 : 1
  return distance <= maxDistance ? 2 - distance * 0.25 : 0
}

function productTokens(product) {
  const details = `${product.name} ${product.category} ${product.format} ${product.flavor}`
  const normalized = normalizeTokens(details)
  if (/\bhair/i.test(details)) normalized.push('hair', 'loss')
  return normalized
}

function rankProducts(products, query) {
  const terms = normalizeTokens(query)
  return products.map((product) => {
    const availableTokens = productTokens(product)
    const scores = terms.map((term) => Math.max(0, ...availableTokens.map((candidate) => scoreToken(term, candidate))))
    return {
      product,
      matchedTerms: scores.filter((score) => score > 0).length,
      score: scores.reduce((total, score) => total + score, 0),
    }
  }).sort((left, right) => right.score - left.score || right.product.rating - left.product.rating)
}

export function searchProducts(products, query, limit = 4) {
  const terms = normalizeTokens(query)
  if (!terms.length) return { products, recommended: false }

  const ranked = rankProducts(products, query)
  const matches = ranked.filter((result) => result.matchedTerms === terms.length)
  if (matches.length) return { products: matches.map(({ product }) => product), recommended: false }

  const recommendations = ranked.filter((result) => result.score > 0)
  const picks = recommendations.length
    ? recommendations
    : [...ranked].sort((left, right) => right.product.rating - left.product.rating || right.product.reviews - left.product.reviews)
  return { products: picks.slice(0, limit).map(({ product }) => product), recommended: true }
}

export function matchesProductCategory(product, category) {
  const expected = normalizeTokens(category)
  if (expected.length === 1 && expected[0] === 'all') return true
  const actual = productTokens({ ...product, name: '', format: '', flavor: '' })
  return expected.every((term) => actual.includes(term))
}
