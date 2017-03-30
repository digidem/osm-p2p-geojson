# osm-p2p-geojson

> Transform OSM documents in an osm-p2p-db to GeoJSON

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
// streaming:
var getGeoJSON = require('osm-p2p-geojson')
var stream = getGeoJSON(osm)

var q = osm.query({
  bbox: [-Infinity, -Infinity, Infinity, Infinity]
})

// outputs geojson object
q.pipe(stream).pipe(process.stdout)

// or as callbacks:
osm.query({
  bbox: [-Infinity, -Infinity, Infinity, Infinity]
}, function (err, docs) {
  getGeoJSON(osm, { docs: docs }, function (err, geojson) {
    console.log(geojson)
    // outputs geojson object
  })
})
```

## API

```js
var getGeoJSON = require('osm-p2p-geojson')
```

### var stream = getGeoJSON(osm[, options][, callback])

Creates a TransformStream that will take as input a stream of osm-p2p documents
and outputs a stream of GeoJSON. If you prefer a callback rather than a stream
for reading output, you can pass `callback(err, geojson)`.

- `osm` - a [`osm-p2p-db`](https://github.com/digidem/osm-p2p-db)
- `docs` - a list of OSM documents. If not provided here, they must be written
  to the returned `stream`.
- `options.metadata` - Array of metadata properties to include as GeoJSON properties. Defaults to `['id', 'version', 'timestamp']`
- `options.objectMode` - when `true` will return a stream of GeoJSON feature objects instead of stringified JSON. Default `false`. You can also use `getGeoJSON.obj()`
- `options.map` - a function that maps a `Feature` to another `Feature`. Defaults to the no-op `function mapFn (feature) { return feature }`

**N.B.**: If `options.objectMode` is enabled and no `callback` is provided, the
resultant object stream will emit GeoJSON `Feature` objects. This is not valid
GeoJSON as-is: the recipient of the stream will need to either wrap these
`Feature`s into a `FeatureCollection` or otherwise further transform them.

## Contribute

PRs accepted.

Small note: If editing the Readme, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © Gregor MacLennan
