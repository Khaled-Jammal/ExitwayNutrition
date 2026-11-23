import { useState } from 'react'
import { readApiResponse } from '../data/readApiResponse'
import { compressImage } from '../data/compressImage'

const maxOriginalPhotoBytes = 25 * 1024 * 1024

export default function ProductForm({ category, product, onSaved, onCancel }) {
  const parsedAmount = product?.amount?.match(/^(\d+(?:\.\d+)?)\s*(g|ml|tablets)$/i)
  const [name, setName] = useState(product?.name || '')
  const [description, setDescription] = useState(product?.description || '')
  const [amount, setAmount] = useState(parsedAmount?.[1] || '')
  const [unit, setUnit] = useState(parsedAmount?.[2]?.toLowerCase() || 'g')
  const [price, setPrice] = useState(product ? String(product.oldPrice ?? product.price) : '')
  const [discountPercent, setDiscountPercent] = useState(product?.discountPercent == null ? '0' : String(product.discountPercent))
  const [photo, setPhoto] = useState('')
  const [photoName, setPhotoName] = useState('')
  const [photoSize, setPhotoSize] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const editing = Boolean(product)
  const isSalesProduct = category === 'Promotion Products'
  const salePrice = Number(price) * (1 - Number(discountPercent || 0) / 100)

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhoto('')
      setPhotoSize(0)
      setPhotoName('')
      setError('Choose a JPEG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > maxOriginalPhotoBytes) {
      setPhoto('')
      setPhotoSize(0)
      setPhotoName('')
      setError('The original photo must be 25 MB or smaller.')
      event.target.value = ''
      return
    }
    try {
      setError('')
      const compressed = await compressImage(file)
      setPhoto(compressed.dataUrl)
      setPhotoSize(compressed.size)
      setPhotoName(file.name)
    } catch (photoError) {
      setPhoto('')
      setPhotoSize(0)
      setPhotoName('')
      setError(photoError.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!editing && !photo) {
      setError('Choose a product photo.')
      return
    }

    setBusy(true)
    try {
      const response = await fetch(editing ? `/api/admin/products/${encodeURIComponent(product.id)}` : '/api/admin/products', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          photo: photo || undefined,
          amount,
          unit,
          price,
          category,
          ...(isSalesProduct && { discountPercent }),
        }),
      })
      const result = await readApiResponse(response)
      onSaved(result.product, result.warning)
    } catch (requestError) {
      setError(requestError.message || 'Unable to save product. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-product-form" onSubmit={submit}>
      <label>Product name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Description<textarea required={!editing} maxLength={2000} rows="3" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>{editing ? 'Change photo (optional)' : 'Product photo'}<input type="file" accept="image/jpeg,image/png,image/webp" required={!editing} onChange={handlePhotoChange} /></label>
      {(photo || product?.image) && <img className="admin-photo-preview" src={photo || product.image} alt={photoName || `${name} product photo`} />}
      {photoSize > 0 && <small className="form-note">Photo optimized to {Math.ceil(photoSize / 1024)} KB (max 500 KB).</small>}
      <div className="admin-form-row">
        <label>Amount<input type="number" min="0.01" step="any" required={!editing} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Unit<select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="g">Grams (g)</option><option value="ml">Milliliters (ml)</option><option value="tablets">Tablets</option></select></label>
        <label>{isSalesProduct ? 'Regular price ($)' : 'Price ($)'}<input type="number" min="0.01" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      </div>
      {isSalesProduct && (
        <>
          <label>Discount (%)<input type="number" min="0" max="100" step="1" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} /></label>
          {Number(discountPercent) > 0 && Number.isFinite(salePrice) && Number(price) > 0 && <small className="form-note">Sales price: ${salePrice.toFixed(2)}</small>}
        </>
      )}
      {editing && !amount && <small className="password-hint">Leave amount blank to keep the current amount.</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving...' : editing ? 'Update product' : 'Save product'}</button>
        <button className="text-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
