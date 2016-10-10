'use strict'

// npm
require('dotenv-safe').load({
  silent: true,
  sample: 'node_modules/feverish-routes/.env.example'
})

const db = require('nano')('http://localhost:5985/')
const pkg = require('./package.json')

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
      console.log('PAYLOAD:', request.payload)
      console.log('AUTH:', request.auth)
      console.log('SES:', session)
      cache.get(
        session.sid, (err, cached) => err
          ? callback(err, false)
          : cached
            ? callback(null, true, cached.account)
            : callback(null, false)
      )
    }
  })

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

  const loginGet = (request, reply) => {
    if (request.auth.isAuthenticated) { return reply.redirect('/') }
    return reply.view('login')
  }

  const loginPost = (request, reply) => {
    if (request.auth.isAuthenticated) { return reply.redirect('/') }
    if (!request.payload.username || !request.payload.password) {
      return reply.view('login', { message: 'Missing username or password' })
    }

    db.auth(request.payload.username, request.payload.password, (err, body, headers) => {
      if (err) { return reply.view('login', { message: 'Invalid username or password' }) }
      request.server.app.cache.set(body.name, { account: body }, 0, (err) => {
        if (err) { return reply(err) }
        request.cookieAuth.set({ sid: body.name })
        reply.redirect('/')
      })
    })
  }

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
