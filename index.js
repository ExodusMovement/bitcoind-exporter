const fs = require('fs').promises
const path = require('path')
const fetch = require('node-fetch')
const yaml = require('js-yaml')
const polka = require('polka')
const yargs = require('yargs')
const winston = require('winston')
const { Registry, Gauge, metrics: promMetrics } = require('prom-client2')

const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()]
})

function getArgs () {
  return yargs
    .usage('Usage: $0 [options]')
    .option('config', {
      coerce: (arg) => path.resolve(arg),
      default: path.join(__dirname, 'config.yaml'),
      type: 'string'
    })
    .version()
    .help('help').alias('help', 'h')
    .argv
}

async function readConfig (config) {
  const content = await fs.readFile(config, 'utf8')
  return yaml.safeLoad(content)
}

async function makeRequest (url, method, ...params) {
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 42
    }),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })

  const json = await res.json()
  if (json.error) throw new Error(`RPC error for ${url} (code: ${json.error.code}): ${json.error.message}`)

  return json.result
}

async function getEstimateFee (type, url) {
  // ok: bitcoin, dash, litecoin, vertcoin
  // not ok: dogecoin, zcash
  if (['dogecoin', 'zcash'].includes(type)) return []

  async function process (target, mode) {
    const obj = await makeRequest(url, 'estimatesmartfee', target, mode)
    return { target, mode, value: obj.feerate }
  }

  const promises = []
  for (let i = 1; i <= 3; i += 1) {
    promises.push(process(i, 'CONSERVATIVE'))
    promises.push(process(i, 'ECONOMICAL'))
  }
  const items = await Promise.all(promises)
  return items.filter((item) => typeof item.value === 'number')
}

function initParityMetrics (registry, nodes) {
  const createGauge = (name, help, labelNames) => new Gauge({ name, help, labelNames, registers: [registry] })

  const gauges = {
    version: createGauge('bitcoind_version', 'Client version', ['name', 'value']),
    latest: {
      hash: createGauge('bitcoind_blockchain_latest', 'Latest block information', ['name', 'hash']),
      sync: createGauge('bitcoind_blockchain_sync', 'Blockchain sync info', ['name', 'type']),
      size: createGauge('bitcoind_blockchain_size_bytes', 'Blockchain size on disk', ['name'])
    },
    mempool: createGauge('bitcoind_mempool_size', 'Mempool information', ['name', 'type']),
    fee: createGauge('bitcoind_fee', 'Approximate fee per kilobyte by estimatesmartfee method', ['name', 'target', 'mode']),
    peers: createGauge('bitcoind_peers', 'Connected peers', ['name', 'version'])
  }

  const dataNodes = {}
  for (const node of nodes) {
    dataNodes[node.name] = {
      version: '',
      latest: '',
      peers: new Map([['all', 0]])
    }
  }

  const update = async ({ name, type, url }) => {
    const [
      blockchainInfo,
      mempoolInfo,
      networkInfo,
      peerInfo,
      feeItems
    ] = await Promise.all([
      makeRequest(url, 'getblockchaininfo'),
      makeRequest(url, 'getmempoolinfo'),
      makeRequest(url, 'getnetworkinfo'),
      makeRequest(url, 'getpeerinfo'),
      getEstimateFee(type, url)
    ])

    const data = dataNodes[name]

    // version
    if (networkInfo.subversion !== data.version) {
      gauges.version.labels({ name, value: networkInfo.subversion }).set(1)
      data.version = networkInfo.subversion
      logger.info(`Update ${name}:version to ${networkInfo.subversion}`)
    }

    // latest
    if (data.latest !== blockchainInfo.bestblockhash) {
      if (data.latest) gauges.latest.hash.remove({ name, hash: data.latest })
      gauges.latest.hash.labels({ name, hash: blockchainInfo.bestblockhash }).set(blockchainInfo.blocks)
      data.latest = blockchainInfo.bestblockhash
      logger.info(`Update ${name}:latest to ${blockchainInfo.blocks}:${blockchainInfo.bestblockhash}`)

      gauges.latest.sync.labels({ name, type: 'blocks' }).set(blockchainInfo.blocks)
      gauges.latest.sync.labels({ name, type: 'headers' }).set(blockchainInfo.headers)
      gauges.latest.sync.labels({ name, type: 'progress' }).set(parseFloat((blockchainInfo.blocks * 100 / blockchainInfo.headers).toFixed(3)))
      gauges.latest.size.labels({ name }).set(blockchainInfo.size_on_disk || 0)
    }

    // mempool
    gauges.mempool.labels({ name, type: 'size' }).set(mempoolInfo.size)
    gauges.mempool.labels({ name, type: 'bytes' }).set(mempoolInfo.bytes)

    // fee
    for (const item of feeItems) {
      gauges.fee.labels({ name, target: item.target, mode: item.mode }).set(item.value)
    }

    // peers
    for (const key of data.peers.keys()) data.peers.set(key, 0)
    data.peers.set('all', peerInfo.length)
    for (const peer of peerInfo) data.peers.set(peer.subver, (data.peers.get(peer.subver) || 0) + 1)
    for (const [version, value] of data.peers.entries()) {
      if (value === 0) gauges.peers.remove({ name, version })
      else gauges.peers.labels({ name, version }).set(value)
    }
  }

  return async () => {
    try {
      await Promise.all(nodes.map((node) => update(node)))
    } catch (err) {
      const skip = [
        'Loading block index',
        'Rewinding blocks',
        'Verifying blocks',
        'Loading P2P addresses'
      ]
      for (const item of skip) {
        if (err.message.match(item)) return
      }

      throw err
    }
  }
}

function createPrometheusClient (config) {
  const register = new Registry()
  if (config.processMetrics) promMetrics.setup(register, config.interval)

  return {
    update: initParityMetrics(register, config.nodes),
    onRequest (req, res) {
      res.setHeader('Content-Type', register.contentType)
      res.end(register.exposeText())
    }
  }
}

async function main () {
  const args = getArgs()
  const config = await readConfig(args.config)

  const client = createPrometheusClient(config)
  await polka().get('/metrics', client.onRequest).listen(config.port, config.hostname)
  logger.info(`listen at ${config.hostname}:${config.port}`)

  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  while (true) {
    const ts = Date.now()
    await client.update()
    const delay = Math.max(10, config.interval - (Date.now() - ts))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

main().catch((err) => {
  logger.error(String(err.stack || err))
  process.exit(1)
})
