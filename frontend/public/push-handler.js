/* Script local importado pelo Service Worker gerado pelo Workbox.
 * A notificação abre apenas rota local, impedindo redirects externos.
 */
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { payload = {} }
  const titulo = typeof payload.title === 'string' ? payload.title.slice(0, 100) : 'Alerta de Chuva Cajamar'
  const corpo = typeof payload.body === 'string' ? payload.body.slice(0, 240) : 'Confira as condições de chuva no aplicativo.'
  const tag = typeof payload.tag === 'string' ? payload.tag.slice(0, 100) : 'chuva-cajamar'
  event.waitUntil(self.registration.showNotification(titulo, {
    body: corpo,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    data: { url: '/analise-preventiva' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL('/analise-preventiva', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) { await existing.navigate(url); return existing.focus() }
    return self.clients.openWindow(url)
  })())
})
