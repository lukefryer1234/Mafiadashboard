import React from 'react';
import { Bar, Line, Pie } from 'react-chartjs-2'; // Added Pie
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement, // Added for Pie chart
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement, // Added for Pie chart
  Title,
  Tooltip,
  Legend
);

const BasicChart = ({ chartData, chartType = 'bar', title }) => {
  // chartData is now expected to be pre-formatted by the parent component
  // For Pie: { labels: [...], datasets: [{ data: [...], backgroundColor: [...], borderColor: [...] }] }
  // For Bar/Line: { labels: [...], datasets: [{ label: 'Dataset', data: [...] }] }

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: title || 'Chart',
        font: {
          size: 16
        }
      },
      tooltip: {
        mode: 'index', // Good for bar/line
        intersect: false,
      }
    },
  };

  const options = chartType === 'pie' ? {
    ...baseOptions,
    plugins: { // Pie charts often have slightly different tooltip/legend needs
        ...baseOptions.plugins,
        tooltip: { // For pie, 'label' or 'value' might be more common, but default is fine
            callbacks: {
                label: function(context) {
                    let label = context.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed !== null) {
                        label += context.parsed;
                        // If you want to show percentage for pie charts:
                        // const total = context.chart.data.datasets[0].data.reduce((acc, val) => acc + val, 0);
                        // const percentage = ((context.parsed / total) * 100).toFixed(2) + '%';
                        // label += ` (${percentage})`;
                    }
                    return label;
                }
            }
        }
    }
    // Scales are not used for pie charts
  } : {
    ...baseOptions,
    scales: {
      x: {
        grid: {
          display: false,
        }
      },
      y: {
        grid: {
          color: '#e0e0e0',
        },
        beginAtZero: true,
      }
    }
  };

  if (!chartData || !chartData.labels || !chartData.datasets || chartData.datasets.length === 0 || chartData.datasets[0].data.length === 0) {
    console.warn("BasicChart: Chart data is missing, improperly formatted, or contains no data points. Received:", chartData);
    return <p>Chart data is missing, improperly formatted, or contains no data points.</p>;
  }

  if (chartType === 'pie') {
    return <Pie options={options} data={chartData} />;
  } else if (chartType === 'line') {
    return <Line options={options} data={chartData} />;
  }
  // Default to bar chart
  return <Bar options={options} data={chartData} />;
};

export default BasicChart;
