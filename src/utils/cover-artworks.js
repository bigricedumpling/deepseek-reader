import { coverArtworkCatalog } from '../../server/cover-artwork-catalog.js'
import { API_BASE } from './api.js'

export const coverArtworks = coverArtworkCatalog.map(({ id, name }) => ({
  id, name,
  url: API_BASE + '/covers/' + id + '.webp',
  thumbnail: API_BASE + '/covers/' + id + '-thumb.webp'
}))

export function getCoverArtwork(id) {
  return coverArtworks.find(artwork => artwork.id === id)
}
