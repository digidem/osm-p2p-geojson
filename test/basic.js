var test = require('tape')
var data = require('./data')
var osmDataToGeoJson = require('./osmdata-to-geojson')

var collect = require('collect-stream')

test('node', function (t) {
  t.plan(2)

  osmDataToGeoJson(data.node.batch, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, data.node.expected)
  })
})

test('way', function (t) {
  t.plan(2)

  osmDataToGeoJson(data.way.batch, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, data.way.expected)
  })
})

test('way (streaming)', function (t) {
  t.plan(4)
  var batch = data.way.batch
  var expected = data.way.expected

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
  t.plan(2)

  osmDataToGeoJson(data.polygon.batch, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, data.polygon.expected)
  })
})

test('opts.map', function (t) {
  t.plan(2)

  function mapFn (geom) {
    if (geom.id) {
      geom.id++
    }
    return geom
  }

  osmDataToGeoJson(data.node.batch, { map: mapFn }, function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, data.node.expected)
  })
})

test('invalid polygon', function (t) {
  t.plan(2)

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

  osmDataToGeoJson(data.json2batch(batch), function (err, geojson) {
    t.error(err)
    t.deepEqual(geojson, expected)
  })
})
