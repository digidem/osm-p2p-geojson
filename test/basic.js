var test = require('tape')

var osmDataToGeoJson = require('./osmdata-to-geojson')
var collect = require('collect-stream')

test('node', function (t) {
  t.plan(4)

  var batch = [
    {
      type: 'node',
      id: 1,
      lat: 1.234,
      lon: 4.321,
      tags: {
        interesting: 'this is'
      }
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is'
        },
        geometry: {
          type: 'Point',
          coordinates: [4.321, 1.234]
        }
      }
    ]
  }

  osmDataToGeoJson(batch, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
  })
})

test('way', function (t) {
  t.plan(4)

  var batch = [
    {
      type: 'way',
      id: 'A',
      tags: {
        interesting: 'this is'
      },
      nodes: ['B', 'C', 'D']
    },
    {
      type: 'node',
      id: 'B',
      lat: 0.0,
      lon: 1.0
    },
    {
      type: 'node',
      id: 'C',
      lat: 0.0,
      lon: 1.1
    },
    {
      type: 'node',
      id: 'D',
      lat: 0.1,
      lon: 1.2
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is'
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [1.0, 0.0],
            [1.1, 0.0],
            [1.2, 0.1]
          ]
        }
      }
    ]
  }

  osmDataToGeoJson(batch, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
  })
})


test('way (streaming)', function (t) {
  t.plan(4)

  var batch = [
    {
      type: 'way',
      id: 'A',
      tags: {
        interesting: 'this is'
      },
      nodes: ['B', 'C', 'D']
    },
    {
      type: 'node',
      id: 'B',
      lat: 0.0,
      lon: 1.0
    },
    {
      type: 'node',
      id: 'C',
      lat: 0.0,
      lon: 1.1
    },
    {
      type: 'node',
      id: 'D',
      lat: 0.1,
      lon: 1.2
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is'
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [1.0, 0.0],
            [1.1, 0.0],
            [1.2, 0.1]
          ]
        }
      }
    ]
  }

  testStreaming()

  function testStreaming () {
    var s = osmDataToGeoJson.getQueryStream(batch)
    collect(s, function (err, geojson) {
      t.error(err)
      t.deepEqual(JSON.parse(geojson), expected)

      testStreamingObjectMode()
    })
  }

  function testStreamingObjectMode () {
    var s = osmDataToGeoJson.getQueryStream(batch, { objectMode: true })
    collect(s, function (err, geojson) {
      t.error(err)

      // Re-wrap the data in a FeatureCollection
      geojson = {
        type: 'FeatureCollection',
        features: geojson
      }
      t.deepEqual(geojson, expected)
    })
  }
})

test('polygon', function (t) {
  t.plan(4)

  var batch = [
    {
      type: 'way',
      id: 'A',
      nodes: ['B', 'C', 'D', 'E', 'B'],
      tags: {area: 'yes'}
    },
    {
      type: 'node',
      id: 'B',
      lat: 0.0,
      lon: 0.0
    },
    {
      type: 'node',
      id: 'C',
      lat: 0.0,
      lon: 1.0
    },
    {
      type: 'node',
      id: 'D',
      lat: 1.0,
      lon: 1.0
    },
    {
      type: 'node',
      id: 'E',
      lat: 1.0,
      lon: 0.0
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          area: 'yes'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0.0, 0.0],
            [1.0, 0.0],
            [1.0, 1.0],
            [0.0, 1.0],
            [0.0, 0.0]
          ]]
        }
      }
    ]
  }

  osmDataToGeoJson(batch, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
  })
})

test('opts.map', function (t) {
  t.plan(4)

  var batch = [
    {
      type: 'node',
      id: 1,
      lat: 1.234,
      lon: 4.321,
      tags: {
        interesting: 'this is'
      }
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is'
        },
        geometry: {
          type: 'Point',
          coordinates: [4.321, 1.234]
        }
      }
    ]
  }

  function mapFn (geom) {
    if (geom.id) {
      geom.id++
    }
    return geom
  }

  osmDataToGeoJson(batch, { map: mapFn }, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
  })
})

test('invalid polygon', function (t) {
  t.plan(4)

  var batch = [
    {
      type: 'way',
      id: 'A',
      nodes: ['B', 'C', 'B'],
      tags: {area: 'yes'}
    },
    {
      type: 'node',
      id: 'B',
      lat: 0.0,
      lon: 0.0
    },
    {
      type: 'node',
      id: 'C',
      lat: 0.0,
      lon: 1.0
    },
    {
      type: 'node',
      id: 'D',
      lat: 1.0,
      lon: 1.0
    },
    {
      type: 'node',
      id: 'E',
      lat: 1.0,
      lon: 0.0
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
    ]
  }

  osmDataToGeoJson(batch, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
  })
})
