var xtend = require('xtend')
var pumpify = require('pumpify')
var through = require('through2')
var once = require('once')
var readonly = require('read-only-stream')
var rewind = require('geojson-rewind')
var collect = require('collect-stream')
var mergePolygons = require('./lib/merge_polygons')
var amap = require('map-limit')

var FCStream = require('./lib/geojson_fc_stream')
var isPolygon = require('./lib/is_polygon_feature')
var hasInterestingTags = require('./lib/has_interesting_tags')

var DEFAULTS = {
  metadata: ['id', 'version', 'timestamp'],
  bbox: [-Infinity, -Infinity, Infinity, Infinity]
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
        next(null, rewind({
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
  getContainingDocIds(osm, id, function (err, docIds) {
    if (err) done(err)

    amap(docIds, 3, iterator, completed)

    function iterator (id, done) {
      osm.log.get(id, function (err, node) {
        if (err) return done(err)
        done(null, node.value.v)
      })
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
  osm.refs.list(ref, function (err, rows) {
    if (err) done(err)
    var docIds = rows.map(function (row) { return row.key })
    done(null, docIds)
  })
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
      if (err) return cb(err)

      var types = geometriesByType(geoms)
      if (Object.keys(types).length > 1) {
        // Heterogeneous data; use a GeometryCollection
        cb(null, {
          type: 'GeometryCollection',
          geometries: geoms
        })
      } else if (Object.keys(types)[0] === 'LineString') {
        cb(null, mergeViableLineStrings(geoms))
      } else if (Object.keys(types)[0] === 'Polygon') {
        cb(null, mergePolygons(geoms, { impl: 'turf' }))
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
  var s1 = coordId(a.coordinates[0])
  var e1 = coordId(a.coordinates[a.coordinates.length - 1])
  var s2 = coordId(b.coordinates[0])
  var e2 = coordId(b.coordinates[b.coordinates.length - 1])

  // TODO: handle case where more than one of these is true!

  var coords
  if (s1 === e2) {
    coords = b.coordinates.concat(a.coordinates.slice(1))
  } else if (s2 === e1) {
    coords = a.coordinates.concat(b.coordinates.slice(1))
  } else if (s1 === s2) {
    coords = a.coordinates.slice(1).reverse().concat(b.coordinates)
  } else if (e1 === e2) {
    coords = a.coordinates.concat(b.coordinates.reverse().slice(1))
  } else {
    return null
  }

  return {
    type: 'LineString',
    coordinates: coords
  }
}

// Merges all connected (non-forking, non-junctioning) line strings into single
// line strings.
// [LineString] -> LineString|MultiLineString
function mergeViableLineStrings (geoms) {
  // TODO: assert all are linestrings

  var lineStrings = geoms.slice()
  var result = []
  while (lineStrings.length > 0) {
    var ls = lineStrings.shift()

    // Attempt to merge this LineString with the other LineStrings, updating
    // the reference as it is merged with others and grows.
    lineStrings = lineStrings.reduce(function (accum, cur) {
      var merged = mergeLineStrings(ls, cur)
      if (merged) {
        // Accumulate the merged LineString
        ls = merged
      } else {
        // Put the unmerged LineString back into the list
        accum.push(cur)
      }
      return accum
    }, [])

    result.push(ls)
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

