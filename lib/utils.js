'use strict'

// npm
const nano = require('nano')
const splitLines = require('split-lines')
const uuid = require('uuid')
const got = require('got')
const sharp = require('sharp')

// core
const url = require('url')

const dbUsers = url.resolve(process.env.DBURL, '_users')
const dbUrl = url.resolve(process.env.DBURL, 'groupe2016')

const isTeacher = (request) => request.auth.credentials.roles.indexOf('teacher') !== -1

const wantedScoreImage = (request) => {
  let r
  const imgIds = {}
  for (r in request.pre.student.body._attachments) {
    imgIds[r.split('.').slice(0, -1).join('.')] = ['/thumb', r].join('/')
  }
  request.pre.score.body.doc.thumb = imgIds[request.pre.score.body.doc._id]
}

const wantedImage = (request) => {
  const t = ['/thumb']
  let r
  const imgIds = {}
  if (request.params.userid) { t.push(request.params.userid) }
  const tt = t.join('/')
  for (r in request.pre.student.body._attachments) {
    imgIds[r.split('.').slice(0, -1).join('.')] = [tt, r].join('/')
  }
  request.pre.exercices.body.rows = request.pre.exercices.body.rows
    .map((row) => {
      if (imgIds[row.id]) { row.thumb = imgIds[row.id] }
      return row
    })
}

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

const configurePost = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    const us = [dbUrl, '_design/feverish/_update/autocompleter/autocompleter']
    const stuff = { }
    if (request.payload.theme) { stuff.theme = request.payload.theme }
    if (request.payload.travail) { stuff.travail = request.payload.travail }
    got.post(us.join('/'), { headers: { cookie: headers['set-cookie'] }, body: stuff })
      .then(() => reply.redirect('/configure'))
      .catch(reply)
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
  wantedScoreImage(request)
  request.pre.score.body.more = request.pre.student.body
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
  wantedImage(request)
  const body = request.pre.exercices.body
  body.active = 'resultats'
  body.student = request.auth.credentials.name
  body.self = true
  body.more = request.pre.student.body
  reply.view('etudiant', body).etag(request.pre.exercices.etag + request.pre.student.head.etag)
}

const resultatsStudent = function (request, reply) {
  wantedImage(request)
  const body = request.pre.exercices.body
  body.student = request.params.userid
  body.self = false
  body.more = request.pre.student.body
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

const etudiantsPre = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUsers, cookie: headers['set-cookie'] })
      .list({
        include_docs: true,
        startkey: 'org.couchdb.user:',
        endkey: 'org.couchdb.user:\ufff0'
      }, (err, body, headers) => {
        if (err) { return reply(err) }
        body.rows = body.rows.filter((row) => row.doc.roles.indexOf('student') !== -1).sort(userSorter)
        reply({ body: body, headers: headers })
      })
  })
}

const etudiants = function (request, reply) {
  const body = request.pre.students.body
  body.active = 'etudiants'
  reply.view('etudiants', body).etag(request.pre.students.headers.etag + request.auth.credentials.name)
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
  const exid = request.pre.score.body.doc._id
  request.pre.score.body.todo = request.pre.students.body.rows
    .filter((r) => !r.doc.corrections || !r.doc.corrections[exid])
    .map((r) => r.doc.name)
  request.pre.score.body.done = request.pre.students.body.rows
    .filter((r) => r.doc.corrections && r.doc.corrections[exid])
    .map((r) => r.doc.name)
  reply.view('corrections', request.pre.score.body).etag(request.pre.score.etag)
}

const correctionsUser = function (request, reply) {
  const data = request.pre.score.body
  data.query = { user: request.params.userid }
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

const studentUser = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUsers, cookie: headers['set-cookie'] })
      .get('org.couchdb.user:' + (request.params.userid || request.auth.credentials.name), (err, body, head) => {
        if (err) { return reply(err) }
        reply({ body: body, head: head })
      })
  })
}

const studentThumb = function (request, reply) {
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUsers, cookie: headers['set-cookie'] })
      .attachment.get('org.couchdb.user:' + (request.params.userid || request.auth.credentials.name), request.params.att, (e, b, h) => {
        if (e) { return reply(e) }
        const img = sharp(b).resize(353).toFormat(h['content-type'].split('/')[1])
        reply(img).type(h['content-type']).etag(h.etag + request.auth.credentials.name)
      })
  })
}

const etudiantsNew = function (request, reply) {
  if (request.payload.password !== request.payload.password2) { return reply('Passwords don\'t match.') }
  delete request.payload.password2
  request.payload.name = request.payload.firstname.split(' ')[0] + ' ' + request.payload.lastname.split(' ')[0]
  request.payload.opaque = uuid.v1().replace(/-/g, '')
  request.payload.type = 'user'
  request.payload.roles = ['student']
  request.payload._id = 'org.couchdb.user:' + request.payload.name
  request.payload.created_at = new Date().toISOString()
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUsers, cookie: headers['set-cookie'] })
      .insert(request.payload, (e, b, h) => {
        if (e) { return reply(e) }
        reply.redirect('/etudiants')
      })
  })
}

const etudiantsLot = function (request, reply) {
  const docs = {
    docs: splitLines(request.payload.file.toString())
      .filter((line) => line)
      .map((line) => {
        const ret = line.trim().split('\t').map((words) => words.split(' '))
        const name = ret[2][0] + ' ' + ret[1][0]
        return {
          name: name,
          firstname: ret[2].join(' '),
          lastname: ret[1].join(' '),
          opaque: uuid.v1().replace(/-/g, ''),
          password: ret[0][0],
          type: 'user',
          roles: ['student'],
          _id: 'org.couchdb.user:' + name
        }
      })
  }
  nano(process.env.DBURL).auth(process.env.DBUSER, process.env.DBPW, (err, body, headers) => {
    if (err) { return reply(err) }
    nano({ url: dbUsers, cookie: headers['set-cookie'] })
      .bulk(docs, (e, b, h) => {
        if (e) { return reply(e) }
        reply.redirect('/etudiants')
      })
  })
}

module.exports = {
  getExercices: getExercices,
  getScore: getScore,
  score: score,
  configure: configure,
  configurePost: configurePost,
  rendus: rendus,
  resultats: resultats,
  resultatsStudent: resultatsStudent,
  rendu: rendu,
  etudiantsPre: etudiantsPre,
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
  studentUser: studentUser,
  studentThumb: studentThumb,
  etudiantsNew: etudiantsNew,
  etudiantsLot: etudiantsLot,
  autocompleters: autocompleters
}
