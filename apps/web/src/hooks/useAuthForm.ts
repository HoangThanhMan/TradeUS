'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface UseAuthFormOptions {
  redirectTo?: string;
}

export function useAuthForm(options: UseAuthFormOptions = {}) {
  const { redirectTo = '/dashboard' } = options;
  const router = useRouter();
  const { login, register, error, clearError, isLoading } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const updateField = useCallback((field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when user types
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
    clearError();
  }, [validationErrors, clearError]);

  const validateLogin = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateRegister = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.username) {
      errors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      errors.username = 'Username can only contain letters, numbers, underscores and hyphens';
    }
    
    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    if (!validateLogin()) return;
    
    try {
      await login({
        email: formData.email,
        password: formData.password,
      });
      router.push(redirectTo);
    } catch {
      // Error is handled by AuthContext
    }
  };

  const handleRegister = async () => {
    if (!validateRegister()) return;
    
    try {
      await register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
      });
      router.push(redirectTo);
    } catch {
      // Error is handled by AuthContext
    }
  };

  const resetForm = useCallback(() => {
    setFormData({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    });
    setValidationErrors({});
    clearError();
  }, [clearError]);

  return {
    formData,
    updateField,
    validationErrors,
    apiError: error,
    isLoading,
    handleLogin,
    handleRegister,
    resetForm,
  };
}
