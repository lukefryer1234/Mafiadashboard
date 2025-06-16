const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const db = require('./database');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const pulseChainRpcUrl = process.env.PULSECHAIN_RPC_URL;
if (!pulseChainRpcUrl) {
  console.error("[ERROR] PULSECHAIN_RPC_URL is not defined. Exiting.");
  process.exit(1);
}
const provider = new ethers.JsonRpcProvider(pulseChainRpcUrl);
console.log("Connected to PulseChain RPC:", pulseChainRpcUrl);

// --- API Endpoints (Full versions from previous steps) ---
app.get('/api/test', (req, res) => {
  console.log("[INFO] GET /api/test called");
  res.json({ message: 'Backend is running!' });
});

app.get('/api/contracts', (req, res) => {
  console.log("[INFO] GET /api/contracts called");
  const sql = `SELECT address, name, added_date FROM contract_abis ORDER BY added_date DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) {
        console.error(`[DB_ERROR] Failed to list contracts:`, err.message, err.stack);
        return res.status(500).json({ errorCode: 'DB_LIST_ERROR', error: 'Failed to retrieve contracts.', details: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/latest-block', async (req, res) => {
  console.log("[INFO] GET /api/latest-block called");
  try {
    const blockNumber = await provider.getBlockNumber();
    res.json({ latestBlockNumber: blockNumber.toString() });
  }
  catch (e) {
    console.error('[ERROR] Failed to fetch latest block number:', e.message, e.stack);
    res.status(500).json({ errorCode: 'BLOCK_FETCH_FAILED', error: 'Failed to fetch block.', details: e.message });
  }
});

app.post('/api/contract/abi', (req, res) => {
  let { address, abi, name } = req.body;
  console.log(`[INFO] POST /api/contract/abi for \${address}`);
  if (!address || !abi) return res.status(400).json({ errorCode: 'MISSING_PARAMETERS', error: 'Address and ABI required.' });
  try {
    const pAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;
    if (!Array.isArray(pAbi) || pAbi.length === 0) return res.status(400).json({ errorCode: 'INVALID_ABI_FORMAT', error: 'ABI must be non-empty array.' });
    new ethers.Interface(pAbi);
    const sAbi = JSON.stringify(pAbi);
    const sql = `INSERT INTO contract_abis (address, abi, name) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET abi=excluded.abi, name=excluded.name, added_date=CURRENT_TIMESTAMP`;
    db.run(sql, [address.toLowerCase(), sAbi, name || null], function(err) {
      if (err) {
        console.error(`[DB_ERROR] Save ABI \${address}:`, err.message, err.stack);
        return res.status(500).json({ errorCode: 'DB_INSERT_ERROR', error: 'Failed to save ABI.', details: err.message });
      }
      console.log(`[INFO] ABI for \${address} (Name: \${name || 'N/A'}) saved/updated. Rows affected: \${this.changes}`);
      res.status(200).json({ message: 'ABI stored.', address: address });
    });
  } catch (e) {
    console.error(`[ERROR] Invalid ABI for address \${address}:`, e.message, e.stack);
    res.status(400).json({ errorCode: 'INVALID_ABI_STRUCTURE', error: 'Invalid ABI.', details: e.message });
  }
});

app.get('/api/contract/abi/:contractAddress', (req, res) => {
  const { contractAddress } = req.params;
  console.log(`[INFO] GET /api/contract/abi/\${contractAddress}`);
  const sql = `SELECT address, abi, name, added_date FROM contract_abis WHERE address = ?`;
  db.get(sql, [contractAddress.toLowerCase()], (err, row) => {
    if (err) {
        console.error(`[DB_ERROR] Failed to retrieve ABI for \${contractAddress}:`, err.message, err.stack);
        return res.status(500).json({ errorCode: 'DB_READ_ERROR', error: 'Failed to get ABI.', details: err.message });
    }
    if (!row) {
        console.warn(`[WARN] ABI not found for \${contractAddress}`);
        return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found.' });
    }
    try {
      res.json({ address: row.address, name: row.name, abi: JSON.parse(row.abi), added_date: row.added_date });
    }
    catch (e) {
      console.error(`[ERROR] Failed to parse ABI from DB for \${contractAddress}:`, e.message, e.stack);
      res.status(500).json({ errorCode: 'ABI_PARSE_ERROR', error: 'Failed to parse ABI.', details: e.message });
    }
  });
});

app.get('/api/contract/data/:contractAddress', async (req, res) => {
  const { contractAddress } = req.params;
  console.log(`[INFO] GET /api/contract/data/\${contractAddress}`);
  const sql = `SELECT abi FROM contract_abis WHERE address = ?`;
  db.get(sql, [contractAddress.toLowerCase()], async (err, row) => {
    if (err) {
        console.error(`[DB_ERROR] Failed to get ABI for data fetch (\${contractAddress}):`, err.message, err.stack);
        return res.status(500).json({ errorCode: 'DB_READ_ERROR', error: 'Failed to get ABI for data.', details: err.message });
    }
    if (!row) {
        console.warn(`[WARN] ABI not found for data fetch: \${contractAddress}`);
        return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found.' });
    }
    try {
      const abi = JSON.parse(row.abi);
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const data = {}; const errors = {}; const funcs = ['name', 'symbol', 'totalSupply', 'decimals'];
      for (const f of funcs) {
        if (abi.find(e => e.name === f && e.type === 'function' && (e.stateMutability === 'view' || e.stateMutability === 'pure') && (!e.inputs || e.inputs.length === 0))) {
          try {
            console.log(`[INFO] Calling \${f} on \${contractAddress}`);
            data[f] = String(await contract[f]());
          } catch (e) {
            console.warn(`[WARN] Error calling \${f} on \${contractAddress}:`, e.message);
            errors[f] = e.message;
          }
        }
      }
      if (Object.keys(data).length === 0 && Object.keys(errors).length > 0) {
        return res.status(400).json({ errorCode: 'NO_DATA_FETCHED', error: 'Std data fetch failed.', details: errors });
      }
      res.json({ address: contractAddress, data, ...(Object.keys(errors).length > 0 && { errors }) });
    } catch (error) {
      console.error(`[ERROR] General error interacting with contract \${contractAddress} (data endpoint):`, error.message, error.stack);
      res.status(500).json({ errorCode: 'CONTRACT_INTERACTION_FAILED', error: 'Contract interaction failed.', details: error.message });
    }
  });
});

app.post('/api/contract/call/:contractAddress', async (req, res) => {
  const { contractAddress } = req.params; const { functionName, args } = req.body;
  console.log(`[INFO] Generic Call: \${contractAddress}.\${functionName}(), Args:`, args);
  if (!functionName) return res.status(400).json({ errorCode: 'MISSING_FUNCTION_NAME', error: 'Function name required.' });
  if (!Array.isArray(args)) return res.status(400).json({ errorCode: 'INVALID_ARGS_FORMAT', error: 'Args must be an array.' });
  const abiSql = `SELECT abi FROM contract_abis WHERE address = ?`;
  db.get(abiSql, [contractAddress.toLowerCase()], async (dbErr, row) => {
    if (dbErr) { console.error(`[DB_ERROR] Get ABI for call \${contractAddress}:`, dbErr.message, dbErr.stack); return res.status(500).json({ errorCode: 'DB_READ_ERROR', error: 'Failed to get ABI for call.', details: dbErr.message }); }
    if (!row) { console.warn(`[WARN] ABI not found for call \${contractAddress}`); return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found.' }); }
    try {
      const abi = JSON.parse(row.abi); const contract = new ethers.Contract(contractAddress, abi, provider);
      const functionAbi = abi.find(item => item.type === 'function' && item.name === functionName);
      if (!functionAbi) return res.status(400).json({ errorCode: 'FUNCTION_NOT_FOUND_IN_ABI', error: `Function '\${functionName}' not found in ABI.` });
      if (functionAbi.inputs.length !== args.length) return res.status(400).json({ errorCode: 'INVALID_ARGUMENT_COUNT', error: `Expected \${functionAbi.inputs.length} args for \${functionName}, got \${args.length}.` });
      const processedArgs = args.map((arg, index) => {
        const inputDef = functionAbi.inputs[index]; const inputType = inputDef.type; let processedArg = arg;
        try {
            if (inputType.startsWith('uint')||inputType.startsWith('int')) { if (arg===''||(isNaN(arg)&&typeof arg==='string')) throw new Error('Invalid number'); processedArg = arg.toString(); }
            else if (inputType === 'bool') { if (typeof arg==='string') { if (arg.toLowerCase()==='true') processedArg=true; else if (arg.toLowerCase()==='false') processedArg=false; else throw new Error('Invalid bool string');} else if (typeof arg!=='boolean') throw new Error('Expected bool');}
            else if (inputType === 'address') { if (!ethers.isAddress(arg)) throw new Error('Invalid address'); processedArg = ethers.getAddress(arg); }
            else if (inputType.startsWith('bytes')) { const len = inputType==='bytes'?undefined:parseInt(inputType.replace('bytes','')); if(typeof arg==='string'){if(!ethers.isHexString(arg))throw new Error('Invalid hex string'); if(len && arg.length!==2+len*2)throw new Error('Invalid length for bytesN');} else throw new Error('Expected hex string');}
        } catch (typeError) { throw new Error(`Argument '\${inputDef.name||index}' ('\${arg}'): \${typeError.message}`); }
        return processedArg;
      });
      console.log(`[INFO] Calling \${functionName} with processed args:`, processedArgs);
      const result = await contract[functionName](...processedArgs);
      function stringifyBigInts(data) {
        if (typeof data === 'bigint') return data.toString();
        if (Array.isArray(data)) { if (Object.keys(data).some(k=>isNaN(parseInt(k)))) { const o={}; for(const k in data) if(isNaN(parseInt(k))&&Object.prototype.hasOwnProperty.call(data,k))o[k]=stringifyBigInts(data[k]); if(Object.keys(o).length===0)return data.map(stringifyBigInts); return o; } return data.map(stringifyBigInts); }
        if (typeof data === 'object' && data !== null) { const o={}; for(const k in data)if(Object.prototype.hasOwnProperty.call(data,k))o[k]=stringifyBigInts(data[k]); return o; } return data;
      }
      console.log(`[INFO] Result for \${functionName}:`, stringifyBigInts(result)); res.json({ functionName, args: processedArgs, result: stringifyBigInts(result) });
    } catch (error) {
      console.error(`[ERROR] Generic call \${functionName} on \${contractAddress}:`, error.message, error.stack);
      const details = error.reason || error.shortMessage || error.message;
      if (error.message.startsWith("Argument '")) return res.status(400).json({ errorCode: 'INVALID_ARGUMENT_VALUE', error: 'Invalid argument value provided.', details: error.message });
      res.status(500).json({ errorCode: 'CONTRACT_CALL_FAILED', error: `Failed to execute \${functionName}.`, details });
    }
  });
});
// --- End of API Endpoints ---

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log('[WSS] WebSocket Server initialized.');

const contractEventSubscriptions = new Map();
const clientSubscriptions = new Map();
const activeContracts = new Map();
const globalEthersListeners = new Map();


async function handleSubscribe(ws, contractAddress, eventName) {
  const lowerAddress = contractAddress.toLowerCase();
  const subscriptionId = `\${lowerAddress}_\${eventName}`;

  try {
    const row = await new Promise((resolve, reject) => {
      db.get(`SELECT abi FROM contract_abis WHERE address = ?`, [lowerAddress], (err, row) => {
        if (err) reject(new Error(`DB_READ_ERROR: Failed to get ABI for \${lowerAddress}: \${err.message}`));
        else if (!row) reject(new Error(`ABI_NOT_FOUND: ABI not found for \${lowerAddress}.`));
        else resolve(row);
      });
    });
    const abi = JSON.parse(row.abi);

    const eventAbi = abi.find(item => item.type === 'event' && item.name === eventName);
    if (!eventAbi) {
      throw new Error(`EVENT_NOT_FOUND_IN_ABI: Event '\${eventName}' not found in ABI for \${lowerAddress}.`);
    }

    if (!globalEthersListeners.has(subscriptionId)) {
      let contract = activeContracts.get(lowerAddress);
      if (!contract) {
        contract = new ethers.Contract(lowerAddress, abi, provider);
        activeContracts.set(lowerAddress, contract);
      }

      const listener = (...args) => {
        const event = args[args.length - 1];
        console.log(`[WSS_EVENT] \${eventName} on \${lowerAddress}: block #\${event.blockNumber}`);

        const formattedArgs = {};
        if (event.args) { // Check if event.args (decoded named arguments) exists
            for (const key in event.args) {
                if (isNaN(parseInt(key))) { // Only include named arguments, not numeric array indices
                    formattedArgs[key] = typeof event.args[key] === 'bigint' ? event.args[key].toString() : event.args[key];
                }
            }
        }

        const eventData = {
          type: 'EVENT_DATA',
          payload: {
            contractAddress: lowerAddress, eventName: eventName, args: formattedArgs,
            blockNumber: event.blockNumber, transactionHash: event.transactionHash, logIndex: event.logIndex,
          }
        };

        if (contractEventSubscriptions.has(lowerAddress) && contractEventSubscriptions.get(lowerAddress).has(eventName)) {
          contractEventSubscriptions.get(lowerAddress).get(eventName).forEach(clientWs => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify(eventData));
            }
          });
        }
      };

      // --- Added try-catch for contract.on ---
      try {
        contract.on(eventName, listener);
        globalEthersListeners.set(subscriptionId, { listener, refCount: 0, contract });
        console.log(`[WSS_ETHERS] Started listening to \${eventName} on \${lowerAddress}`);
      } catch (ethersError) {
        console.error(`[WSS_ETHERS_ERROR] Failed to attach listener for \${eventName} on \${lowerAddress}:`, ethersError.message, ethersError.stack);
        // Clean up activeContracts if this was the first attempt to use it for this address and it failed.
        // This check is important: only remove if no other listeners for this contract are in globalEthersListeners.
        let hasOtherListenersForThisContract = false;
        for (const id of globalEthersListeners.keys()) {
            if (id.startsWith(lowerAddress + '_') && id !== subscriptionId) { // Check other potential listeners for same address
                hasOtherListenersForThisContract = true;
                break;
            }
        }
        if (!hasOtherListenersForThisContract && activeContracts.has(lowerAddress)) {
            activeContracts.delete(lowerAddress);
             console.log(`[WSS_ETHERS_ERROR] Cleaned up contract instance for \${lowerAddress} due to listener setup failure.`);
        }
        throw new Error(`ETHERS_LISTENER_SETUP_FAILED: Could not start listening due to: \${ethersError.message}`);
      }
      // --- End of added try-catch ---
    }

    if (!contractEventSubscriptions.has(lowerAddress)) contractEventSubscriptions.set(lowerAddress, new Map());
    if (!contractEventSubscriptions.get(lowerAddress).has(eventName)) contractEventSubscriptions.get(lowerAddress).set(eventName, new Set());
    contractEventSubscriptions.get(lowerAddress).get(eventName).add(ws);

    if (!clientSubscriptions.has(ws)) clientSubscriptions.set(ws, new Map());
    clientSubscriptions.get(ws).set(subscriptionId, { contractAddress: lowerAddress, eventName });

    globalEthersListeners.get(subscriptionId).refCount++;

    ws.send(JSON.stringify({ type: 'SUBSCRIPTION_ACK', payload: { contractAddress, eventName, status: 'subscribed' } }));
    console.log(`[WSS_SUB] Client subscribed to \${eventName} on \${lowerAddress}. RefCount: \${globalEthersListeners.get(subscriptionId).refCount}`);

  } catch (error) {
    console.error(`[WSS_SUB_ERROR] Subscribe \${eventName} on \${contractAddress}:`, error.message, error.stack); // Added stack here
    ws.send(JSON.stringify({ type: 'SUBSCRIPTION_ERROR', payload: { contractAddress, eventName, error: error.message } }));
  }
}

