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

// [OsmObject] -> Error, GeoJSON <Async>
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

// String, GeoJSON -> GeoJSON
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

test('single way -> LineString', function (t) {
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

test('two disconnected ways -> MultiLineString', function (t) {
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
      type: 'node',
      id: '4',
      lat: 3,
      lon: 3
    },
    {
      type: 'way',
      id: '5',
      nodes: [ '1', '2' ]
    },
    {
      type: 'way',
      id: '6',
      nodes: [ '3', '4' ]
    },
    {
      type: 'relation',
      id: '7',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '5'
        },
        {
          type: 'way',
          ref: '6'
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
          type: 'MultiLineString',
          coordinates: [
            [
              [0.0, 0.0],
              [1.0, 1.0],
            ],
            [
              [2.0, 2.0],
              [3.0, 3.0],
            ]
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

test('two connected ways -> LineString', function (t) {
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

test('two connected ways -> LineString (opposite order)', function (t) {
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

test('two connected ways /w heads touching -> LineString', function (t) {
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
      nodes: [ '1', '3' ]
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
            [1.0, 1.0],
            [0.0, 0.0],
            [2.0, 2.0]
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

test('two connected ways /w tails touching -> LineString', function (t) {
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
      nodes: [ '3', '2' ]
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

test('three connected ways -> LineString', function (t) {
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
      type: 'node',
      id: '4',
      lat: 3,
      lon: 3
    },
    {
      type: 'way',
      id: '5',
      nodes: [ '2', '3' ]
    },
    {
      type: 'way',
      id: '6',
      nodes: [ '3', '4' ]
    },
    {
      type: 'way',
      id: '7',
      nodes: [ '1', '2' ]
    },
    {
      type: 'relation',
      id: '8',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '5'
        },
        {
          type: 'way',
          ref: '6'
        },
        {
          type: 'way',
          ref: '7'
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
            [3.0, 3.0],
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

test('two ways -> MultiLineString /w two LineStrings', function (t) {
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
      type: 'node',
      id: '4',
      lat: 3,
      lon: 3
    },
    {
      type: 'way',
      id: '5',
      nodes: [ '1', '2' ]
    },
    {
      type: 'way',
      id: '6',
      nodes: [ '3', '4' ]
    },
    {
      type: 'relation',
      id: '7',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '5'
        },
        {
          type: 'way',
          ref: '6'
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
          type: 'MultiLineString',
          coordinates: [
            [
              [0.0, 0.0],
              [1.0, 1.0]
            ],
            [
              [2.0, 2.0],
              [3.0, 3.0]
            ]
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

test('four ways -> MultiLineString /w two LineStrings', function (t) {
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
      type: 'node',
      id: '4',
      lat: 3,
      lon: 3
    },
    {
      type: 'node',
      id: '5',
      lat: 4,
      lon: 4
    },
    {
      type: 'node',
      id: '6',
      lat: 5,
      lon: 5
    },
    {
      type: 'way',
      id: '7',
      nodes: [ '1', '2' ]
    },
    {
      type: 'way',
      id: '8',
      nodes: [ '2', '3' ]
    },
    {
      type: 'way',
      id: '9',
      nodes: [ '4', '5' ]
    },
    {
      type: 'way',
      id: '10',
      nodes: [ '5', '6' ]
    },
    {
      type: 'relation',
      id: '11',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '7'
        },
        {
          type: 'way',
          ref: '8'
        },
        {
          type: 'way',
          ref: '9'
        },
        {
          type: 'way',
          ref: '10'
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
          type: 'MultiLineString',
          coordinates: [
            [
              [0.0, 0.0],
              [1.0, 1.0],
              [2.0, 2.0]
            ],
            [
              [3.0, 3.0],
              [4.0, 4.0],
              [5.0, 5.0]
            ]
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

test('many long ways -> LineString', function (t) {
  var _id = 1
  function id () {
    return '' + (_id++)
  }

  // 500 nodes
  var nodes = (new Array(500)).fill(0).map(function (_, idx) {
    return {
      type: 'node',
      id: id(),
      lat: idx,
      lon: idx
    }
  })

  // 10 ways, each mapping to 50 nodes, plus the predecessor of the last way
  var ways = (new Array(10)).fill(0).map(function (_, idx) {
    return {
      type: 'way',
      id: id(),
      nodes: (new Array(51)).fill(0).map(function (_, jdx) {
        return '' + (jdx + idx * 50)
      })
    }
  })

  // 1 relation containing it all
  var relation = {
    type: 'relation',
    id: id(),
    tags: {
      interesting: 'this is'
    },
    members: ways.map(function (way) {
      return {
        type: 'way',
        ref: way.id
      }
    })
  }

  // glom it all into a single data array
  var data = nodes.concat(ways).concat([relation])

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
          coordinates: nodes.map(function (node) {
            return [node.lat, node.lon]
          })
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

test('two connected ways (diamond shape) -> Polygon', function (t) {
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
      lat: 1,
      lon: -1
    },
    {
      type: 'node',
      id: '4',
      lat: 2,
      lon: 0
    },
    {
      type: 'way',
      id: '5',
      tags: {
        area: 'yes'
      },
      nodes: [ '1', '2', '3', '1' ]
    },
    {
      type: 'way',
      id: '6',
      tags: {
        area: 'yes'
      },
      nodes: [ '2', '3', '4', '2' ]
    },
    {
      type: 'relation',
      id: '7',
      tags: {
        interesting: 'this is'
      },
      members: [
        {
          type: 'way',
          ref: '5'
        },
        {
          type: 'way',
          ref: '6'
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
          interesting: 'this is'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [1, 1],
              [0, 2],
              [-1, 1],
              [0, 0],
              [1, 1]
            ]
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

