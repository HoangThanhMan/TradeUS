'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VipStatus, VipPlan } from '@tradex/shared-types';
import { Header } from '@/src/components/page/Header';
import { Plus_Jakarta_Sans } from 'next/font/google';
import {
  IconStar,
  IconCalendar,
  IconCheck,
  IconGift,
  IconCrown,
  IconSparkles,
} from '@tabler/icons-react';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const DEFAULT_PLANS = {
  [VipPlan.MONTHLY]: {
    id: VipPlan.MONTHLY,
    name: 'VIP Monthly',
    price: 99000,
    priceDisplay: '99.000',
    duration: '1 month',
    features: [
      'Unlimited access to all charts',
      'Backtest with full historical data',
      'Real-time alerts and notifications',
      'Priority technical support',
      'Export detailed reports',
      'API access for trading bot',
    ],
  },
  [VipPlan.YEARLY]: {
    id: VipPlan.YEARLY,
    name: 'VIP Yearly',
    price: 990000,
    priceDisplay: '990.000',
    duration: '12 months',
    popular: true,
    savings: '2 months free!',
    features: [
      'All VIP Monthly features',
      'Save 16% compared to monthly plan',
      'Advanced AI analysis',
      'Investment strategy consultation',
      'Exclusive monthly webinars',
      'Copy trading from professional traders',
    ],
  },
};

interface QrConfig {
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  template: string;
  monthlyPrice: number;
  yearlyPrice: number;
}

