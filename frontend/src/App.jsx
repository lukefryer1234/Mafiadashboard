import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = 'http://localhost:3001';

function App() {
  const [latestBlock, setLatestBlock] = useState(null);
  const [error, setError] = useState('');
  const [contractAddress, setContractAddress] = useState(''); // State for contract address

  useEffect(() => {
    const fetchLatestBlock = async () => {
      try {
        const response = await axios.get(\`\${BACKEND_URL}/api/latest-block\`);
        setLatestBlock(response.data.latestBlockNumber);
        setError('');
      } catch (err) {
        console.error("Error fetching latest block:", err);
        setError('Failed to fetch data from backend. Is the backend server running?');
        setLatestBlock(null);
      }
    };

    fetchLatestBlock();
  }, []);

  const handleAddressChange = (event) => {
    setContractAddress(event.target.value);
  };

  return (
    <>
      <h1>PulseChain Dashboard</h1>

      <div className="card">
        <h2>Blockchain Status</h2>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {latestBlock ? (
          <p>Latest PulseChain Block Number: <strong>{latestBlock}</strong></p>
        ) : (
          !error && <p>Loading latest block number...</p>
        )}
      </div>

      <div className="card">
        <h2>Monitor Contract</h2>
        <div>
          <label htmlFor="contractAddressInput">Enter Contract Address: </label>
          <input
            type="text"
            id="contractAddressInput"
            value={contractAddress}
            onChange={handleAddressChange}
            placeholder="0x..."
            style={{ width: '300px', marginLeft: '10px' }}
          />
        </div>
        {contractAddress && (
          <p style={{ marginTop: '10px' }}>Monitoring address: {contractAddress}</p>
        )}
      </div>
    </>
  );
}

export default App;
EOF
