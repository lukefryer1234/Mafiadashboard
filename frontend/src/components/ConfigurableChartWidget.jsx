import React, { useState, useEffect, useCallback } from 'react';
import BasicChart from './BasicChart';

// Helper function to generate random colors
const getRandomColor = () => {
  const r = Math.floor(Math.random() * 255);
  const g = Math.floor(Math.random() * 255);
  const b = Math.floor(Math.random() * 255);
  return `rgba(${r}, ${g}, ${b}, 0.7)`;
};

const DEFAULT_DATASET = {
  id: '',
  name: '',
  contractAddress: '',
  functionName: '',
  args: '',
  dataPath: 'result.value', // Default dataPath
};

const ConfigurableChartWidget = ({ widgetId, config: initialConfigFromProps, onConfigChange, onRemove }) => {
  const [config, setConfig] = useState(() => {
    const defaultConfig = {
      chartTitle: '',
      chartType: 'bar',
      datasets: [],
    };
    if (initialConfigFromProps) {
      if (initialConfigFromProps.datasets && Array.isArray(initialConfigFromProps.datasets)) {
        // New format already
        return { ...defaultConfig, ...initialConfigFromProps };
      } else if (initialConfigFromProps.contractAddress || initialConfigFromProps.functionName) {
        // Old format, migrate
        return {
          chartTitle: initialConfigFromProps.chartTitle || '',
          chartType: initialConfigFromProps.chartType || 'bar',
          datasets: [{
            id: Date.now().toString(),
            name: initialConfigFromProps.chartTitle || 'Default Dataset', // Or derive from functionName
            contractAddress: initialConfigFromProps.contractAddress || '',
            functionName: initialConfigFromProps.functionName || '',
            args: initialConfigFromProps.args || '',
            dataPath: initialConfigFromProps.dataPath || 'result.value',
          }],
        };
      }
    }
    return defaultConfig;
  });

  const [editingDataset, setEditingDataset] = useState(null); // null or dataset object
  const [isDatasetFormVisible, setIsDatasetFormVisible] = useState(false);

  const [chartData, setChartData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Effect to update local config if prop changes (e.g., loading from storage)
  useEffect(() => {
    if (initialConfigFromProps) {
        // Basic merge, assuming new format. Add migration logic if needed.
        setConfig(prevConfig => ({
            ...prevConfig, // Keep existing if some parts are not in initialConfigFromProps
            ...initialConfigFromProps,
            datasets: initialConfigFromProps.datasets || ( (initialConfigFromProps.contractAddress || initialConfigFromProps.functionName) ? [{
                id: Date.now().toString(),
                name: initialConfigFromProps.chartTitle || 'Default Dataset',
                contractAddress: initialConfigFromProps.contractAddress || '',
                functionName: initialConfigFromProps.functionName || '',
                args: initialConfigFromProps.args || '',
                dataPath: initialConfigFromProps.dataPath || 'result.value',
            }] : [])
        }));
    }
  }, [initialConfigFromProps]);


  const handleMainConfigChange = (event) => {
    const { name, value } = event.target;
    setConfig(prevConfig => ({
      ...prevConfig,
      [name]: value,
    }));
  };

  const handleSaveCurrentConfiguration = () => {
    setError('');
    // Validate that if pie chart, only one dataset exists.
    if (config.chartType === 'pie' && config.datasets.length > 1) {
        setError('Pie charts currently support only a single dataset. Please remove extra datasets or change chart type.');
        return;
    }
    onConfigChange(widgetId, config);
    fetchData();
  };

  // --- Dataset Management Functions ---
  const handleAddNewDataset = () => {
    setEditingDataset({ ...DEFAULT_DATASET, id: Date.now().toString() });
    setIsDatasetFormVisible(true);
  };

  const handleEditDataset = (datasetToEdit) => {
    setEditingDataset({ ...datasetToEdit });
    setIsDatasetFormVisible(true);
  };

  const handleRemoveDataset = (datasetIdToRemove) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      datasets: prevConfig.datasets.filter(ds => ds.id !== datasetIdToRemove),
    }));
    // Note: Consider if fetchData should be called immediately or only on "Save Configuration"
  };

  const handleDatasetFormChange = (event) => {
    const { name, value } = event.target;
    setEditingDataset(prevDs => ({
      ...prevDs,
      [name]: value,
    }));
  };

  const handleSaveDataset = () => {
    if (!editingDataset || !editingDataset.name) {
      // Basic validation: name is required for a dataset
      alert("Dataset name is required."); // Replace with better error display if needed
      return;
    }
    setConfig(prevConfig => {
      const existingDatasetIndex = prevConfig.datasets.findIndex(ds => ds.id === editingDataset.id);
      let newDatasets;
      if (existingDatasetIndex > -1) {
        newDatasets = [...prevConfig.datasets];
        newDatasets[existingDatasetIndex] = editingDataset;
      } else {
        newDatasets = [...prevConfig.datasets, editingDataset];
      }
      return { ...prevConfig, datasets: newDatasets };
    });
    setIsDatasetFormVisible(false);
    setEditingDataset(null);
  };

  const handleCancelDatasetEdit = () => {
    setIsDatasetFormVisible(false);
    setEditingDataset(null);
  };


  const fetchData = useCallback(async () => {
    if (!config.datasets || config.datasets.length === 0) {
      setChartData(null);
      setError(config.datasets ? "No datasets configured. Please add at least one dataset." : "Configuration error: datasets array is missing.");
      return;
    }
     // Pie charts with multiple datasets are problematic with current data structure
    if (config.chartType === 'pie' && config.datasets.length > 1) {
        setError('Pie charts currently support only a single dataset for this widget. Aborting fetch.');
        setChartData(null);
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError('');
    setChartData(null);

    // For aligning data: collect all unique labels (names) from all datasets
    let allLabels = new Set();
    let allFetchedData = []; // Store results of each dataset fetch

    console.log(`Fetching data for widget ${widgetId} with new multi-dataset config:`, config);

    for (const dataset of config.datasets) {
      // Simulate API call for each dataset
      console.log(`Fetching for dataset: ${dataset.name}`);
      await new Promise(resolve => setTimeout(resolve, 200)); // Shorter delay for individual datasets

      try {
        let extractedData; // Expected format: [{ name: 'CategoryA', value: 10 }, { name: 'CategoryB', value: 20 }]
        // Simplified mock data logic for multi-dataset
        if (dataset.functionName === 'getSampleData') {
          extractedData = [
            { name: 'Alpha', value: Math.floor(Math.random() * 100) + 1 },
            { name: 'Bravo', value: Math.floor(Math.random() * 100) + 1 },
            { name: 'Charlie', value: Math.floor(Math.random() * 100) + 1 },
            { name: `Data-${dataset.name.slice(0,2)}`, value: Math.floor(Math.random() * 50) + 1}, // Unique point
          ];
        } else if (dataset.functionName === 'getAnotherSample') {
           extractedData = [
            { name: 'Alpha', value: Math.floor(Math.random() * 70) + 5 },
            { name: 'Charlie', value: Math.floor(Math.random() * 70) + 5 }, // Missing Bravo
            { name: 'Delta', value: Math.floor(Math.random() * 70) + 5 },
            { name: `Data-${dataset.name.slice(0,2)}`, value: Math.floor(Math.random() * 60) + 1},
          ];
        } else {
            extractedData = [ // Default generic data if functionName is not specific
                { name: 'Generic1', value: (Math.random() * 10 + 1).toFixed(2) },
                { name: 'Generic2', value: (Math.random() * 20 + 5).toFixed(2) },
            ];
        }

        if (!extractedData || extractedData.length === 0) {
          console.warn(`No data extracted for dataset: ${dataset.name}`);
          allFetchedData.push({ ...dataset, dataPoints: [], originalData: [] }); // Keep placeholder
          continue; // Skip if no data for this dataset
        }

        extractedData.forEach(item => allLabels.add(item.name));
        allFetchedData.push({ ...dataset, dataPoints: extractedData.map(item => ({...item, value: parseFloat(item.value) || 0})), originalData: extractedData });

      } catch (e) {
        console.error(`Error fetching or processing data for dataset ${dataset.name}:`, e);
        // Store error with dataset or handle globally
        allFetchedData.push({ ...dataset, dataPoints: [], error: e.message, originalData: [] });
      }
    }

    if (allFetchedData.length === 0) {
        setError("No data could be fetched for any dataset.");
        setIsLoading(false);
        return;
    }

    const finalLabels = Array.from(allLabels).sort(); // Sort labels for consistency
    const finalDatasets = allFetchedData.map(fetchedDs => {
      const dataMap = new Map(fetchedDs.dataPoints.map(p => [p.name, p.value]));
      const orderedData = finalLabels.map(label => dataMap.get(label) || null); // Use null for missing data points

      const color = getRandomColor();
      let datasetOutput = {
        label: fetchedDs.name || 'Unnamed Dataset',
        data: orderedData,
        borderWidth: 1,
        backgroundColor: color,
        borderColor: color.replace('0.7', '1'),
      };

      // Special handling for Pie chart (even though multi-dataset pie is discouraged)
      // If it's a pie chart, it typically uses the direct values, not aligned ones, and multiple backgroundColors
      if (config.chartType === 'pie') {
        // For pie, we use the original extracted data for THIS dataset only.
        // Labels for this specific pie segment will be its own data point names.
        // This means a multi-dataset pie chart will effectively render as multiple separate pies if not handled carefully by BasicChart or if data isn't structured for a single combined pie.
        // For now, we'll assume BasicChart will take the first dataset for a Pie Chart or needs specific pie-data structure.
        // The current fetchData logic for pie (from previous step) expects a single dataset with multiple colors.
        // Let's adapt for the first dataset if pie.
        if (fetchedDs.id === config.datasets[0].id) { // Only use first dataset for pie chart data structure
            datasetOutput.data = fetchedDs.originalData.map(item => parseFloat(item.value) || 0);
            // This specific dataset's labels for pie chart:
            // We will override finalLabels later if it's a pie chart.
            datasetOutput.backgroundColor = fetchedDs.originalData.map(() => getRandomColor());
            datasetOutput.borderColor = datasetOutput.backgroundColor.map(c => c.replace('0.7', '1'));
        }
      }
      return datasetOutput;
    });

    let chartLabels = finalLabels;
    // If pie chart, use labels from the first dataset's original data (as per current single-dataset pie logic)
    if (config.chartType === 'pie' && config.datasets.length > 0 && allFetchedData[0] && allFetchedData[0].originalData) {
        chartLabels = allFetchedData[0].originalData.map(item => item.name);
        // And ensure only the first dataset is passed, formatted for pie
         setChartData({
            labels: chartLabels,
            datasets: [finalDatasets[0]], // Pass only the first dataset, specially formatted for pie
        });
    } else {
         setChartData({
            labels: chartLabels,
            datasets: finalDatasets.filter(ds => ds.data.some(d => d !== null)), // Filter out datasets that ended up with all nulls
        });
    }

    if (finalDatasets.filter(ds => ds.data.some(d => d !== null)).length === 0 && config.chartType !== 'pie') {
        setError("All datasets resulted in empty or unalignable data.");
    }

    setIsLoading(false);
  }, [widgetId, config]); // config is a dependency


  useEffect(() => {
    // Fetch data if there are datasets and essential fields are present
    if (config.datasets && config.datasets.length > 0 && config.datasets.every(ds => ds.contractAddress && ds.functionName) && config.chartType) {
      fetchData();
    } else if (!config.datasets || config.datasets.length === 0) {
      setChartData(null); // Clear chart if no datasets
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, initialConfigFromProps]); // Re-fetch if entire config changes or initialConfigFromProps changes. fetchData is memoized with config.

  // Render Dataset Form (simplified inline for now)
  const renderDatasetForm = () => {
    if (!isDatasetFormVisible || !editingDataset) return null;

    return (
      <div className="dataset-form">
        <h5>{editingDataset.id && config.datasets.find(ds => ds.id === editingDataset.id) ? 'Edit Dataset' : 'Add New Dataset'}</h5>
        <label>Name: <input type="text" name="name" value={editingDataset.name} onChange={handleDatasetFormChange} placeholder="Dataset Name" /></label>
        <label>Contract Address: <input type="text" name="contractAddress" value={editingDataset.contractAddress} onChange={handleDatasetFormChange} placeholder="0x..." /></label>
        <label>Function Name: <input type="text" name="functionName" value={editingDataset.functionName} onChange={handleDatasetFormChange} placeholder="getSomeValue" /></label>
        <label>Arguments (comma-separated): <input type="text" name="args" value={editingDataset.args} onChange={handleDatasetFormChange} placeholder="arg1,arg2" /></label>
        <label>Data Path: <input type="text" name="dataPath" value={editingDataset.dataPath} onChange={handleDatasetFormChange} placeholder="result.value" /></label>
        <button onClick={handleSaveDataset}>Save Dataset</button>
        <button onClick={handleCancelDatasetEdit}>Cancel</button>
      </div>
    );
  };

  return (
    <div className="configurable-chart-widget">
      <h4>Widget Configuration</h4>
      <div className="widget-config-form">
        <label>
          Chart Title:
          <input
            type="text"
            name="chartTitle"
            value={config.chartTitle || ''}
            onChange={handleMainConfigChange}
            placeholder="My Awesome Chart"
          />
        </label>
        <label>
          Chart Type:
          <select name="chartType" value={config.chartType || 'bar'} onChange={handleMainConfigChange}>
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie (Single Dataset)</option>
          </select>
        </label>

        <div className="datasets-management">
          <h5>Datasets:</h5>
          {config.datasets && config.datasets.length > 0 ? (
            <ul className="datasets-list">
              {config.datasets.map(ds => (
                <li key={ds.id}>
                  <span>{ds.name} ({ds.functionName})</span>
                  <button onClick={() => handleEditDataset(ds)}>Edit</button>
                  <button onClick={() => handleRemoveDataset(ds.id)}>Remove</button>
                </li>
              ))}
            </ul>
          ) : <p>No datasets configured.</p>}
          {!isDatasetFormVisible && <button onClick={handleAddNewDataset}>Add Dataset</button>}
        </div>

        {renderDatasetForm()}

        <button onClick={handleSaveCurrentConfiguration} disabled={isLoading || isDatasetFormVisible}>
          {isLoading ? 'Loading Data...' : 'Save & Reload Chart'}
        </button>
        <button onClick={() => onRemove(widgetId)} className="remove-widget-button" disabled={isLoading}>
          Remove Widget
        </button>
      </div>

      {error && <p className="widget-error">{error}</p>}

      <div className="chart-display-area">
        {isLoading && <p>Loading chart data...</p>}
        {!isLoading && !error && chartData && chartData.datasets && chartData.datasets.length > 0 && (
          <BasicChart chartData={chartData} chartType={config.chartType} title={config.chartTitle} />
        )}
        {!isLoading && !error && (!chartData || !chartData.datasets || chartData.datasets.length === 0) && config.datasets && config.datasets.length > 0 && (
          <p>No data to display. Check configuration, data source, or ensure extracted data is not empty for all datasets.</p>
        )}
         {!isLoading && !error && (!config.datasets || config.datasets.length === 0) && (
          <p>No datasets configured. Add datasets and save to display chart.</p>
        )}
      </div>
    </div>
  );
};

export default ConfigurableChartWidget;
