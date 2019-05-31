var inherits = require('inherits')
var events = require('events')
var randombytes = require('randombytes')

function hex2dec (hexStr) {
  return parseInt(hexStr, 16).toString(10)
}

function genId () {
  return hex2dec(randombytes(8).toString('hex'))
}

module.exports = Importer

function Importer (osm) {
  if (!(this instanceof Importer)) return new Importer(osm)
  events.EventEmitter.call(this)
  this.osm = osm
  this.importing = false
}

inherits(Importer, events.EventEmitter)

Importer.prototype.importFeatureCollection = function (geojson, cb) {
  var self = this
  var docs = []
  if (self.importing) return cb(new Error('Import currently in progress.'))
  this.importing = true
  if (!geojson || !geojson.features) return cb(new Error('Import expects geojson FeatureCollection object.'))
  geojson.features.forEach(function addFeature (feature) {
    var geo = feature.geometry
    if (geo.type === 'Point') {
      var doc = {
        type: 'node',
        tags: feature.properties || {},
        lat: geo.coordinates[1],
        lon: geo.coordinates[0]
      }
      docs.push(doc)
    } else if (geo.type === 'MultiPoint') {
      var rdoc = {
        type: 'relation',
        members: [],
        tags: feature.properties || {}
      }
      docs.push(rdoc)
      geo.coordinates.forEach(function (pt) {
        var doc = {
          type: 'node',
          lat: pt[1],
          lon: pt[0],
          id: genId()
        }
        docs.push(doc)
        rdoc.members.push({ type: 'node', ref: doc.id, id: doc.id })
      })
    } else if (geo.type === 'LineString') {
      var wdoc = {
        type: 'way',
        refs: [],
        tags: feature.properties || {}
      }
      docs.push(wdoc)
      geo.coordinates.forEach(function (pt) {
        var doc = {
          type: 'node',
          id: genId(),
          lat: pt[1],
          lon: pt[0]
        }
        docs.push(doc)
        wdoc.refs.push(doc.id)
      })
    } else if (geo.type === 'MultiLineString') {
      var rdoc = {
        type: 'relation',
        members: [],
        tags: feature.properties || {}
      }
      docs.push(rdoc)
      geo.coordinates.forEach(function (pts) {
        var wdoc = {
          type: 'way',
          id: genId(),
          refs: []
        }
        docs.push(wdoc)
        rdoc.members.push({ type: 'way', id: wdoc.id, ref: wdoc.id })

        pts.forEach(function (pt) {
          var doc = {
            type: 'node',
            id: genId(),
            lat: pt[1],
            lon: pt[0]
          }
          docs.push(doc)
          wdoc.refs.push(doc.id)
        })
      })
    } else if (geo.type === 'Polygon' && geo.coordinates.length === 1) {
      // simple way case
      var pts = geo.coordinates[0]
      var wdoc = {
        type: 'way',
        id: genId(),
        refs: [],
        tags: Object.assign({
          area: 'yes'
        }, feature.properties || {})
      }
      docs.push(wdoc)

      var i = 0
      pts.forEach(function (pt) {
        var doc = {
          type: 'node',
          id: genId(),
          lat: pt[1],
          lon: pt[0]
        }
        docs.push(doc)
        wdoc.refs.push(doc.id)
        i++
        if (i === 1) first = doc.id
      })
      // areas need the last one to connect to the first one again.
      wdoc.refs.push(first)
    } else if (geo.type === 'Polygon' && geo.coordinates.length > 1) {
      // complex multipolygon!
      // TODO: this is *incomplete*! missing 'role' information, and possibly also 'type=boundary' tag
      // see: https://wiki.openstreetmap.org/wiki/Relation:multipolygon
      var rdoc = {
        type: 'relation',
        id: genId(),
        members: [],
        tags: feature.properties || {}
      }
      docs.push(rdoc)

      geo.coordinates.forEach(function (pts) {
        var wdoc = {
          type: 'way',
          id: genId(),
          refs: [],
          tags: {
            area: 'yes'
          }
        }
        docs.push(wdoc)
        rdoc.members.push({ type: 'relation', id: wdoc.id, ref: wdoc.id })

        var i = 0
        pts.forEach(function (pt) {
          var doc = {
            type: 'node',
            id: genId(),
            lat: pt[1],
            lon: pt[0]
          }
          docs.push(doc)
          wdoc.refs.push(doc.id)
          i++
          if (i === 1) first = doc.id
        })
        // areas need the last one to connect to the first one again.
        wdoc.refs.push(first)
      })
    } else if (geo.type === 'MultiPolygon') {
      var srdoc = {
        type: 'relation',
        members: [],
        tags: feature.properties || {}
      }
      docs.push(srdoc)
      geo.coordinates.forEach(function (xpts) {
        var rdoc = {
          type: 'relation',
          id: genId(),
          members: []
        }
        srdoc.members.push({ type: 'relation', id: rdoc.id, ref: rdoc.id })
        docs.push(rdoc)

        xpts.forEach(function (pts) {
          var wdoc = {
            type: 'way',
            id: genId(),
            refs: [],
            tags: {
              area: 'yes'
            }
          }
          docs.push(wdoc)
          rdoc.members.push({ type: 'way', id: wdoc.id, ref: wdoc.id })

          pts.forEach(function (pt) {
            var doc = {
              type: 'node',
              id: genId(),
              lat: pt[1],
              lon: pt[0]
            }
            docs.push(doc)
            wdoc.refs.push(doc.id)
          })
        })
      })
    } else if (geo.type === 'GeometryCollection') {
      geo.features.forEach(addFeature)
    }
  })
  function done (err) {
    if (err) self.emit('error', err)
    else self.emit('done')
    self.importing = false
    cb(err)
  }

  var batch = []

  for (var index=0; index < docs.length; index++) {
    var doc = docs[index]
    if (doc.id === undefined) {
      doc.changeset = geojson.changeset
      batch.push({
        type: 'put',
        value: doc
      })
    } else {
      var id = doc.id
      delete doc.id
      doc.changeset = geojson.changeset
      batch.push({
        type: 'put',
        id: id,
        value: doc
      })
    }
  }
  self.osm.batch(batch, done)
}
