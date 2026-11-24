export async function readApiResponse(response) {
  const body = await response.text()
  let result

  if (body) {
    try {
      result = JSON.parse(body)
    } catch {
      if (response.ok) throw new Error('The server returned an invalid response.')
    }
  }

  if (!response.ok) {
    throw new Error(
      result?.error
      || `The API returned HTTP ${response.status}. Make sure the API server is running with "npm run dev:server".`,
    )
  }
  if (!body) throw new Error('The server returned an empty response.')
  return result
}
