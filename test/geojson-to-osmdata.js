var osmGeoJson = require('..')
var utils = require('./utils')

module.exports = function (data, opts, cb) {
  if (opts && !cb) {
    cb = opts
    opts = {}
  }

  run(utils.osmp2p(), data, opts, cb)
  run(utils.hyperosm(), data, opts, cb)
}

function run (osm, data, opts, cb) {
  var importer = osmGeoJson.importer(osm)
  importer.on('import', function () {
    // got data
  })
  importer.importFeatureCollection(data, function done (err) {
    if (err) return cb(err)
    var bbox = [[-Infinity, Infinity], [-Infinity, Infinity]]
    osm.query(bbox, function (err, docs) {
      if (err) return cb(err)
      docs = utils.clearProperty('version', docs)
      docs = utils.clearProperty('id', docs)
      docs = utils.clearProperty('timestamp', docs)
      docs = utils.clearProperty('refs', docs)
      docs = utils.clearProperty('members', docs)
      return cb(null, docs)
    })
  })
}
