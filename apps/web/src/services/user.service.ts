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

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  name?: string;
  role: string;
  vipStatus?: string;
  vipPlan?: string;
  vipExpiry?: string;
  vipRequestedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChangePasswordData {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateProfileData {
  username?: string;
  name?: string;
}

export const userService = {
  getProfile: async (): Promise<UserProfile> => {
    const response = await axios.get(`${API_URL}/users/profile`, getAuthHeaders());
    return response.data;
  },

  updateProfile: async (data: UpdateProfileData): Promise<UserProfile> => {
    const response = await axios.put(`${API_URL}/users/profile`, data, getAuthHeaders());
    return response.data;
  },

  changePassword: async (data: ChangePasswordData): Promise<{ message: string }> => {
    const response = await axios.put(`${API_URL}/users/profile/password`, data, getAuthHeaders());
    return response.data;
  },
};
