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
          interesting: 'this is',
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
          area: 'yes',
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

// test.skip('simple multipolygon', function (t) {
//   t.plan(1)
//   var json, geojson
//   // valid simple multipolygon
//   batch = [
//       {
//         type: 'relation',
//         id: 1,
//         tags: {'type': 'multipolygon'},
//         members: [
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'inner'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [4, 5, 6, 7, 4],
//         tags: {'area': 'yes'}
//       },
//       {
//         type: 'way',
//         id: 3,
//         nodes: [8, 9, 10, 8]
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: -1.0,
//         lon: -1.0
//       },
//       {
//         type: 'node',
//         id: 5,
//         lat: -1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 6,
//         lat: 1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 7,
//         lat: 1.0,
//         lon: -1.0
//       },
//       {
//         type: 'node',
//         id: 8,
//         lat: -0.5,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 9,
//         lat: 0.5,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 10,
//         lat: 0.0,
//         lon: 0.5
//       }
//     ]
//   geojson = {
//     type: 'FeatureCollection',
//     features: [
//       {
//         type: 'Feature',
//         id: 'way/2',
//         properties: {
//           type: 'way',
//           id: 2,
//           tags: {'area': 'yes'},
//           relations: [
//             {
//               rel: 1,
//               role: 'outer',
//               reltags: {'type': 'multipolygon'}
//             }
//           ],
//           meta: {}
//         },
//         geometry: {
//           type: 'Polygon',
//           coordinates: [[
//             [-1.0, -1.0],
//             [ 1.0, -1.0],
//             [ 1.0, 1.0],
//             [-1.0, 1.0],
//             [-1.0, -1.0]
//           ], [
//             [0.0, -0.5],
//             [0.0, 0.5],
//             [0.5, 0.0],
//             [0.0, -0.5]
//           ]]
//         }
//       }
//     ]
//   }
//   var result = osmtogeojson.toGeojson(json)
//   t.deepEqual(result, geojson)
//   // invalid simple multipolygon (no outer way)
//   batch = [
//       {
//         type: 'relation',
//         id: 1,
//         tags: {'type': 'multipolygon'},
//         members: [
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'inner'
//           }
//         ]
//       }
//     ]
//   geojson = {
//     type: 'FeatureCollection',
//     features: []
//   }
//   result = osmtogeojson.toGeojson(json)
//   t.deepEqual(result, geojson)
// })
// test.skip('multipolygon', function (t) {
//   t.plan(1)
//   var json, geojson
//   // valid multipolygon
//   batch = [
//       {
//         type: 'relation',
//         id: 1,
//         tags: {'type': 'multipolygon', 'building': 'yes'},
//         members: [
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'inner'
//           },
//           {
//             type: 'way',
//             ref: 4,
//             role: 'inner'
//           },
//           {
//             type: 'way',
//             ref: 5,
//             role: 'outer'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [4, 5, 6, 7, 4],
//         tags: {'building': 'yes'}
//       },
//       {
//         type: 'way',
//         id: 3,
//         nodes: [8, 9, 10, 8],
//         tags: {'area': 'yes'}
//       },
//       {
//         type: 'way',
//         id: 4,
//         nodes: [11, 12, 13, 11],
//         tags: {'barrier': 'fence'}
//       },
//       {
//         type: 'way',
//         id: 5,
//         nodes: [14, 15, 16, 14],
//         tags: {'building': 'yes', 'area': 'yes'}
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: -1.0,
//         lon: -1.0
//       },
//       {
//         type: 'node',
//         id: 5,
//         lat: -1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 6,
//         lat: 1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 7,
//         lat: 1.0,
//         lon: -1.0
//       },
//       {
//         type: 'node',
//         id: 8,
//         lat: -0.5,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 9,
//         lat: 0.5,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 10,
//         lat: 0.0,
//         lon: 0.5
//       },
//       {
//         type: 'node',
//         id: 11,
//         lat: 0.1,
//         lon: -0.1
//       },
//       {
//         type: 'node',
//         id: 12,
//         lat: -0.1,
//         lon: -0.1
//       },
//       {
//         type: 'node',
//         id: 13,
//         lat: 0.0,
//         lon: -0.2
//       },
//       {
//         type: 'node',
//         id: 14,
//         lat: 0.1,
//         lon: -1.1
//       },
//       {
//         type: 'node',
//         id: 15,
//         lat: -0.1,
//         lon: -1.1
//       },
//       {
//         type: 'node',
//         id: 16,
//         lat: 0.0,
//         lon: -1.2
//       }
//     ]
//   geojson = {
//     type: 'FeatureCollection',
//     features: [
//       {
//         type: 'Feature',
//         id: 'relation/1',
//         properties: {
//           type: 'relation',
//           id: 1,
//           tags: {'type': 'multipolygon','building': 'yes'},
//           relations: [],
//           meta: {}
//         },
//         geometry: {
//           type: 'MultiPolygon',
//           coordinates: [[[
//             [-1.1, 0.1],
//             [-1.1, -0.1],
//             [-1.2, 0.0],
//             [-1.1, 0.1]
//           ].reverse()],
//             [[
//               [-1.0, -1.0],
//               [ 1.0, -1.0],
//               [ 1.0, 1.0],
//               [-1.0, 1.0],
//               [-1.0, -1.0]
//             ], [
//               [-0.1, 0.1],
//               [-0.1, -0.1],
//               [-0.2, 0.0],
//               [-0.1, 0.1]
//             ], [
//               [0.0, -0.5],
//               [0.0, 0.5],
//               [0.5, 0.0],
//               [0.0, -0.5]
//             ]]]
//         }
//       },
//       {
//         type: 'Feature',
//         id: 'way/3',
//         properties: {
//           type: 'way',
//           id: 3,
//           tags: {'area': 'yes'},
//           relations: [
//             {
//               rel: 1,
//               role: 'inner',
//               reltags: {'type': 'multipolygon','building': 'yes'}
//             }
//           ],
//           meta: {}
//         },
//         geometry: {
//           type: 'Polygon',
//           coordinates: [[
//             [0.0, -0.5],
//             [0.0, 0.5],
//             [0.5, 0.0],
//             [0.0, -0.5]
//           ].reverse()]
//         }
//       },
//       {
//         type: 'Feature',
//         id: 'way/5',
//         properties: {
//           type: 'way',
//           id: 5,
//           tags: {'building': 'yes', 'area': 'yes'},
//           relations: [
//             {
//               rel: 1,
//               role: 'outer',
//               reltags: {'type': 'multipolygon','building': 'yes'}
//             }
//           ],
//           meta: {}
//         },
//         geometry: {
//           type: 'Polygon',
//           coordinates: [[
//             [-1.1, 0.1],
//             [-1.1, -0.1],
//             [-1.2, 0.0],
//             [-1.1, 0.1]
//           ].reverse()]
//         }
//       },
//       {
//         type: 'Feature',
//         id: 'way/4',
//         properties: {
//           type: 'way',
//           id: 4,
//           tags: {'barrier': 'fence'},
//           relations: [
//             {
//               rel: 1,
//               role: 'inner',
//               reltags: {'type': 'multipolygon','building': 'yes'}
//             }
//           ],
//           meta: {}
//         },
//         geometry: {
//           type: 'LineString',
//           coordinates: [
//             [-0.1, 0.1],
//             [-0.1, -0.1],
//             [-0.2, 0.0],
//             [-0.1, 0.1]
//           ]
//         }
//       }
//     ]
//   }
//   var result = osmtogeojson.toGeojson(json)
//   t.deepEqual(result, geojson)
//   // handle role-less members as outer ways
//   json.elements[0].members[3].role = ''
//   geojson.features[2].properties.relations[0].role = ''
//   result = osmtogeojson.toGeojson(json)
//   t.deepEqual(result, geojson)
// })
// // tags & pois
// test.skip('tags: ways and nodes / pois', function (t) {
//   t.plan(1)
//   var json, geojson
//   batch = [
//       {
//         type: 'way',
//         id: 1,
//         nodes: [2, 3, 4],
//         tags: {'foo': 'bar'}
//       },
//       {
//         type: 'node',
//         id: 2,
//         lat: 0.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 3,
//         lat: 0.0,
//         lon: 1.1,
//         tags: {'asd': 'fasd'}
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: 0.1,
//         lon: 1.2,
//         tags: {'created_by': 'me'}
//       },
//       {
//         type: 'node',
//         id: 5,
//         lat: 0.0,
//         lon: 0.0
//       }
//     ]
//   geojson = {
//     type: 'FeatureCollection',
//     features: [
//       {
//         type: 'Feature',
//         id: 'way/1',
//         properties: {
//           type: 'way',
//           id: 1,
//           tags: {'foo': 'bar'},
//           relations: [],
//           meta: {}
//         },
//         geometry: {
//           type: 'LineString',
//           coordinates: [
//             [1.0, 0.0],
//             [1.1, 0.0],
//             [1.2, 0.1]
//           ]
//         }
//       },
//       {
//         type: 'Feature',
//         id: 'node/3',
//         properties: {
//           type: 'node',
//           id: 3,
//           tags: {'asd': 'fasd'},
//           relations: [],
//           meta: {}
//         },
//         geometry: {
//           type: 'Point',
//           coordinates: [1.1, 0.0]
//         }
//       },
//       {
//         type: 'Feature',
//         id: 'node/5',
//         properties: {
//           type: 'node',
//           id: 5,
//           tags: {},
//           relations: [],
//           meta: {}
//         },
//         geometry: {
//           type: 'Point',
//           coordinates: [0.0, 0.0]
//         }
//       }
//     ]
//   }
//   var result = osmtogeojson.toGeojson(json)
//   t.deepEqual(result, geojson)
// })
// // invalid one-node-ways
// test.skip('one-node-ways', function (t) {
//   t.plan(1)
//   var json, result
//   batch = [
//       {
//         type: 'way',
//         id: 1,
//         nodes: [2],
//         tags: {'foo': 'bar'}
//       },
//       {
//         type: 'node',
//         id: 2,
//         lat: 0.0,
//         lon: 0.0
//       }
//     ]
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(0)
// })
// // invalid empty multipolygon
// test.skip('empty multipolygon', function (t) {
//   t.plan(1)
//   var json, result
//   // empty multipolygon
//   batch = [
//       {
//         type: 'relation',
//         id: 1,
//         tags: {'type': 'multipolygon'}
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   t.equal(result.features.length, 0)
// })
// // relations
// test.skip('relations and id-spaces', function (t) {
//   t.plan(1)
//   var json, geojson
//   batch = [
//       {
//         type: 'way',
//         id: 1,
//         tags: {'foo': 'bar'},
//         nodes: [1, 2, 3]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [3, 1]
//       },
//       {
//         type: 'node',
//         id: 1,
//         lat: 1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 2,
//         lat: 2.0,
//         lon: 2.0
//       },
//       {
//         type: 'node',
//         id: 3,
//         lat: 1.0,
//         lon: 2.0
//       },
//       {
//         type: 'relation',
//         id: 1,
//         tags: {'foo': 'bar'},
//         members: [
//           {
//             type: 'way',
//             ref: 1,
//             role: 'asd'
//           },
//           {
//             type: 'node',
//             ref: 1,
//             role: 'fasd'
//           },
//           {
//             type: 'relation',
//             ref: 2,
//             role: ''
//           }
//         ]
//       },
//       {
//         type: 'relation',
//         id: 2,
//         tags: {'type': 'multipolygon'},
//         members: [
//           {
//             type: 'way',
//             ref: 1,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           }
//         ]
//       }
//     ]
//   geojson = {
//     type: 'FeatureCollection',
//     features: [
//       {
//         type: 'Feature',
//         id: 'relation/2',
//         properties: {
//           type: 'relation',
//           id: 2,
//           tags: {'type': 'multipolygon'},
//           relations: [
//             {
//               rel: 1,
//               role: '',
//               reltags: {'foo': 'bar'}
//             }
//           ],
//           meta: {}
//         },
//         geometry: {
//           type: 'Polygon',
//           coordinates: [[
//             [2.0, 1.0],
//             [1.0, 1.0],
//             [2.0, 2.0],
//             [2.0, 1.0]
//           ].reverse()]
//         }
//       },
//       {
//         type: 'Feature',
//         id: 'way/1',
//         properties: {
//           type: 'way',
//           id: 1,
//           tags: {'foo': 'bar'},
//           relations: [
//             {
//               rel: 1,
//               role: 'asd',
//               reltags: {'foo': 'bar'}
//             },
//             {
//               rel: 2,
//               role: 'outer',
//               reltags: {'type': 'multipolygon'}
//             }
//           ],
//           meta: {}
//         },
//         geometry: {
//           type: 'LineString',
//           coordinates: [
//             [1.0, 1.0],
//             [2.0, 2.0],
//             [2.0, 1.0]
//           ]
//         }
//       },
//       {
//         type: 'Feature',
//         id: 'node/1',
//         properties: {
//           type: 'node',
//           id: 1,
//           tags: {},
//           relations: [
//             {
//               rel: 1,
//               role: 'fasd',
//               reltags: {'foo': 'bar'}
//             }
//           ],
//           meta: {}
//         },
//         geometry: {
//           type: 'Point',
//           coordinates: [1.0, 1.0]
//         }
//       }
//     ]
//   }
//   var result = osmtogeojson.toGeojson(json)
//   t.equal(result, geojson)
// })
// // meta info // todo +lines, +polygons
// test.skip('meta data', function (t) {
//   t.plan(1)
//   var json, geojson, result
//   // node with meta data
//   batch = [
//       {
//         type: 'node',
//         id: 1,
//         lat: 1.234,
//         lon: 4.321,
//         timestamp: '2013-01-13T22:56:07Z',
//         version: 7,
//         changeset: 1234,
//         user: 'johndoe',
//         uid: 666
//       }
//     ]
//   geojson = {
//     type: 'FeatureCollection',
//     features: [
//       {
//         type: 'Feature',
//         id: 'node/1',
//         properties: {
//           type: 'node',
//           id: 1,
//           tags: {},
//           relations: [],
//           meta: {
//             timestamp: '2013-01-13T22:56:07Z',
//             version: 7,
//             changeset: 1234,
//             user: 'johndoe',
//             uid: 666
//           }
//         },
//         geometry: {
//           type: 'Point',
//           coordinates: [4.321, 1.234]
//         }
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   t.equal(result, geojson)
//   // ways and relsvar json, geojson
//   batch = [
//       {
//         type: 'node',
//         id: 1,
//         lat: 1.234,
//         lon: 4.321,
//         tags: {'amenity': 'yes'},
//         user: 'johndoe'
//       },
//       {
//         type: 'way',
//         id: 1,
//         tags: {'highway': 'road'},
//         user: 'johndoe',
//         nodes: [1, 1, 1, 1]
//       },
//       {
//         type: 'relation',
//         id: 1,
//         tags: {'type': 'multipolygon'},
//         user: 'johndoe',
//         members: [{type: 'way',ref: 1,role: 'outer'}, {type: 'way',ref: 1,role: 'outer'}]
//       },
//       {
//         type: 'way',
//         id: 2,
//         tags: {'highway': 'road'},
//         user: 'johndoe',
//         nodes: [1, 1, 1, 1]
//       },
//       {
//         type: 'relation',
//         id: 2,
//         tags: {'type': 'multipolygon'},
//         user: 'johndoe',
//         members: [{type: 'way',ref: 2,role: 'outer'}]
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(4)
//   expect(result.features[0].properties.meta).to.have.property('user')
//   expect(result.features[1].properties.meta).to.have.property('user')
//   expect(result.features[2].properties.meta).to.have.property('user')
//   expect(result.features[3].properties.meta).to.have.property('user')
// })
// // multipolygon detection corner case
// // see https://github.com/tyrasd/osmtogeojson/issues/7
// test.skip('multipolygon: outer way tagging', function (t) {
//   t.plan(1)
//   var json
//   batch = [
//       {
//         type: 'relation',
//         id: 1,
//         tags: {'type': 'multipolygon', 'amenity': 'xxx'},
//         members: [
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'inner'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [4, 5, 6, 7, 4],
//         tags: {'amenity': 'yyy'}
//       },
//       {
//         type: 'way',
//         id: 3,
//         nodes: [8, 9, 10, 8]
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: -1.0,
//         lon: -1.0
//       },
//       {
//         type: 'node',
//         id: 5,
//         lat: -1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 6,
//         lat: 1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 7,
//         lat: 1.0,
//         lon: -1.0
//       },
//       {
//         type: 'node',
//         id: 8,
//         lat: -0.5,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 9,
//         lat: 0.5,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 10,
//         lat: 0.0,
//         lon: 0.5
//       }
//     ]
//   }
//   var result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(2)
//   expect(result.features[0].properties.id).to.eql(1)
//   expect(result.features[1].properties.id).to.eql(2)
// })
// // non-matching inner and outer rings
// test.skip('multipolygon: non-matching inner and outer rings', function (t) {
//   t.plan(1)
//   // complex multipolygon
//   batch = [
//       {
//         type: 'relation',
//         tags: {'type': 'multipolygon'},
//         id: 1,
//         members: [
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: -1,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'inner'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [4, 5, 6, 7, 4]
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: 0.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 5,
//         lat: 1.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 6,
//         lat: 1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 7,
//         lat: 0.0,
//         lon: 1.0
//       },
//       {
//         type: 'way',
//         id: 3,
//         nodes: [8, 9, 10, 8]
//       },
//       {
//         type: 'node',
//         id: 8,
//         lat: 3.0,
//         lon: 3.0
//       },
//       {
//         type: 'node',
//         id: 9,
//         lat: 4.0,
//         lon: 3.0
//       },
//       {
//         type: 'node',
//         id: 10,
//         lat: 3.0,
//         lon: 4.0
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(1)
//   expect(result.features[0].properties.id).to.equal(1)
//   expect(result.features[0].geometry.type).to.equal('Polygon')
//   expect(result.features[0].geometry.coordinates).to.have.length(1)