function handleUnsubscribe(ws, contractAddress, eventName) {
  const lowerAddress = contractAddress.toLowerCase();
  const subscriptionId = `\${lowerAddress}_\${eventName}`;
  let clientHadSubscription = false;

  if (clientSubscriptions.has(ws) && clientSubscriptions.get(ws).has(subscriptionId)) {
    clientSubscriptions.get(ws).delete(subscriptionId);
    if (clientSubscriptions.get(ws).size === 0) clientSubscriptions.delete(ws);
    clientHadSubscription = true;
  }

  if (contractEventSubscriptions.has(lowerAddress) && contractEventSubscriptions.get(lowerAddress).has(eventName)) {
    contractEventSubscriptions.get(lowerAddress).get(eventName).delete(ws);
    if (contractEventSubscriptions.get(lowerAddress).get(eventName).size === 0) {
        contractEventSubscriptions.get(lowerAddress).delete(eventName);
        console.log(`[WSS_SUB] No more clients for \${eventName} on \${lowerAddress}.`);
    }
    if (contractEventSubscriptions.get(lowerAddress).size === 0) {
        contractEventSubscriptions.delete(lowerAddress);
        console.log(`[WSS_SUB] No more event subscriptions for \${lowerAddress}.`);
    }
  }

  if (clientHadSubscription) { // Only proceed if client actually had this specific subscription
    if (globalEthersListeners.has(subscriptionId)) {
      const globalListener = globalEthersListeners.get(subscriptionId);
      globalListener.refCount--;
      console.log(`[WSS_SUB] Client unsubscribed from \${eventName} on \${lowerAddress}. New RefCount for \${subscriptionId}: \${globalListener.refCount}`);
      if (globalListener.refCount === 0) {
        try {
            globalListener.contract.off(eventName, globalListener.listener);
            console.log(`[WSS_ETHERS] Stopped listening to \${eventName} on \${lowerAddress}.`);
        } catch (ethersError) {
            console.error(`[WSS_ETHERS_ERROR] Error during contract.off for \${eventName} on \${lowerAddress}:`, ethersError.message, ethersError.stack);
        }
        globalEthersListeners.delete(subscriptionId);

        let hasMoreListenersForContract = false;
        for (const id of globalEthersListeners.keys()) {
            if (id.startsWith(lowerAddress + '_')) {
                hasMoreListenersForContract = true;
                break;
            }
        }
        if (!hasMoreListenersForContract && activeContracts.has(lowerAddress)) {
            // Optional: ethers.js v6 Contract instances don't have a generic .removeAllListeners() without specifying event.
            // activeContracts.get(lowerAddress).removeAllListeners(); // This might be needed if .off() is not enough or errors out.
            activeContracts.delete(lowerAddress);
            console.log(`[WSS_ETHERS] Removed inactive contract instance for \${lowerAddress}`);
        }
      }
    }
    ws.send(JSON.stringify({ type: 'UNSUBSCRIPTION_ACK', payload: { contractAddress, eventName, status: 'unsubscribed' } }));
  } else {
    // Client didn't have this specific subscription according to clientSubscriptions map.
    // This can happen if unsubscribe is called multiple times or for a non-existent subscription.
    console.log(`[WSS_SUB] Client was not actively tracked as subscribed to \${eventName} on \${lowerAddress}, or already unsubscribed.`);
    ws.send(JSON.stringify({ type: 'UNSUBSCRIPTION_ACK', payload: { contractAddress, eventName, status: 'not_subscribed_or_already_removed' } }));
  }
}

