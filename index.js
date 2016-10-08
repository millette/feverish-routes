'use strict'

// npm
require('dotenv-safe').load({
  silent: true,
  sample: 'node_modules/feverish-routes/.env.example'
})

const pkg = require('./package.json')

const after = (options, server, next) => {
  server.views({
    engines: { html: require('lodash-vision') },
    path: 'templates',
    partialsPath: 'templates/partials',
    isCached: process.env.TEMPLATE_CACHE.toLowerCase() === 'true'
  })

  const cache = server.cache({ segment: 'sessions', expiresIn: 3 * 24 * 60 * 60 * 1000 })
  server.app.cache = cache

  server.auth.strategy('session', 'cookie', true, {
    password: 'password-should-be-32-characters',
    cookie: 'sid-example',
    redirectTo: '/login',
    isSecure: false,
    validateFunc: function (request, session, callback) {
      cache.get(session.sid, (err, cached) => {
        if (err) { return callback(err, false) }
        if (cached) { return callback(null, true, cached.account) }
        return callback(null, false)
      })
    }
  })

  server.route({
    method: 'POST',
    path: '/logout',
    handler: (request, reply) => {
      request.cookieAuth.clear();
      return reply.redirect('/');
    }
  })

  server.route({
    method: 'GET',
    path: '/',
    handler: {
      view: {
        template: 'bienvenue',
        context: { active: 'accueil' }
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
          doc: { _id: 'aaa', _rev: '2-bbb' },
          active: 'resultats'
        }
      }
    }
  })

  let uuid = 1 // Use seq instead of proper unique identifiers for demo only
  const users = {
    john: {
      id: 'john',
      password: 'password',
      name: 'John Doe',
      roles: ['student']
    }
  }

  const login = (request, reply) => {
    if (request.auth.isAuthenticated) { return reply.redirect('/') }
    let message = ''
    let account = null

    if (request.method === 'post') {
      if (request.payload.username && request.payload.password) {
        account = users[request.payload.username]
        if (!account || account.password !== request.payload.password) {
          message = 'Invalid username or password'
        }
      } else {
        message = 'Missing username or password'
      }
    }

    if (request.method === 'get' || message) { return reply.view('login', { message: message }) }

    const sid = String(++uuid)
    request.server.app.cache.set(sid, { account: account }, 0, (err) => {
      if (err) { reply(err) }
      request.cookieAuth.set({ sid: sid })
      return reply.redirect('/')
    })
  }

  server.route({
    method: ['GET', 'POST'],
    path: '/login',
    config: {
      handler: login,
      auth: { mode: 'try' },
      plugins: { 'hapi-auth-cookie': { redirectTo: false } }
    }
  })

  server.route({
    method: 'GET',
    path: '/testing2',
    handler: { view: 'testing' }
  })

  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: { directory: { path: './assets/' } }
  })

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