//   // simple multipolygon
//   batch = [
//       {
//         type: 'relation',
//         tags: {'type': 'multipolygon'},
//         id: 1,
//         members: [
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'inner'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [4, 5, 6, 7, 4]
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: 0.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 5,
//         lat: 1.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 6,
//         lat: 1.0,
//         lon: 1.0
//       },
//       {
//         type: 'node',
//         id: 7,
//         lat: 0.0,
//         lon: 1.0
//       },
//       {
//         type: 'way',
//         id: 3,
//         nodes: [8, 9, 10, 8]
//       },
//       {
//         type: 'node',
//         id: 8,
//         lat: 3.0,
//         lon: 3.0
//       },
//       {
//         type: 'node',
//         id: 9,
//         lat: 4.0,
//         lon: 3.0
//       },
//       {
//         type: 'node',
//         id: 10,
//         lat: 3.0,
//         lon: 4.0
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(1)
//   expect(result.features[0].properties.id).to.equal(2)
//   expect(result.features[0].geometry.type).to.equal('Polygon')
//   expect(result.features[0].geometry.coordinates).to.have.length(1)
// })
// // non-trivial ring building (way order and direction)
// test.skip('multipolygon: non-trivial ring building', function (t) {
//   t.plan(1)
//   // way order
//   batch = [
//       {
//         type: 'relation',
//         tags: {'type': 'multipolygon'},
//         id: 1,
//         members: [
//           {
//             type: 'way',
//             ref: 1,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 1,
//         nodes: [1, 2]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [2, 3]
//       },
//       {
//         type: 'way',
//         id: 3,
//         nodes: [3, 1]
//       },
//       {
//         type: 'node',
//         id: 1,
//         lat: 1.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 2,
//         lat: 2.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 3,
//         lat: 3.0,
//         lon: 0.0
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(1)
//   expect(result.features[0].properties.id).to.equal(1)
//   expect(result.features[0].geometry.type).to.equal('Polygon')
//   expect(result.features[0].geometry.coordinates).to.have.length(1)
//   expect(result.features[0].geometry.coordinates[0]).to.have.length(4)
//   // way directions
//   batch = [
//       {
//         type: 'relation',
//         tags: {'type': 'multipolygon'},
//         id: 1,
//         members: [
//           {
//             type: 'way',
//             ref: 1,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 3,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 4,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 5,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 6,
//             role: 'outer'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 1,
//         nodes: [1, 2]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [2, 3]
//       },
//       {
//         type: 'way',
//         id: 3,
//         nodes: [4, 3]
//       },
//       {
//         type: 'way',
//         id: 4,
//         nodes: [5, 4]
//       },
//       {
//         type: 'way',
//         id: 5,
//         nodes: [5, 6]
//       },
//       {
//         type: 'way',
//         id: 6,
//         nodes: [1, 6]
//       },
//       {
//         type: 'node',
//         id: 1,
//         lat: 1.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 2,
//         lat: 2.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 3,
//         lat: 3.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: 4.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 5,
//         lat: 5.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 6,
//         lat: 6.0,
//         lon: 0.0
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(1)
//   expect(result.features[0].properties.id).to.equal(1)
//   expect(result.features[0].geometry.type).to.equal('Polygon')
//   expect(result.features[0].geometry.coordinates).to.have.length(1)
//   expect(result.features[0].geometry.coordinates[0]).to.have.length(7)
// })
// // unclosed rings
// test.skip('multipolygon: unclosed ring', function (t) {
//   t.plan(1)
//   // non-matching ways, unclosed rings
//   batch = [
//       {
//         type: 'relation',
//         tags: {'type': 'multipolygon'},
//         id: 1,
//         members: [
//           {
//             type: 'way',
//             ref: 1,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 1,
//         nodes: [1, 2, 3, 4]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [3, 2]
//       },
//       {
//         type: 'node',
//         id: 1,
//         lat: 1.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 2,
//         lat: 2.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 3,
//         lat: 3.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: 4.0,
//         lon: 0.0
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(1)
//   expect(result.features[0].properties.id).to.equal(1)
//   expect(result.features[0].geometry.type).to.equal('Polygon')
//   expect(result.features[0].geometry.coordinates).to.have.length(1)
//   expect(result.features[0].geometry.coordinates[0]).to.have.length(4)
//   expect(result.features[0].properties.tainted).to.not.equal(true)
//   // matching ways, but unclosed ring
//   batch = [
//       {
//         type: 'relation',
//         tags: {'type': 'multipolygon'},
//         id: 1,
//         members: [
//           {
//             type: 'way',
//             ref: 1,
//             role: 'outer'
//           },
//           {
//             type: 'way',
//             ref: 2,
//             role: 'outer'
//           }
//         ]
//       },
//       {
//         type: 'way',
//         id: 1,
//         nodes: [1, 2]
//       },
//       {
//         type: 'way',
//         id: 2,
//         nodes: [2, 3, 4]
//       },
//       {
//         type: 'node',
//         id: 1,
//         lat: 1.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 2,
//         lat: 2.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 3,
//         lat: 3.0,
//         lon: 0.0
//       },
//       {
//         type: 'node',
//         id: 4,
//         lat: 4.0,
//         lon: 0.0
//       }
//     ]
//   }
//   result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(1)
//   expect(result.features[0].properties.id).to.equal(1)
//   expect(result.features[0].geometry.type).to.equal('Polygon')
//   expect(result.features[0].geometry.coordinates).to.have.length(1)
//   expect(result.features[0].geometry.coordinates[0]).to.have.length(4)
//   expect(result.features[0].properties.tainted).to.not.equal(true)
// })
// // overpass area
// test.skip('overpass area', function (t) {
//   t.plan(1)
//   var json, geojson_properties
//   batch = [
//       {
//         type: 'area',
//         id: 1
//       }
//     ]
//   }
//   var result = osmtogeojson.toGeojson(json)
//   expect(result.features).to.have.length(0)
// })

