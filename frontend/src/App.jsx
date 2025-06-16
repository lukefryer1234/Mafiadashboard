import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = 'http://localhost:3001';

function App() {
  // ... (all existing state variables up to genericCallStatus)
  const [latestBlock, setLatestBlock] = useState(null);
  const [blockError, setBlockError] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [contractName, setContractName] = useState('');
  const [contractAbi, setContractAbi] = useState('');
  const [abiSubmissionStatus, setAbiSubmissionStatus] = useState('');
  const [isAbiReady, setIsAbiReady] = useState(false);
  const [readOnlyFunctions, setReadOnlyFunctions] = useState([]);
  const [contractData, setContractData] = useState(null);
  const [fetchDataStatus, setFetchDataStatus] = useState('');
  const [storedContracts, setStoredContracts] = useState([]);
  const [listContractsError, setListContractsError] = useState('');
  const [selectedFunctionIndex, setSelectedFunctionIndex] = useState(''); // Stores ID of selected function
  const [functionInputs, setFunctionInputs] = useState({});
  const [genericCallResult, setGenericCallResult] = useState(null);
  const [genericCallStatus, setGenericCallStatus] = useState('');

  // --- Initial Data Fetching & Utility Functions ---
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const blockResponse = await axios.get(\`\${BACKEND_URL}/api/latest-block\`);
        setLatestBlock(blockResponse.data.latestBlockNumber);
        setBlockError('');
      } catch (err) {
        console.error("Error fetching latest block:", err);
        setBlockError('Failed to fetch blockchain status.');
      }
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
    }
  };

  const resetSubmissionStates = () => {
    setAbiSubmissionStatus(''); setIsAbiReady(false);
    setContractData(null); setFetchDataStatus('');
    setReadOnlyFunctions([]); setSelectedFunctionIndex('');
    setFunctionInputs({}); setGenericCallResult(null); setGenericCallStatus('');
  };

  const parseAndStoreAbiFunctions = (abiString) => {
    try {
      const parsedAbi = JSON.parse(abiString);
      if (!Array.isArray(parsedAbi)) {
        setAbiSubmissionStatus('Error: ABI is not a valid JSON array.');
        setIsAbiReady(false); setReadOnlyFunctions([]); return false;
      }
      // Use originalIndex from ABI parsing as a stable ID for selection
      const funcs = parsedAbi
        .map((item, index) => ({ ...item, originalIndex: index }))
        .filter(item => item.type === 'function' && (item.stateMutability === 'view' || item.stateMutability === 'pure'))
        .map(func => ({
          id: func.originalIndex,
          name: func.name,
          inputs: func.inputs || [],
          outputs: func.outputs || []
        }));
      setReadOnlyFunctions(funcs); setIsAbiReady(true); return true;
    } catch (e) {
      setAbiSubmissionStatus(\`Error: Invalid ABI JSON - \${e.message}\`);
      setIsAbiReady(false); setReadOnlyFunctions([]); return false;
    }
  };

  // --- Event Handlers ---
  const handleAddressChange = (event) => { setContractAddress(event.target.value); resetSubmissionStates(); };
  const handleNameChange = (event) => { setContractName(event.target.value); };
  const handleAbiChange = (event) => { setContractAbi(event.target.value); resetSubmissionStates(); };

  const handleSubmitAbi = async () => {
    if (!contractAddress.trim() || !contractAbi.trim()) {
      setAbiSubmissionStatus('Error: Address and ABI are required.'); setIsAbiReady(false); return;
    }
    if (!parseAndStoreAbiFunctions(contractAbi)) return; // This sets isAbiReady and abiSubmissionStatus

    setAbiSubmissionStatus('Submitting ABI to backend...'); // Overrides parse success message if any
    try {
      const res = await axios.post(\`\${BACKEND_URL}/api/contract/abi\`, { address: contractAddress, abi: contractAbi, name: contractName });
      setAbiSubmissionStatus(\`Success: \${res.data.message}\`);
      // isAbiReady is already true from parseAndStoreAbiFunctions
      fetchStoredContracts();
    } catch (error) {
      setIsAbiReady(false); // Mark ABI not ready if backend submission fails
      if (error.response) setAbiSubmissionStatus(\`Backend Error: \${error.response.data.error || 'Failed to submit ABI'}\`);
      else if (error.request) setAbiSubmissionStatus('Error: No server response during ABI submission.');
      else setAbiSubmissionStatus(\`Error: \${error.message}\`);
      console.error("Error submitting ABI to backend:", error);
    }
  };

  const handleFetchData = async () => {
    if (!contractAddress.trim() || !isAbiReady) {
      setFetchDataStatus('Error: Address and a successfully parsed ABI are required.'); return;
    }
    setFetchDataStatus('Fetching standard data...'); setContractData(null);
    try {
      const res = await axios.get(\`\${BACKEND_URL}/api/contract/data/\${contractAddress}\`);
      setContractData(res.data);
      if (res.data.data && Object.keys(res.data.data).length > 0) setFetchDataStatus('Standard data fetched.');
      else if (res.data.errors && Object.keys(res.data.errors).length > 0) setFetchDataStatus('Attempted standard fetch, some calls failed.');
      else setFetchDataStatus('No standard data found or contract does not implement common functions.');
    } catch (error) {
      setContractData(null);
      if (error.response) setFetchDataStatus(\`Error fetching standard data: \${error.response.data.error || 'Failed.'}\`);
      else if (error.request) setFetchDataStatus('Error: No server response when fetching standard data.');
      else setFetchDataStatus(\`Error: \${error.message}\`);
      console.error("Error fetching standard data:", error);
    }
  };

  const handleSelectContract = async (selectedAddress) => {
    setContractAddress(selectedAddress); setContractAbi(''); setContractName(''); resetSubmissionStates();
    setAbiSubmissionStatus(\`Loading ABI for \${selectedAddress}...\`);
    try {
        const res = await axios.get(\`\${BACKEND_URL}/api/contract/abi/\${selectedAddress}\`);
        if (res.data && res.data.abi) {
            const abiStr = typeof res.data.abi === 'string' ? res.data.abi : JSON.stringify(res.data.abi, null, 2);
            setContractAbi(abiStr); setContractName(res.data.name || '');
            if (parseAndStoreAbiFunctions(abiStr)) {
                 setAbiSubmissionStatus(\`ABI for \${selectedAddress} loaded and parsed.\`);
            } // parseAndStoreAbiFunctions sets error and isAbiReady=false if it fails
        } else {
            setAbiSubmissionStatus(\`Error: ABI data not found in response for \${selectedAddress}.\`);
            setIsAbiReady(false); setReadOnlyFunctions([]);
        }
    } catch (error) {
        setAbiSubmissionStatus(\`Error loading ABI: \${error.response?.data?.error || error.message}\`);
        setIsAbiReady(false); setReadOnlyFunctions([]);
        console.error("Error loading ABI for selected contract:", error);
    }
  };

  const handleFunctionSelect = (event) => {
    const funcId = event.target.value; // This is the function's originalIndex (id)
    setSelectedFunctionIndex(funcId);
    setFunctionInputs({});
    setGenericCallResult(null); setGenericCallStatus('');
    if (funcId !== '') {
        const selectedFunc = readOnlyFunctions.find(f => f.id.toString() === funcId);
        if (selectedFunc) {
            const initialInputs = {};
            selectedFunc.inputs.forEach((input, idx) => {
                initialInputs[input.name || \`param\${idx}\`] = '';
            });
            setFunctionInputs(initialInputs);
        }
    }
  };

  const handleFunctionInputChange = (inputName, value) => {
    setFunctionInputs(prev => ({ ...prev, [inputName]: value }));
  };

  const handleCallGenericFunction = async () => {
    if (selectedFunctionIndex === '' || !readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex)) {
      setGenericCallStatus('Error: No function selected or selected function is invalid.');
      return;
    }

    const selectedFunc = readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex);
    if (!selectedFunc) { // Should not happen if selectedFunctionIndex is valid
        setGenericCallStatus('Error: Selected function details not found.');
        return;
    }

    const argsArray = selectedFunc.inputs.map((input, idx) => {
        const inputKey = input.name || \`param\${idx}\`;
        return functionInputs[inputKey] || ''; // Default to empty string if undefined
    });

    setGenericCallStatus(\`Calling \${selectedFunc.name}...\`);
    setGenericCallResult(null);

    try {
      const response = await axios.post(\`\${BACKEND_URL}/api/contract/call/\${contractAddress}\`, {
        functionName: selectedFunc.name,
        args: argsArray,
      });
      setGenericCallResult(response.data.result);
      setGenericCallStatus(\`Call to \${selectedFunc.name} successful.\`);
    } catch (error) {
      setGenericCallResult(null);
      if (error.response && error.response.data) {
        setGenericCallStatus(\`Error calling \${selectedFunc.name}: \${error.response.data.error} - \${error.response.data.details || ''}\`);
      } else if (error.request) {
        setGenericCallStatus(\`Error: No response from server for \${selectedFunc.name} call.\`);
      } else {
        setGenericCallStatus(\`Error: \${error.message}\`);
      }
      console.error("Error calling generic function:", error);
    }
  };

  // --- JSX ---
  const currentSelectedFunction = selectedFunctionIndex !== '' ? readOnlyFunctions.find(f => f.id.toString() === selectedFunctionIndex) : null;

  return (
    <>
      <h1>PulseChain Dashboard</h1>
      <div className="card">
        <h2>Blockchain Status</h2>
        {blockError && <p style={{ color: 'red' }}>{blockError}</p>}
        {latestBlock ? <p>Latest PulseChain Block Number: <strong>{latestBlock}</strong></p> : (!blockError && <p>Loading latest block number...</p>)}
      </div>

      <div className="card">
        <h2>Stored Contracts</h2>
        {listContractsError && <p style={{ color: 'red' }}>{listContractsError}</p>}
        {storedContracts.length > 0 ? (
          <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
            {storedContracts.map(c => (
              <li key={c.address} style={{ marginBottom: '5px', padding: '5px', border: '1px solid #eee' }}>
                <strong>{c.name || 'Unnamed Contract'}</strong><br />
                <small>{c.address.slice(0,10)}...{c.address.slice(-8)}</small><br />
                <small>Added: {new Date(c.added_date).toLocaleString()}</small>
                <button onClick={()=>handleSelectContract(c.address)} style={{marginLeft: '10px', padding: '3px 6px', fontSize: '0.9em'}}>Load</button>
              </li>))}
          </ul>
        ) : (!listContractsError && <p>No contracts stored yet.</p>)}
        <button onClick={fetchStoredContracts} style={{marginTop: '10px'}}>Refresh List</button>
      </div>

      <div className="card">
        <h2>Monitor New or Update Existing Contract</h2>
        <div><label htmlFor="addrIn">Address: </label><input id="addrIn" type="text" value={contractAddress} onChange={handleAddressChange} style={{width: "calc(100% - 100px)", maxWidth: "400px"}} /></div>
        <div><label htmlFor="nameIn">Name: </label><input id="nameIn" type="text" value={contractName} onChange={handleNameChange} style={{width: "calc(100% - 100px)", maxWidth: "400px"}} /></div>
        <div><label htmlFor="abiIn">ABI (JSON): </label><textarea id="abiIn" value={contractAbi} onChange={handleAbiChange} rows={3} style={{width: "95%", display:'block', marginTop:'2px'}} /></div>
        <button onClick={handleSubmitAbi} style={{marginTop:'5px'}}>Save ABI & Parse</button>
        {abiSubmissionStatus && <p style={{color: abiSubmissionStatus.startsWith('Error:') ? 'red' : 'green', marginTop:'5px'}}>{abiSubmissionStatus}</p>}
      </div>

      {isAbiReady && (
        <>
          <div className="card">
            <h2>Standard Contract Data</h2>
            <button onClick={handleFetchData} disabled={!contractAddress}>Fetch (Name, Symbol, etc.)</button>
            {fetchDataStatus && <p style={{color: fetchDataStatus.startsWith('Error:') ? 'red' : (fetchDataStatus.includes('fetched') ? 'green' : 'black')}}>{fetchDataStatus}</p>}
            {contractData && (
              <div>
                <h3>Data for {contractData.address.slice(0,10)}...</h3>
                {contractData.data && Object.keys(contractData.data).length > 0 ? (
                  <ul>{Object.entries(contractData.data).map(([k, v]) => <li key={k}><strong>{k}:</strong> {String(v)}</li>)}</ul>
                ) : <p>No standard data retrieved for this contract.</p>}
                {contractData.errors && Object.keys(contractData.errors).length > 0 && (
                  <div><h4>Call Errors:</h4><ul>{Object.entries(contractData.errors).map(([k,v])=><li key={k} style={{color:'orange'}}><strong>{k}:</strong> {String(v)}</li>)}</ul></div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Generic Function Calls</h2>
            {readOnlyFunctions.length > 0 ? (
              <div>
                <label htmlFor="funcSelect">Select Function: </label>
                <select id="funcSelect" value={selectedFunctionIndex} onChange={handleFunctionSelect} style={{marginBottom: '10px', display:'block', maxWidth:'95%'}}>
                  <option value="">-- Select a function --</option>
                  {readOnlyFunctions.map(f => <option key={f.id} value={f.id}>{f.name}({f.inputs.map(inp=>\`\${inp.name ? inp.name+": " : ""}\${inp.type}\`).join(', ')})</option>)}
                </select>

                {currentSelectedFunction && (
                  <>
                    {currentSelectedFunction.inputs.length > 0 && (
                      <div style={{marginTop: '10px'}}>
                        <h4>Inputs for {currentSelectedFunction.name}:</h4>
                        {currentSelectedFunction.inputs.map((input, idx) => {
                          const inputKey = input.name || \`param\${idx}\`;
                          return (
                          <div key={inputKey} style={{marginBottom: '5px'}}>
                            <label htmlFor={\`dyn_input_\${inputKey}\`} style={{marginRight:"5px"}}>{input.name || \`param\${idx}\`} ({input.type}): </label>
                            <input id={\`dyn_input_\${inputKey}\`} type="text" value={functionInputs[inputKey] || ''}
                                   onChange={(e) => handleFunctionInputChange(inputKey, e.target.value)}
                                   style={{width: '50%'}} />
                          </div>
                        )})}
                      </div>
                    )}
                    <button onClick={handleCallGenericFunction} style={{marginTop: '10px'}}>Call {currentSelectedFunction.name}</button>
                  </>
                )}
                {genericCallStatus && <p style={{marginTop: '10px', whiteSpace: 'pre-wrap', color: genericCallStatus.startsWith('Error:') ? 'red' : 'green'}}>{genericCallStatus}</p>}
                {genericCallResult !== null && (
                  <div style={{marginTop: '10px'}}>
                    <h4>Result:</h4>
                    <pre style={{backgroundColor: '#f0f0f0', padding: '10px', overflowX: 'auto', wordBreak: 'break-all', whiteSpace: 'pre-wrap'}}>
                      {typeof genericCallResult === 'object' ? JSON.stringify(genericCallResult, null, 2) : String(genericCallResult)}
                    </pre>
                  </div>
                )}
              </div>
            ) : <p>No read-only functions found in ABI, or ABI not ready.</p>}
          </div>
        </>
      )}
    </>
  );
}
export default App;
