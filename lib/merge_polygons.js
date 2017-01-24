var topojson = require('topojson')
var clone = require('clone')

// [Polygon] -> GeoJSON (Polygon/MultiPolygon)
module.exports = function (lst) {
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

