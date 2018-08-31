# Bitcoind exporter for Prometheus

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Metrics page example:

```
# HELP bitcoind_version Client version
# TYPE bitcoind_version gauge
bitcoind_version{value="/Satoshi:0.16.2/"} 1

# HELP bitcoind_blockchain_latest Latest block information
# TYPE bitcoind_blockchain_latest gauge
bitcoind_blockchain_latest{hash="00000000000000000029904e7ae7eeffaf46b9b2a6b623afd39b8ee64d281a10"} 536574

# HELP bitcoind_blockchain_sync Blockchain sync info
# TYPE bitcoind_blockchain_sync gauge
bitcoind_blockchain_sync{type="blocks"} 536574
bitcoind_blockchain_sync{type="headers"} 536574
bitcoind_blockchain_sync{type="progress"} 100

# HELP bitcoind_blockchain_size_bytes Blockchain size on disk
# TYPE bitcoind_blockchain_size_bytes gauge
bitcoind_blockchain_size_bytes 204263512502

# HELP bitcoind_mempool_size Mempool information
# TYPE bitcoind_mempool_size gauge
bitcoind_mempool_size{type="size"} 3670
bitcoind_mempool_size{type="bytes"} 2392949

# HELP bitcoind_fee Approximate fee per kilobyte by estimatesmartfee method
# TYPE bitcoind_fee gauge
bitcoind_fee{target="1",mode="CONSERVATIVE"} 0.00004696
bitcoind_fee{target="1",mode="ECONOMICAL"} 0.00004696
bitcoind_fee{target="2",mode="CONSERVATIVE"} 0.00004696
bitcoind_fee{target="2",mode="ECONOMICAL"} 0.00004696
bitcoind_fee{target="3",mode="CONSERVATIVE"} 0.00004455
bitcoind_fee{target="3",mode="ECONOMICAL"} 0.00004455

# HELP bitcoind_peers Connected peers
# TYPE bitcoind_peers gauge
bitcoind_peers{version="all"} 8
bitcoind_peers{version="/Satoshi:0.16.0/"} 4
bitcoind_peers{version="/Satoshi:0.15.1/"} 1
bitcoind_peers{version="/Satoshi:0.16.1/"} 1
bitcoind_peers{version="/Satoshi:0.13.2/"} 1
bitcoind_peers{version="/Satoshi:0.14.2/"} 1
```

Usage:

```
docker run \
  -p 8000:8000 \
  -e BITCOIND_EXPORTER_LISTEN=0.0.0.0:8000 \
  -e BITCOIND_EXPORTER_NODE=http://bitcoinrpc:password@bitcoind:8332/ \
  -e BITCOIND_EXPORTER_TYPE=bitcoin
  exodusmovement/bitcoind-exporter
```

### LICENSE

MIT
