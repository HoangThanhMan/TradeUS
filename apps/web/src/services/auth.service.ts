import axios from 'axios';

const API_URL = 'http://localhost:3001/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

export const authService = {
  login: async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });
      if (response.data.access_token) {
        localStorage.setItem('accessToken', response.data.access_token);
        if (response.data.refresh_token) {
           localStorage.setItem('refreshToken', response.data.refresh_token);
        }
      }
      return response.data;
    } catch (error: any) {
      throw error.response ? error.response.data : error;
    }
  },

  register: async (email: string, password: string, username: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        password,
        username,
      });
      
      if (response.data.access_token) {
        localStorage.setItem('accessToken', response.data.access_token);
      }
      
      return response.data;
    } catch (error: any) {
      throw error.response ? error.response.data : error;
    }
  },

  getCurrentUser: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return null;

      const response = await axios.get(`${API_URL}/auth/me`, getAuthHeaders());
      return response.data;
    } catch (error: any) {
        if (error.response && error.response.status === 401) {
            authService.logout();
        }
        return null;
    }
  },

  logout: async () => {
    try {
       await axios.post(`${API_URL}/auth/logout`, {}, getAuthHeaders());
    } catch (error) {
       console.error("Logout error", error);
    } finally {
       localStorage.removeItem('accessToken');
       localStorage.removeItem('refreshToken');
       window.location.href = '/login'; 
    }
  },
  
  refreshToken: async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if(!refreshToken) throw new Error("No refresh token");
      
      const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken: refreshToken
      });
      
      if (response.data.access_token) {
        localStorage.setItem('accessToken', response.data.access_token);
      }
      return response.data;
  }
};