function cleanupClient(ws) {
  console.log('[WSS] Cleaning up subscriptions for disconnected client.');
  if (clientSubscriptions.has(ws)) {
    const clientSubsMap = new Map(clientSubscriptions.get(ws));
    clientSubsMap.forEach(({ contractAddress, eventName }, subscriptionId) => { // subscriptionId is the key here
        handleUnsubscribe(ws, contractAddress, eventName);
    });
    if (clientSubscriptions.has(ws) && clientSubscriptions.get(ws).size === 0) {
        clientSubscriptions.delete(ws);
    } else if (clientSubscriptions.has(ws)) {
         console.warn(`[WSS_CLEANUP] Client still has \${clientSubscriptions.get(ws).size} subscriptions after cleanup attempt for client. This might indicate an issue if client should be fully cleared.`);
    }
  }
}

wss.on('connection', (ws) => {
  console.log('[WSS] Client connected.');
  ws.send(JSON.stringify({ type: 'connection_ack', message: 'Successfully connected.' }));

  ws.on('message', async (message) => {
    let parsedMessage;
    try { parsedMessage = JSON.parse(message); }
    catch (e) { console.error('[WSS] Invalid JSON message:', message.toString()); ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON.' })); return; }

    const { type, payload } = parsedMessage;
    console.log('[WSS] Received:', type, payload ? JSON.stringify(payload).substring(0, 100) + (JSON.stringify(payload).length > 100 ? '...' : '') : 'No payload');

    switch (type) {
      case 'SUBSCRIBE':
        if (payload && payload.contractAddress && payload.eventName) {
          await handleSubscribe(ws, payload.contractAddress, payload.eventName);
        } else { ws.send(JSON.stringify({ type: 'error', message: 'Invalid SUBSCRIBE payload (contractAddress & eventName required).' })); }
        break;
      case 'UNSUBSCRIBE':
        if (payload && payload.contractAddress && payload.eventName) {
          handleUnsubscribe(ws, payload.contractAddress, payload.eventName);
        } else { ws.send(JSON.stringify({ type: 'error', message: 'Invalid UNSUBSCRIBE payload (contractAddress & eventName required).' })); }
        break;
      default: console.log(`[WSS] Unknown message type: \${type}`); ws.send(JSON.stringify({ type: 'message_ack', info: 'Unknown type.' }));
    }
  });

  ws.on('close', () => { console.log('[WSS] Client disconnected.'); cleanupClient(ws); });
  ws.on('error', (error) => { console.error('[WSS] Client error:', error.message, error.stack); cleanupClient(ws); });
});

wss.on('error', (error) => console.error('[WSS] Server error:', error.message, error.stack));
server.listen(port, () => console.log(`[INFO] HTTP & WSS Server on port \${port}`));
EOF
