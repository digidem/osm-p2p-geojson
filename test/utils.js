var osmdb = require('osm-p2p-db')
var from = require('from2')
var traverse = require('traverse')
var memdb = require('memdb')
var hyperlog = require('hyperlog')
var memstore = require('memory-chunk-store')
var hyperOsm = require('hyperdb-osm')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var grid = require('grid-point-store')

module.exports = {
  osmp2p, hyperosm, clearProperty, fromString
}

function osmp2p () {
  return osmdb({
    db: memdb(),
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    store: memstore(4096)
  })
}

function hyperosm () {
  return hyperOsm({
    db: hyperdb(ram, { valueEncoding: 'json' }),
    index: memdb(),
    pointstore: grid({ store: memdb(), zoomLevel: 7 })
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

function fromString (string) {
  return from(function (size, next) {
    if (string.length <= 0) return next(null, null)
    var chunk = string.slice(0, size)
    string = string.slice(size)
    next(null, chunk)
  })
}