export default function VipRegisterPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<VipPlan | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [qrConfig, setQrConfig] = useState<QrConfig | null>(null);
  const [plans, setPlans] = useState(DEFAULT_PLANS);

  useEffect(() => {
    const fetchData = async () => {
      const token =
        sessionStorage.getItem('accessToken') ||
        sessionStorage.getItem('token');

      if (!token) {
        router.push('/auth');
        return;
      }

      try {
        // Fetch user profile first
        const userResponse = await fetch(`${API_URL}/users/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!userResponse.ok) {
          // Chỉ redirect sang /auth nếu 401
          if (userResponse.status === 401) {
            sessionStorage.removeItem('accessToken');
            sessionStorage.removeItem('token');
            router.push('/auth');
            return;
          }
          throw new Error('Failed to fetch profile');
        }

        const userData = await userResponse.json();
        setUser(userData);

        // Update sessionStorage with fresh user data
        sessionStorage.setItem('user', JSON.stringify(userData));

        // Fetch QR config (may fail if not configured - that's OK)
        try {
          const configResponse = await fetch(`${API_URL}/vip/config`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (configResponse.ok) {
            const configText = await configResponse.text();
            // Chỉ parse JSON nếu có data
            if (configText && configText !== 'null') {
              const config = JSON.parse(configText);
              if (config && config.monthlyPrice) {
                setQrConfig(config);
                // Update plans with actual prices
                setPlans({
                  [VipPlan.MONTHLY]: {
                    ...DEFAULT_PLANS[VipPlan.MONTHLY],
                    price: config.monthlyPrice,
                    priceDisplay: config.monthlyPrice.toLocaleString(),
                  },
                  [VipPlan.YEARLY]: {
                    ...DEFAULT_PLANS[VipPlan.YEARLY],
                    price: config.yearlyPrice,
                    priceDisplay: config.yearlyPrice.toLocaleString(),
                  },
                });
              }
            }
          }
        } catch (configErr) {
          // Ignore config errors - just use default plans
          console.warn('Could not fetch QR config, using defaults');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        // Không redirect sang /auth nữa - giữ user ở trang này
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (isLoading) {
    return (
      <div
        className={`min-h-screen bg-gray-50 flex items-center justify-center ${pjs.className}`}
      >
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  // Interface when already VIP
  if (user?.vipStatus === VipStatus.ACTIVE) {
    return (
      <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
        <Header
          status={{ connected: true, clientId: null, instanceId: null }}
        />
        <div className="flex items-center justify-center p-8 pt-20">
          <div className="bg-white p-10 rounded-2xl shadow-lg max-w-md w-full text-center border border-green-200">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <IconCrown className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-green-600 mb-2">
              You are a VIP Member!
            </h1>
            <p className="text-gray-500 mb-6">
              Thank you for being with Trade-X.
            </p>

            <div className="bg-gray-50 p-4 rounded-xl mb-6">
              <p className="text-sm text-gray-500">Expiry Date:</p>
              <p className="text-xl font-bold text-gray-800">
                {user.vipExpiry
                  ? new Date(user.vipExpiry).toLocaleDateString('en-US')
                  : 'Lifetime'}
              </p>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold py-3 rounded-xl transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pending status
  if (user?.vipStatus === VipStatus.PENDING) {
    return (
      <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
        <Header
          status={{ connected: true, clientId: null, instanceId: null }}
        />
        <div className="flex items-center justify-center p-8 pt-20">
          <div className="bg-white p-10 rounded-2xl shadow-lg max-w-md w-full text-center border border-yellow-200">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <IconSparkles className="w-10 h-10 text-yellow-600" />
            </div>
            <h1 className="text-xl font-bold text-yellow-600 mb-2">
              Payment Pending Approval
            </h1>
            <p className="text-gray-500 text-[14px] mb-6">
              Your request has been submitted. Admin will verify and activate
              your account within 24 hours.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-gray-200 hover:bg-gray-300 text-[16px] text-gray-800 font-semibold py-3 rounded-xl transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSelectPlan = (planId: VipPlan) => {
    setSelectedPlan(planId);
    setShowPayment(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedPlan) return;

    const token =
      sessionStorage.getItem('accessToken') || sessionStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(`${API_URL}/vip/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: selectedPlan }),
      });

      if (response.ok) {
        setUser({
          ...user,
          vipStatus: VipStatus.PENDING,
          vipPlan: selectedPlan,
        });
        sessionStorage.setItem(
          'user',
          JSON.stringify({
            ...user,
            vipStatus: VipStatus.PENDING,
            vipPlan: selectedPlan,
          }),
        );
        setShowPayment(false);
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to submit VIP request');
      }
    } catch (err) {
      console.error('Error submitting VIP request:', err);
      alert('Error submitting request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const bankInfo = qrConfig || {
    bankId: 'MB',
    accountNo: '0000123456789',
    accountName: 'TRADE X ADMIN',
    template: 'compact',
  };

  const qrUrl = selectedPlan
    ? `https://img.vietqr.io/image/${bankInfo.bankId}-${bankInfo.accountNo}-${bankInfo.template}.png?amount=${plans[selectedPlan].price}&addInfo=TRADEX VIP ${user?.username || user?.email} ${selectedPlan}`
    : '';

  // Payment modal
  if (showPayment && selectedPlan) {
    return (
      <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
        <Header
          status={{ connected: true, clientId: null, instanceId: null }}
        />
        <div className="flex items-center justify-center p-8 pt-12">
          <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full">
            <button
              onClick={() => setShowPayment(false)}
              className="text-gray-400 hover:text-gray-600 mb-4"
            >
              ← Back to plans
            </button>

            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Complete Payment
            </h2>
            <p className="text-gray-500 mb-6">
              Scan QR code to pay for {plans[selectedPlan].name}
            </p>

            <div className="bg-gray-50 p-4 rounded-xl mb-6 flex justify-center">
              <img
                src={qrUrl}
                alt="VietQR Payment"
                className="w-56 h-56 object-contain"
              />
            </div>

            <div className="space-y-3 mb-6 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Bank:</span>
                <span className="font-semibold text-gray-800">
                  {qrConfig?.bankName || bankInfo.bankId}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Account Number:</span>
                <span className="font-semibold text-gray-800">
                  {bankInfo.accountNo}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Account Name:</span>
                <span className="font-semibold text-gray-800">
                  {bankInfo.accountName}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Amount:</span>
                <span className="font-bold text-yellow-600 text-lg">
                  {plans[selectedPlan].priceDisplay} VND
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-6">
              * Please do not modify the transfer content for automatic
              recognition.
            </p>

            <button
              onClick={handleConfirmPayment}
              disabled={isProcessing}
              className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold py-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-800"></div>
                  Processing...
                </>
              ) : (
                <>
                  <IconCheck className="w-5 h-5" />
                  Confirm Payment
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main VIP selection page
  return (
    <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
      <Header status={{ connected: true, clientId: null, instanceId: null }} />

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Title Section */}
        <div className="text-center mb-7">
          <div className="flex items-center justify-center gap-2 mb-2">
            <IconSparkles className="w-8 h-8 text-yellow-500 fill-yellow-500" />
            <h1 className="text-[25px] font-bold text-gray-800">
              Upgrade to VIP
            </h1>
            <IconSparkles className="w-8 h-8 text-yellow-500 fill-yellow-500" />
          </div>
          <p className="text-gray-500 text-[17px]">
            Unlock all premium features and become a professional trader
          </p>
        </div>

        {/* Current Account Status */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-10 max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-3 text-gray-600 text-[15px]">
            <span>
              Current account of{' '}
              <span className="font-semibold text-gray-900">
                {user?.username || user?.email}
              </span>
              :
            </span>

            <span className="flex items-center gap-2 font-semibold text-gray-700">
              <IconCalendar className="w-5 h-5 text-gray-400" />
              Free Plan
            </span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Monthly Plan */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 relative flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <IconSparkles className="w-5 h-5 text-indigo-500" />
              <h3 className="text-xl font-bold text-gray-800">
                {plans[VipPlan.MONTHLY].name}
              </h3>
            </div>

            <div className="min-h-[72px] pt-5">
              <span className="text-4xl font-bold text-blue-600">
                {plans[VipPlan.MONTHLY].priceDisplay}
              </span>
              <span className="text-gray-500 ml-1">
                VND/{plans[VipPlan.MONTHLY].duration}
              </span>
            </div>

            <ul className="space-y-3 mb-8">
              {plans[VipPlan.MONTHLY].features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-gray-600">
                  <IconCheck className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSelectPlan(VipPlan.MONTHLY)}
              className="mt-auto text-[15px] w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <IconSparkles className="w-5 h-5" />
              Select monthly plan
            </button>
          </div>

          {/* Yearly Plan */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 relative flex flex-col">
            {/* Most Popular Badge */}
            <div className="absolute -top-3 right-6">
              <span className="bg-yellow-400 text-gray-800 text-xs font-bold px-4 py-1.5 rounded-full uppercase">
                Most Popular
              </span>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <IconCrown className="w-5 h-5 text-yellow-400" />
              <h3 className="text-xl font-bold text-gray-800">
                {plans[VipPlan.YEARLY].name}
              </h3>
            </div>

            <div className="min-h-[72px]">
              {/* Original price */}
              <div className="text-sm text-gray-400 line-through">
                1.188.000 VND/year
              </div>

              {/* Discounted price */}
              <div>
                <span className="text-4xl font-bold text-yellow-500">
                  {plans[VipPlan.YEARLY].priceDisplay}
                </span>
                <span className="text-gray-500 ml-1">
                  VND/{plans[VipPlan.YEARLY].duration}
                </span>
              </div>
            </div>

            {/* Savings Badge */}
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 bg-yellow-100 text-yellow-700 text-sm font-medium px-3 py-1.5 rounded-lg">
                <IconGift className="w-4 h-4" />
                {DEFAULT_PLANS[VipPlan.YEARLY].savings}
              </span>
            </div>

            <ul className="space-y-3 mb-8">
              {plans[VipPlan.YEARLY].features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-gray-600">
                  <IconCheck className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSelectPlan(VipPlan.YEARLY)}
              className="w-full text-[15px] bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <IconCrown className="w-5 h-5" />
              Select yearly plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
