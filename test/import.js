var test = require('tape')

var utils = require('./utils')
var osmGeoJson = require('..')
var geoJsonToOsmData = require('./geojson-to-osmdata')
var compare = function (a, b) { return a.lat - b.lat }

test('Point', function (t) {
  t.plan(4)

  var expected = [
    {
      type: 'node',
      changeset: '1',
      lat: 1.234,
      lon: 4.321,
      tags: {
        interesting: 'this is'
      }
    }
  ]

  var geojson = {
    type: 'FeatureCollection',
    changeset: '1',
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

  geoJsonToOsmData(geojson, function (err, docs) {
    t.error(err)
    docs.forEach((node) => {
      node.lat = Number(node.lat)
      node.lon = Number(node.lon)
    })
    t.same(docs, expected)
  })
})

test('LineString', function (t) {
  t.plan(4)

  var expected = [
    {
      type: 'way',
      changeset: '2',
      tags: {
        interesting: 'this is'
      }
    },
    {
      type: 'node',
      changeset: '2',
      lat: 0.0,
      lon: 1.0
    },
    {
      type: 'node',
      changeset: '2',
      lat: 1.0,
      lon: 1.1
    },
    {
      type: 'node',
      changeset: '2',
      lat: 2.1,
      lon: 1.2
    }
  ]

  var geojson = {
    type: 'FeatureCollection',
    changeset: '2',
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
            [1.1, 1.0],
            [1.2, 2.1]
          ]
        }
      }
    ]
  }

  geoJsonToOsmData(geojson, function (err, docs) {
    t.error(err)
    docs.forEach((node) => {
      if (typeof node.lat !== 'undefined') {
        node.lat = Number(node.lat)
        node.lon = Number(node.lon)
      }
    })
    t.deepEqual(docs.sort(compare), expected.sort(compare))
  })
})

test('Polygon', function (t) {
  t.plan(8)

  var nodes = [
    {
      type: 'way',
      changeset: '4',
      tags: {area: 'yes'}
    },
    {
      type: 'node',
      changeset: '4',
      lat: 0.0,
      lon: 2
    },
    {
      type: 'node',
      changeset: '4',
      lat: 0.1,
      lon: 0.0
    },
    {
      type: 'node',
      changeset: '4',
      lat: 0.1,
      lon: 0.0
    },
    {
      type: 'node',
      changeset: '4',
      lat: 1.0,
      lon: 3.0
    },
    {
      type: 'node',
      changeset: '4',
      lat: 1.5,
      lon: 5.0
    },
    {
      type: 'relation',
      changeset: '4',
      tags: {
        interesting: 'this is'
      }
    }
  ]

  var geojson = {
    type: 'FeatureCollection',
    changeset: '4',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0.0, 0.1],
            [2.0, 0.0],
            [3.0, 1.0],
            [5.0, 1.5],
            [0.0, 0.1]
          ]]
        }
      }
    ]
  }

  geoJsonToOsmData(geojson, function (err, docs) {
    t.error(err)
    docs.forEach((node) => {
      if (typeof node.lat !== 'undefined') {
        node.lat = Number(node.lat)
        node.lon = Number(node.lon)
      }
    })
    var onlyNodes = function (d) { return d.type === 'node' }
    t.deepEqual(docs.filter(onlyNodes).sort(compare), nodes.filter(onlyNodes).sort(compare))
    var onlyRelations = function (d) { return d.type === 'relation' }
    t.deepEqual(docs.filter(onlyRelations), nodes.filter(onlyRelations))
    var onlyWays = function (d) { return d.type === 'way' }
    t.deepEqual(docs.filter(onlyWays), nodes.filter(onlyWays))
  })
})

test('importing twice', function (t) {
  var feature = {
    type: 'Feature',
    properties: {
      interesting: 'this is'
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [0.0, 0.1],
        [2.0, 0.0],
        [3.0, 1.0],
        [5.0, 1.5],
        [0.0, 0.1]
      ]]
    }
  }
  var features = []
  var i = 500
  while (i) {
    features.push(Object.assign(feature, {}))
    i--
  }
  var pending = 2

  function done (err) {
    pending--
    if (pending === 1) t.ok(err)
    if (!pending) t.end()
  }
  var geojson = {
    type: 'FeatureCollection',
    changeset: 'A',
    features: features
  }
  importTwice(utils.osmp2p(), geojson, done)
  // importTwice(utils.hyperosm())
})

function importTwice (osm, geojson, done) {
  var importer = osmGeoJson.importer(osm)
  importer.on('import', function () {
    // got data
  })
  importer.importFeatureCollection(geojson, done)
  importer.importFeatureCollection(geojson, done)
}
