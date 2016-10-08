'use strict'

// npm
require ('dotenv-safe').load({ silent: true, sample: 'node_modules/feverish-routes/.env.example' })

const pkg = require('./package.json')

const after = (options, server, next) => {
  console.log('OPTIONS2:', options)

  server.views({
    engines: { html: require('lodash-vision') },
    path: 'templates',
    partialsPath: 'templates/partials',
    isCached: process.env.TEMPLATE_CACHE.toLowerCase() === 'true'
  })

  server.route({
    method: 'GET',
    path: '/',
    handler: {
      view: {
        template: 'bienvenue',
        context: {
          name: 'joséanne',
          roles: ['student'],
          active: 'accueil'
        }
      }
    }
  })

  server.route({
    method: 'GET',
    path: '/exercices',
    handler: {
      view: {
        template: 'exercices',
        context: {
          name: 'joséanne',
          roles: ['student'],
          active: 'exercices',
          rows: []
        }
      }
    }
  })

  server.route({
    method: 'GET',
    path: '/rendus',
    handler: {
      view: {
        template: 'rendus',
        context: {
          rows: [],
          name: 'joséanne',
          roles: ['student'],
          active: 'rendus'
        }
      }
    }
  })

  server.route({
    method: 'GET',
    path: '/resultats',
    handler: {
      view: {
        template: 'score',
        context: {
          name: 'joséanne',
          roles: ['student'],
          doc: { _id: 'aaa', _rev: '2-bbb', title: 'joséanne' },
          active: 'resultats'
        }
      }
    }
  })

  server.route({
    method: 'GET',
    path: '/testing',
    handler: { view: { template: 'testing' } }
  })

  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: { directory: { path: './assets/' } }
  })

  next()
}

exports.register = (server, options, next) => {
  console.log('OPTIONS:', options)
  server.dependency(Object.keys(pkg.dependencies).filter((x) => pkg.notHapiDeps.indexOf(x) === -1), after.bind(null, options))
  next()
}

exports.register.attributes = {
  name: pkg.name,
  version: pkg.version
}
