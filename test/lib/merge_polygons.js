var test = require('tape')
var merge = require('../../lib/merge_polygons')
var polygonsEqual = require('../../lib/polygons_equal')

test('1 polygon; no merge', function (t) {
  var poly = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0]
      ]
    ]
  }

  t.ok(polygonsEqual(merge([poly], { impl: 'turf' }), poly))
  t.ok(polygonsEqual(merge([poly], { impl: 'topojson' }), poly))

  t.end()
})

test('2 polygons; no merge', function (t) {
  var poly1 = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0]
      ]
    ]
  }

  var poly2 = {
    type: 'Polygon',
    coordinates: [
      [
        [10, 10],
        [10, 11],
        [11, 11],
        [11, 10],
        [10, 10]
      ]
    ]
  }

  var expected = {
    type: 'MultiPolygon',
    coordinates: [poly1.coordinates, poly2.coordinates]
  }

  t.ok(polygonsEqual(merge([poly1, poly2], { impl: 'turf' }), expected))
  t.ok(polygonsEqual(merge([poly1, poly2], { impl: 'topojson' }), expected))

  t.end()
})

test('2 polygons; merge', function (t) {
  var poly1 = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0]
      ]
    ]
  }

  var poly2 = {
    type: 'Polygon',
    coordinates: [
      [
        [1, 0],
        [1, 1],
        [2, 1],
        [2, 0],
        [1, 0]
      ]
    ]
  }

  var expected = {
    type: 'Polygon',
    coordinates: [
      [
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [2, 0],
        [1, 0]
      ]
    ]
  }

  t.ok(polygonsEqual(merge([poly1, poly2], { impl: 'turf' }), expected))
  t.ok(polygonsEqual(merge([poly1, poly2], { impl: 'topojson' }), expected))

  t.end()
})

