# osm-p2p-geojson

> Export GeoJSON from osm-p2p-db

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
var getGeoJSON = require('osm-p2p-geojson')
var q = [[-Infinity, Infinity], [-Infinity, Infinity]]
var stream = getGeoJSON(osm, q)
stream.pipe(process.stdout)
// pipes GeoJSON to stdout...
getGeoJSON(osm, q, function (err, geojson) {
  console.log(geojson)
  // outputs geojson object
})
```

## API

## Contribute

PRs accepted.

Small note: If editing the Readme, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © Gregor MacLennan
