const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { ethers } = require('ethers');

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
console.log("[INFO] Connected to PulseChain RPC:", pulseChainRpcUrl);


const abiStorage = {}; // In-memory storage for ABIs { [contractAddress]: abi }

// --- API Endpoints ---

app.get('/api/test', (req, res) => {
  console.log("[INFO] GET /api/test called");
  res.json({ message: 'Backend is running!' });
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
  const { address, abi } = req.body;
  console.log(`[INFO] POST /api/contract/abi called for address: \${address}`);

  if (!address || !abi) {
    console.warn(`[WARN] Missing address or ABI for POST /api/contract/abi. Address: \${address}`);
    return res.status(400).json({ errorCode: 'MISSING_PARAMETERS', error: 'Contract address and ABI are required.' });
  }

  try {
    const parsedAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;

    if (!Array.isArray(parsedAbi) || parsedAbi.length === 0) {
      console.warn(`[WARN] Invalid ABI format (not a non-empty array) for address: \${address}`);
      return res.status(400).json({ errorCode: 'INVALID_ABI_FORMAT', error: 'ABI must be a non-empty array.' });
    }

    // Validate ABI structure using ethers.Interface
    // This will throw an error if the ABI is malformed
    new ethers.Interface(parsedAbi);

    abiStorage[address.toLowerCase()] = parsedAbi;
    console.log(`[INFO] ABI stored successfully for address: \${address}`);
    res.status(200).json({ message: 'ABI stored successfully.', address: address });

  } catch (e) {
    // This catch block now handles errors from JSON.parse and ethers.Interface
    console.error(`[ERROR] Invalid ABI for address \${address}:`, e.message, e.stack);
    res.status(400).json({
      errorCode: 'INVALID_ABI_STRUCTURE',
      error: 'Invalid ABI format or structure. Ensure it is a valid JSON ABI.',
      details: e.message // Include the specific error from ethers.js or JSON.parse
    });
  }
});

app.get('/api/contract/abi/:contractAddress', (req, res) => {
  const { contractAddress } = req.params;
  console.log(`[INFO] GET /api/contract/abi/\${contractAddress} called`);
  const abi = abiStorage[contractAddress.toLowerCase()];

  if (!abi) {
    console.warn(`[WARN] ABI not found for address: \${contractAddress}`);
    return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found for this address.' });
  }
  res.json({ address: contractAddress, abi: abi });
});

app.get('/api/contract/data/:contractAddress', async (req, res) => {
  const { contractAddress } = req.params;
  const normalizedAddress = contractAddress.toLowerCase();
  console.log(`[INFO] GET /api/contract/data/\${contractAddress} called`);

  const abi = abiStorage[normalizedAddress];
  if (!abi) {
    console.warn(`[WARN] ABI not found for data fetch: \${contractAddress}`);
    return res.status(404).json({ errorCode: 'ABI_NOT_FOUND', error: 'ABI not found for this address. Please submit ABI first.' });
  }

  try {
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const data = {};
    const errors = {}; // To store errors for individual function calls

    const erc20Functions = ['name', 'symbol', 'totalSupply', 'decimals'];

    for (const funcName of erc20Functions) {
      const abiEntry = abi.find(entry =>
        entry.name === funcName &&
        entry.type === 'function' &&
        (entry.stateMutability === 'view' || entry.stateMutability === 'pure') &&
        (!entry.inputs || entry.inputs.length === 0)
      );

      if (abiEntry) {
        try {
          console.log(`[INFO] Calling \${funcName} on \${contractAddress}`);
          const result = await contract[funcName]();
          data[funcName] = typeof result === 'bigint' ? result.toString() : result;
          console.log(`[INFO] \${funcName} on \${contractAddress} result: \${data[funcName]}`);
        } catch (e) {
          console.warn(`[WARN] Error calling \${funcName} on \${contractAddress}:`, e.message);
          errors[funcName] = e.message; // Store specific error for this function call
        }
      }
    }

    if (Object.keys(data).length === 0 && Object.keys(errors).length > 0) {
      console.warn(`[WARN] No data fetched, only errors for \${contractAddress}:`, errors);
      return res.status(400).json({ // Changed to 400 as it's more like a bad request / contract not suitable
          errorCode: 'NO_DATA_FETCHED',
          error: 'Failed to fetch any standard data. Contract might not implement common functions or calls failed.',
          details: errors
      });
    }

    console.log(`[INFO] Data fetched for \${contractAddress}:`, data);
    res.json({
      address: contractAddress,
      data,
      ...(Object.keys(errors).length > 0 && { errors }) // Conditionally add errors object
    });

  } catch (error) {
    // Catchall for other errors during contract interaction (e.g., network issues, invalid address format for ethers.Contract)
    console.error(`[ERROR] General error interacting with contract \${contractAddress}:`, error.message, error.stack);
    res.status(500).json({
        errorCode: 'CONTRACT_INTERACTION_FAILED',
        error: 'Failed to interact with contract. Ensure address is valid and network is reachable.',
        details: error.message
    });
  }
});


// --- Server Start ---
app.listen(port, () => {
  console.log(`[INFO] Server listening at http://localhost:\${port}`);
});
EOF
