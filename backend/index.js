const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { ethers } = require('ethers'); // Import ethers

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// PulseChain RPC URL from .env file
const pulseChainRpcUrl = process.env.PULSECHAIN_RPC_URL;
if (!pulseChainRpcUrl) {
  console.error("Error: PULSECHAIN_RPC_URL is not defined in .env file.");
  process.exit(1); // Exit if RPC URL is not set
}
const provider = new ethers.JsonRpcProvider(pulseChainRpcUrl);

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// New endpoint to get the latest block number
app.get('/api/latest-block', async (req, res) => {
  try {
    const blockNumber = await provider.getBlockNumber();
    res.json({ latestBlockNumber: blockNumber.toString() });
  } catch (error) {
    console.error('Error fetching latest block number:', error);
    res.status(500).json({ error: 'Failed to fetch latest block number', details: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:\${port}`);
});
EOF
