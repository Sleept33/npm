'use strict'

const BB = require('bluebird')

const extract = require('pacote/extract')
const npmlog = require('npmlog')
const path = require('path')
const readJson = BB.promisify(require('read-package-json'))

module.exports = (args, cb) => {
  const parsed = typeof args === 'string' ? JSON.parse(args) : args
  const spec = parsed[0]
  const extractTo = parsed[1]
  const opts = parsed[2]
  if (!opts.log && opts.loglevel) {
    opts.log = npmlog
    opts.log.level = opts.loglevel
  }
  extract(spec, extractTo, opts).then(() => {
    return readJson(
      path.join(extractTo, 'package.json'),
      false
    ).catch(() => {
      return null
    })
  }).then((res) => JSON.stringify(res)).nodeify(cb)
}
