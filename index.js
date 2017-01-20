var xtend = require('xtend')
var pumpify = require('pumpify')
var through = require('through2')
var once = require('once')
var rewind = require('geojson-rewind')
var collect = require('collect-stream')
var from = require('from2')

var FCStream = require('./lib/geojson_fc_stream')
var isPolygon = require('./lib/is_polygon_feature')
var hasInterestingTags = require('./lib/has_interesting_tags')

var DEFAULTS = {
  metadata: ['id', 'version', 'timestamp'],
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
      var types = geometriesByType(geoms)
      if (Object.keys(types).length > 1) {
        // Heterogeneous data; use a GeometryCollection
        cb(err, {
          type: 'GeometryCollection',
          geometries: geoms
        })
      } else if (Object.keys(types)[0] === 'LineString') {
        cb(err, mergeViableLineStrings(geoms))
      } else {
        cb(new Error('unknown type; should not happen'))
      }
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

// Coordinate ([Number, Number]) -> CoordId (String)
function coordId (coord) {
  return coord[0].toString() + ',' + coord[1].toString()
}

// LineString, LineString -> LineString
function mergeLineStrings (a, b) {
  // TODO: assert that a is the head that leads into b

  return {
    type: 'LineString',
    coordinates: a.coordinates.concat(b.coordinates.slice(1))
  }
}

// Merges all connected (non-forking, non-junctioning) line strings into single
// line strings.
// [LineString] -> GeoJson
function mergeViableLineStrings (geoms) {
  // TODO: assert all are linestrings

  var lineStrings = geoms.slice()
  var result = []

  while (lineStrings.length > 0) {
    var ls = lineStrings.shift()

    var didMerge = false

    // Look for exactly ONE other LineString whose tail matches our head, and
    // merge.
    var headId = coordId(ls.coordinates[0])
    var matches = partition(lineStrings, function (geom) {
      return coordId(geom.coordinates[geom.coordinates.length - 1]) === headId
    })
    var tailMatches = matches[0]
    lineStrings = matches[1]
    if (tailMatches.length === 1) {
      ls = mergeLineStrings(tailMatches[0], ls)
      didMerge = true
    } else if (tailMatches.length > 1) {
      throw new Error('junction/fork scenario; unimplemented')
    }

    // Look for exactly ONE other LineString whose head matches our tail, and
    // merge.
    var tailId = coordId(ls.coordinates[ls.coordinates.length - 1])
    matches = partition(lineStrings, function (geom) {
      return coordId(geom.coordinates[0]) === tailId
    })
    var headMatches = matches[0]
    lineStrings = matches[1]
    if (headMatches.length === 1) {
      ls = mergeLineStrings(ls, headMatches[0])
      didMerge = true
    } else if (headMatches.length > 1) {
      throw new Error('junction/fork scenario; unimplemented')
    }

    // Re-insert the LineString if a merge occurred
    if (didMerge) {
      lineStrings.push(ls)
    } else {
      result.push(ls)
    }
  }

  if (result.length === 1) {
    result = result[0]
  } else {
    result = {
      type: 'MultiLineString',
      coordinates: result.map(function (ls) { return ls.coordinates })
    }
  }

  return result
}

// [a], (a -> Bool) -> [[a], [a]]
function partition (lst, fn) {
  var result = [[], []]
  for (var i = 0; i < lst.length; i++) {
    if (fn(lst[i])) {
      result[0].push(lst[i])
    } else {
      result[1].push(lst[i])
    }
  }
  return result
}
