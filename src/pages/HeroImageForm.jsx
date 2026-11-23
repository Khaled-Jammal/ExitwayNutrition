import { useState } from 'react'
import { readApiResponse } from '../data/readApiResponse'
import { compressImage } from '../data/compressImage'

const maxOriginalPhotoBytes = 25 * 1024 * 1024

export default function HeroImageForm({ currentImage, onSaved }) {
  const [photo, setPhoto] = useState('')
  const [photoSize, setPhotoSize] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setMessage('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhoto('')
      setPhotoSize(0)
      setError('Choose a JPEG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > maxOriginalPhotoBytes) {
      setPhoto('')
      setPhotoSize(0)
      setError('The original photo must be 25 MB or smaller.')
      event.target.value = ''
      return
    }
    try {
      const compressed = await compressImage(file)
      setPhoto(compressed.dataUrl)
      setPhotoSize(compressed.size)
    } catch (photoError) {
      setPhoto('')
      setPhotoSize(0)
      setError(photoError.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!photo) {
      setError('Choose a new homepage photo first.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/site-settings/hero-image', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo }),
      })
      const result = await readApiResponse(response)
      onSaved(result.heroImage)
      setPhoto('')
      setPhotoSize(0)
      setMessage(result.warning || `Homepage photo updated (${Math.ceil(photoSize / 1024)} KB).`)
    } catch (requestError) {
      setError(requestError.message || 'Unable to update the homepage photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-product-form hero-image-form" onSubmit={submit}>
      <img className="admin-hero-preview" src={photo || currentImage} alt="Homepage hero preview"/>
      <label>Choose a new homepage photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange}/></label>
      {photoSize > 0 && <small className="form-note">Photo optimized to {Math.ceil(photoSize / 1024)} KB (max 500 KB).</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-note" role="status">{message}</p>}
      <div className="admin-form-actions">
        <button className="primary-button" type="submit" disabled={busy || !photo}>{busy ? 'Saving...' : 'Save homepage photo'}</button>
      </div>
    </form>
  )
}
