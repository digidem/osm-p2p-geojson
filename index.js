var xtend = require('xtend')
var pumpify = require('pumpify')
var through = require('through2')
var once = require('once')
var readonly = require('read-only-stream')
var rewind = require('geojson-rewind')
var collect = require('collect-stream')

var FCStream = require('./lib/geojson_fc_stream')
var isPolygon = require('./lib/is_polygon_feature')
var hasInterestingTags = require('./lib/has_interesting_tags')

var DEFAULTS = {
  metadata: ['id', 'version', 'timestamp'],
  bbox: [-Infinity, -Infinity, Infinity, Infinity],
  map: function (f) { return f }
}

module.exports = getGeoJSON

module.exports.obj = function (osm, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  getGeoJSON(osm, xtend({objectMode: true, highWaterMark: 16}, opts), cb)
}

function getGeoJSON (osm, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  opts = xtend(DEFAULTS, opts)
  if (!opts.metadata) opts.metadata = []
  if (!Array.isArray(opts.metadata)) throw new Error('metadata option must be an array')

  var q = [[opts.bbox[0], opts.bbox[2]], [opts.bbox[1], opts.bbox[3]]]
  var pipeline = [osm.queryStream(q), through.obj(write)]
  var stream

  if (!opts.objectMode && !cb) {
    stream = pumpify(pipeline.concat(FCStream()))
  } else {
    stream = pumpify.obj(pipeline)
  }

  if (cb) {
    collect(stream, function (err, features) {
      if (err) return cb(err)
      cb(null, {
        type: 'FeatureCollection',
        features: features
      })
    })
  } else {
    return readonly(stream)
  }

  function write (row, enc, next) {
    geom(osm, row, function (err, geometry) {
      if (err) return next(err)
      if (!row.tags || !hasInterestingTags(row.tags)) return next()
      var metadata = {}
      opts.metadata.forEach(function (key) {
        if (row[key]) metadata[key] = row[key]
      })
      next(null, opts.map(rewind({
        type: 'Feature',
        id: row.id,
        geometry: geometry,
        properties: xtend(row.tags || {}, metadata)
      })))
    })
  }
}

function geom (osm, doc, cb) {
  cb = once(cb)
  if (doc.type === 'node') {
    cb(null, {
      type: 'Point',
      coordinates: [ +doc.lon, +doc.lat ]
    })
  } else if (doc.type === 'way') {
    expandRefs(osm, doc.refs || [], function (err, coords) {
      if (err) return cb(err)
      var type = isPolygon(coords, doc.tags) ? 'Polygon' : 'LineString'
      cb(null, {
        type: type,
        coordinates: type === 'LineString' ? coords : [coords]
      })
    })
  } else if (doc.type === 'relation') {
    expandMembers(osm, doc.members || [], function (err, geoms) {
      // TODO: Relations need to be processed as MultiPolygons / MultiLineStrings / MultiPoints
      cb(err, {
        type: 'GeometryCollection',
        geometries: geoms
      })
    })
  } else cb(null, undefined)
}

function expandRefs (osm, refs, cb) {
  cb = once(cb)
  var pending = 1
  var coords = Array(refs.length)
  refs.forEach(function (ref, ix) {
    pending++
    osm.get(ref, function (err, docs) {
      if (err) return cb(err)
      if (docs && Object.keys(docs).length) {
        var doc = mostRecentFork(docs) // for now
        if (!doc) return cb(new Error('Missing ref #' + ref))
        coords[ix] = [+doc.lon, +doc.lat]
      }
      if (--pending === 0) done()
    })
  })
  if (--pending === 0) done()
  function done () {
    coords = coords.filter(Array.isArray)
    cb(null, coords)
  }
}

function expandMembers (osm, members, cb) {
  cb = once(cb)
  var pending = 1
  var geoms = Array(members.length)
  members.forEach(function (member, ix) {
    pending++
    osm.get(member.ref, function (err, docs) {
      if (err) return cb(err)
      if (docs) {
        var doc = mostRecentFork(docs) // for now
        geom(osm, doc, function (err, geometry) {
          if (err) return cb(err)
          geoms[ix] = geometry
          if (--pending === 0) cb(null, geoms)
        })
      } else if (--pending === 0) cb(null, geoms)
    })
  })
  if (--pending === 0) cb(null, geoms)
}

function mostRecentFork (docs) {
  return Object.keys(docs).map(key => docs[key]).sort(cmpFork)[0]
}

/**
 * Sort function to sort forks by most recent first, or by version id
 * if no timestamps are set
 */
function cmpFork (a, b) {
  if (a.timestamp && b.timestamp) {
    return b.timestamp - a.timestamp
  }
  // Ensure sorting is stable between requests
  return a.version < b.version ? -1 : 1
}
