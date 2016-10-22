'use strict'

require('dotenv-safe').load({
  silent: true,
  sample: 'node_modules/feverish-routes/.env.example'
})

// self
const pkg = require('./package.json')
const utils = require('./lib/utils')

const after = (options, server, next) => {
  server.views({
    engines: { html: require('lodash-vision') },
    path: 'templates',
    partialsPath: 'templates/partials',
    isCached: process.env.TEMPLATE_CACHE.toLowerCase() === 'true'
  })

  server.route({
    method: 'GET',
    path: '/',
    handler: utils.welcome
  })

  server.route({
    method: 'POST',
    path: '/',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      payload: { parse: false },
      handler: utils.welcomePost
    }
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
      plugins: { hapiAuthorization: { roles: ['student'] } },
      pre: [
        { method: utils.studentUser, assign: 'student' },
        { method: utils.getExercices, assign: 'exercices' }
      ],
      handler: utils.resultats
    }
  })

  server.route({
    method: 'GET',
    path: '/etudiant/{userid}',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      pre: [
        { method: utils.studentUser, assign: 'student' },
        { method: utils.getExercices, assign: 'exercices' }
      ],
      handler: utils.resultatsStudent
    }
  })

  server.route({
    method: 'GET',
    path: '/thumb/{att}',
    config: {
      plugins: { hapiAuthorization: { roles: ['student'] } },
      handler: utils.studentThumb
    }
  })

  server.route({
    method: 'GET',
    path: '/thumb/{userid}/{att}',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: utils.studentThumb
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
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: utils.etudiantDelete
    }
  })

  server.route({
    method: 'GET',
    path: '/etudiants',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: utils.etudiants
    }
  })

  server.route({
    method: 'GET',
    path: '/theme.json',
    handler: utils.autocompleters.bind(null, 'themes')
  })

  server.route({
    method: 'GET',
    path: '/travail.json',
    handler: utils.autocompleters.bind(null, 'travaux')
  })

  server.route({
    method: 'GET',
    path: '/score/{ex}',
    config: {
      plugins: { hapiAuthorization: { roles: ['student'] } },
      pre: [
        { method: utils.studentUser, assign: 'student' },
        { method: utils.getScore, assign: 'score' }
      ],
      handler: utils.score
    }
  })

  server.route({
    method: 'GET',
    path: '/new',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: { view: 'create-exercice' }
    }
  })

  server.route({
    method: 'POST',
    path: '/new',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      pre: [{ method: utils.updateExercice, assign: 'updex' }],
      handler: utils.editExercicePost
    }
  })

  server.route({
    method: 'GET',
    path: '/edit/{ex}',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      pre: [{ method: utils.getScore, assign: 'score' }],
      handler: utils.editExercice
    }
  })

  server.route({
    method: 'POST',
    path: '/edit/{ex}',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      pre: [{ method: utils.updateExercice, assign: 'updex' }],
      handler: utils.editExercicePost
    }
  })

  server.route({
    method: 'DELETE',
    path: '/delete/{ex}',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: utils.delExercice
    }
  })

  server.route({
    method: 'GET',
    path: '/configure',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: utils.configure
    }
  })

  server.route({
    method: 'POST',
    path: '/configure',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: utils.configurePost
    }
  })

  server.route({
    method: 'GET',
    path: '/corrections/{ex}',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      pre: [{ method: utils.getScore, assign: 'score' }],
      handler: utils.corrections
    }
  })

  server.route({
    method: 'GET',
    path: '/corrections/{ex}/{userid}',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      pre: [{ method: utils.getScore, assign: 'score' }],
      handler: utils.correctionsUser
    }
  })

  server.route({
    method: 'GET',
    path: '/etudiants/new',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: { view: 'etudiants-new' }
    }
  })

  server.route({
    method: 'GET',
    path: '/etudiants/lot',
    config: {
      plugins: { hapiAuthorization: { roles: ['teacher'] } },
      handler: { view: 'etudiants-lot' }
    }
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
