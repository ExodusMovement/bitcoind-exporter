# Bitcoind exporter for Prometheus
[![Docker Stars](https://img.shields.io/docker/stars/exodusmovement/bitcoind-exporter.svg?style=flat-square)](https://hub.docker.com/r/exodusmovement/bitcoind-exporter/)
[![Docker Pulls](https://img.shields.io/docker/pulls/exodusmovement/bitcoind-exporter.svg?style=flat-square)](https://hub.docker.com/r/exodusmovement/bitcoind-exporter/)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Metrics page example:

```
# HELP bitcoind_version Client version
# TYPE bitcoind_version gauge
bitcoind_version{name="btc1",value="/Satoshi:0.16.0/"} 1

# HELP bitcoind_blockchain_latest Latest block information
# TYPE bitcoind_blockchain_latest gauge
bitcoind_blockchain_latest{name="btc1",hash="0000000000000010c0baa3c721c3d1cef99fc85bcd097a614c95fa28ebb8717c"} 1382110

# HELP bitcoind_blockchain_sync Blockchain sync info
# TYPE bitcoind_blockchain_sync gauge
bitcoind_blockchain_sync{name="btc1",type="blocks"} 1382110
bitcoind_blockchain_sync{name="btc1",type="headers"} 1382110
bitcoind_blockchain_sync{name="btc1",type="progress"} 100

# HELP bitcoind_blockchain_size_bytes Blockchain size on disk
# TYPE bitcoind_blockchain_size_bytes gauge
bitcoind_blockchain_size_bytes{name="btc1"} 16210706700

# HELP bitcoind_mempool_size Mempool information
# TYPE bitcoind_mempool_size gauge
bitcoind_mempool_size{name="btc1",type="size"} 2135
bitcoind_mempool_size{name="btc1",type="bytes"} 605698

# HELP bitcoind_fee Approximate fee per kilobyte by estimatesmartfee method
# TYPE bitcoind_fee gauge
bitcoind_fee{name="btc1",target="1",mode="CONSERVATIVE"} 0.00124872
bitcoind_fee{name="btc1",target="1",mode="ECONOMICAL"} 0.00124871
bitcoind_fee{name="btc1",target="2",mode="CONSERVATIVE"} 0.00124872
bitcoind_fee{name="btc1",target="2",mode="ECONOMICAL"} 0.00124871
bitcoind_fee{name="btc1",target="3",mode="CONSERVATIVE"} 0.00124872
bitcoind_fee{name="btc1",target="3",mode="ECONOMICAL"} 0.00124871

# HELP bitcoind_peers Connected peers
# TYPE bitcoind_peers gauge
bitcoind_peers{name="btc1",version="all"} 8
bitcoind_peers{name="btc1",version="/Satoshi:0.15.0.1/"} 2
bitcoind_peers{name="btc1",version="/Satoshi:0.14.99/"} 1
bitcoind_peers{name="btc1",version="/Satoshi:0.16.0/"} 2
bitcoind_peers{name="btc1",version="/Satoshi:0.15.99/"} 1
bitcoind_peers{name="btc1",version="/Satoshi:0.14.2/"} 1
bitcoind_peers{name="btc1",version="/Satoshi:0.15.1/"} 1
```

Config example:

```
port: 8000
hostname: 127.0.0.1

interval: 100 # in ms
nodes:
  - name: btc1
    type: bitcoin
    url: http://localhost:8332/
```

Usage:

```
docker run -p 8000:8000 exodusmovement/bitcoind-exporter
```

### LICENSE

MIT
