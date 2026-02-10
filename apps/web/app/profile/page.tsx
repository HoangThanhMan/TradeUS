'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/src/components/page/Header';
import {
  userService,
  UserProfile,
  ChangePasswordData,
} from '../../src/services/user.service';
import { VipStatus } from '@tradex/shared-types';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { IconKey, IconSparkles } from '@tabler/icons-react';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Username editing
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState<ChangePasswordData>({
    oldPassword: '',
    newPassword: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      router.push('/auth');
      return;
    }

    fetchProfile();
  }, [router]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profile = await userService.getProfile();
      setUser(profile);
      setNewUsername(profile.username);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load profile');
      if (err.response?.status === 401) {
        sessionStorage.removeItem('accessToken');
        router.push('/auth');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameUpdate = async () => {
    if (!newUsername.trim() || newUsername === user?.username) {
      setIsEditingUsername(false);
      return;
    }

    try {
      setUsernameLoading(true);
      setUsernameError(null);
      const updatedUser = await userService.updateProfile({
        username: newUsername,
      });
      setUser(updatedUser);
      setIsEditingUsername(false);
      setUsernameSuccess('Username updated successfully!');

      // Update sessionStorage
      const storedUser = sessionStorage.getItem('user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        parsed.username = updatedUser.username;
        sessionStorage.setItem('user', JSON.stringify(parsed));
      }

      setTimeout(() => setUsernameSuccess(null), 3000);
    } catch (err: any) {
      setUsernameError(
        err.response?.data?.message || 'Failed to update username',
      );
    } finally {
      setUsernameLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (passwordData.newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    try {
      setPasswordLoading(true);
      await userService.changePassword(passwordData);
      setPasswordSuccess('Password changed successfully!');
      setPasswordData({ oldPassword: '', newPassword: '' });
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(null);
      }, 2000);
    } catch (err: any) {
      setPasswordError(
        err.response?.data?.message || 'Failed to change password',
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not available';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isVipActive =
    user?.vipStatus === VipStatus.ACTIVE || user?.vipStatus === 'ACTIVE';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header
          status={{ connected: true, clientId: null, instanceId: null }}
        />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 text-red-700 px-6 py-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
      <Header status={{ connected: true, clientId: null, instanceId: null }} />
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <svg
                className="w-8 h-8 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Profile Settings
                </h1>
                <div className="text-gray-500 text-sm">
                  Manage your account information and security
                </div>
              </div>
            </div>
          </div>

          {/* Account Information Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex flex-row items-center gap-2">
                <svg
                  className="w-6 h-6 text-gray-600 "
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <div>
                  <h2 className="text-[16px] font-semibold text-gray-900 ">
                    Account Information
                  </h2>{' '}
                  <p className="text-gray-500 text-[13px]">
                    Your basic account details and role information
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Username */}
              <div>
                <label className="block text-[13px] font-medium text-gray-400 mb-1">
                  Username
                </label>
                <div className="flex items-center gap-3">
                  {isEditingUsername ? (
                    <>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="flex-1 px-3 py-2 text-black text-[13px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        disabled={usernameLoading}
                      />
                      <button
                        onClick={handleUsernameUpdate}
                        disabled={usernameLoading}
                        className="px-4 py-2 bg-blue-600 text-white text-[12px] font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {usernameLoading ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingUsername(false);
                          setNewUsername(user?.username || '');
                          setUsernameError(null);
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 text-[12px] font-medium rounded-lg hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-[14px] text-gray-900 font-medium">
                        {user?.username}
                      </span>
                      <button
                        onClick={() => setIsEditingUsername(true)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                {usernameError && (
                  <p className="mt-2 text-sm text-red-600">{usernameError}</p>
                )}
                {usernameSuccess && (
                  <p className="mt-2 text-sm text-green-600">
                    {usernameSuccess}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-[13px] font-medium text-gray-400 mb-1">
                  Email
                </label>
                <div className="flex items-center gap-2 text-gray-900">
                  <svg
                    className="w-4 h-4 text-gray-900 font-medium mt-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-[14px] font-medium">{user?.email}</span>
                </div>
              </div>

              {/* Account Role */}
              <div className="flex justify-between">
                <label className="block text-[13px] font-medium text-gray-400 mb-1">
                  Account Role
                </label>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                    user?.role === 'admin'
                      ? 'bg-red-100 text-red-700 border border-red-200'
                      : isVipActive
                        ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  {user?.role === 'admin'
                    ? 'Administrator'
                    : isVipActive
                      ? 'VIP Member'
                      : 'Standard User'}
                </span>
              </div>

              {/* Member Since */}
              <div>
                <label className="block text-[13px] font-medium text-gray-400 mb-1">
                  Member Since
                </label>
                <span className="text-[13px] font-medium text-gray-900">
                  {formatDate(user?.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* VIP Membership Card - Only show for VIP members */}
          {isVipActive && (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl shadow-sm border border-yellow-200 mb-6 overflow-hidden">
              <div className="px-6 py-4 border-b border-yellow-200">
                <div className="flex flex-row items-center gap-2">
                  <svg
                    className="w-5 h-5 text-yellow-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <div>
                    <h2 className="text-[16px] font-semibold text-yellow-800">
                      VIP Membership
                    </h2>
                    <p className="text-yellow-700 text-[13px]">
                      Your VIP subscription details
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* VIP Status */}
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-yellow-800">
                    Status
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-semibold bg-green-100 text-green-700 border border-green-200">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Active
                  </span>
                </div>

                {/* VIP Plan */}
                {user?.vipPlan && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-yellow-800">
                      Plan
                    </span>
                    <span className="text-yellow-900 text-[13px] font-medium capitalize">
                      {user.vipPlan}
                    </span>
                  </div>
                )}

                {/* VIP Registration Date */}
                {user?.vipRequestedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-yellow-800">
                      Registration Date
                    </span>
                    <span className="text-yellow-900 font-medium text-[13px]">
                      {formatDate(user.vipRequestedAt)}
                    </span>
                  </div>
                )}

                {/* VIP Expiry Date */}
                {user?.vipExpiry && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px]   font-medium text-yellow-800">
                      Expiration Date
                    </span>
                    <span
                      className={`font-medium text-[13px] ${
                        new Date(user.vipExpiry) < new Date()
                          ? 'text-red-600'
                          : new Date(user.vipExpiry) <
                              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                            ? 'text-orange-600'
                            : 'text-yellow-900'
                      }`}
                    >
                      {formatDate(user.vipExpiry)}
                      {new Date(user.vipExpiry) < new Date() && ' (Expired)'}
                      {new Date(user.vipExpiry) >= new Date() &&
                        new Date(user.vipExpiry) <
                          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
                        ' (Expiring Soon)'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Upgrade to VIP Card - Only show for non-VIP and non-admin users */}
          {!isVipActive && user?.role !== 'admin' && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl shadow-sm border border-indigo-200 mb-6 overflow-hidden">
              <div className="px-6 py-5">
                <div className="flex items-center justify-between">
                  {/* Left: Icon + Text */}
                  <div className="flex flex-row items-center gap-3">
                    {/* Icon */}
                    <IconSparkles
                      size={20}
                      stroke={1.75}
                      className="text-indigo-600"
                    />

                    {/* Text */}
                    <div>
                      <h3 className="text-[16px] font-semibold text-indigo-900">
                        Upgrade to VIP
                      </h3>
                      <p className="text-indigo-700 text-[13px]">
                        Get access to exclusive features and premium tools
                      </p>
                    </div>
                  </div>

                  {/* Right: Button */}
                  <button
                    onClick={() => router.push('/vip-register')}
                    className="px-5 py-2.5 text-[13px] bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[14px] font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25 transition-all"
                  >
                    Upgrade Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Security Settings Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex flex-row items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <div>
                  <h2 className="text-[16px] font-semibold text-gray-900">
                    Security Settings
                  </h2>
                  <p className="text-gray-500 text-[13px]">
                    Manage your password and account security
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-medium text-gray-400">
                    Password
                  </h3>
                  <p className="text-[13px] text-gray-900 font-medium">
                    Last updated:{' '}
                    {user?.updatedAt
                      ? formatDate(user.updatedAt)
                      : 'Not available'}
                  </p>
                </div>
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="
    px-3 py-2 bg-blue-500 border border-gray-300
    text-gray-700 text-white text-[13px] font-medium rounded-lg
    hover:bg-blue-400 transition-colors
    flex items-center gap-2
  "
                >
                  <IconKey size={16} stroke={1.75} />
                  Change Password
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Password Change Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">
                  Change Password
                </h3>
                <p className="text-sm text-gray-500">
                  Enter your current and new password
                </p>
              </div>

              <form
                onSubmit={handlePasswordChange}
                className="px-6 py-5 space-y-4"
              >
                {passwordError && (
                  <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
                    {passwordSuccess}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.oldPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        oldPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                    disabled={passwordLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        newPassword: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                    minLength={8}
                    disabled={passwordLoading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Must be at least 8 characters
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                    disabled={passwordLoading}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordData({ oldPassword: '', newPassword: '' });
                      setConfirmPassword('');
                      setPasswordError(null);
                      setPasswordSuccess(null);
                    }}
                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                    disabled={passwordLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    disabled={passwordLoading}
                  >
                    {passwordLoading ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
