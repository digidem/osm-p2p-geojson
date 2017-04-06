var tmpdir = require('os').tmpdir()
var osmdb = require('osm-p2p-db')
var memdb = require('memdb')
var hyperlog = require('hyperlog')
var path = require('path')
var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var fdstore = require('fd-chunk-store')
var traverse = require('traverse')
var xtend = require('xtend')
var through = require('through2')
var clone = require('clone')

var getGeoJSON = require('../')

function db () {
  var dir = path.join(tmpdir, 'osm-p2p-geojson-test-' + Math.random())
  rimraf.sync(dir)
  mkdirp.sync(dir)
  return osmdb({
    db: memdb(),
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    store: fdstore(4096, path.join(dir, 'kdb'))
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
        done(null, json)
      })
    })
  })
}

module.exports.getQueryStream = function (data) {
  var batch = data.map(json2batch)
  var t = through.obj()

  var osm = db()
  t.osm = osm
  osm.batch(batch, function (err, docs) {
    if (err) return done(err)
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    var q = osm.queryStream(bbox)
    var x = through.obj(function (row, enc, next) {
      row = clearProperty('version', row)
      row = clearProperty('id', row)
      this.push(row)
      next()
    })
    var s = getGeoJSON(osm, { objectMode: true })
    q.pipe(s).pipe(x).pipe(t)
  })

  return t
}