// test.skip('defaults', function (t) {
//   t.plan(1)
//   // interesting objects
//   test.skip('interesting objects', function (t) {
//   t.plan(1)
//     var json, result
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           nodes: [1, 2]
//         },
//         {
//           type: 'node',
//           id: 1,
//           tags: {'created_by': 'foo'},
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 2,
//           tags: {'interesting': 'yes'},
//           lat: 2.0,
//           lon: 0.0
//         }
//       ]
//     }
//     var result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(2)
//     expect(result.features[0].geometry.type).to.equal('LineString')
//     expect(result.features[1].geometry.type).to.equal('Point')
//     expect(result.features[1].properties.id).to.equal(2)
//   })

//   // polygon detection
//   // see: http://wiki.openstreetmap.org/wiki/Overpass_turbo/Polygon_Features
//   test.skip('polygon detection', function (t) {
//   t.plan(1)
//     var json, result
//     // basic tags: area=yes
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           tags: {'foo': 'bar', 'area': 'yes'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'way',
//           id: 2,
//           tags: {'area': 'yes'},
//           nodes: [1, 2, 3]
//         },
//         {
//           type: 'node',
//           id: 1,
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 2,
//           lat: 2.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 3.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(2)
//     expect(result.features[0].geometry.type).to.equal('Polygon')
//     expect(result.features[1].geometry.type).to.equal('LineString')
//     // basic tags: area=no
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           tags: {
//             'area': 'no',
//             'building': 'yes'
//           },
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'node',
//           id: 1,
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 2,
//           lat: 2.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 3.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(1)
//     expect(result.features[0].geometry.type).to.equal('LineString')
//   })
// })

// test.skip('options', function (t) {
//   t.plan(1)
//   // flattened properties output mode
//   test.skip('flattened properties', function (t) {
//   t.plan(1)
//     var json, geojson_properties
//     batch = [
//         {
//           type: 'node',
//           id: 1,
//           tags: {'foo': 'bar'},
//           user: 'johndoe',
//           lat: 1.234,
//           lon: 4.321
//         }
//       ]
//     geojson_properties = {
//       id: 'node/1',
//       foo: 'bar',
//       user: 'johndoe'
//     }
//     var result = osmtogeojson.toGeojson(json, {flatProperties: true})
//     expect(result.features[0].properties).to.eql(geojson_properties)
//   })
//   // interesting objects
//   test.skip('uninteresting tags', function (t) {
//   t.plan(1)
//     var json
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           nodes: [2, 3]
//         },
//         {
//           type: 'node',
//           id: 2,
//           tags: {'foo': 'bar'},
//           user: 'johndoe',
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 3,
//           tags: {'foo': 'bar', 'asd': 'fasd'},
//           user: 'johndoe',
//           lat: 2.0,
//           lon: 0.0
//         }
//       ]
//     }
//     var result = osmtogeojson.toGeojson(json, {uninterestingTags: {foo: true}})
//     expect(result.features).to.have.length(2)
//     expect(result.features[1].properties.id).to.eql(3)
//   })
//   // interesting objects with custom callback
//   test.skip('uninteresting tags: callback', function (t) {
//   t.plan(1)
//     var json, result
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           nodes: [1, 2]
//         },
//         {
//           type: 'node',
//           id: 1,
//           tags: {'tag': '1'},
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 2,
//           tags: {'tag': '2'},
//           lat: 2.0,
//           lon: 0.0
//         }
//       ]
//     }
//     var result = osmtogeojson.toGeojson(json, {uninterestingTags: function (tags, ignore_tags) {
//         return tags['tag'] != '1'
//     }})
//     expect(result.features).to.have.length(2)
//     expect(result.features[0].geometry.type).to.equal('LineString')
//     expect(result.features[1].geometry.type).to.equal('Point')
//     expect(result.features[1].properties.id).to.equal(1)
//   })
//   // polygon detection
//   // see: http://wiki.openstreetmap.org/wiki/Overpass_turbo/Polygon_Features
//   test.skip('polygon detection', function (t) {
//   t.plan(1)
//     var json, result
//     // custom tagging detection rules
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           tags: {'is_polygon_key': '*'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'way',
//           id: 2,
//           tags: {'is_polygon_key_value': 'included_value'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'way',
//           id: 3,
//           tags: {'is_polygon_key_excluded_value': '*'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'way',
//           id: 4,
//           tags: {'is_polygon_key': 'no'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'way',
//           id: 5,
//           tags: {'is_polygon_key_value': 'not_included_value'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'way',
//           id: 6,
//           tags: {'is_polygon_key_excluded_value': 'excluded_value'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'node',
//           id: 1,
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 2,
//           lat: 2.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 3.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json, {
//       polygonFeatures: {
//         'is_polygon_key': true,
//         'is_polygon_key_value': {
//           'included_values': {'included_value': true}
//         },
//         'is_polygon_key_excluded_value': {
//           'excluded_values': {'excluded_value': true}
//         }
//       }
//     })
//     expect(result.features).to.have.length(6)
//     expect(result.features[0].geometry.type).to.equal('Polygon')
//     expect(result.features[1].geometry.type).to.equal('Polygon')
//     expect(result.features[2].geometry.type).to.equal('Polygon')
//     expect(result.features[3].geometry.type).to.equal('LineString')
//     expect(result.features[4].geometry.type).to.equal('LineString')
//     expect(result.features[5].geometry.type).to.equal('LineString')
//   })
//   // polygon detection with custom callback
//   test.skip('polygon detection: callback', function (t) {
//   t.plan(1)
//     var json, result
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           tags: {'tag': '1'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'way',
//           id: 2,
//           tags: {'tag': '2'},
//           nodes: [1, 2, 3, 1]
//         },
//         {
//           type: 'node',
//           id: 1,
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 2,
//           lat: 2.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 3.0
//         }
//       ]
//     }
//     var result = osmtogeojson.toGeojson(json, {polygonFeatures: function (tags) {
//         return tags['tag'] == '1'
//     }})
//     expect(result.features).to.have.length(2)
//     expect(result.features[0].geometry.type).to.equal('Polygon')
//     expect(result.features[1].geometry.type).to.equal('LineString')
//   })
// })

// test.skip('tainted data', function (t) {
//   t.plan(1)
//   // basic tainted geometries
//   test.skip('tainted geometries', function (t) {
//   t.plan(1)
//     var json, geojson
//     batch = [
//         {
//           type: 'way',
//           id: 10,
//           nodes: [2, 3, 5]
//         },
//         {
//           type: 'way',
//           id: 11,
//           nodes: [2, 3, 4, 5, 2],
//           tags: {'area': 'yes'}
//         },
//         {
//           type: 'way',
//           id: 12,
//           nodes: [2, 3, 4, 2]
//         },
//         {
//           type: 'relation',
//           id: 100,
//           tags: {'type': 'multipolygon'},
//           members: [
//             {
//               type: 'way',
//               ref: 12,
//               role: 'outer'
//             },
//             {
//               type: 'way',
//               ref: 13,
//               role: 'inner'
//             }
//           ]
//         },
//         {
//           type: 'node',
//           id: 2,
//           lat: 1.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 1.0
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 1.0,
//           lon: 1.0
//         }
//       ]
//     geojson = {
//       type: 'FeatureCollection',
//       features: [
//         {
//           type: 'Feature',
//           id: 'way/12',
//           properties: {
//             type: 'way',
//             id: 12,
//             tags: {},
//             relations: [
//               {
//                 rel: 100,
//                 role: 'outer',
//                 reltags: {'type': 'multipolygon'}
//               }
//             ],
//             meta: {},
//             tainted: true
//           },
//           geometry: {
//             type: 'Polygon',
//             coordinates: [[
//               [0.0, 1.0],
//               [1.0, 0.0],
//               [1.0, 1.0],
//               [0.0, 1.0]
//             ]]
//           }
//         },
//         {
//           type: 'Feature',
//           id: 'way/11',
//           properties: {
//             type: 'way',
//             id: 11,
//             tags: {'area': 'yes'},
//             relations: [],
//             meta: {},
//             tainted: true
//           },
//           geometry: {
//             type: 'Polygon',
//             coordinates: [[
//               [0.0, 1.0],
//               [1.0, 0.0],
//               [1.0, 1.0],
//               [0.0, 1.0]
//             ]]
//           }
//         },
//         {
//           type: 'Feature',
//           id: 'way/10',
//           properties: {
//             type: 'way',
//             id: 10,
//             tags: {},
//             relations: [],
//             meta: {},
//             tainted: true
//           },
//           geometry: {
//             type: 'LineString',
//             coordinates: [
//               [0.0, 1.0],
//               [1.0, 0.0]
//             ]
//           }
//         }
//       ]
//     }
//     var result = osmtogeojson.toGeojson(json)
//     t.equal(result, geojson)
//   })
//   // ignore missing node coordinates
//   test.skip('ids_only (missing coordinates or references)', function (t) {
//   t.plan(1)
//     var json, result
//     batch = [
//         {
//           type: 'node',
//           id: 1
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(0)
//     batch = [
//         {
//           type: 'way',
//           id: 1
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(0)
//     batch = [
//         {
//           type: 'relation',
//           id: 1
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(0)
//   })
//   // tainted way
//   test.skip('tainted way', function (t) {
//   t.plan(1)
//     var json
//     batch = [
//         {
//           type: 'way',
//           id: 1,
//           nodes: [2, 3, 4]
//         },
//         {
//           type: 'node',
//           id: 2,
//           lat: 0.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 1.0,
//           lon: 1.0
//         }
//       ]
//     }
//     var result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(1)
//     expect(result.features[0].properties.id).to.equal(1)
//     expect(result.features[0].geometry.coordinates).to.eql([[0.0, 0.0], [1.0, 1.0]])
//     expect(result.features[0].properties.tainted).to.equal(true)
//   })
//   // invalid empty multipolygon
//   test.skip('empty multipolygon', function (t) {
//   t.plan(1)
//     var json, result
//   })
//   // tainted simple multipolygon
//   test.skip('tainted simple multipolygon', function (t) {
//   t.plan(1)
//     var json, result
//     // missing way
//     batch = [
//         {
//           type: 'relation',
//           tags: {'type': 'multipolygon'},
//           id: 1,
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'outer'
//             },
//             {
//               type: 'way',
//               ref: 3,
//               role: 'inner'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [3, 4, 5, 3]
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 0.0,
//           lon: 1.0
//         },
//         {
//           type: 'node',
//           id: 5,
//           lat: 1.0,
//           lon: 0.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(1)
//     expect(result.features[0].properties.id).to.equal(2)
//     expect(result.features[0].properties.tainted).to.equal(true)
//     // missing nodes
//     batch = [
//         {
//           type: 'relation',
//           id: 1,
//           tags: {'type': 'multipolygon'},
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'outer'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [3, 4, 5, 3]
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(0)
//     // missing node
//     batch = [
//         {
//           type: 'relation',
//           tags: {'type': 'multipolygon'},
//           id: 1,
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'outer'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [3, 4, 5, 6, 3]
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 0.0,
//           lon: 1.0
//         },
//         {
//           type: 'node',
//           id: 5,
//           lat: 1.0,
//           lon: 0.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(1)
//     expect(result.features[0].properties.id).to.equal(2)
//     expect(result.features[0].properties.tainted).to.equal(true)
//   })
//   // tainted multipolygon
//   test.skip('tainted multipolygon', function (t) {
//   t.plan(1)
//     var json, result
//     // missing way
//     batch = [
//         {
//           type: 'relation',
//           tags: {'type': 'multipolygon'},
//           id: 1,
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'outer'
//             },
//             {
//               type: 'way',
//               ref: 3,
//               role: 'outer'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [4, 5, 6, 4]
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 0.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 5,
//           lat: 0.0,
//           lon: 1.0
//         },
//         {
//           type: 'node',
//           id: 6,
//           lat: 1.0,
//           lon: 0.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(1)
//     expect(result.features[0].properties.id).to.equal(1)
//     expect(result.features[0].properties.tainted).to.equal(true)
//     // missing node
//     batch = [
//         {
//           type: 'relation',
//           tags: {'type': 'multipolygon'},
//           id: 1,
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'outer'
//             },
//             {
//               type: 'way',
//               ref: 3,
//               role: 'outer'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [4, 5, 6, 7, 4]
//         },
//         {
//           type: 'way',
//           id: 3,
//           nodes: [4, 5, 6, 4]
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 0.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 5,
//           lat: 0.0,
//           lon: 1.0
//         },
//         {
//           type: 'node',
//           id: 6,
//           lat: 1.0,
//           lon: 0.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(1)
//     expect(result.features[0].properties.id).to.equal(1)
//     expect(result.features[0].properties.tainted).to.equal(true)
//   })
//   // degenerate multipolygon
//   test.skip('degenerate multipolygon', function (t) {
//   t.plan(1)
//     // no coordinates
//     var json, result
//     batch = [
//         {
//           type: 'relation',
//           tags: {'type': 'multipolygon'},
//           id: 1,
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'outer'
//             },
//             {
//               type: 'way',
//               ref: 3,
//               role: 'outer'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [4, 5, 6]
//         },
//         {
//           type: 'way',
//           id: 3,
//           nodes: [6, 4]
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(0)
//     // no outer ring
//     batch = [
//         {
//           type: 'relation',
//           tags: {'type': 'multipolygon'},
//           id: 1,
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'inner'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [3, 4, 5, 3]
//         },
//         {
//           type: 'node',
//           id: 3,
//           lat: 0.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 1.0,
//           lon: 1.0
//         },
//         {
//           type: 'node',
//           id: 5,
//           lat: 1.0,
//           lon: 0.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     // expected behaviour: do not return a degenerate (multi)polygon.
//     // this could in principle return just the way that is now sort of unused
//     // but just as with an (untagged) node of a one-node-way we're going to
//     // assume that those outlines aren't interesting enough.
//     expect(result.features).to.have.length(0)
//     // incomplete outer ring
//     batch = [
//         {
//           type: 'relation',
//           tags: {'type': 'multipolygon'},
//           id: 1,
//           members: [
//             {
//               type: 'way',
//               ref: 2,
//               role: 'outer'
//             },
//             {
//               type: 'way',
//               ref: 3,
//               role: 'outer'
//             }
//           ]
//         },
//         {
//           type: 'way',
//           id: 2,
//           nodes: [4, 5, 6, 4]
//         },
//         {
//           type: 'node',
//           id: 4,
//           lat: 0.0,
//           lon: 0.0
//         },
//         {
//           type: 'node',
//           id: 5,
//           lat: 1.0,
//           lon: 1.0
//         }
//       ]
//     }
//     result = osmtogeojson.toGeojson(json)
//     expect(result.features).to.have.length(0)
//   })
// })

// test.skip('other', function (t) {
//   t.plan(1)
//   //
//   test.skip('sideeffects', function (t) {
//   t.plan(1)
//     var json, json_before, json_after
//     batch = [
//         {
//           type: 'node',
//           id: 1,
//           tags: {'foo': 'bar'},
//           user: 'johndoe',
//           lat: 1.234,
//           lon: 4.321
//         },
//         {
//           type: 'node',
//           id: 2
//         },
//         {
//           type: 'way',
//           id: 1,
//           nodes: [1, 2, 3]
//         },
//         {
//           type: 'relation',
//           id: 1,
//           members: [{type: 'way', ref: 1}, {type: 'way', ref: 2}, {type: 'node', ref: 1}]
//         }
//       ]
//     }
//     json_before = JSON.stringify(json)
//     osmtogeojson.toGeojson(json)
//     json_after = JSON.stringify(json)
//     expect(json_after).to.equal(json_before)
//   })
// })

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
