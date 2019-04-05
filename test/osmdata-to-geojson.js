var xtend = require('xtend')
var through = require('through2')
var clone = require('clone')
var concat = require('concat-stream')
var utils = require('./utils')

var getGeoJSON = require('../')

function json2batch (e) {
  e = clone(e)
  var op = {
    type: 'put',
    key: e.id,
    id: e.id,
    value: e
  }
  if (e.nodes) e.refs = e.nodes
  delete e.id
  delete e.nodes
  return op
}

// [OsmObject] -> Error, GeoJSON <Async>
module.exports = function osmDataToGeoJson (data, opts, cb) {
  if (opts && !cb) {
    cb = opts
    opts = {}
  }

  run(utils.createDb(), data, opts, cb)
}

function run (osm, data, opts, done) {
  var batch = data.map(json2batch)

  osm.batch(batch, function (err, docs) {
    if (err) return done(err)
    var bbox = [-Infinity, -Infinity, Infinity, Infinity]
    osm.query(bbox, function (err, docs) {
      if (err) return done(err)
      getGeoJSON(osm, xtend(opts, { docs: docs }), function (err, json) {
        if (err) return done(err)
        json = utils.clearProperty('version', json)
        json = utils.clearProperty('id', json)
        done(null, json, osm)
      })
    })
  })
}

module.exports.getQueryStream = function (data, opts, done) {
  var batch = data.map(json2batch)
  var t = through.obj()

  var osm = utils.createDb()
  t.osm = osm
  osm.batch(batch, function (err, docs) {
    if (err) return done(err)
    var bbox = [-Infinity, -Infinity, Infinity, Infinity]
    var q = osm.query(bbox)
    var s = getGeoJSON(osm, opts)

    if (opts && opts.objectMode) {
      var x = through.obj(function (row, enc, next) {
        row = utils.clearProperty('version', row)
        row = utils.clearProperty('id', row)
        next(null, row)
      })
      q.pipe(s).pipe(x).pipe(t)
    } else {
      // Accumulate the entire GeoJSON string and parse it, so that 'version'
      // and 'id' properties can be stripped, then re-pipe it into the outgoing
      // stream.
      q.pipe(s).pipe(concat(function (text) {
        var data = JSON.parse(text)
        data = utils.clearProperty('version', data)
        data = utils.clearProperty('id', data)
        utils.fromString(JSON.stringify(data)).pipe(t)
      }))
    }
  })

  return t
}
