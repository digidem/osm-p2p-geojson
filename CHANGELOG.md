# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [4.0.5](https://github.com/digidem/osm-p2p-geojson/compare/v4.0.2...v4.0.5) (2019-08-12)

### Fixed
- Replace deprecated `geojsonhint` with `geojson-validation`.

## 3.0.0 - 2017-04-26
*Breaking API change and major semver version bump!*
### Changed
- The main `getGeoJSON` API now returns a Transform stream that accepts
  ndjson-formatted OSM documents and writes GeoJSON on the other side. This
  means API consumers must perform an `osm.query()` call on an `osm-p2p-db`
  instance themselves and feed it into `getGeoJSON()` rather than relying on
  `osm-p2p-geojson` to do OSM database querying for them.
- GeoJSON elements of the same type (LineString, Polygon) inside a relation that
  are touching will automatically be "dissolved" into single GeoJSON features
  where possible.
### Added
- Add optional map function - applied to each feature

## 2.0.0 - 2016-09-05
*Breaking API change and major semver version bump!*
### Changed
- Accept the query bounding box as `opts.bbox` rather than mandatory parameter
  `q`. `opts.bbox` defaults to `Infinity`.
- The GeoJSON bounding box format of `[minLat, maxLat, minLon, maxLon]` is used.

## 1.1.0 - 2016-09-03
### Added
- Initial implementation.
