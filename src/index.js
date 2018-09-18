// Adds support for colorfying output
const chalk = require('chalk')
// Adds support for padding in output
const leftPad = require('left-pad')
// Adds support for a progress bar
const progress = require('cli-progress')
const progressBar = new progress.Bar({
  format:
    '{step}... [{bar}] {percentage}% | ETA: {eta}s | Remaining Rate Limit: {rateLimit}',
})
// Adds support for --repo & --period CLI arguments
const commandLineArgs = require('command-line-args')
const optionDefinitions = [
  {
    name: 'repo',
    type: String,
  },
  {
    name: 'period',
    type: String,
  },
]
// Retireves CLI arguments
const options = commandLineArgs(optionDefinitions)
// Library for GitHub-related operations
const github = require('./github')

// https://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Parser for CLI arguments
function parseOptions(options) {
  let parsedOptions = {}
  // Parse resource
  parsedOptions.resource = options.repo.trim()
  const [owner, repo] = parsedOptions.resource.split('/')
  parsedOptions.route = `/repos/${owner}/${repo}`
  // Creates a cutoff date for considering commits
  if (options.period) {
    const days = Number(options.period.replace('d', '').trim())
    if (Number.isNaN(days)) {
      throw new Error("Option '--period' must be in the form '<# days>d'")
    }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    parsedOptions.days = days
    parsedOptions.cutoff = cutoff
  }
  return parsedOptions
}

// Given an object containg collaborator information
// match comments to collaborator or add a new entry
function matchCommentsToCollaborator(comments, collaboratorStatistics) {
  comments.forEach(comment => {
    if (collaboratorStatistics[comment.user.login]) {
      collaboratorStatistics[comment.user.login].totalComments += 1
    } else {
      collaboratorStatistics[comment.user.login] = {
        totalCommits: 0,
        totalComments: 1,
      }
    }
  })
  return collaboratorStatistics
}

// Attempt a callback after a millisecond delay
function futureRetry(retryMs, callback, params) {
  return new Promise((resolve, reject) => {
    return sleep(retryMs).then(() =>
      callback(...params)
        .then(payload => resolve(payload))
        .catch(error => reject(error)),
    )
  })
}

// Run the CLI Application
async function run() {
  // Parse CLI options
  const parsedOptions = parseOptions(options)

  console.log(
    `  Fetching comments for past ${
      parsedOptions.days ? parsedOptions.days : '*'
    } days for "${parsedOptions.resource}"...\n`,
  )

  // Set the endpoints to be accessed
  // & number of tasks to be tracked by the progress bar
  let endpoints = ['comments', 'pulls/comments', 'issues/comments']
  let tasks = endpoints.length + 2

  // Start the progress bar
  let progress = 0
  progressBar.start(tasks, progress, {
    step: 'Getting Collaborator Statistics',
    rateLimit: await github.getRateLimit(),
  })

  // Get Collaborator Statistics (commiters/# commits)
  let collaboratorStatistics = {}
  let payload = await github.getCollaboratorStatistics(parsedOptions.route)
  // Handle request errors
  if (payload.retry) {
    // Retry when Rate Limit exceeded
    progressBar.update(progress, {
      step: `Rate Limit Exceeded! Retrying in ${payload.retryMs} ms`,
      rateLimit: payload.rateLimit,
    })
    payload = await futureRetry(
      payload.retryMs,
      github.getCollaboratorStatistics,
      [parsedOptions.route, true],
    )
  } else if (payload.timeout) {
    // Retry on timeout
    progressBar.update(progress, {
      step: `Request Timed Out! Retrying in ${payload.retryMs} ms`,
    })
    payload = await futureRetry(
      payload.retryMs,
      github.getCollaboratorStatistics,
      [parsedOptions.route, true],
    )
  }
  collaboratorStatistics = payload.stats
  // Update progress bar
  progress += 1
  progressBar.update(progress, {
    step: 'Finished Getting Collaborator Statistics',
    rateLimit: payload.rateLimit,
  })
  // Get Comments from Endpoints
  for (let path of endpoints) {
    payload = await github.getComments(
      `${parsedOptions.route}/${path}`,
      parsedOptions.cutoff,
    )
    // Handle request errors
    if (payload.retry) {
      progressBar.update(progress, {
        step: `Rate Limit Exceeded! Retrying in ${payload.retryMs} ms`,
        rateLimit: payload.rateLimit,
      })
      payload = await futureRetry(payload.retryMs, github.getComments, [
        `${parsedOptions.route}/${path}`,
        parsedOptions.cutoff,
        true,
      ])
    } else if (payload.timeout) {
      progressBar.update(progress, {
        step: `Request Timed Out! Retrying in ${payload.retryMs} ms`,
      })
      payload = await futureRetry(payload.retryMs, github.getComments, [
        `${parsedOptions.route}/${path}`,
        parsedOptions.cutoff,
        true,
      ])
    }
    // Get comments (accumulated until pagination finished)
    let comments = payload.comments
    if (payload.links) {
      // Update progress bar by number of pages left to visit
      let links = payload.links
      tasks += links.last.page - 1
      progressBar.setTotal(tasks)
      // traverse links until reaching last page
      while (links.next) {
        progressBar.update(progress, {
          step: `Get ${path} (page ${links.next.page})`,
          rateLimit: payload.rateLimit,
        })
        // Get comments from link
        payload = await github.getComments(links.next.url, parsedOptions.cutoff)
        // Handle request errors
        if (payload.retry) {
          progressBar.update(progress, {
            step: `Rate Limit Exceeded! Retrying in ${payload.retryMs} ms`,
            rateLimit: payload.rateLimit,
          })
          payload = await futureRetry(payload.retryMs, github.getComments, [
            links.next.url,
            parsedOptions.cutoff,
            true,
          ])
        } else if (payload.timeout) {
          progressBar.update(progress, {
            step: `Request Timed Out! Retrying in ${payload.retryMs} ms`,
          })
          payload = await futureRetry(payload.retryMs, github.getComments, [
            links.next.url,
            parsedOptions.cutoff,
            true,
          ])
        }
        // Concatenate comments
        comments.concat(payload.comments)
        // Update progress bar
        progress += 1
        progressBar.update(progress, {
          rateLimit: payload.rateLimit,
        })
        // Parse links
        links = payload.links
      }
    }
    // Update Collaborator Statistics given a collection of comments
    collaboratorStatistics = matchCommentsToCollaborator(
      comments,
      collaboratorStatistics,
    )
    // Update progress bar
    progressBar.increment(1, {
      step: `Finished Get ${path}`,
    })
  }
  // Program finished
  progressBar.increment(1, {
    step: 'Finished',
  })
  return collaboratorStatistics
}

run()
  .then(collaboratorStatistics => {
    progressBar.stop()
    // Sort the collaborators (desc) by total comments
    const sortedCollaborators = Object.keys(collaboratorStatistics).sort(
      (a, b) =>
        collaboratorStatistics[b].totalComments -
        collaboratorStatistics[a].totalComments,
    )
    // Print output
    sortedCollaborators.forEach(collaborator => {
      const element = collaboratorStatistics[collaborator]
      console.log(
        `${leftPad(element.totalComments, 5)} comment${
          element.totalComments === 1 ? '' : 's'
        }, ${collaborator} (${element.totalCommits} commit${
          element.totalCommits === 1 ? '' : 's'
        })`,
      )
    })
  })
  .catch(error => {
    progressBar.stop()
    console.error(chalk.red(error))
  })
