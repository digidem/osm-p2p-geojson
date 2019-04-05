var kappa = require('kappa-core')
var Osm = require('kappa-osm')
var raf = require('random-access-file')
var level = require('level')
var tmp = require('os').tmpdir()
var path = require('path')
var from = require('from2')
var traverse = require('traverse')
var mkdirp = require('mkdirp')

function createDb () {
  var dir = path.join(tmp, 'kappa-osm-' + String(Math.random()).substring(10))
  mkdirp.sync(dir)
  mkdirp.sync(path.join(dir, 'storage'))
  var kstorage = function (name) { return raf(path.join(dir, 'kappa', name)) }
  var core = kappa(kstorage, { valueEncoding: 'json' })
  return Osm({
    core: core,
    index: level(dir),
    storage: function (name, cb) { cb(null, raf(path.join(dir, 'storage', name))) }
  })
}

module.exports = {
  createDb, clearProperty, fromString
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

function fromString (string) {
  return from(function (size, next) {
    if (string.length <= 0) return next(null, null)
    var chunk = string.slice(0, size)
    string = string.slice(size)
    next(null, chunk)
  })
}
