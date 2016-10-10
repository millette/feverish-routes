'use strict'

// npm
require('dotenv-safe').load({
  silent: true,
  sample: 'node_modules/feverish-routes/.env.example'
})

const nano = require('nano')

// core
const url = require('url')

const pkg = require('./package.json')

let dbDocs

nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
  if (err) { process.exit(200) }
  // console.log('body1:', body)
  // console.log('head1:', headers)
  dbDocs = nano({
    url: url.resolve(process.env.DBURL, 'groupe2016'),
    cookie: headers['set-cookie']
  })
})

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

  const travailJson = (request, reply) => dbDocs.view('feverish', 'travaux', { group: true }, (err, body, more) => reply(err || body.rows))
  const themeJson = (request, reply) => dbDocs.view('feverish', 'themes', { group: true }, (err, body, more) => reply(err || body.rows))
  const loginGet = (request, reply) => request.auth.isAuthenticated ? reply.redirect('/') : reply.view('login')
  const loginPost = (request, reply) => {
    if (request.auth.isAuthenticated) { return reply.redirect('/') }
    if (!request.payload.username || !request.payload.password) {
      return reply.view('login', { message: 'Missing username or password' })
    }

    nano(process.env.DBURL).auth(request.payload.username, request.payload.password, (err, body, headers) => {
      if (err) { return reply.view('login', { message: 'Invalid username or password' }) }
      if (!body.name) { body.name = request.payload.username }
      cache.set(body.name, { account: body }, 0, (err) => {
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
    path: '/theme.json',
    handler: themeJson
  })

  server.route({
    method: 'GET',
    path: '/travail.json',
    handler: travailJson
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

  server.route({
    method: 'GET',
    path: '/testing',
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
