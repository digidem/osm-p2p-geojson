var topojson = require('topojson')
var union = require('@turf/union')
var clone = require('clone')

// [Polygon] -> GeoJSON (Polygon/MultiPolygon)
module.exports = function (lst, opts) {
  opts = opts || {}
  opts.impl = opts.impl || 'turf'

  if (opts.impl === 'topojson') {
    return topojsonMerge(lst)
  } else if (opts.impl === 'turf') {
    return turfMerge(lst)
  } else {
    throw new Error('invalid merge implementation (' + opts.impl + ')')
  }
}

function turfMerge (lst) {
  // Map polygons to features -- turf-union requires this.
  lst = lst.map(function (poly) {
    return {
      type: 'Feature',
      properties: {},
      geometry: poly
    }
  })

  // turf-union also requires the list of polygons be provided as explicit
  // function arguments.
  var feature = union.apply(this, lst)

  // Unpack the Feature back into its contents.
  var result = feature.geometry

  return result
}

function topojsonMerge (lst) {
  // Clone the input list, since topojson will mutate its input.
  lst = clone(lst)

  var topo = topojson.topology({
    poly: {
      type: 'GeometryCollection',
      geometries: lst
    }
  })
  var result = topojson.merge(topo, topo.objects.poly.geometries)

  // Flatten a one-element MultiPolygon into a Polygon.
  if (result.type === 'MultiPolygon' && result.coordinates.length === 1) {
    return {
      type: 'Polygon',
      coordinates: result.coordinates[0]
    }
  } else {
    return result
  }
}
