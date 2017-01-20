var tmpdir = require('os').tmpdir()
var test = require('tape')
var osmdb = require('osm-p2p-db')
var memdb = require('memdb')
var hyperlog = require('hyperlog')
var path = require('path')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var fdstore = require('fd-chunk-store')
var concat = require('concat-stream')
var traverse = require('traverse')

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

// [OsmObject] -> Error <Async>
function writeOsmToDb (data, done) {
  var batch = data.map(json2batch)
  osm.batch(batch, function (err, docs) {
    done(err)
  })
}

// [OsmObject] -> Error, JSON <Async>
function osmDataToGeoJson (data, done) {
  var batch = data.map(json2batch)

  var osm = db()
  osm.batch(batch, function (err, docs) {
    if (err) return done(err)
    getGeoJSON(osm, function (err, json) {
      if (err) return done(err)
      json = clearProperty('version', json)
      json = clearProperty('id', json)
      done(null, json)
    })
  })
}

// String, JSON -> JSON <Mutate>
function clearProperty (property, geojson) {
  var copy = traverse(geojson).clone()
  traverse(copy)
    .forEach(function (value) {
      if (value && value[property]) {
        delete value[property]
      }
    })
  return copy
}

test('single way -- no merge', function (t) {
  var data = [
    {
      type: 'node',
      id: '1',
      lat: 0,
      lon: 0
    },
    {
      type: 'node',
      id: '2',
      lat: 1,
      lon: 1
    },
    {
      type: 'way',
      id: '3',
      nodes: [ '1', '2' ]
    },
    {
      type: 'relation',
      id: '4',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '3'
        }
      ]
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0.0, 0.0],
            [1.0, 1.0],
          ]
        }
      }
    ]
  }

  osmDataToGeoJson(data, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
    t.end()
  })
})

test('merge two connected ways into one', function (t) {
  var data = [
    {
      type: 'node',
      id: '1',
      lat: 0,
      lon: 0
    },
    {
      type: 'node',
      id: '2',
      lat: 1,
      lon: 1
    },
    {
      type: 'node',
      id: '3',
      lat: 2,
      lon: 2
    },
    {
      type: 'way',
      id: '4',
      nodes: [ '1', '2' ]
    },
    {
      type: 'way',
      id: '5',
      nodes: [ '2', '3' ]
    },
    {
      type: 'relation',
      id: '6',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '4'
        },
        {
          type: 'way',
          ref: '5'
        }
      ]
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0.0, 0.0],
            [1.0, 1.0],
            [2.0, 2.0],
          ]
        }
      }
    ]
  }

  osmDataToGeoJson(data, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
    t.end()
  })
})

test('merge two connected ways into one -- opposite dir', function (t) {
  var data = [
    {
      type: 'node',
      id: '1',
      lat: 0,
      lon: 0
    },
    {
      type: 'node',
      id: '2',
      lat: 1,
      lon: 1
    },
    {
      type: 'node',
      id: '3',
      lat: 2,
      lon: 2
    },
    {
      type: 'way',
      id: '4',
      nodes: [ '2', '3' ]
    },
    {
      type: 'way',
      id: '5',
      nodes: [ '1', '2' ]
    },
    {
      type: 'relation',
      id: '6',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '4'
        },
        {
          type: 'way',
          ref: '5'
        }
      ]
    }
  ]

  var expected = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          interesting: 'this is',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [0.0, 0.0],
            [1.0, 1.0],
            [2.0, 2.0],
          ]
        }
      }
    ]
  }

  osmDataToGeoJson(data, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
    t.end()
  })
})
