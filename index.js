var xtend = require('xtend')
var pumpify = require('pumpify')
var through = require('through2')
var once = require('once')
var rewind = require('geojson-rewind')
var collect = require('collect-stream')
var from = require('from2')
var amap = require('map-limit')
var dissolve = require('geojson-dissolve')
var geoJsonHints = require('geojsonhint').hint

var Importer = require('./lib/importer.js')
var FCStream = require('./lib/geojson_fc_stream')
var isPolygon = require('./lib/is_polygon_feature')
var hasInterestingTags = require('./lib/has_interesting_tags')

var DEFAULTS = {
  metadata: ['id', 'version', 'timestamp'],
  map: function (f) { return f }
}

module.exports = getGeoJSON
module.exports.importer = Importer

module.exports.obj = function (osm, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  return getGeoJSON(osm, xtend({objectMode: true, highWaterMark: 16}, opts), cb)
}

function getGeoJSON (osm, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  opts = xtend(DEFAULTS, opts)
  if (!opts.metadata) opts.metadata = []
  if (!Array.isArray(opts.metadata)) throw new Error('metadata option must be an array')

  var pipeline = [through.obj(write)]
  var stream

  if (opts.docs) {
    pipeline.unshift(from.obj(opts.docs))
  }

  if (!opts.objectMode && !cb) {
    stream = pumpify.obj(pipeline.concat(FCStream()))
  } else {
    stream = pipeline.length === 1 ? pipeline[0] : pumpify.obj(pipeline)
  }

  if (cb) {
    return collect(stream, function (err, features) {
      if (err) return cb(err)
      cb(null, {
        type: 'FeatureCollection',
        features: features
      })
    })
  } else {
    return stream
  }

  function write (row, enc, next) {
    geom(osm, row, opts.polygonFeatures, function (err, geometry) {
      if (err) return next(err)
      if (!row.tags || !hasInterestingTags(row.tags)) return next()

      geometry = rewindFixed(geometry)

      var errors = geoJsonHints(geometry)
      if (errors.length > 0) {
        return next()
      }

      // Skip this entry if it has an interesting parent. This avoids
      // double-processing the document.
      hasAnInterestingParent(osm, row.id, function (err, has) {
        if (err) return next(err)
        if (has) {
          next()
        } else {
          handleRow()
        }
      })

      function handleRow () {
        var metadata = {}
        opts.metadata.forEach(function (key) {
          if (row[key]) metadata[key] = row[key]
        })
        next(null, opts.map({
          type: 'Feature',
          id: row.id,
          geometry: geometry,
          properties: xtend(row.tags || {}, metadata)
        }))
      }
    })
  }
}

// OsmDb, ID -> Bool <Async>
function hasAnInterestingParent (osm, id, done) {
  getContainingDocIds(osm, id, function (err, docVersions) {
    if (err) done(err)

    amap(docVersions, 3, version2doc, completed)

    function version2doc (version, done) {
      osm.getByVersion(version, done)
    }

    function completed (err, docs) {
      if (err) return done(err)

      var interestingParents = docs.filter(function (doc) {
        return doc.tags && hasInterestingTags(doc.tags)
      })
      done(null, interestingParents.length > 0)
    }
  })
}

// Looks up the OSM IDs of the OSM documents that contain a reference to the
// given ID.
// OsmDb, ID -> [VersionID] <Async>
function getContainingDocIds (osm, ref, done) {
  osm.getReferrers(ref, function (err, rows) {
    if (err) done(err)
    var docVersions = rows.map(function (row) { return row.version })
    done(null, docVersions)
  })
}

function geom (osm, doc, polygonFeatures, cb) {
  cb = once(cb)
  if (doc.type === 'node') {
    cb(null, {
      type: 'Point',
      coordinates: [ +doc.lon, +doc.lat ]
    })
  } else if (doc.type === 'way') {
    expandRefs(osm, doc.refs || doc.nodes || [], function (err, coords) {
      if (err) return cb(err)
      var type = isPolygon(coords, doc.tags, polygonFeatures) ? 'Polygon' : 'LineString'
      cb(null, {
        type: type,
        coordinates: type === 'LineString' ? coords : [coords]
      })
    })
  } else if (doc.type === 'relation') {
    expandMembers(osm, doc.members || [], polygonFeatures, function (err, geoms) {
      if (err) return cb(err)
      var result = assembleGeometries(geoms)
      cb(null, result)
    })
  } else cb(null, undefined)
}

// Takes a list of GeoJSON objects and returns a single GeoJSON object
// containing them. Applies dissolving of (Multi)LineStrings and
// (Multi)Polygons where ever possible.
// [GeoJSON] -> GeoJSON
function assembleGeometries (geoms) {
  var types = geometriesByType(geoms)

  var numTypes = Object.keys(types).length
  if (numTypes === 0) {
    return {}
  }

  var dissolvableTypes = [
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon'
  ]

  var type = Object.keys(types)[0]
  if (numTypes === 1 && dissolvableTypes.indexOf(type) !== -1) {
    geoms = geoms.map(rewindFixed)

    var errors = geoms.reduce(function (accum, geom) {
      var errs = geoJsonHints(geom)
      if (errs.length > 0) return accum.concat(errs)
      else return accum
    }, [])
    if (errors.length > 0) {
      // skip
      return {}
    }

    return dissolve(types[type])
  }

  // Heterogeneous data; use a GeometryCollection
  return {
    type: 'GeometryCollection',
    geometries: geoms
  }
}

function expandRefs (osm, refs, cb) {
  cb = once(cb)
  var pending = 1
  var coords = Array(refs.length)
  refs.forEach(function (ref, ix) {
    pending++
    osm.get(ref, function (err, docs) {
      if (err) return cb(err)
      var doc = mostRecentFork(docs || []) // for now
      if (doc) {
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

function expandMembers (osm, members, polygonFeatures, cb) {
  cb = once(cb)
  var pending = 1
  var geoms = Array(members.length)
  members.forEach(function (member, ix) {
    pending++
    osm.get(member.ref, function (err, docs) {
      if (err) return cb(err)
      var doc = mostRecentFork(docs || []) // for now
      if (doc) {
        geom(osm, doc, polygonFeatures, function (err, geometry) {
          if (err) return cb(err)
          geoms[ix] = geometry
          if (--pending === 0) cb(null, geoms)
        })
      } else if (--pending === 0) cb(null, geoms)
    })
  })
  if (--pending === 0) cb(null, geoms)
}

// [OsmDocument] -> OsmDocument|null
function mostRecentFork (docs) {
  var results = Object.keys(docs).map(key => docs[key]).sort(cmpFork)
  results = results.filter(function (doc) { return !doc.deleted })
  return results[0]
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

// [GeoJson] -> {String: [GeoJson]}
function geometriesByType (geoms) {
  var types = {}
  geoms.forEach(function (geom) {
    if (!types[geom.type]) {
      types[geom.type] = []
    }
    types[geom.type].push(geom)
  })
  return types
}

// Handles GeometryCollections until https://github.com/mapbox/geojson-rewind/pull/14 lands
function rewindFixed (gj) {
  if (gj && gj.type === 'GeometryCollection') {
    gj.geometries = gj.geometries.map(function (g) { return rewind(g) })
    return gj
  } else {
    return rewind(gj)
  }
}
