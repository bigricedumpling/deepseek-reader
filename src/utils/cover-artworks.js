import { coverArtworkCatalog } from '../../server/cover-artwork-catalog.js'
import { API_BASE } from './api.js'

const artworks = coverArtworkCatalog.map(artwork => ({
  ...artwork,
  url: API_BASE + '/covers/' + artwork.id + '.webp',
  thumbnail: API_BASE + '/covers/' + artwork.id + '-thumb.webp'
}))

export const coverArtworks = artworks.filter(artwork => !artwork.archived)

export function getCoverArtwork(id) {
  return artworks.find(artwork => artwork.id === id)
}
