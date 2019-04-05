# osm-p2p-geojson

> Transform OSM documents in a kappa-osm database to GeoJSON

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Contribute](#contribute)
- [License](#license)

## Install

```
npm install osm-p2p-geojson
```

## Usage

```js
var core = require('kappa-core')
var osmdb = require('kappa-osm')
var ram = require('random-access-memory')
var memdb = require('memdb')
var osmGeoJson = require('osm-p2p-geojson')

var osm = osmdb({
  core: core,
  index: memdb(),
  storage: function (name, cb) { cb(null, ram()) }
})

osm.create({
  type: 'node',
  lat: 1,
  lon: -1,
  tags: {
    foo: 'bar'
  }
}, function (err) {
  queryStreaming()
  queryCallback()
})

function queryStreaming () {
  var q = osm.queryStream([[-Infinity, Infinity], [-Infinity, Infinity]])
  var geo = osmGeoJson(osm)

  q.pipe(geo)

  geo.on('data', console.log)
}

function queryCallback () {
  osm.query([[-Infinity, Infinity], [-Infinity, Infinity]], function (err, docs) {
    osmGeoJson(osm, { docs: docs }, function (err, geojson) {
      console.log(geojson)
    })
  })
}
```

## API

```js
var osmGeoJson = require('osm-p2p-geojson')
```

### var importer = osmGeoJson.importer(osm)

Create an importer for importing GeoJSON objects into the given osm-p2p database. Can track progress through listening to the 'import' event. This event gives you the index of the most recently imported data and how many documents will be imported in total. If you try to import twice with the same importer, the callback will be called with an error.

If you want to import twice, create another importer.

```js
var importer = osmGeoJson.importer(osm)
importer.on('import', function (index, total) {
  console.log('import', index, total)
})
importer.importFeatureCollection(geojson, onDone)
```

### var stream = osmGeoJson(osm[, options][, callback])

Creates a TransformStream that will take as input a stream of osm-p2p documents
and outputs a stream of GeoJSON. If you prefer a callback rather than a stream
for reading output, you can pass `callback(err, geojson)`.

- `osm` - a [`kappa-osm`](https://github.com/digidem/kappa-osm)
- `docs` - a list of OSM documents. If not provided here, they must be written
  to the returned `stream`.
- `options.metadata` - Array of metadata properties to include as GeoJSON properties. Defaults to `['id', 'version', 'timestamp']`
- `options.objectMode` - when `true` will return a stream of GeoJSON feature objects instead of stringified JSON. Default `false`. You can also use `osmGeoJson.obj()`
- `options.map` - a function that maps a `Feature` to another `Feature`. Defaults to the no-op `function mapFn (feature) { return feature }`
- `options.polygonFeatures` - _either_ a list of tag keys and values that are polygons (for schema see https://github.com/tyrasd/osm-polygon-features/blob/master/schema.json) _or_ a function that will be called with two arguments: `coordinates` (from the GeoJSON geometry) and `tags` (a hash of tag key-value pairs) and should return `true` for polygons.

**N.B.**: If `options.objectMode` is enabled and no `callback` is provided, the
resultant object stream will emit GeoJSON `Feature` objects. This is not valid
GeoJSON as-is: the recipient of the stream will need to either wrap these
`Feature`s into a `FeatureCollection` or otherwise further transform them.

**N.B.**: Only "interesting" elements are exported. An interesting element is
defined as an element that is both a) not malformed, and b) has a populated
"tags" object set on it.

## Contribute

PRs accepted.

Small note: If editing the Readme, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © Gregor MacLennan
