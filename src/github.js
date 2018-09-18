const axios = require('axios')
const parseLinkHeader = require('parse-link-header')
const CancelToken = axios.CancelToken
const config = require('./config')
const apiBase = 'https://api.github.com'
const http = axios.create({
  baseURL: apiBase,
  headers: {
    Authorization: `token ${config.GITHUB_PERSONAL_ACCESS_TOKEN}`,
  },
})
// Sets the global timeout/retry time
const TIMEOUT = 10000
const RETRY = 1000

// Gets the account's current rate limit
function getRateLimit() {
  return http
    .get('rate_limit')
    .then(response => response.data.resources.core.remaining)
}

// Gets the resource's collaborator statistics
/*
  On success
  payload: {
    rateLimit: <The current Rate Limit>,
    <Github Login>: {
      totalCommits: <Total # of Commits>,
      totalComments: 0 (unknown)
    }, ...
  }
  On Handled Failure
  payload: {
    retry: true/false,
    timeout: true/false,
    retryMs: <Number of milliseconds to wait until next request>
  }
*/
function getCollaboratorStatistics(resource, retry = false, options = {}) {
  return new Promise((resolve, reject) => {
    // Set a timeout
    const source = CancelToken.source()
    setTimeout(
      () => source.cancel(),
      options.timeout == null ? TIMEOUT : options.timeout,
    )
    // Make request
    return http
      .get(`${resource}/stats/contributors`, { cancelToken: source.token })
      .then(response => {
        let payload = {
          stats: {},
        }
        // Set the current rate limit
        payload.rateLimit = response.headers['x-ratelimit-remaining']
        // Parse the stats
        response.data.forEach(statistic => {
          payload.stats[statistic.author.login] = {
            totalCommits: statistic.total,
            totalComments: 0,
          }
        })
        resolve(payload)
      })
      .catch(error => {
        // GitHub replies with 403 when Rate Limit is exceeded
        if (
          !retry &&
          error.response &&
          error.response.status === 403 &&
          error.response.headers['x-ratelimit-remaining'] === 0
        ) {
          // Set number of milliseconds to sleep for the nest Rate Limit reset
          const retryMs =
            new Date(error.response.headers['x-ratelimit-reset'] * 1000) -
            new Date()
          resolve({
            retry: true,
            retryMs: retryMs,
            rateLimit: error.response.headers['x-ratelimit-remaining'],
          })
        } else if (retry) {
          // Reject on second failed attempt
          reject('Retry failed.')
        } else if (axios.isCancel(error)) {
          // Notify on request timeout
          resolve({
            timeout: true,
            retryMs: options.retry == null ? RETRY : options.retry,
          })
        } else {
          reject(error)
        }
      })
  })
}

// Gets the comments from an endpoint
/*
  On Success
  payload: {
    rateLimit: <The current Rate Limit>,
    links: parse-link-header Object (see docs) (optional)
    comments: [{
      Comment data (see GitHub docs)
    }, ...]
  }
  On Handled Failure
  payload: {
    retry: true/false,
    timeout: true/false,
    retryMs: <Number of milliseconds to wait until next request>
  }
*/
function getComments(endpoint, dateCutoff = null, retry = false, options = {}) {
  return new Promise((resolve, reject) => {
    // Set a timeout
    const source = CancelToken.source()
    setTimeout(
      () => source.cancel(),
      options.timeout == null ? TIMEOUT : options.timeout,
    )
    // Make request
    return http
      .get(endpoint, { cancelToken: source.token })
      .then(response => {
        let payload = {}
        // Set the current rate limit
        payload.rateLimit = response.headers['x-ratelimit-remaining']
        if (response.headers.link) {
          payload.links = parseLinkHeader(response.headers.link)
        }
        if (dateCutoff == null) {
          payload.comments = response.data
        } else {
          // Comments before (newer) than cutoff are selected
          payload.comments = response.data.filter(comment => {
            const createdAt = Date.parse(comment.created_at)
            return createdAt >= dateCutoff
          })
        }
        resolve(payload)
      })
      .catch(error => {
        // GitHub replies with 403 when Rate Limit is exceeded
        if (
          !retry &&
          error.response &&
          error.response.status === 403 &&
          error.response.headers['x-ratelimit-remaining'] === 0
        ) {
          // Set number of milliseconds to sleep for the nest Rate Limit reset
          const retryMs =
            new Date(error.response.headers['x-ratelimit-reset'] * 1000) -
            new Date()
          resolve({
            retry: true,
            retryMs: retryMs,
            rateLimit: error.response.headers['x-ratelimit-remaining'],
          })
        } else if (retry) {
          // Reject on second failed attempt
          reject('Retry failed.')
        } else if (axios.isCancel(error)) {
          // Notify on request timeout
          resolve({
            timeout: true,
            retryMs: options.retry == null ? RETRY : options.retry,
          })
        } else {
          reject(error)
        }
      })
  })
}

module.exports.getRateLimit = getRateLimit
module.exports.getCollaboratorStatistics = getCollaboratorStatistics
module.exports.getComments = getComments
