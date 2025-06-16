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
  const [contractName, setContractName] = useState(''); // For naming the contract
  const [contractAbi, setContractAbi] = useState('');
  const [abiSubmissionStatus, setAbiSubmissionStatus] = useState('');
  const [isAbiSubmitted, setIsAbiSubmitted] = useState(false);

  // Contract Data State
  const [contractData, setContractData] = useState(null);
  const [fetchDataStatus, setFetchDataStatus] = useState('');

  // Stored Contracts List
  const [storedContracts, setStoredContracts] = useState([]);
  const [listContractsError, setListContractsError] = useState('');

  // Fetch Latest Block & Stored Contracts on Mount
  useEffect(() => {
    const fetchInitialData = async () => {
      // Fetch latest block
      try {
        const blockResponse = await axios.get(\`\${BACKEND_URL}/api/latest-block\`);
        setLatestBlock(blockResponse.data.latestBlockNumber);
        setBlockError('');
      } catch (err) {
        console.error("Error fetching latest block:", err);
        setBlockError('Failed to fetch blockchain status.');
        setLatestBlock(null);
      }
      // Fetch stored contracts
      fetchStoredContracts();
    };
    fetchInitialData();
  }, []);

  const fetchStoredContracts = async () => {
    setListContractsError('');
    try {
      const response = await axios.get(\`\${BACKEND_URL}/api/contracts\`);
      setStoredContracts(response.data);
    } catch (err) {
      console.error("Error fetching stored contracts:", err);
      setListContractsError('Failed to fetch stored contracts list.');
      setStoredContracts([]);
    }
  };

  const handleAddressChange = (event) => {
    setContractAddress(event.target.value);
    resetSubmissionStates();
  };

  const handleNameChange = (event) => {
    setContractName(event.target.value);
  };

  const handleAbiChange = (event) => {
    setContractAbi(event.target.value);
    resetSubmissionStates(); // Reset if user manually changes ABI after loading
  };

  const resetSubmissionStates = () => {
    setAbiSubmissionStatus('');
    setIsAbiSubmitted(false);
    setContractData(null);
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
      JSON.parse(contractAbi);
      setAbiSubmissionStatus('Submitting ABI...');
      const response = await axios.post(\`\${BACKEND_URL}/api/contract/abi\`, {
        address: contractAddress,
        abi: contractAbi,
        name: contractName // Include name in submission
      });
      setAbiSubmissionStatus(\`Success: \${response.data.message} for \${response.data.address}\`);
      setIsAbiSubmitted(true);
      setContractData(null);
      setFetchDataStatus('');
      fetchStoredContracts(); // Refresh the list after successful submission
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
    // If ABI is not marked as submitted (e.g. user typed address, didn't click load/submit)
    // we can check if an ABI exists on backend to improve UX for already stored contracts.
    let abiAvailable = isAbiSubmitted;
    if (!abiAvailable) {
        try {
            console.log("Attempting to check for existing ABI on backend for data fetch...");
            await axios.get(\`\${BACKEND_URL}/api/contract/abi/\${contractAddress}\`);
            abiAvailable = true; // ABI exists on backend
            setIsAbiSubmitted(true); // Mark it as available for this session
            setAbiSubmissionStatus(\`ABI found for \${contractAddress}. Ready to fetch data.\`)
        } catch (error) {
             setFetchDataStatus('Error: ABI not found. Please submit ABI for this address first or load from stored contracts.');
             return;
        }
    }

    setFetchDataStatus('Fetching contract data...');
    setContractData(null);

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

  const handleSelectContract = async (selectedAddress) => {
    setContractAddress(selectedAddress);
    setContractAbi('');
    setContractName('');
    resetSubmissionStates(); // Clear all submission/data statuses
    setFetchDataStatus(''); // Clear data fetch status specifically

    try {
        setAbiSubmissionStatus(\`Loading ABI for \${selectedAddress}...\`);
        const response = await axios.get(\`\${BACKEND_URL}/api/contract/abi/\${selectedAddress}\`);
        if (response.data && response.data.abi) {
            // Ensure ABI is stringified for the textarea
            const abiString = typeof response.data.abi === 'string' ? response.data.abi : JSON.stringify(response.data.abi, null, 2);
            setContractAbi(abiString);
            setContractName(response.data.name || '');
            setAbiSubmissionStatus(\`ABI for \${selectedAddress} loaded. You can now fetch data or re-submit if ABI changed.\`);
            setIsAbiSubmitted(true);
        } else {
            throw new Error("ABI not found in response data.");
        }
    } catch (error) {
        setAbiSubmissionStatus(\`Error loading ABI for \${selectedAddress}: \${error.response?.data?.error || error.message}\`);
        setIsAbiSubmitted(false);
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
        <h2>Stored Contracts</h2>
        {listContractsError && <p style={{ color: 'red' }}>{listContractsError}</p>}
        {storedContracts.length > 0 ? (
          <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
            {storedContracts.map(contract => (
              <li key={contract.address} style={{ marginBottom: '5px', padding: '5px', border: '1px solid #eee' }}>
                <strong>{contract.name || 'Unnamed Contract'}</strong>
                <br />
                <small>{contract.address}</small>
                <br />
                <small>Added: {new Date(contract.added_date).toLocaleString()}</small>
                <button onClick={() => handleSelectContract(contract.address)} style={{marginLeft: '10px', padding: '3px 6px', fontSize: '0.9em'}}>
                  Load
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !listContractsError && <p>No contracts stored yet. Add one below.</p>
        )}
        <button onClick={fetchStoredContracts} style={{marginTop: '10px'}}>Refresh List</button>
      </div>

      <div className="card">
        <h2>Monitor New or Update Existing Contract</h2>
        <div>
          <label htmlFor="contractAddressInput">Contract Address: </label>
          <input type="text" id="contractAddressInput" value={contractAddress} onChange={handleAddressChange} placeholder="0x..." style={{ width: '350px', marginBottom: '10px' }} />
        </div>
        <div>
          <label htmlFor="contractNameInput">Contract Name (Optional): </label>
          <input type="text" id="contractNameInput" value={contractName} onChange={handleNameChange} placeholder="My Contract" style={{ width: '350px', marginBottom: '10px' }} />
        </div>
        <div>
          <label htmlFor="contractAbiInput">Contract ABI (JSON): </label>
          <textarea id="contractAbiInput" value={contractAbi} onChange={handleAbiChange} placeholder='[{"inputs":[], ...}]' rows={6} style={{ width: 'calc(100% - 22px)', minWidth: '350px', maxWidth: '600px', marginBottom: '10px', display: 'block' }} />
        </div>
        <button onClick={handleSubmitAbi}>Save/Update ABI</button>
        {abiSubmissionStatus && <p style={{ marginTop: '10px', color: abiSubmissionStatus.startsWith('Error:') ? 'red' : (abiSubmissionStatus.startsWith('Success') || abiSubmissionStatus.includes('loaded') ? 'green' : 'black') }}>{abiSubmissionStatus}</p>}

        {(contractAddress.trim() && isAbiSubmitted) && (
          <div style={{marginTop: '15px'}}>
            <button onClick={handleFetchData}>Fetch Contract Data</button>
            {fetchDataStatus && <p style={{ marginTop: '10px', color: fetchDataStatus.startsWith('Error:') ? 'red' : (fetchDataStatus.startsWith('Success') || fetchDataStatus.includes('successfully') ? 'green' : 'black') }}>{fetchDataStatus}</p>}
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
