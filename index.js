'use strict'

// npm
require('dotenv-safe').load({
  silent: true,
  sample: 'node_modules/feverish-routes/.env.example'
})

// self
const pkg = require('./package.json')
const utils = require('./lib/utils')

// npm
const nano = require('nano')

const after = (options, server, next) => {
  const cache = server.cache({ segment: 'sessions', expiresIn: 3 * 24 * 60 * 60 * 1000 })
  server.app.cache = cache

  server.views({
    engines: { html: require('lodash-vision') },
    path: 'templates',
    partialsPath: 'templates/partials',
    isCached: process.env.TEMPLATE_CACHE.toLowerCase() === 'true'
  })

  server.auth.strategy('session', 'cookie', true, {
    password: 'password-should-be-32-characters',
    cookie: 'sid-example',
    redirectTo: '/login',
    isSecure: false,
    validateFunc: (request, session, callback) => {
      cache.get(
        session.sid, (err, cached) => err
          ? callback(err, false)
          : cached
            ? callback(null, true, cached.account)
            : callback(null, false)
      )
    }
  })

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

  const loginGet = function (request, reply) {
    request.auth.isAuthenticated ? reply.redirect('/') : reply.view('login').etag(pkg.version)
  }

  const loginPost = function (request, reply) {
    if (request.auth.isAuthenticated) { return reply.redirect('/') }
    if (!request.payload.username || !request.payload.password) {
      return reply.view('login', { message: 'Missing username or password' })
    }

    nano(process.env.DBURL).auth(request.payload.username, request.payload.password, (err, body, headers) => {
      if (err) {
        if (err.statusCode === 401) {
          reply.view('login', { message: err.reason })
        } else if (err.code === 'ECONNREFUSED') {
          reply.view('login', { message: 'Problem with the database.' })
        } else {
          reply(err)
        }
        return
      }
      if (!body.name) { body.name = request.payload.username }
      cache.set(body.name, { account: body }, 0, (err) => {
        if (err) { return reply(err) }
        request.cookieAuth.set({ sid: body.name })
        reply.redirect('/')
      })
    })
  }

  server.route({
    method: 'POST',
    path: '/logout',
    handler: (request, reply) => {
      request.cookieAuth.clear()
      return reply.redirect('/')
    }
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
    path: '/login',
    config: {
      handler: loginGet,
      auth: { mode: 'try' },
      plugins: { 'hapi-auth-cookie': { redirectTo: false } }
    }
  })

  server.route({
    method: 'POST',
    path: '/login',
    config: {
      handler: loginPost,
      auth: { mode: 'try' },
      plugins: { 'hapi-auth-cookie': { redirectTo: false } }
    }
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

  /*
  server.route({
    method: 'POST',
    path: '/new',
    handler: { view: 'testing' }
  })
  */

  next()
}

exports.register = (server, options, next) => {
  server.dependency(Object.keys(pkg.dependencies).filter((x) => pkg.notHapiPlugins.indexOf(x) === -1), after.bind(null, options))
  next()
}

exports.register.attributes = {
  name: pkg.name,
  version: pkg.version
}
