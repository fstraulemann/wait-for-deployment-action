const core = require('@actions/core')
const github = require('@actions/github')

const options = {
  token: core.getInput('github-token'),
  environment: core.getInput('environment'),
  timeout: core.getInput('timeout'),
  interval: core.getInput('interval'),
  deployment_timeout: core.getInput('deployment-timeout')
}

waitForDeployment(options)
  .then(res => {
    core.setOutput('id', res.deployment.id)
    core.setOutput('url', res.url)
  })
  .catch(error => {
    core.setFailed(error.message)
  })

async function waitForDeployment (options) {
  const {
    token,
    environment
  } = options

  const interval = parseInt(options.interval) || 5
  const timeout = parseInt(options.timeout) || 300
  const deployment_timeout = parseInt(options.deployment_timeout) || 30

  const { sha } = github.context
  const octokit = github.getOctokit(token)
  const start = Date.now()

  const params = {
    ...github.context.repo,
    environment,
    sha
  }

  core.info(`Deployment params: ${JSON.stringify(params, null, 2)}`)
  // throw new Error('DERP')

  while (true) {
    const { data: deployments } = await octokit.repos.listDeployments(params)
    core.info(`Found ${deployments.length} deployments...`)
    let running_deployments = false;

    for (const deployment of deployments) {
      core.info(`\tgetting statuses for deployment ${deployment.id}...`)

      const { data: statuses } = await octokit.request('GET /repos/:owner/:repo/deployments/:deployment/statuses', {
        ...github.context.repo,
        deployment: deployment.id
      })

      core.info(`\tfound ${statuses.length} statuses`)

      const [success] = statuses
        .filter(status => status.state === 'success')
      if (success) {
        core.info(`\tsuccess! ${JSON.stringify(success, null, 2)}`)
        let url = success.target_url
        const { payload = {} } = deployment
        if (payload.web_url) {
          url = payload.web_url
        }
        return {
          deployment,
          status: success,
          url
        }
      } else {
        core.info(`No statuses with state === "success": "${statuses.map(status => status.state).join('", "')}"`)
      }
      if (statuses.find(status => ["pending", "in_progress", "queued"].find(running => running === status)))
      {
        running_deployments = true
      }
    }
    
    await sleep(interval)

    const elapsed = (Date.now() - start) / 1000
    if (elapsed >= timeout) {
      throw new Error(`Timing out after ${timeout} seconds (${elapsed} elapsed)`)
    }
    
    if (!running_deployments && elapsed >= deployment_timeout) {
      throw new Error(`Timing out (no current deployments found) after ${deployment_timeout} seconds (${elapsed} elapsed)`)
    }
  }
}

function sleep (seconds) {
  const ms = parseInt(seconds) * 1000 || 1
  return new Promise(resolve => setTimeout(resolve, ms))
}
