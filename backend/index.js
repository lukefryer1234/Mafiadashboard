const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { ethers } = require('ethers'); // Ensure ethers is v6 for Result object behavior
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

// --- Existing Endpoints (test, contracts, latest-block, contract/abi, contract/data) ---
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
// --- End of existing endpoints ---

// Modified POST endpoint for generic contract function calls
app.post('/api/contract/call/:contractAddress', async (req, res) => {
  const { contractAddress } = req.params;
  const { functionName, args } = req.body;

  console.log(`[INFO] Generic Call: \${contractAddress}.\${functionName}(), Args:`, args);

  if (!functionName) return res.status(400).json({ errorCode: 'MISSING_FUNCTION_NAME', error: 'Function name required.' });
  if (!Array.isArray(args)) return res.status(400).json({ errorCode: 'INVALID_ARGS_FORMAT', error: 'Args must be an array.' });

  const abiSql = `SELECT abi FROM contract_abis WHERE address = ?`;
  db.get(abiSql, [contractAddress.toLowerCase()], async (dbErr, row) => {
    if (dbErr) {
        console.error(`[DB_ERROR] Failed to get ABI for call (\${contractAddress}):`, dbErr.message, dbErr.stack);
        return res.status(500).json({ errorCode: 'DB_READ_ERROR', error: 'Failed to get ABI for call.', details: dbErr.message });
    }
    if (!row) {
        console.warn(`[WARN] ABI not found for call: \${contractAddress}`);
        return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found.' });
    }

    try {
      const abi = JSON.parse(row.abi);
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const functionAbi = abi.find(item => item.type === 'function' && item.name === functionName);

      if (!functionAbi) return res.status(400).json({ errorCode: 'FUNCTION_NOT_FOUND_IN_ABI', error: `Function '\${functionName}' not found in ABI.` });
      if (functionAbi.inputs.length !== args.length) {
        return res.status(400).json({ errorCode: 'INVALID_ARGUMENT_COUNT', error: `Expected \${functionAbi.inputs.length} args for \${functionName}, got \${args.length}.` });
      }

      const processedArgs = args.map((arg, index) => {
        const inputDef = functionAbi.inputs[index];
        const inputType = inputDef.type;
        let processedArg = arg;

        try {
            if (inputType.startsWith('uint') || inputType.startsWith('int')) {
                if (arg === '') throw new Error('Numeric input cannot be empty.');
                if (isNaN(arg) && typeof arg === 'string') throw new Error (\`Invalid number: '\${arg}' for type \${inputType}\`);
                // Pass as string, ethers.js handles it. For very large numbers, BigInt(arg) might be needed if issues arise.
                processedArg = arg.toString(); // Ensure it's a string for ethers.js
            } else if (inputType === 'bool') {
                if (typeof arg === 'string') {
                    if (arg.toLowerCase() === 'true') processedArg = true;
                    else if (arg.toLowerCase() === 'false') processedArg = false;
                    else throw new Error(\`Invalid boolean string: '\${arg}'\`);
                } else if (typeof arg !== 'boolean') {
                     throw new Error(\`Expected boolean for type \${inputType}, got \${typeof arg}\`);
                }
            } else if (inputType === 'address') {
                if (!ethers.isAddress(arg)) {
                    throw new Error(\`Invalid address format: '\${arg}'\`);
                }
                processedArg = ethers.getAddress(arg);
            } else if (inputType.startsWith('bytes')) {
                // For dynamic bytes, length check is not done by isHexString. For fixed bytesN, it is.
                const expectedLength = inputType === 'bytes' ? undefined : parseInt(inputType.replace('bytes', '')) * 2 + 2; // *2 for chars, +2 for 0x
                if (typeof arg === 'string') {
                    if (!ethers.isHexString(arg)) { // Basic hex check
                        throw new Error(\`Invalid hex string for type \${inputType}: '\${arg}'\`);
                    }
                    if (expectedLength && arg.length !== expectedLength) { // Fixed bytesN length check
                        throw new Error(\`Invalid length for \${inputType}: '\${arg}'. Expected \${expectedLength} hex chars (incl 0x).\`);
                    }
                } else {
                    throw new Error(\`Expected hex string for \${inputType}\`);
                }
            }
        } catch (typeError) {
            throw new Error(`Argument '\${inputDef.name || index}' ('\${arg}'): \${typeError.message}`);
        }
        return processedArg;
      });

      console.log(`[INFO] Calling \${functionName} with processed args:`, processedArgs);
      const result = await contract[functionName](...processedArgs);

      let displayResult = result;
      function stringifyBigInts(data) {
        if (typeof data === 'bigint') return data.toString();
        if (Array.isArray(data)) {
            // Check if it's an ethers.Result object which is array-like and has named properties
            if (Object.keys(data).some(key => isNaN(parseInt(key)))) { // Has named properties
                const newObj = {};
                // Iterate over named properties first
                for (const key in data) {
                    if (isNaN(parseInt(key)) && Object.prototype.hasOwnProperty.call(data, key)) {
                         newObj[key] = stringifyBigInts(data[key]);
                    }
                }
                // If it also has array elements (e.g. tuple return), add them if not already covered by named keys
                // This part can be tricky if names match indices. For simplicity, if named keys exist, prefer them.
                // If no named keys, or to be absolutely sure for mixed results:
                if (Object.keys(newObj).length === 0) { // No named keys found, treat as plain array
                    return data.map(stringifyBigInts);
                }
                // Optionally, to include numeric indices as well if they differ from named ones:
                // data.forEach((val, idx) => { if (newObj[idx] === undefined) newObj[idx] = stringifyBigInts(val); });
                return newObj;
            }
            return data.map(stringifyBigInts); // Plain array
        }
        if (typeof data === 'object' && data !== null) { // For struct-like objects (not array-like Results)
            const newObj = {};
            for (const key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    newObj[key] = stringifyBigInts(data[key]);
                }
            }
            return newObj;
        }
        return data;
      }
      displayResult = stringifyBigInts(result);

      console.log(`[INFO] Result for \${functionName}:`, displayResult);
      res.json({ functionName, args: processedArgs, result: displayResult });

    } catch (error) {
      console.error(`[ERROR] Generic call \${functionName}:`, error.message, error.stack);
      const details = error.reason || error.shortMessage || error.message;
      if (error.message.startsWith("Argument '")) {
          return res.status(400).json({ errorCode: 'INVALID_ARGUMENT_VALUE', error: 'Invalid argument value provided.', details: error.message });
      }
      res.status(500).json({ errorCode: 'CONTRACT_CALL_FAILED', error: `Failed to execute \${functionName}.`, details });
    }
  });
});

app.listen(port, () => {
  console.log(`[INFO] Server listening at http://localhost:\${port}`);
});
EOF
