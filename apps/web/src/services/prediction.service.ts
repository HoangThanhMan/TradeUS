import axios from 'axios';
import { authService } from './auth.service';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const getAuthHeaders = () => {
  const token =
    sessionStorage.getItem('accessToken') || sessionStorage.getItem('token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const handleApiCall = async (apiCall: () => Promise<any>) => {
  try {
    return await apiCall();
  } catch (error: any) {
    if (error.response?.status === 401) {
      try {
        await authService.refreshToken();
        return await apiCall();
      } catch (refreshError) {
        authService.logout();
        throw new Error('Session expired. Please login again.');
      }
    }
    throw error;
  }
};

export interface PredictionResponse {
  symbol: string;
  interval: string;
  current_price: number;
  predicted_price: number;
  price_change: number;
  price_change_percent: number;
  predicted_log_return: number;
  signal: string;
  signal_color: string;
  message: string;
  sentiment: number;
  timestamp: string;
  model_info: {
    window_size: number;
    features: string[];
    device: string;
  };
}

export interface BufferStatus {
  model_loaded: boolean;
  buffers: {
    [symbol: string]: {
      [interval: string]: {
        size: number;
        required: number;
        ready: boolean;
      };
    };
  };
}

export interface ModelInfo {
  loaded: boolean;
  window_size: number;
  feature_cols: string[];
  device: string;
  extra_info: {
    rmse?: number;
    [key: string]: unknown;
  };
}

export const predictionService = {
  /**
   * Get price prediction for a symbol and interval
   */
  getPrediction: async (
    symbol: string,
    interval: string = '1h',
  ): Promise<PredictionResponse> => {
    return handleApiCall(async () => {
      const response = await axios.get(`${API_URL}/predictions/predict`, {
        params: { symbol, interval },
        ...getAuthHeaders(),
      });
      return response.data;
    });
  },

  /**
   * Get buffer status for all symbols
   */
  getBufferStatus: async (): Promise<BufferStatus> => {
    try {
      const response = await axios.get(
        `${API_URL}/predictions/buffer-status`,
        getAuthHeaders(),
      );
      return response.data;
    } catch (error: any) {
      console.error('Buffer status API error:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Get model information
   */
  getModelInfo: async (): Promise<ModelInfo> => {
    return handleApiCall(async () => {
      const response = await axios.get(
        `${API_URL}/predictions/model-info`,
        getAuthHeaders(),
      );
      return response.data;
    });
  },

  /**
   * Get available symbols with prediction data
   */
  getAvailableSymbols: async () => {
    try {
      const response = await axios.get(
        `${API_URL}/predictions/symbols`,
        getAuthHeaders(),
      );
      return response.data;
    } catch (error: any) {
      console.error('Symbols API error:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Check prediction service health (public endpoint)
   */
  healthCheck: async () => {
    try {
      const response = await axios.get(`${API_URL}/predictions/health`);
      return response.data;
    } catch (error: any) {
      console.error('Health check error:', error);
      throw error.response?.data || error;
    }
  },
};
