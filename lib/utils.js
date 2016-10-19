'use strict'

// npm
const nano = require('nano')
const got = require('got')

// core
const url = require('url')

const dbUsers = url.resolve(process.env.DBURL, '_users')
const dbUrl = url.resolve(process.env.DBURL, 'groupe2016')

const isTeacher = (request) => request.auth.credentials.roles.indexOf('teacher') !== -1

const getExercices = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUrl, cookie: headers['set-cookie'] })
      .view('feverish', 'exercices', { 'include_docs': true, 'descending': true }, (err, body, headers) => {
        if (err) { return reply(err) }
        reply({ body: body, etag: headers.etag + request.auth.credentials.name })
      })
  })
}

const configure = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUrl, cookie: headers['set-cookie'] })
      .get('autocompleter', (err, body, headers) => {
        if (err) { return reply(err) }
        request.auth.credentials.theme = body.theme
        request.auth.credentials.travail = body.travail
        reply.view('configure', request.auth.credentials).etag(headers.etag + request.auth.credentials.name)
      })
  })
}

const getScore = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUrl, cookie: headers['set-cookie'] })
      .get(request.params.ex, (err, body, headers) => {
        if (err) { return reply(err) }
        request.auth.credentials.doc = body
        reply({ body: request.auth.credentials, etag: headers.etag + request.auth.credentials.name })
      })
  })
}

const score = function (request, reply) {
  return reply.view('score', request.pre.score.body).etag(request.pre.score.etag)
}

const exercices = function (request, reply) {
  const body = request.pre.exercices.body
  body.active = 'exercices'
  body.rows = body.rows.map((r) => r.doc)
  body.userMenu = request.auth.credentials.roles.indexOf('teacher') === -1 ? 'studentmenu' : 'teachermenu'
  reply.view('exercices', body).etag(request.pre.exercices.etag)
}

const rendus = function (request, reply) {
  const body = request.pre.exercices.body
  body.active = 'rendus'
  body.rows = body.rows.map((r) => r.doc)
  reply.view('rendus', body).etag(request.pre.exercices.etag)
}

const resultats = function (request, reply) {
  const body = request.pre.exercices.body
  body.active = 'resultats'
  body.student = request.auth.credentials.name
  body.self = true
  reply.view('etudiant', body).etag(request.pre.exercices.etag)
}

const resultats2 = function (request, reply) {
  const body = request.pre.exercices.body
  body.student = request.params.student
  body.self = false
  reply.view('etudiant', body).etag(request.pre.exercices.etag)
}

const rendu = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUrl, cookie: headers['set-cookie'] })
      .attachment.get(request.params.ex, request.params.att, (e, b, h) => {
        if (e) { return reply(e) }
        reply(b).type(h['content-type']).etag(h.etag + request.auth.credentials.name)
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
        reply.view('etudiants', body).etag(headers.etag + request.auth.credentials.name)
      })
  })
}

const etudiantDelete = function (request, reply) {
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

const editExercice = function (request, reply) {
  reply.view('create-exercice', request.pre.score.body).etag(request.pre.score.etag)
}

const corrections = function (request, reply) {
  reply.view('corrections', request.pre.score.body).etag(request.pre.score.etag)
}

const correctionsUser = function (request, reply) {
  const data = request.pre.score.body
  data.query = { user: request.params.user }
  reply.view('corrections-user', data).etag(request.pre.score.etag)
}

const updateExercice = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    const us = [dbUrl, '_design/feverish/_update/create']
    if (request.params.ex) { us.push(request.params.ex) }
    got.post(us.join('/'), { headers: { cookie: headers['set-cookie'] }, body: request.payload })
      .catch((e) => reply(e.statusCode === 303 ? { ok: true } : e))
  })
}

const editExercicePost = function (request, reply) {
  reply.redirect('/exercices')
}

const delExercice = function (request, reply) {
  // TODO: delete rendus de référence and all other related stuff
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUrl, cookie: headers['set-cookie'] })
      .head(request.params.ex, (err, body, head) => {
        if (err) { return reply(err) }
        nano({ url: dbUrl, cookie: headers['set-cookie'] })
          .destroy(request.params.ex, head.etag.slice(1, -1), (e2, b2, h2) => {
            if (e2) { return reply(e2) }
            reply({ ok: true })
          })
      })
  })
}

const welcome = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUrl, cookie: headers['set-cookie'] })
      .get('accueil', (err, body) => {
        if (err) { return reply(err) }
        body.active = 'accueil'
        body.editor = isTeacher(request)
        body.etag = body._rev + request.auth.credentials.name
        reply.view('bienvenue', body).etag(body.etag)
      })
  })
}

const welcomePost = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    const us = [dbUrl, '_design/feverish/_update/bienvenue/accueil']
    const content = request.payload.toString()
    got.post(us.join('/'), { headers: { cookie: headers['set-cookie'] }, body: content })
      .then((a) => reply('ok'))
      .catch(reply)
  })
}

const autocompleters = function (type, request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({
      url: dbUrl,
      cookie: headers['set-cookie']
    }).view('feverish', type, { group: true }, (err, body) => {
      if (err) { return reply(err) }
      reply(body.rows)
    })
  })
}

module.exports = {
  getExercices: getExercices,
  getScore: getScore,
  score: score,
  configure: configure,
  rendus: rendus,
  resultats: resultats,
  resultats2: resultats2,
  rendu: rendu,
  etudiants: etudiants,
  etudiantDelete: etudiantDelete,
  exercices: exercices,
  editExercice: editExercice,
  correctionsUser: correctionsUser,
  corrections: corrections,
  updateExercice: updateExercice,
  editExercicePost: editExercicePost,
  delExercice: delExercice,
  welcomePost: welcomePost,
  welcome: welcome,
  autocompleters: autocompleters
}
