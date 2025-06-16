import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = 'http://localhost:3001';

function App() {
  // Blockchain Status State
  const [latestBlock, setLatestBlock] = useState(null);
  const [blockError, setBlockError] = useState('');

  // Contract Input State
  const [contractAddress, setContractAddress] = useState('');
  const [contractAbi, setContractAbi] = useState('');
  const [abiSubmissionStatus, setAbiSubmissionStatus] = useState('');
  const [isAbiSubmitted, setIsAbiSubmitted] = useState(false); // Track if ABI was successfully submitted

  // Contract Data State
  const [contractData, setContractData] = useState(null);
  const [fetchDataStatus, setFetchDataStatus] = useState('');

  useEffect(() => {
    const fetchLatestBlock = async () => {
      try {
        const response = await axios.get(\`\${BACKEND_URL}/api/latest-block\`);
        setLatestBlock(response.data.latestBlockNumber);
        setBlockError('');
      } catch (err) {
        console.error("Error fetching latest block:", err);
        setBlockError('Failed to fetch blockchain status. Is the backend server running?');
        setLatestBlock(null);
      }
    };
    fetchLatestBlock();
  }, []);

  const handleAddressChange = (event) => {
    setContractAddress(event.target.value);
    setAbiSubmissionStatus('');
    setIsAbiSubmitted(false); // Reset ABI submission status
    setContractData(null); // Clear old data
    setFetchDataStatus('');
  };

  const handleAbiChange = (event) => {
    setContractAbi(event.target.value);
    setAbiSubmissionStatus('');
    setIsAbiSubmitted(false); // Reset ABI submission status
    setContractData(null); // Clear old data
    setFetchDataStatus('');
  };

  const handleSubmitAbi = async () => {
    if (!contractAddress.trim()) {
      setAbiSubmissionStatus('Error: Contract address is required.');
      setIsAbiSubmitted(false);
      return;
    }
    if (!contractAbi.trim()) {
      setAbiSubmissionStatus('Error: ABI is required.');
      setIsAbiSubmitted(false);
      return;
    }

    try {
      JSON.parse(contractAbi); // Basic client-side check
      setAbiSubmissionStatus('Submitting ABI...');
      const response = await axios.post(\`\${BACKEND_URL}/api/contract/abi\`, {
        address: contractAddress,
        abi: contractAbi,
      });
      setAbiSubmissionStatus(\`Success: \${response.data.message} for \${response.data.address}\`);
      setIsAbiSubmitted(true); // Mark ABI as submitted successfully
      setContractData(null); // Clear previous data
      setFetchDataStatus(''); // Clear previous fetch status
    } catch (error) {
      setIsAbiSubmitted(false);
      if (error.response) {
        setAbiSubmissionStatus(\`Error: \${error.response.data.error || 'Failed to submit ABI.'} (\${error.response.status})\`);
      } else if (error.request) {
        setAbiSubmissionStatus('Error: No response from server. Check backend connection.');
      } else {
        setAbiSubmissionStatus(\`Error: \${error.message}\`);
      }
      console.error("Error submitting ABI:", error);
    }
  };

  const handleFetchData = async () => {
    if (!contractAddress.trim()) {
      setFetchDataStatus('Error: Contract address is missing.');
      return;
    }
    if (!isAbiSubmitted) {
      setFetchDataStatus('Error: Please submit a valid ABI for this address first.');
      return;
    }

    setFetchDataStatus('Fetching contract data...');
    setContractData(null); // Clear previous data

    try {
      const response = await axios.get(\`\${BACKEND_URL}/api/contract/data/\${contractAddress}\`);
      setContractData(response.data);
      if (response.data.data && Object.keys(response.data.data).length > 0) {
        setFetchDataStatus('Contract data fetched successfully.');
      } else if (response.data.errors && Object.keys(response.data.errors).length > 0) {
         setFetchDataStatus('Attempted to fetch data, but some calls failed. See details below.');
      } else {
         setFetchDataStatus('No standard data found or contract does not implement common functions.');
      }
    } catch (error) {
      setContractData(null);
      if (error.response) {
        setFetchDataStatus(\`Error: \${error.response.data.error || 'Failed to fetch data.'} (\${error.response.status})\`);
      } else if (error.request) {
        setFetchDataStatus('Error: No response from server when fetching data.');
      } else {
        setFetchDataStatus(\`Error: \${error.message}\`);
      }
      console.error("Error fetching contract data:", error);
    }
  };

  return (
    <>
      <h1>PulseChain Dashboard</h1>

      <div className="card">
        <h2>Blockchain Status</h2>
        {blockError && <p style={{ color: 'red' }}>{blockError}</p>}
        {latestBlock ? (
          <p>Latest PulseChain Block Number: <strong>{latestBlock}</strong></p>
        ) : (
          !blockError && <p>Loading latest block number...</p>
        )}
      </div>

      <div className="card">
        <h2>Monitor Contract</h2>
        <div>
          <label htmlFor="contractAddressInput">Contract Address: </label>
          <input
            type="text"
            id="contractAddressInput"
            value={contractAddress}
            onChange={handleAddressChange}
            placeholder="0x..."
            style={{ width: '350px', marginBottom: '10px' }}
          />
        </div>
        <div>
          <label htmlFor="contractAbiInput">Contract ABI (JSON): </label>
          <textarea
            id="contractAbiInput"
            value={contractAbi}
            onChange={handleAbiChange}
            placeholder='[{"inputs":[],"name":"name",...}]'
            rows={6}
            style={{ width: 'calc(100% - 22px)', minWidth: '350px', maxWidth: '600px', marginBottom: '10px', display: 'block' }}
          />
        </div>
        <button onClick={handleSubmitAbi}>Submit ABI</button>
        {abiSubmissionStatus && (
          <p style={{ marginTop: '10px', color: abiSubmissionStatus.startsWith('Error:') ? 'red' : (abiSubmissionStatus.startsWith('Success:') ? 'green' : 'black') }}>
            {abiSubmissionStatus}
          </p>
        )}

        {isAbiSubmitted && abiSubmissionStatus.startsWith('Success') && (
          <div style={{marginTop: '15px'}}>
            <button onClick={handleFetchData}>Fetch Contract Data</button>
            {fetchDataStatus && (
              <p style={{ marginTop: '10px', color: fetchDataStatus.startsWith('Error:') ? 'red' : (fetchDataStatus.includes('successfully') ? 'green' : 'black') }}>
                {fetchDataStatus}
              </p>
            )}
          </div>
        )}
      </div>

      {contractData && (
        <div className="card">
          <h3>Data for {contractData.address}</h3>
          {contractData.data && Object.keys(contractData.data).length > 0 ? (
            <ul>
              {Object.entries(contractData.data).map(([key, value]) => (
                <li key={key}><strong>{key}:</strong> {String(value)}</li>
              ))}
            </ul>
          ) : (
            <p>No data successfully fetched for this contract using common function names.</p>
          )}
          {contractData.errors && Object.keys(contractData.errors).length > 0 && (
            <div>
              <h4>Call Errors:</h4>
              <ul>
                {Object.entries(contractData.errors).map(([key, value]) => (
                  <li key={key} style={{color: 'orange'}}><strong>{key}:</strong> {String(value)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default App;
EOF
