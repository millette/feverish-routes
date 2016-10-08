'use strict'

const after = (options, server, next) => {
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

const pkg = require('./package.json')

exports.register = (server, options, next) => {
  server.dependency(Object.keys(pkg.dependencies), after.bind(null, options))
  next()
}

exports.register.attributes = {
  name: pkg.name,
  version: pkg.version
}
