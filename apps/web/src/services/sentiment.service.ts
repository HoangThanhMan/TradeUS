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

/**
 * Response type from the sentiment API
 */
export interface SentimentApiResponse {
  id: string;
  title: string;
  published: string;
  link: string;
  symbol: string;
  sentiment: number;
  emotion: string;
  reason: string;
  created_at?: string;
}

/**
 * Average sentiment response type
 */
export interface AverageSentimentResponse {
  symbol: string;
  average_sentiment: number;
  total_count: number;
  days: number;
  sentiment_breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

/**
 * Collect reddit request type
 */
export interface CollectRedditRequest {
  subreddits?: string[];
  limit?: number;
  sort?: 'hot' | 'new' | 'top' | 'rising';
  analyze_immediately?: boolean;
}

/**
 * Collect yahoo request type
 */
export interface CollectYahooRequest {
  symbols?: string[];
  analyze_immediately?: boolean;
}

export const sentimentService = {
  /**
   * Get recent sentiment analyses
   * @param limit - Maximum number of results (1-100)
   * @param skip - Number of results to skip for pagination
   */
  getRecentSentiments: async (
    limit: number = 20,
    skip: number = 0,
  ): Promise<SentimentApiResponse[]> => {
    return handleApiCall(async () => {
      const response = await axios.get(`${API_URL}/sentiments`, {
        ...getAuthHeaders(),
        params: { limit, skip },
      });
      return response.data;
    });
  },

  /**
   * Get sentiment analyses by crypto symbol
   * @param symbol - Crypto trading pair (e.g., BTCUSDT)
   * @param limit - Maximum number of results
   * @param skip - Number of results to skip for pagination
   */
  getSentimentsBySymbol: async (
    symbol: string,
    limit: number = 10,
    skip: number = 0,
  ): Promise<SentimentApiResponse[]> => {
    try {
      const response = await axios.get(
        `${API_URL}/sentiments/symbol/${symbol}`,
        {
          ...getAuthHeaders(),
          params: { limit, skip },
        },
      );
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch sentiments for ${symbol}:`, error);
      throw error.response ? error.response.data : error;
    }
  },

  /**
   * Get a specific sentiment by ID
   * @param sentimentId - MongoDB document ID
   */
  getSentimentById: async (
    sentimentId: string,
  ): Promise<SentimentApiResponse> => {
    return handleApiCall(async () => {
      const response = await axios.get(
        `${API_URL}/sentiments/${sentimentId}`,
        getAuthHeaders(),
      );
      return response.data;
    });
  },

  /**
   * Get average sentiment for a symbol
   * @param symbol - Crypto trading pair
   * @param days - Number of days to calculate average
   */
  getAverageSentiment: async (
    symbol: string,
    days: number = 7,
  ): Promise<AverageSentimentResponse> => {
    return handleApiCall(async () => {
      const response = await axios.get(
        `${API_URL}/sentiments/symbol/${symbol}/average`,
        {
          ...getAuthHeaders(),
          params: { days },
        },
      );
      return response.data;
    });
  },

  /**
   * Trigger Reddit news collection
   * @param request - Collection parameters
   */
  collectReddit: async (request?: CollectRedditRequest): Promise<any> => {
    try {
      const response = await axios.post(
        `${API_URL}/collect/reddit`,
        request || {},
        getAuthHeaders(),
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to collect Reddit posts:', error);
      throw error.response ? error.response.data : error;
    }
  },

  /**
   * Trigger Yahoo Finance news collection
   * @param request - Collection parameters
   */
  collectYahoo: async (request?: CollectYahooRequest): Promise<any> => {
    try {
      const response = await axios.post(
        `${API_URL}/collect/yahoo`,
        request || {},
        getAuthHeaders(),
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to collect Yahoo news:', error);
      throw error.response ? error.response.data : error;
    }
  },

  /**
   * Get today's negative sentiment analyses
   * @param symbol - Optional crypto symbol filter
   * @param threshold - Maximum sentiment score (exclusive, default 0)
   * @param limit - Maximum number of results
   */
  getNegativeSentimentsToday: async (
    symbol?: string,
    threshold: number = 0,
    limit: number = 50,
  ): Promise<SentimentApiResponse[]> => {
    return handleApiCall(async () => {
      const response = await axios.get(
        `${API_URL}/sentiments/negative/today`,
        {
          ...getAuthHeaders(),
          params: { symbol, threshold, limit },
        },
      );
      return response.data;
    });
  },
};
