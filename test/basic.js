var tmpdir = require('os').tmpdir()
var test = require('tape')
var osmdb = require('osm-p2p-db')
var memdb = require('memdb')
var hyperlog = require('hyperlog')
var path = require('path')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var fdstore = require('fd-chunk-store')
var collect = require('collect-stream')

var getGeoJSON = require('../')
var dir = path.join(tmpdir, 'osm-p2p-geojson-test-' + Math.random())

function db () {
  rimraf.sync(dir)
  mkdirp.sync(dir)
  return osmdb({
    db: memdb(),
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    store: fdstore(4096, path.join(dir, 'kdb'))
  })
}

function json2batch (e) {
  var op = {
    type: 'put',
    key: e.id,
    value: e
  }
  e.refs = e.nodes
  delete e.id
  delete e.nodes
  return op
}

test('node', function (t) {
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
  ].map(json2batch)
  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 1,
        properties: {
          id: 1,
          interesting: 'this is'
        },
        geometry: {
          type: 'Point',
          coordinates: [4.321, 1.234]
        }
      }
    ]
  }
  var osm = db()
  osm.batch(batch, function (err, docs) {
    t.error(err)
    expected.features[0].properties.version = docs[0].key

    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    osm.query(bbox, function (err, docs) {
      t.error(err)
      getGeoJSON(osm, { docs: docs }, function (err, geojson) {
        t.error(err)
        t.deepEqual(geojson, expected)
        t.end()
      })
    })
  })
})

test('way', function (t) {
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
  ].map(json2batch)
  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'A',
        properties: {
          id: 'A',
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
  var osm = db()
  osm.batch(batch, function (err, docs) {
    t.error(err)
    expected.features[0].properties.version = docs[0].key

    // callback
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    osm.query(bbox, function (err, docs) {
      t.error(err)
      getGeoJSON(osm, { docs: docs }, function (err, geojson) {
        t.error(err)
        t.deepEqual(geojson, expected)

        testStreaming()
      })
    })
  })

  function testStreaming () {
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    var s = osm.queryStream(bbox).pipe(getGeoJSON(osm))
    collect(s, function (err, geojson) {
      t.error(err)
      t.deepEqual(JSON.parse(geojson), expected)

      testStreamingObjectMode()
    })
  }

  function testStreamingObjectMode () {
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    var s = osm.queryStream(bbox).pipe(getGeoJSON(osm, { objectMode: true }))
    collect(s, function (err, geojson) {
      // Re-wrap the data in a FeatureCollection
      geojson = {
        type: 'FeatureCollection',
        features: geojson
      }

      t.error(err)
      t.deepEqual(geojson, expected)
      t.end()
    })
  }
})

test('polygon', function (t) {
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
  ].map(json2batch)
  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'A',
        properties: {
          id: 'A',
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
  var osm = db()
  osm.batch(batch, function (err, docs) {
    t.error(err)
    expected.features[0].properties.version = docs[0].key
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    osm.query(bbox, function (err, docs) {
      t.error(err)
      getGeoJSON(osm, { docs: docs }, function (err, geojson) {
        t.error(err)
        t.deepEqual(geojson, expected)
        t.end()
      })
    })
  })
})

test('opts.map', function (t) {
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
  ].map(json2batch)
  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 2,
        properties: {
          id: 1,
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

  var osm = db()
  osm.batch(batch, function (err, docs) {
    t.error(err)
    expected.features[0].properties.version = docs[0].key

    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    osm.query(bbox, function (err, docs) {
      t.error(err)
      getGeoJSON(osm, { map: mapFn, docs: docs }, function (err, geojson) {
        t.error(err)
        t.deepEqual(geojson, expected)
        t.end()
      })
    })
  })
})
