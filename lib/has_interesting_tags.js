var xtend = require('xtend')

var DEFAULTS = {
  uninterestingKeys: [
    'source',
    'source_ref',
    'source:ref',
    'history',
    'attribution',
    'created_by',
    'tiger:county',
    'tiger:tlid',
    'tiger:upload_uuid'
  ]
}

/**
 * Checks whether tags object has any interesting tags
 * i.e. any tags whose keys are not in opts.uninterestingKeys
 * and tags whose key and value are not in opts.ignoreTags
 */
module.exports = function hasInterestingTags (tags, opts) {
  opts = xtend(opts, DEFAULTS)
  opts.ignoreTags = opts.ignoreTags || {}

  for (var key in tags) {
    // Return true if tags has a key that is not in opts.uninterestingKeys
    // and the key-value combination is not in opts.ignoreTags
    if (opts.uninterestingKeys.indexOf(key) === -1 &&
      !(opts.ignoreTags[key] === true || opts.ignoreTags[key] === tags[key])) {
      return true
    }
  }
  return false
}
