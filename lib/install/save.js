'use strict'

const BB = require('bluebird')

const createShrinkwrap = require('../shrinkwrap.js').createShrinkwrap
const deepSortObject = require('../utils/deep-sort-object.js')
const detectIndent = require('detect-indent')
const fs = BB.promisifyAll(require('graceful-fs'))
const log = require('npmlog')
const moduleName = require('../utils/module-name.js')
const npm = require('../npm.js')
const parseJSON = require('../utils/parse-json.js')
const path = require('path')
const validate = require('aproba')
const without = require('lodash.without')
const writeFileAtomic = BB.promisify(require('write-file-atomic'))

// if the -S|--save option is specified, then write installed packages
// as dependencies to a package.json file.

exports.saveRequested = function (args, tree, andReturn) {
  validate('AOF', arguments)
  saveShrinkwrap(tree).then(() => {
    return savePackageJson(args, tree)
  }).catch((err) => {
    log.warn('saveError', err.message)
  }).nodeify(andReturn)
}

function saveShrinkwrap (tree) {
  validate('O', arguments)
  return BB.fromNode((next) => {
    createShrinkwrap(tree, {silent: false}, next)
  })
}

function savePackageJson (args, tree) {
  validate('AO', arguments)
  if (!args || !args.length) { return }

  var saveBundle = npm.config.get('save-bundle')

  // each item in the tree is a top-level thing that should be saved
  // to the package.json file.
  // The relevant tree shape is { <folder>: {what:<pkg>} }
  var saveTarget = path.resolve(tree.path, 'package.json')
  // don't use readJson, because we don't want to do all the other
  // tricky npm-specific stuff that's in there.
  return fs.readFileAsync(saveTarget, 'utf8').then((packagejson) => {
    const indent = detectIndent(packagejson).indent || '  '
    tree.package = parseJSON(packagejson)

    // If we're saving bundled deps, normalize the key before we start
    if (saveBundle) {
      var bundle = tree.package.bundleDependencies || tree.package.bundledDependencies
      delete tree.package.bundledDependencies
      if (!Array.isArray(bundle)) bundle = []
    }

    var toSave = getThingsToSave(tree)
    var toRemove = getThingsToRemove(tree)
    var savingTo = {}
    toSave.forEach(function (pkg) { savingTo[pkg.save] = true })
    toRemove.forEach(function (pkg) { savingTo[pkg.save] = true })

    Object.keys(savingTo).forEach(function (save) {
      if (!tree.package[save]) tree.package[save] = {}
    })

    log.verbose('saving', toSave)
    toSave.forEach(function (pkg) {
      tree.package[pkg.save][pkg.name] = pkg.spec
      if (saveBundle) {
        var ii = bundle.indexOf(pkg.name)
        if (ii === -1) bundle.push(pkg.name)
      }
    })

    toRemove.forEach(function (pkg) {
      delete tree.package[pkg.save][pkg.name]
      if (saveBundle) {
        bundle = without(bundle, pkg.name)
      }
    })

    Object.keys(savingTo).forEach(function (key) {
      tree.package[key] = deepSortObject(tree.package[key])
    })
    if (saveBundle) {
      tree.package.bundleDependencies = deepSortObject(bundle)
    }

    var json = JSON.stringify(tree.package, null, indent) + '\n'
    return writeFileAtomic(saveTarget, json)
  })
}

exports.getSaveType = function (tree, arg) {
  if (arguments.length) validate('OO', arguments)
  var globalInstall = npm.config.get('global')
  var noSaveFlags = !npm.config.get('save') &&
                    !npm.config.get('save-dev') &&
                    !npm.config.get('save-optional')
  if (globalInstall || noSaveFlags) return null

  if (npm.config.get('save-optional')) {
    return 'optionalDependencies'
  } else if (npm.config.get('save-dev')) {
    return 'devDependencies'
  } else {
    if (arg) {
      var name = moduleName(arg)
      if (tree.package.optionalDependencies[name]) {
        return 'optionalDependencies'
      } else if (tree.package.devDependencies[name]) {
        return 'devDependencies'
      }
    }
    return 'dependencies'
  }
}

function getThingsToSave (tree) {
  validate('O', arguments)
  var toSave = tree.children.filter(function (child) {
    return child.save
  }).map(function (child) {
    return {
      name: moduleName(child),
      spec: child.saveSpec,
      save: child.save
    }
  })
  return toSave
}

function getThingsToRemove (tree) {
  validate('O', arguments)
  if (!tree.removed) return []
  var toRemove = tree.removed.map(function (child) {
    return {
      name: moduleName(child),
      save: child.save
    }
  })
  return toRemove
}
