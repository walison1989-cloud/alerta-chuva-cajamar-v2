import { createCatalogService } from '../server/rain-sources.mjs'

const load = createCatalogService()
export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'method_not_allowed' })
    return
  }
  // Cache only public metadata, never cookies, addresses or sessions.
  response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
  const payload = await load()
  response.status(200).json(payload)
}
