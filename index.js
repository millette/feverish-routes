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

const dbUrl = url.resolve(process.env.DBURL, 'groupe2016')

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

  const welcome = (request, reply) => {
    cache.get('accueil', (err, cached) => {
      if (err) { return reply(err) }
      if (cached) {
        cached.active = 'accueil'
        return reply.view('bienvenue', cached).etag(cached._rev)
      }
      nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
        if (err) { return reply(err) }
        nano({ url: dbUrl, cookie: headers['set-cookie']})
          .get('accueil', (err, body) => {
            if (err) { return reply(err) }
            cache.set('accueil', body, 0, (err) => {
              if (err) { return reply(err) }
              body.active = 'accueil'
              return reply.view('bienvenue', body).etag(body._rev)
            })
          })
      })
    })
  }

  server.route({
    method: 'GET',
    path: '/',
    handler: welcome
  })

  const studentMenu = (row) => '<td><a class="label success" href="/score/' + row._id + '">Consulter mon résultat</a></td>'

  const teacherMenu = (row) => [
    '<td><a class="label" href="/edit/' + row._id + '">Éditer</a></td>',
    '<td><a class="label success" href="/corrections/' + row._id + '">Corriger</a></td>',
    '<td><div class="label warning" data-toggle="' + row._id + '">Effacer</div></td>',
    '<td><div class="dropdown-pane top" id="' + row._id,
    '" data-dropdown data-auto-focus="true" data-close-on-click="true" data-position-class="top">',
    '<button type="button" class="confirm-delete button alert" data-exid="' + row._id + '" data-exrev="' + row._rev + '">Effacer ' + row.title + '</button>',
    '</div></td>'
  ].join('')

  const exercices = (request, reply) => {
    nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
      if (err) { return reply(err) }
      nano({ url: dbUrl, cookie: headers['set-cookie']})
        .view('feverish', 'exercices', { 'include_docs': true, 'descending': true }, (err, body, headers) => {
          if (err) { return reply(err) }
          body.active = 'exercices'
          body.rows = body.rows.map((r) => r.doc)
          body.userMenu = request.auth.credentials.roles.indexOf('teacher') === -1 ? studentMenu : teacherMenu
          return reply.view('exercices', body).etag(headers.etag + request.auth.credentials.name)
        })
    })
  }

  server.route({
    method: 'GET',
    path: '/exercices',
    handler: exercices
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

  const autocompleters = (type, request, reply) =>
    cache.get(type, (err, cached) => {
      if (err) { return reply(err) }
      if (cached) { return reply(cached) }
      nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
        if (err) { return reply(err) }
        nano({
          url: dbUrl,
          cookie: headers['set-cookie']
        }).view('feverish', type, { group: true }, (err, body) => {
          if (err) { return reply(err) }
          cache.set(type, body.rows, 0, (err) => reply(err || body.rows))
        })
      })
    })

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
    handler: autocompleters.bind(null, 'themes')
    // handler: themeJson
  })

  server.route({
    method: 'GET',
    path: '/travail.json',
    handler: autocompleters.bind(null, 'travaux')
    // handler: travailJson
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
