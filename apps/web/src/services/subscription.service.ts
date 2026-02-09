import axios from 'axios';

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

export interface Subscription {
  _id: string;
  user_id: string;
  symbol: string;
  created_at: string;
}

export const subscriptionService = {
  subscribe: async (userId: string, symbol: string) => {
    const response = await axios.post(
      `${API_URL}/subscriptions`,
      { user_id: userId, symbol },
      getAuthHeaders(),
    );
    return response.data;
  },

  unsubscribe: async (userId: string, symbol: string) => {
    const response = await axios.delete(`${API_URL}/subscriptions`, {
      ...getAuthHeaders(),
      params: { user_id: userId, symbol },
    });
    return response.data;
  },

  getUserSubscriptions: async (userId: string) => {
    const response = await axios.get(
      `${API_URL}/subscriptions/user/${userId}`,
      getAuthHeaders(),
    );
    return response.data;
  },

  checkSubscription: async (userId: string, symbol: string) => {
    const response = await axios.get(`${API_URL}/subscriptions/check`, {
      ...getAuthHeaders(),
      params: { user_id: userId, symbol },
    });
    return response.data;
  },
};
