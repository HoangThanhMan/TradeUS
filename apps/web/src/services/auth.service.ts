import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

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
      if (response.data.accessToken) {
        localStorage.setItem('accessToken', response.data.accessToken);
        if (response.data.refreshToken) {
           localStorage.setItem('refreshToken', response.data.refreshToken);
        }
      }
      return response.data;
    } catch (error: any) {
      // Extract error message properly
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || errorData?.error || 'Login failed. Please check your credentials.';
      throw new Error(errorMessage);
    }
  },

  register: async (email: string, password: string, username: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        password,
        username,
      });
      
      if (response.data.accessToken) {
        localStorage.setItem('accessToken', response.data.accessToken);
      }
      
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || errorData?.error || 'Registration failed. Please try again.';
      throw new Error(errorMessage);
    }
  },

  getCurrentUser: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return null;

      const response = await axios.get(`${API_URL}/users/profile`, getAuthHeaders());
      return response.data;
    } catch (error: any) {
        if (error.response && error.response.status === 401) {
            authService.logout();
        }
        return null;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth'; 
  },
  
  refreshToken: async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if(!refreshToken) throw new Error("No refresh token");
      
      const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken: refreshToken
      });
      
      if (response.data.accessToken) {
        localStorage.setItem('accessToken', response.data.accessToken);
      }
      return response.data;
  }
};