var JSONStream = require('JSONStream')

var OPEN = '{\n' +
  '    "type": "FeatureCollection",\n' +
  '    "features": [\n        '

var SEP = ',\n        '

var CLOSE = '    ]\n}\n'

module.exports = function GeoJSONFeatureCollectionStream () {
  return JSONStream.stringify(OPEN, SEP, CLOSE)
}
