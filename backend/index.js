const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { ethers } = require('ethers');
const db = require('./database'); // Import the SQLite database connection

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const pulseChainRpcUrl = process.env.PULSECHAIN_RPC_URL;
if (!pulseChainRpcUrl) {
  console.error("[ERROR] PULSECHAIN_RPC_URL is not defined in .env file. Exiting.");
  process.exit(1);
}
const provider = new ethers.JsonRpcProvider(pulseChainRpcUrl);
console.log("Connected to PulseChain RPC:", pulseChainRpcUrl);

// --- API Endpoints ---

app.get('/api/test', (req, res) => {
  console.log("[INFO] GET /api/test called");
  res.json({ message: 'Backend is running!' });
});

// Endpoint to list all stored contracts
app.get('/api/contracts', (req, res) => {
  console.log("[INFO] GET /api/contracts called");
  const sql = `SELECT address, name, added_date FROM contract_abis ORDER BY added_date DESC`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(`[DB_ERROR] Failed to list contracts:`, err.message, err.stack);
      return res.status(500).json({ errorCode: 'DB_LIST_ERROR', error: 'Failed to retrieve contracts from database.', details: err.message });
    }
    res.json(rows); // Send the array of contract objects
  });
});


app.get('/api/latest-block', async (req, res) => {
  console.log("[INFO] GET /api/latest-block called");
  try {
    const blockNumber = await provider.getBlockNumber();
    res.json({ latestBlockNumber: blockNumber.toString() });
  } catch (error) {
    console.error('[ERROR] Failed to fetch latest block number:', error.message, error.stack);
    res.status(500).json({
      errorCode: 'BLOCK_FETCH_FAILED',
      error: 'Failed to fetch latest block number from PulseChain.',
      details: error.message
    });
  }
});

app.post('/api/contract/abi', (req, res) => {
  let { address, abi, name } = req.body;
  console.log(`[INFO] POST /api/contract/abi called for address: \${address}`);

  if (!address || !abi) {
    console.warn(`[WARN] Missing address or ABI. Address: \${address}`);
    return res.status(400).json({ errorCode: 'MISSING_PARAMETERS', error: 'Contract address and ABI are required.' });
  }

  try {
    const parsedAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;
    if (!Array.isArray(parsedAbi) || parsedAbi.length === 0) {
      console.warn(`[WARN] Invalid ABI format for address: \${address}`);
      return res.status(400).json({ errorCode: 'INVALID_ABI_FORMAT', error: 'ABI must be a non-empty array.' });
    }
    new ethers.Interface(parsedAbi);

    const abiString = JSON.stringify(parsedAbi);
    const sql = `INSERT INTO contract_abis (address, abi, name) VALUES (?, ?, ?)
                 ON CONFLICT(address) DO UPDATE SET abi=excluded.abi, name=excluded.name, added_date=CURRENT_TIMESTAMP`;

    db.run(sql, [address.toLowerCase(), abiString, name || null], function(err) {
      if (err) {
        console.error(`[DB_ERROR] Failed to save ABI for \${address}:`, err.message, err.stack);
        return res.status(500).json({ errorCode: 'DB_INSERT_ERROR', error: 'Failed to save ABI to database.', details: err.message });
      }
      console.log(`[INFO] ABI for \${address} (Name: \${name || 'N/A'}) saved/updated. Rows affected: \${this.changes}`);
      res.status(200).json({ message: 'ABI stored successfully.', address: address });
    });

  } catch (e) {
    console.error(`[ERROR] Invalid ABI for address \${address}:`, e.message, e.stack);
    res.status(400).json({
      errorCode: 'INVALID_ABI_STRUCTURE',
      error: 'Invalid ABI format or structure.',
      details: e.message
    });
  }
});

app.get('/api/contract/abi/:contractAddress', (req, res) => {
  const { contractAddress } = req.params;
  console.log(`[INFO] GET /api/contract/abi/\${contractAddress} called`);

  const sql = `SELECT address, abi, name, added_date FROM contract_abis WHERE address = ?`;
  db.get(sql, [contractAddress.toLowerCase()], (err, row) => {
    if (err) {
      console.error(`[DB_ERROR] Failed to retrieve ABI for \${contractAddress}:`, err.message, err.stack);
      return res.status(500).json({ errorCode: 'DB_READ_ERROR', error: 'Failed to retrieve ABI from database.', details: err.message });
    }
    if (!row) {
      console.warn(`[WARN] ABI not found in DB for address: \${contractAddress}`);
      return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found for this address.' });
    }
    try {
      res.json({ address: row.address, name: row.name, abi: JSON.parse(row.abi), added_date: row.added_date });
    } catch (parseError) {
        console.error(`[ERROR] Failed to parse ABI from DB for \${contractAddress}:`, parseError.message, parseError.stack);
        return res.status(500).json({ errorCode: 'ABI_PARSE_ERROR', error: 'Failed to parse stored ABI.', details: parseError.message });
    }
  });
});

app.get('/api/contract/data/:contractAddress', async (req, res) => {
  const { contractAddress } = req.params;
  const normalizedAddress = contractAddress.toLowerCase();
  console.log(`[INFO] GET /api/contract/data/\${contractAddress} called`);

  const abiSql = `SELECT abi FROM contract_abis WHERE address = ?`;
  db.get(abiSql, [normalizedAddress], async (err, row) => {
    if (err) {
      console.error(`[DB_ERROR] Failed to retrieve ABI for data fetch (\${contractAddress}):`, err.message, err.stack);
      return res.status(500).json({ errorCode: 'DB_READ_ERROR', error: 'Failed to retrieve ABI for data fetching.', details: err.message });
    }
    if (!row) {
      console.warn(`[WARN] ABI not found for data fetch: \${contractAddress}`);
      return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found for this address. Please submit ABI first.' });
    }

    try {
      const abi = JSON.parse(row.abi);
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const data = {};
      const errors = {};

      const erc20Functions = ['name', 'symbol', 'totalSupply', 'decimals'];
      for (const funcName of erc20Functions) {
        const abiEntry = abi.find(entry =>
          entry.name === funcName && entry.type === 'function' &&
          (entry.stateMutability === 'view' || entry.stateMutability === 'pure') &&
          (!entry.inputs || entry.inputs.length === 0)
        );
        if (abiEntry) {
          try {
            console.log(`[INFO] Calling \${funcName} on \${contractAddress}`);
            const result = await contract[funcName]();
            data[funcName] = typeof result === 'bigint' ? result.toString() : result;
          } catch (e) {
            console.warn(`[WARN] Error calling \${funcName} on \${contractAddress}:`, e.message);
            errors[funcName] = e.message;
          }
        }
      }

      if (Object.keys(data).length === 0 && Object.keys(errors).length > 0) {
        return res.status(400).json({
            errorCode: 'NO_DATA_FETCHED',
            error: 'Failed to fetch any standard data.',
            details: errors
        });
      }
      res.json({
        address: contractAddress,
        data,
        ...(Object.keys(errors).length > 0 && { errors })
      });

    } catch (error) {
      console.error(`[ERROR] General error interacting with contract \${contractAddress}:`, error.message, error.stack);
      res.status(500).json({
          errorCode: 'CONTRACT_INTERACTION_FAILED',
          error: 'Failed to interact with contract.',
          details: error.message
      });
    }
  });
});

app.listen(port, () => {
  console.log(`[INFO] Server listening at http://localhost:\${port}`);
});
EOF
