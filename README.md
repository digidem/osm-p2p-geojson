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
var GeoJSONStream = require('osm-p2p-geojson')
var stream = GeoJSONStream(osm, [-Infinity, -Infinity, Infinity, Infinity])
stream.pipe(process.stdout)
// pipes GeoJSON to stdout...
```

## API

## Contribute

PRs accepted.

Small note: If editing the Readme, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © Gregor MacLennan
