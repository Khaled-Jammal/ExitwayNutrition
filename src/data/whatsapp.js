const phoneNumber = '96181712946'

export function whatsappLink(message) {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`
}
