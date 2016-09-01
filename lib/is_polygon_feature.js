var OsmPolygonFeatures = require('osm-polygon-features')

OsmPolygonFeatures = OsmPolygonFeatures.reduce(function (p, v) {
  if (v.polygon === 'all') {
    p[v.key] = true
  } else {
    var tagValues = {}
    v.values.forEach(function (value) { tagValues[value] = true })
    p[v.key] = {}
    // v.polygon is 'whitelist' || 'blacklist'
    p[v.key][v.polygon] = tagValues
  }
  return p
}, {})

/**
 * Check whether a given geojson feature is a polygon
 * @param {object} feature GeoJSON Feature
 * @param {array|function} polygonFeatures a list of tag keys and values that are polygons,
 *   for schema see https://github.com/tyrasd/osm-polygon-features/blob/master/schema.json
 * @return {boolean}
 */
module.exports = function isPolygonFeature (coords, tags, polygonFeatures) {
  if (typeof polygonFeatures === 'function') return polygonFeatures(coords, tags)
  polygonFeatures = polygonFeatures || OsmPolygonFeatures
  if (!Array.isArray(coords)) return false
  if (!coordsEqual(coords[0], coords[coords.length - 1])) return false
  if (!tags || tags.area === 'no') return false

  var val
  var pfk
  for (var key in tags) {
    val = tags[key]
    pfk = polygonFeatures[key]
    // continue with next if tag is unknown or not "categorizing"
    if (typeof pfk === 'undefined') continue
    // continue with next if tag is explicitely un-set ("building=no")
    if (val === 'no') continue
    // check polygon features for: general acceptance, included or excluded values
    if (pfk === true) return true
    if (pfk.whitelist && pfk.whitelist[val] === true) return true
    if (pfk.blacklist && pfk.blacklist[val] !== true) return true
  }
  // if no tags matched, this ain't no area.
  return false
}

function coordsEqual (coords1, coords2) {
  if (!coords1 || !coords2) return false
  return coords1[0] === coords2[0] && coords1[1] === coords2[1]
}
