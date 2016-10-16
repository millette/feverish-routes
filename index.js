'use strict'

// npm
require('dotenv-safe').load({
  silent: true,
  sample: 'node_modules/feverish-routes/.env.example'
})

const nano = require('nano')
const Boom = require('boom')

// core
const url = require('url')

const pkg = require('./package.json')

const dbUrl = url.resolve(process.env.DBURL, 'groupe2016')
const dbUsers = url.resolve(process.env.DBURL, '_users')

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

  const isTeacher = (request) => request.auth.credentials.roles.indexOf('teacher') !== -1

  const welcome = function (request, reply) {
    cache.get('accueil', (err, cached) => {
      if (err) { return reply(err) }
      if (cached) {
        cached.editor = isTeacher(request)
        cached.active = 'accueil'
        return reply.view('bienvenue', cached).etag(cached._rev)
      }
      nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
        if (err) { return reply(err) }
        nano({ url: dbUrl, cookie: headers['set-cookie'] })
          .get('accueil', (err, body) => {
            if (err) { return reply(err) }
            cache.set('accueil', body, 0, (err) => {
              if (err) { return reply(err) }
              body.editor = isTeacher(request)
              body.active = 'accueil'
              return reply.view('bienvenue', body).etag(body._rev)
            })
          })
      })
    })
  }

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

  const getExercices = function (request, reply) {
    nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
      if (err) { return reply(err) }
      nano({ url: dbUrl, cookie: headers['set-cookie'] })
        .view('feverish', 'exercices', { 'include_docs': true, 'descending': true }, (err, body, headers) => {
          if (err) { return reply(err) }
          return reply({ body: body, etag: headers.etag + request.auth.credentials.name })
        })
    })
  }

  const exercices = function (request, reply) {
    const body = request.pre.exercices.body
    body.active = 'exercices'
    body.rows = body.rows.map((r) => r.doc)
    body.userMenu = request.auth.credentials.roles.indexOf('teacher') === -1 ? studentMenu : teacherMenu
    return reply.view('exercices', body).etag(request.pre.exercices.etag)
  }

  const rendus = function (request, reply) {
    const body = request.pre.exercices.body
    body.active = 'rendus'
    body.rows = body.rows.map((r) => r.doc)
    return reply.view('rendus', body).etag(request.pre.exercices.etag)
  }

  const resultats = function (request, reply) {
    const body = request.pre.exercices.body
    body.active = 'resultats'
    body.student = request.auth.credentials.name
    body.self = true
    return reply.view('etudiant', body).etag(request.pre.exercices.etag)
  }

  const rendu = function (request, reply) {
    nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
      if (err) { return reply(err) }
      nano({ url: dbUrl, cookie: headers['set-cookie'] })
        .attachment.get(request.params.ex, request.params.att, (e, b, h) => {
          if (e) { return reply(e) }
          reply(b).type(h['content-type']).etag(h.etag)
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
          url: dbUrl,
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

  const userSorter = (a, b) => {
    const a1 = a.name ? a.name : a.doc.name
    const b1 = b.name ? b.name : b.doc.name
    const a2 = a1.toLowerCase().split(' ').reverse().join(' ')
    const b2 = b1.toLowerCase().split(' ').reverse().join(' ')
    return a2.localeCompare(b2)
  }

  const etudiants = function (request, reply) {
    nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
      if (err) { return reply(err) }
      nano({ url: dbUsers, cookie: headers['set-cookie'] })
        .list({
          include_docs: true,
          startkey: 'org.couchdb.user:',
          endkey: 'org.couchdb.user:\ufff0'
        }, (err, body, headers) => {
          if (err) { return reply(err) }
          body.active = 'etudiants'
          body.rows = body.rows
            .filter((row) => row.doc.roles.indexOf('student') !== -1)
            .sort(userSorter)
            .map((row) => {
              delete row.doc
              return row
            })
          reply.view('etudiants', body).etag(headers.etag)
        })
    })
  }

  const etudiantDelete = function (request, reply) {
    if (request.auth.credentials.roles.indexOf('teacher') === -1) {
      return reply(Boom.forbidden('Can\'t touch this.'))
    }

    // TODO: delete rendus de référence and all other related stuff
    nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
      if (err) { return reply(err) }
      nano({ url: dbUsers, cookie: headers['set-cookie'] })
        .head(request.params.userid, (err, body, head) => {
          if (err) { return reply(err) }
          nano({ url: dbUsers, cookie: headers['set-cookie'] })
            .destroy(request.params.userid, head.etag.slice(1, -1), (e2, b2, h2) => {
              if (e2) { return reply(e2) }
              reply({ ok: true })
            })
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
      pre: [{ method: getExercices, assign: 'exercices' }],
      handler: exercices
    }
  })

  server.route({
    method: 'GET',
    path: '/rendus',
    config: {
      pre: [{ method: getExercices, assign: 'exercices' }],
      handler: rendus
    }
  })

  server.route({
    method: 'GET',
    path: '/resultats',
    config: {
      pre: [{ method: getExercices, assign: 'exercices' }],
      handler: resultats
    }
  })

  server.route({
    method: 'GET',
    path: '/rendu/{ex}/{att}',
    handler: rendu
  })

  server.route({
    method: 'DELETE',
    path: '/etudiant/{userid}',
    handler: etudiantDelete
  })

  server.route({
    method: 'GET',
    path: '/etudiants',
    handler: etudiants
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
