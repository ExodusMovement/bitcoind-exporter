#!/usr/bin/env node
const fetch = require('node-fetch')
const polka = require('polka')
const yargs = require('yargs')
const logger = require('log2json2stdout')
const { Registry, Gauge } = require('prom-client')
const { hashObject } = require('prom-client/lib/util')

function getArgs () {
  return yargs
    .usage('Usage: $0 [options]')
    .env('BITCOIND_EXPORTER')
    .option('interval', {
      default: 100,
      describe: 'Metrics fetch interval',
      type: 'number'
    })
    .option('listen', {
      coerce (arg) {
        const [hostname, port] = arg.split(':')
        return { hostname, port }
      },
      default: 'localhost:8000',
      describe: 'Provide metrics on host:port/metrics',
      type: 'string'
    })
    .option('node', {
      default: 'http://bitcoinrpc:password@localhost:8332/',
      describe: 'Fetch info from this node'
    })
    .option('type', {
      choices: [
        'bitcoin',
        'bitcoincash',
        'bitcoingold',
        'bitcoinsv',
        'dash',
        'decred',
        'digibyte',
        'dogecoin',
        'litecoin',
        'qtum',
        'vertcoin',
        'zcash'
      ],
      default: 'bitcoin',
      describe: 'Type of bitcoin-like coin'
    })
    .version()
    .help('help').alias('help', 'h')
    .argv
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
  // not ok:
  if (['dogecoin', 'zcash', 'bitcoincash', 'bitcoinsv'].includes(type)) return []

  async function process (target, mode) {
    let obj = {}
    if (['dash'].includes(type)) { // no mode
      obj = await makeRequest(url, 'estimatesmartfee', target)
    } else {
      obj = await makeRequest(url, 'estimatesmartfee', target, mode)
    }

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

function initParityMetrics (registry, nodeType, nodeURL) {
  const createGauge = (name, help, labelNames) => new Gauge({ name, help, labelNames, registers: [registry] })

  const gauges = {
    version: createGauge('bitcoind_version', 'Client version', ['value']),
    latest: {
      hash: createGauge('bitcoind_blockchain_latest', 'Latest block information', ['hash']),
      sync: createGauge('bitcoind_blockchain_sync', 'Blockchain sync info', ['type']),
      size: createGauge('bitcoind_blockchain_size_bytes', 'Blockchain size on disk', [])
    },
    mempool: createGauge('bitcoind_mempool_size', 'Mempool information', ['type']),
    fee: createGauge('bitcoind_fee', 'Approximate fee per kilobyte by estimatesmartfee method', ['target', 'mode']),
    peers: createGauge('bitcoind_peers', 'Connected peers', ['version'])
  }

  const data = {
    version: '',
    latest: '',
    peers: new Map([['all', 0]])
  }

  const update = async () => {
    const [
      blockchainInfo,
      mempoolInfo,
      networkInfo,
      peerInfo,
      feeItems
    ] = await Promise.all([
      makeRequest(nodeURL, 'getblockchaininfo'),
      makeRequest(nodeURL, 'getmempoolinfo'),
      makeRequest(nodeURL, 'getnetworkinfo'),
      makeRequest(nodeURL, 'getpeerinfo'),
      getEstimateFee(nodeType, nodeURL)
    ])

    // version
    if (networkInfo.subversion !== data.version) {
      gauges.version.set({ value: networkInfo.subversion }, 1)
      data.version = networkInfo.subversion
      logger.info(`update version to ${networkInfo.subversion}`)
    }

    // latest
    if (data.latest !== blockchainInfo.bestblockhash) {
      if (data.latest) delete gauges.latest.hash.hashMap[hashObject({ hash: data.latest })]
      gauges.latest.hash.set({ hash: blockchainInfo.bestblockhash }, blockchainInfo.blocks)
      data.latest = blockchainInfo.bestblockhash
      logger.info(`update latest to ${blockchainInfo.blocks}:${blockchainInfo.bestblockhash}`)

      gauges.latest.sync.set({ type: 'blocks' }, blockchainInfo.blocks)
      gauges.latest.sync.set({ type: 'headers' }, blockchainInfo.headers)
      gauges.latest.sync.set({ type: 'progress' }, parseFloat((blockchainInfo.blocks / blockchainInfo.headers).toFixed(5)) || 0)
    }
    gauges.latest.size.set(blockchainInfo.size_on_disk || 0)

    // mempool
    gauges.mempool.set({ type: 'size' }, mempoolInfo.size)
    gauges.mempool.set({ type: 'bytes' }, mempoolInfo.bytes)

    // fee
    for (const item of feeItems) {
      gauges.fee.set({ target: item.target, mode: item.mode }, item.value)
    }

    // peers
    for (const key of data.peers.keys()) data.peers.set(key, 0)
    data.peers.set('all', peerInfo.length)
    for (const peer of peerInfo) data.peers.set(peer.subver, (data.peers.get(peer.subver) || 0) + 1)
    for (const [version, value] of data.peers.entries()) {
      if (value === 0 && version !== 'all') delete gauges.peers.hashMap[hashObject({ version })]
      else gauges.peers.set({ version }, value)
    }
  }

  return async () => {
    try {
      await update()
    } catch (err) {
      const skip = [
        'Loading block index',
        'Rewinding blocks',
        'Verifying blocks',
        'Loading P2P addresses',
        // dash specific
        'Loading masternode cache',
        'Loading masternode payment cache',
        'Loading governance cache',
        'Masternode cache is empty, skipping payments and governance cache',
        'Loading fulfilled requests cache',
        'Loading addresses', // also zcash
        // dogecoin specific
        'Activating best chain'
      ]
      for (const item of skip) {
        if (err.message.match(item)) {
          logger.info(`waiting node because: ${item.toLowerCase()}`)
          return
        }
      }

      throw err
    }
  }
}

function createPrometheusClient (args) {
  const register = new Registry()
  return {
    update: initParityMetrics(register, args.type, args.node),
    onRequest (req, res) {
      res.setHeader('Content-Type', register.contentType)
      res.end(register.metrics())
    }
  }
}

async function main () {
  const args = getArgs()
  const promClient = createPrometheusClient(args)
  await polka().get('/metrics', promClient.onRequest).listen(args.listen)
  logger.info(`listen at ${args.listen.hostname}:${args.listen.port}`)

  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  while (true) {
    const ts = Date.now()
    await promClient.update()
    const delay = Math.max(10, args.interval - (Date.now() - ts))
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

main().catch((err) => {
  logger.error({ message: err.message, stack: err.stack })
  process.exit(1)
})
