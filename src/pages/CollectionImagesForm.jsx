import { useState } from 'react'
import { compressImage } from '../data/compressImage'
import { defaultCollectionImages } from '../data/collectionImages'
import { readApiResponse } from '../data/readApiResponse'

const imageOptions = [
  { key: 'hair', label: 'Hair loss' },
  { key: 'vitamins', label: 'Vitamins' },
  { key: 'bodybuilder', label: 'Bodybuilder' },
  { key: 'otherProducts', label: 'Other products (Fruits)' },
]
const maxOriginalPhotoBytes = 25 * 1024 * 1024

export default function CollectionImagesForm({ images, onImageUpdated }) {
  const [selectedImages, setSelectedImages] = useState({})
  const [photoSizes, setPhotoSizes] = useState({})
  const [errors, setErrors] = useState({})
  const [messages, setMessages] = useState({})
  const [busyKey, setBusyKey] = useState('')

  async function handlePhotoChange(key, event) {
    const file = event.target.files?.[0]
    if (!file) return
    setErrors((current) => ({ ...current, [key]: '' }))
    setMessages((current) => ({ ...current, [key]: '' }))

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSelectedImages((current) => ({ ...current, [key]: '' }))
      setPhotoSizes((current) => ({ ...current, [key]: 0 }))
      setErrors((current) => ({ ...current, [key]: 'Choose a JPEG, PNG, or WebP image.' }))
      event.target.value = ''
      return
    }
    if (file.size > maxOriginalPhotoBytes) {
      setSelectedImages((current) => ({ ...current, [key]: '' }))
      setPhotoSizes((current) => ({ ...current, [key]: 0 }))
      setErrors((current) => ({ ...current, [key]: 'The original photo must be 25 MB or smaller.' }))
      event.target.value = ''
      return
    }

    try {
      const compressed = await compressImage(file)
      setSelectedImages((current) => ({ ...current, [key]: compressed.dataUrl }))
      setPhotoSizes((current) => ({ ...current, [key]: compressed.size }))
    } catch (error) {
      setSelectedImages((current) => ({ ...current, [key]: '' }))
      setPhotoSizes((current) => ({ ...current, [key]: 0 }))
      setErrors((current) => ({ ...current, [key]: error.message || 'Could not compress the selected photo.' }))
    }
  }

  async function saveImage(key, event) {
    event.preventDefault()
    const form = event.currentTarget
    const photo = selectedImages[key]
    if (!photo) {
      setErrors((current) => ({ ...current, [key]: 'Choose a new photo first.' }))
      return
    }

    const photoSize = photoSizes[key]
    setBusyKey(key)
    setErrors((current) => ({ ...current, [key]: '' }))
    setMessages((current) => ({ ...current, [key]: '' }))
    try {
      const response = await fetch(`/api/admin/site-settings/collection-images/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo }),
      })
      const result = await readApiResponse(response)
      onImageUpdated(key, result.image)
      setSelectedImages((current) => ({ ...current, [key]: '' }))
      setPhotoSizes((current) => ({ ...current, [key]: 0 }))
      setMessages((current) => ({ ...current, [key]: result.warning || `Image updated (${Math.ceil(photoSize / 1024)} KB).` }))
      form.reset()
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: error.message || 'Unable to update this image.' }))
    } finally {
      setBusyKey('')
    }
  }

  return (
    <div className="admin-collection-images">
      {imageOptions.map(({ key, label }) => (
        <form className="admin-collection-item" key={key} onSubmit={(event) => saveImage(key, event)}>
          <strong>{label}</strong>
          <img className="admin-collection-preview" src={selectedImages[key] || images[key] || defaultCollectionImages[key]} alt={`${label} collection preview`}/>
          <label>Choose a new photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePhotoChange(key, event)}/></label>
          {photoSizes[key] > 0 && <small className="form-note">Optimized to {Math.ceil(photoSizes[key] / 1024)} KB (max 500 KB).</small>}
          {errors[key] && <p className="form-error" role="alert">{errors[key]}</p>}
          {messages[key] && <p className="form-note" role="status">{messages[key]}</p>}
          <button className="primary-button" type="submit" disabled={busyKey === key || !selectedImages[key]}>{busyKey === key ? 'Saving...' : 'Save image'}</button>
        </form>
      ))}
    </div>
  )
}
