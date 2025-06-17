import React from 'react';
import { Bar, Line } from 'react-chartjs-2'; // Added Line for potential future use
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement, // Added for Line chart
  PointElement, // Added for Line chart
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
  Title,
  Tooltip,
  Legend
);

const BasicChart = ({ chartData, chartType = 'bar', title }) => {
  // chartData is now expected to be pre-formatted by the parent component
  // in the structure: { labels: [...], datasets: [{ label: 'Dataset', data: [...] }] }

  const options = {
    responsive: true,
    maintainAspectRatio: true, // Maintain aspect ratio, can be false if specific height/width is set by container
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
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      x: {
        grid: {
          display: false, // Cleaner look
        }
      },
      y: {
        grid: {
          color: '#e0e0e0', // Lighter grid lines
        },
        beginAtZero: true,
      }
    }
  };

  if (!chartData || !chartData.labels || !chartData.datasets || chartData.datasets.length === 0) {
    console.warn("BasicChart: Chart data is missing or improperly formatted. Received:", chartData);
    return <p>Chart data is missing, improperly formatted, or contains no datasets.</p>;
  }

  if (chartType === 'line') {
    return <Line options={options} data={chartData} />;
  }
  // Default to bar chart
  return <Bar options={options} data={chartData} />;
};

export default BasicChart;
