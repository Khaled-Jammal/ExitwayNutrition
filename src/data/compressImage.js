const maxCompressedBytes = 500000
const qualityLevels = [0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6]

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not compress the selected photo.'))
    }, type, quality)
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the compressed photo.'))
    reader.readAsDataURL(blob)
  })
}

export async function compressImage(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('The selected file is not a readable image.')
  }

  try {
    let maxDimension = 1600
    while (maxDimension >= 600) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not prepare the photo for compression.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

      for (const quality of qualityLevels) {
        let blob = await canvasToBlob(canvas, 'image/webp', quality)
        if (blob.type !== 'image/webp') {
          blob = await canvasToBlob(canvas, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', quality)
        }
        if (blob.size <= maxCompressedBytes) {
          return { dataUrl: await blobToDataUrl(blob), size: blob.size }
        }
      }

      maxDimension = Math.floor(maxDimension * 0.85)
    }

    throw new Error('Could not reduce this photo below 500 KB. Try a smaller image.')
  } finally {
    bitmap.close()
  }
}
