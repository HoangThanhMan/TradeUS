'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/src/components/page/Header';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { UserRole, VipPlan } from '@tradex/shared-types';
import {
  IconQrcode,
  IconUserCheck,
  IconRefresh,
  IconCheck,
  IconX,
  IconSettings,
  IconMail,
  IconCalendar,
  IconCrown,
  IconEye,
} from '@tabler/icons-react';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Vietnamese banks list
const BANKS = [
  { id: 'VCB', name: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)' },
  { id: 'TCB', name: 'Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)' },
  { id: 'MB', name: 'Ngân hàng TMCP Quân Đội (MB Bank)' },
  { id: 'VPB', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)' },
  { id: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)' },
  { id: 'TPB', name: 'Ngân hàng TMCP Tiên Phong (TPBank)' },
  { id: 'STB', name: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)' },
  { id: 'HDB', name: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)' },
  { id: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam (VIB)' },
  { id: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)' },
  { id: 'CTG', name: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)' },
  { id: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)' },
  { id: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)' },
  { id: 'OCB', name: 'Ngân hàng TMCP Phương Đông (OCB)' },
  { id: 'LPB', name: 'Ngân hàng TMCP Bưu điện Liên Việt (LienVietPostBank)' },
];

const QR_TEMPLATES = [
  { id: 'compact', name: 'Compact - Simple' },
  { id: 'compact2', name: 'Compact2 - Full information' },
  { id: 'qr_only', name: 'QR Only' },
  { id: 'print', name: 'Print - For printing' },
];

interface QrConfig {
  _id?: string;
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  template: string;
  monthlyPrice: number;
  yearlyPrice: number;
}

interface VipRequest {
  _id: string;
  userId: string;
  username: string;
  email: string;
  plan: VipPlan;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note?: string;
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'qr-config' | 'approve-payments'>(
    'qr-config',
  );

  // QR Config State
  const [qrConfig, setQrConfig] = useState<QrConfig>({
    bankId: 'CTG',
    bankName: 'Ngân hàng TMCP Công Thương Việt Nam (VietinBank)',
    accountNo: '',
    accountName: '',
    template: 'compact2',
    monthlyPrice: 99000,
    yearlyPrice: 990000,
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // VIP Requests State
  const [vipRequests, setVipRequests] = useState<VipRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      const token =
        sessionStorage.getItem('accessToken') ||
        sessionStorage.getItem('token');
      const userData = sessionStorage.getItem('user');

      if (!token || !userData) {
        router.push('/auth');
        return;
      }

      try {
        const parsedUser = JSON.parse(userData);

        // Check if user is admin
        if (parsedUser.role !== UserRole.ADMIN) {
          router.push('/dashboard');
          return;
        }

        setUser(parsedUser);

        // Load QR config
        await loadQrConfig(token);

        // Load pending requests
        await loadVipRequests(token);
      } catch (err) {
        console.error('Error:', err);
        router.push('/auth');
      } finally {
        setIsLoading(false);
      }
    };

    checkAdmin();
  }, [router]);

  const loadQrConfig = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/admin/qr-config`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const text = await response.text();

        if (!text || text.trim() === '') {
          console.log('No existing QR config, using defaults');
          return;
        }

        try {
          const config = JSON.parse(text);
          if (config) {
            setQrConfig((prev) => ({ ...prev, ...config }));
          }
        } catch (parseError) {
          console.error('Error parsing QR config JSON:', parseError);
        }
      }
    } catch (err) {
      console.error('Failed to load QR config:', err);
    }
  };

  const loadVipRequests = async (token: string) => {
    setIsLoadingRequests(true);
    try {
      const response = await fetch(
        `${API_URL}/admin/vip-requests?status=pending`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setVipRequests(Array.isArray(data) ? data : data.requests || []);
      }
    } catch (err) {
      console.error('Failed to load VIP requests:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const handleSaveConfig = async () => {
    const token =
      sessionStorage.getItem('accessToken') || sessionStorage.getItem('token');
    if (!token) return;

    setIsSavingConfig(true);
    try {
      // Only send the exact fields expected by the API DTO
      const configPayload = {
        bankId: qrConfig.bankId,
        bankName: qrConfig.bankName,
        accountNo: qrConfig.accountNo,
        accountName: qrConfig.accountName,
        template: qrConfig.template,
        monthlyPrice: qrConfig.monthlyPrice,
        yearlyPrice: qrConfig.yearlyPrice,
      };
      const response = await fetch(`${API_URL}/admin/qr-config`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configPayload),
      });

      if (response.ok) {
        alert('Configuration saved successfully!');
      } else {
        const errorData = await response.text();
        console.error('Save config failed:', response.status, errorData);
        alert('Failed to save configuration');
      }
    } catch (err) {
      console.error('Error saving config:', err);
      alert('Error saving configuration');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    const token =
      sessionStorage.getItem('accessToken') || sessionStorage.getItem('token');
    if (!token) return;

    setProcessingId(requestId);
    try {
      const response = await fetch(
        `${API_URL}/admin/vip-requests/${requestId}/approve`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        setVipRequests((prev) => prev.filter((r) => r._id !== requestId));
      } else {
        alert('Failed to approve request');
      }
    } catch (err) {
      console.error('Error approving:', err);
      alert('Error approving request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    const token =
      sessionStorage.getItem('accessToken') || sessionStorage.getItem('token');
    if (!token) return;

    const note = prompt('Reason for rejection (optional):');

    setProcessingId(requestId);
    try {
      const response = await fetch(
        `${API_URL}/admin/vip-requests/${requestId}/reject`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ note }),
        },
      );

      if (response.ok) {
        setVipRequests((prev) => prev.filter((r) => r._id !== requestId));
      } else {
        alert('Failed to reject request');
      }
    } catch (err) {
      console.error('Error rejecting:', err);
      alert('Error rejecting request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBankChange = (bankId: string) => {
    const bank = BANKS.find((b) => b.id === bankId);
    setQrConfig((prev) => ({
      ...prev,
      bankId,
      bankName: bank?.name || '',
    }));
  };

  const generateQrUrl = (plan: 'monthly' | 'yearly') => {
    const amount =
      plan === 'monthly' ? qrConfig.monthlyPrice : qrConfig.yearlyPrice;
    return `https://img.vietqr.io/image/${qrConfig.bankId}-${qrConfig.accountNo}-${qrConfig.template}.png?amount=${amount}&addInfo=TRADEX VIP ${plan}&accountName=${encodeURIComponent(qrConfig.accountName)}`;
  };

  if (isLoading) {
    return (
      <div
        className={`min-h-screen bg-gray-50 flex items-center justify-center ${pjs.className}`}
      >
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
      <Header status={{ connected: true, clientId: null, instanceId: null }} />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center">
            <IconSettings className="w-8 h-8 text-gray-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Admin Dashboard
            </h1>
            <p className="text-gray-500 text-sm">
              Manage QR code configuration and approve VIP payments
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('qr-config')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
              activeTab === 'qr-config'
                ? 'border-gray-800 text-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <IconQrcode className="w-4 h-4" />
            QR Code Configuration
          </button>
          <button
            onClick={() => setActiveTab('approve-payments')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
              activeTab === 'approve-payments'
                ? 'border-gray-800 text-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <IconUserCheck className="w-4 h-4" />
            Approve Payments
            {vipRequests.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {vipRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* QR Config Tab */}
        {activeTab === 'qr-config' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-6">
              <IconQrcode className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-gray-800">
                VietQR Configuration
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Form */}
              <div className="space-y-4 text-black">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank
                  </label>
                  <select
                    value={qrConfig.bankId}
                    onChange={(e) => handleBankChange(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    {BANKS.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={qrConfig.accountNo}
                    onChange={(e) =>
                      setQrConfig((prev) => ({
                        ...prev,
                        accountNo: e.target.value,
                      }))
                    }
                    placeholder="Enter account number"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    QR Template
                  </label>
                  <select
                    value={qrConfig.template}
                    onChange={(e) =>
                      setQrConfig((prev) => ({
                        ...prev,
                        template: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    {QR_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={qrConfig.accountName}
                    onChange={(e) =>
                      setQrConfig((prev) => ({
                        ...prev,
                        accountName: e.target.value,
                      }))
                    }
                    placeholder="e.g., TradeX"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monthly Plan (VND)
                    </label>
                    <input
                      type="number"
                      value={qrConfig.monthlyPrice}
                      onChange={(e) =>
                        setQrConfig((prev) => ({
                          ...prev,
                          monthlyPrice: Number(e.target.value),
                        }))
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Yearly Plan (VND)
                    </label>
                    <input
                      type="number"
                      value={qrConfig.yearlyPrice}
                      onChange={(e) =>
                        setQrConfig((prev) => ({
                          ...prev,
                          yearlyPrice: Number(e.target.value),
                        }))
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column - QR Preview */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <IconEye className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">
                    QR Code Preview
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700 mb-2">
                      Monthly Plan
                    </p>
                    <div className="bg-gray-50 rounded-xl p-3">
                      {qrConfig.accountNo ? (
                        <img
                          src={generateQrUrl('monthly')}
                          alt="Monthly QR"
                          className="w-full aspect-square object-contain"
                        />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center text-gray-400 text-xs">
                          Enter account number to preview
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-bold text-blue-600 mt-2">
                      {(qrConfig.monthlyPrice ?? 0).toLocaleString()} VND
                    </p>
                  </div>

                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-700 mb-2">
                      Yearly Plan
                    </p>
                    <div className="bg-gray-50 rounded-xl p-3">
                      {qrConfig.accountNo ? (
                        <img
                          src={generateQrUrl('yearly')}
                          alt="Yearly QR"
                          className="w-full aspect-square object-contain"
                        />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center text-gray-400 text-xs">
                          Enter account number to preview
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-bold text-yellow-600 mt-2">
                      {(qrConfig.yearlyPrice ?? 0).toLocaleString()} VND
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-6 pt-6 text-[13px] border-t border-gray-100">
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {isSavingConfig ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <IconCheck className="w-4 h-4" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Approve Payments Tab */}
        {activeTab === 'approve-payments' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <IconUserCheck className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-bold text-gray-800">
                  Pending Payments
                </h2>
              </div>
              <button
                onClick={() => {
                  const token =
                    sessionStorage.getItem('accessToken') ||
                    sessionStorage.getItem('token');
                  if (token) loadVipRequests(token);
                }}
                disabled={isLoadingRequests}
                className="flex items-center gap-2 px-2 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-[14px]"
              >
                <IconRefresh
                  className={`w-4 h-4 ${isLoadingRequests ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            {isLoadingRequests ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
              </div>
            ) : vipRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <IconUserCheck className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500">No pending payment requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {vipRequests.map((request) => (
                  <div
                    key={request._id}
                    className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        {/* User Icon */}
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-600 font-semibold">
                            {request.username?.charAt(0).toUpperCase() || 'U'}
                          </span>
                        </div>

                        {/* User Info */}
                        <div>
                          <h3 className="font-bold text-gray-800">
                            {request.username}
                          </h3>
                          <div className="flex items-center gap-1 text-gray-500 text-sm mt-0.5">
                            <IconMail className="w-3.5 h-3.5" />
                            {request.email}
                          </div>
                          <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                            <IconCalendar className="w-3.5 h-3.5" />
                            {new Date(request.createdAt).toLocaleString(
                              'en-US',
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Amount & Plan */}
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-800">
                          $ {request.amount.toLocaleString()}{' '}
                          <span className="text-sm font-normal">VND</span>
                        </p>
                        <div className="flex font-semibold items-center gap-1 text-yellow-500 text-[13px] mt-1 justify-end">
                          <IconCrown className="w-3.5 h-3.5" />
                          Plan: {request.plan}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          VIP {request.plan.toUpperCase()} plan upgrade
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 ml-6">
                        <button
                          onClick={() => handleApprove(request._id)}
                          disabled={processingId === request._id}
                          className="flex items-center gap-1.5 px-2 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors text-[12px] disabled:opacity-50"
                        >
                          <IconCheck className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(request._id)}
                          disabled={processingId === request._id}
                          className="flex items-center justify-center gap-1.5 px-2 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-[12px] disabled:opacity-50"
                        >
                          <IconX className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
