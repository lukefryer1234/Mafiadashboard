import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const ERC721_ABI = [ // For checking ownership of a specific token ID
  "function ownerOf(uint256 tokenId) view returns (address)",
];

const ERC1155_ABI = [ // For checking balance of a specific token ID for an owner
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

const GameAssetWidget = ({ widgetId, initialConfig, onConfigChange, onRemove }) => {
  const [config, setConfig] = useState(initialConfig || {
    contractAddress: '',
    tokenId: '',
    assetName: 'My Game Asset',
  });
  const [assetData, setAssetData] = useState(null); // { balance, symbol, decimals, isOwner }
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userAddress, setUserAddress] = useState('');

  useEffect(() => {
    if (initialConfig) {
      setConfig(prevConfig => ({ ...prevConfig, ...initialConfig }));
    }
  }, [initialConfig]);

  const getCurrentUserAddress = async (provider) => {
    if (userAddress) return userAddress;
    try {
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setUserAddress(address);
      return address;
    } catch (e) {
      console.error("Error getting user address:", e);
      setError("Could not get user address from wallet.");
      return null;
    }
  };

  const fetchAssetData = useCallback(async () => {
    if (!config.contractAddress || !config.assetName) {
      setAssetData(null);
      // setError("Contract address and asset name are required."); // Don't show error for partial config
      return;
    }
    if (typeof window.ethereum === 'undefined') {
      setError('MetaMask (or another Ethereum wallet) is not installed.');
      return;
    }

    setIsLoading(true);
    setError('');
    setAssetData(null);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const currentAddress = await getCurrentUserAddress(provider);
      if (!currentAddress) {
        setIsLoading(false);
        return; // Error already set by getCurrentUserAddress
      }

      const contract = new ethers.Contract(config.contractAddress, [], provider); // Abi will be set later

      if (config.tokenId) { // Likely ERC721 or ERC1155
        const tokenIdNum = ethers.getBigInt(config.tokenId);
        let balance = BigInt(0);
        let isOwner = false;

        // Try ERC1155 first (balanceOf(address,id))
        try {
          const erc1155Contract = contract.connect(provider).attach(config.contractAddress).connect(null).withABI(ERC1155_ABI);
          balance = await erc1155Contract.balanceOf(currentAddress, tokenIdNum);
          setAssetData({ balance: balance.toString(), type: 'ERC1155' });
        } catch (e1155) {
          console.warn("ERC1155 balanceOf(address,id) call failed, trying ERC721 ownerOf:", e1155.message);
          // Try ERC721 (ownerOf(tokenId))
          try {
            const erc721Contract = contract.connect(provider).attach(config.contractAddress).connect(null).withABI(ERC721_ABI);
            const owner = await erc721Contract.ownerOf(tokenIdNum);
            isOwner = owner.toLowerCase() === currentAddress.toLowerCase();
            setAssetData({ isOwner, balance: isOwner ? '1' : '0', type: 'ERC721' });
          } catch (e721) {
            console.error("Error fetching ERC721/ERC1155 data:", e721);
            setError(`Failed to fetch token data. Ensure address is correct and supports ERC721/ERC1155 standards. (${e721.message})`);
            setAssetData(null);
          }
        }
      } else { // Likely ERC20
        const erc20Contract = contract.connect(provider).attach(config.contractAddress).connect(null).withABI(ERC20_ABI);
        const balanceRaw = await erc20Contract.balanceOf(currentAddress);
        let decimals = 18; // Default
        let symbol = 'Tokens';
        try {
          decimals = await erc20Contract.decimals();
        } catch (e) { console.warn("Could not fetch decimals, using default 18."); }
        try {
          symbol = await erc20Contract.symbol();
        } catch (e) { console.warn("Could not fetch symbol, using default 'Tokens'."); }

        setAssetData({
          balance: ethers.formatUnits(balanceRaw, Number(decimals)),
          symbol,
          decimals: Number(decimals),
          type: 'ERC20'
        });
      }
    } catch (err) {
      console.error('Error fetching asset data:', err);
      setError(`Failed to fetch asset data: ${err.message}`);
      setAssetData(null);
    } finally {
      setIsLoading(false);
    }
  }, [config, userAddress]); // Added userAddress

  useEffect(() => {
    if (config.contractAddress && config.assetName) {
      fetchAssetData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.contractAddress, config.assetName, config.tokenId]); // Removed fetchAssetData from deps, config covers it.

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setConfig(prevConfig => ({
      ...prevConfig,
      [name]: value,
    }));
  };

  const handleSaveConfiguration = () => {
    onConfigChange(config); // Pass the current component's config state
    fetchAssetData(); // Re-fetch data after saving
  };

  return (
    <div className="game-asset-widget card">
      <h4>Game Asset: {config.assetName || "Not Set"}</h4>
      <div className="widget-config-form">
        <label>
          Asset Name/Label:
          <input
            type="text"
            name="assetName"
            value={config.assetName}
            onChange={handleInputChange}
            placeholder="e.g., My Game Tokens"
          />
        </label>
        <label>
          Token Contract Address:
          <input
            type="text"
            name="contractAddress"
            value={config.contractAddress}
            onChange={handleInputChange}
            placeholder="0x..."
          />
        </label>
        <label>
          Token ID (Optional - for NFT/ERC1155):
          <input
            type="text"
            name="tokenId"
            value={config.tokenId}
            onChange={handleInputChange}
            placeholder="e.g., 123"
          />
        </label>
        <button onClick={handleSaveConfiguration} disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save & Refresh Data'}
        </button>
      </div>

      {isLoading && <p>Loading asset data...</p>}
      {error && <p className="widget-error">{error}</p>}

      {assetData && !isLoading && !error && (
        <div className="asset-display">
          <h5>{config.assetName}</h5>
          {assetData.type === 'ERC20' && (
            <p>Balance: {assetData.balance} {assetData.symbol}</p>
          )}
          {assetData.type === 'ERC1155' && (
            <p>Balance (ID: {config.tokenId}): {assetData.balance}</p>
          )}
          {assetData.type === 'ERC721' && (
            <p>Ownership (ID: {config.tokenId}): {assetData.isOwner ? `You own this NFT (${userAddress.slice(0,6)}...)` : 'You do not own this NFT'}</p>
          )}
        </div>
      )}
      {!assetData && !isLoading && !error && config.contractAddress && (
        <p>No data to display. Ensure configuration is correct and wallet is connected.</p>
      )}
       <button onClick={() => onRemove(widgetId)} className="remove-widget-button" style={{marginTop: '10px'}} disabled={isLoading}>
        Remove Widget
      </button>
    </div>
  );
};

export default GameAssetWidget;
