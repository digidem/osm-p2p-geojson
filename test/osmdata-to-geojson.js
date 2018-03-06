var osmdb = require('osm-p2p-db')
var memdb = require('memdb')
var hyperlog = require('hyperlog')
var memstore = require('memory-chunk-store')
var traverse = require('traverse')
var xtend = require('xtend')
var through = require('through2')
var clone = require('clone')
var from = require('from2')
var concat = require('concat-stream')

var getGeoJSON = require('../')

function db () {
  return osmdb({
    db: memdb(),
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    store: memstore(4096)
  })
}

function json2batch (e) {
  e = clone(e)
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

// [OsmObject] -> Error, GeoJSON <Async>
module.exports = function osmDataToGeoJson (data, opts, done) {
  if (opts && !done) {
    done = opts
    opts = {}
  }

  var batch = data.map(json2batch)

  var osm = db()
  osm.batch(batch, function (err, docs) {
    if (err) return done(err)
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    osm.query(bbox, function (err, docs) {
      if (err) return done(err)
      getGeoJSON(osm, xtend(opts, { docs: docs }), function (err, json) {
        if (err) return done(err)
        json = clearProperty('version', json)
        json = clearProperty('id', json)
        done(null, json, osm)
      })
    })
  })
}

module.exports.getQueryStream = function (data, opts) {
  var batch = data.map(json2batch)
  var t = through.obj()

  var osm = db()
  t.osm = osm
  osm.batch(batch, function (err, docs) {
    if (err) return done(err)
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    var q = osm.queryStream(bbox)
    var s = getGeoJSON(osm, opts)

    if (opts && opts.objectMode) {
      var x = through.obj(function (row, enc, next) {
        row = clearProperty('version', row)
        row = clearProperty('id', row)
        next(null, row)
      })
      q.pipe(s).pipe(x).pipe(t)
    } else {
      // Accumulate the entire GeoJSON string and parse it, so that 'version'
      // and 'id' properties can be stripped, then re-pipe it into the outgoing
      // stream.
      q.pipe(s).pipe(concat(function (text) {
        var data = JSON.parse(text)
        data = clearProperty('version', data)
        data = clearProperty('id', data)
        fromString(JSON.stringify(data)).pipe(t)
      }))
    }
  })

  return t
}

function fromString (string) {
  return from(function(size, next) {
    if (string.length <= 0) return next(null, null)
    var chunk = string.slice(0, size)
    string = string.slice(size)
    next(null, chunk)
  })
}
