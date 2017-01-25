// MultiPolygon|Polygon, MultiPolygon|Polygon -> Bool
module.exports = function (a, b) {
  if (a.type !== b.type) {
    return false
  }

  if (a.type === 'Polygon') {
    return polygonsEqual(a, b)
  } else if (a.type === 'MultiPolygon') {
    return multiPolygonsEqual(a, b)
  } else {
    throw new Error('type not supported (' + a.type + ')')
  }
}

// MultiPolygon, MultiPolygon -> Bool
function multiPolygonsEqual (a, b) {
  if (a.coordinates.length !== b.coordinates.length) {
    return false
  }

  for (var i = 0; i < a.coordinates; i++) {
    var poly1 = a.coordinates[i]
    var poly2 = b.coordinates[i]
    if (!polygonsEqual(poly1, poly2)) {
      return false
    }
  }

  return true
}

// Polygon, Polygon -> Bool
function polygonsEqual (a, b) {
  if (a.type !== 'Polygon' || a.type !== b.type) {
    return false
  }

  if (a.coordinates.length !== b.coordinates.length) {
    return false
  }

  for (var i = 0; i < a.coordinates; i++) {
    var ring1 = a.coordinates[i]
    var ring2 = b.coordinates[i]
    if (!linearRingsEqual(ring1, ring2)) {
      return false
    }
  }

  return true
}

// [[Number, Number]], [[Number, Number]] -> Bool
function linearRingsEqual (a, b) {
  if (a.length !== b.length) {
    return false
  }

  // Cut the head off of both polygons, since it is repeated at the end.
  a = a.slice(1)
  b = b.slice(1)

  // Compare a[i] to b[0] until all items match.
  var bc = b[0]
  for (var i = 0; i < a.length; i++) {
    var ac = a[i]
    if (coordsEqual(ac, bc)) {
      for (var j = 1; j < b.length; j++) {
        ac = a[(i + j) % a.length]
        bc = b[j]
        if (!coordsEqual(ac, bc)) {
          break
        }
      }
      return true
    }
  }

  return false
}

// [Number, Number], [Number, Number] -> Bool
function coordsEqual (a, b) {
  return a[0] === b[0] && a[1] === b[1]
}

module.exports.linearRingsEqual = linearRingsEqual
module.exports.coordsEqual = coordsEqual
