'use strict'

// npm
const nano = require('nano')
require('dotenv-safe').load({
  silent: true,
  sample: 'node_modules/feverish-routes/.env.example'
})

// self
const pkg = require('./package.json')
const utils = require('./lib/utils')

const after = (options, server, next) => {
  const cache = server.app.cache

  const welcome = function (request, reply) {
    cache.get('accueil', (err, cached) => {
      if (err) { return reply(err) }
      if (cached) {
        cached.editor = utils.isTeacher(request)
        cached.active = 'accueil'
        return reply.view('bienvenue', cached).etag(cached._rev)
      }
      nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
        if (err) { return reply(err) }
        nano({ url: utils.dbUrl, cookie: headers['set-cookie'] })
          .get('accueil', (err, body) => {
            if (err) { return reply(err) }
            cache.set('accueil', body, 0, (err) => {
              if (err) { return reply(err) }
              body.editor = utils.isTeacher(request)
              body.active = 'accueil'
              return reply.view('bienvenue', body).etag(body._rev)
            })
          })
      })
    })
  }

  const autocompleters = function (type, request, reply) {
    cache.get(type, (err, cached) => {
      if (err) { return reply(err) }
      if (cached) { return reply(cached) }
      nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
        if (err) { return reply(err) }
        nano({
          url: utils.dbUrl,
          cookie: headers['set-cookie']
        }).view('feverish', type, { group: true }, (err, body) => {
          if (err) { return reply(err) }
          cache.set(type, body.rows, 0, (err) => reply(err || body.rows))
        })
      })
    })
  }

  server.views({
    engines: { html: require('lodash-vision') },
    path: 'templates',
    partialsPath: 'templates/partials',
    isCached: process.env.TEMPLATE_CACHE.toLowerCase() === 'true'
  })

  server.route({
    method: 'GET',
    path: '/',
    handler: welcome
  })

  server.route({
    method: 'GET',
    path: '/exercices',
    config: {
      pre: [{ method: utils.getExercices, assign: 'exercices' }],
      handler: utils.exercices
    }
  })

  server.route({
    method: 'GET',
    path: '/rendus',
    config: {
      pre: [{ method: utils.getExercices, assign: 'exercices' }],
      handler: utils.rendus
    }
  })

  server.route({
    method: 'GET',
    path: '/resultats',
    config: {
      pre: [{ method: utils.getExercices, assign: 'exercices' }],
      handler: utils.resultats
    }
  })

  server.route({
    method: 'GET',
    path: '/rendu/{ex}/{att}',
    handler: utils.rendu
  })

  server.route({
    method: 'DELETE',
    path: '/etudiant/{userid}',
    handler: utils.etudiantDelete
  })

  server.route({
    method: 'GET',
    path: '/etudiants',
    handler: utils.etudiants
  })

  server.route({
    method: 'GET',
    path: '/theme.json',
    handler: autocompleters.bind(null, 'themes')
  })

  server.route({
    method: 'GET',
    path: '/travail.json',
    handler: autocompleters.bind(null, 'travaux')
  })

  server.route({
    method: 'GET',
    path: '/new',
    handler: { view: 'create-exercice' }
  })

  next()
}

exports.register = (server, options, next) => {
  const deps = Object.keys(pkg.dependencies)
    .filter((x) => pkg.notHapiPlugins.indexOf(x) === -1)
  server.dependency(deps, after.bind(null, options))
  next()
}

exports.register.attributes = {
  name: pkg.name,
  version: pkg.version
}
