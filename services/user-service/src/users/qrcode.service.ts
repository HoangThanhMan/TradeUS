import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';

export interface VietQRData {
  bankId: string;
  accountNumber: string;
  accountName: string;
  amount?: number;
  description?: string;
}

export interface QRGenerateOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

@Injectable()
export class QrCodeService {
  private readonly logger = new Logger(QrCodeService.name);

  // Bank BIN codes for VietQR (common banks)
  private readonly bankBinCodes: Record<string, string> = {
    'vietcombank': '970436',
    'vcb': '970436',
    'techcombank': '970407',
    'tcb': '970407',
    'mbbank': '970422',
    'mb': '970422',
    'acb': '970416',
    'vpbank': '970432',
    'tpbank': '970423',
    'sacombank': '970403',
    'stb': '970403',
    'hdbank': '970437',
    'vietinbank': '970415',
    'ctg': '970415',
    'bidv': '970418',
    'agribank': '970405',
    'vba': '970405',
    'oceanbank': '970414',
    'shb': '970443',
    'eximbank': '970431',
    'msb': '970426',
    'namabank': '970428',
    'pvcombank': '970412',
    'vib': '970441',
    'baoviet': '970438',
    'seabank': '970440',
    'abbank': '970425',
    'baca': '970409',
    'dongabank': '970406',
    'gpbank': '970408',
    'lpb': '970449',
    'kienlongbank': '970452',
    'ncb': '970419',
    'ocb': '970448',
    'publicbank': '970439',
    'saigonbank': '970400',
    'scb': '970429',
    'uob': '970458',
    'woori': '970457',
    'cimb': '422589',
    'kookmin': '970462',
    'cake': '546034',
    'ubank': '546035',
    'momo': '900010',
  };

  /**
   * Generate VietQR code for bank transfer
   * VietQR format based on EMV QR Code standard
   */
  async generateVietQR(
    data: VietQRData,
    options?: QRGenerateOptions,
  ): Promise<string> {
    this.logger.log(`Generating VietQR for account: ${data.accountNumber}`);

    const bankBin = this.getBankBin(data.bankId);
    const qrContent = this.buildVietQRContent(
      bankBin,
      data.accountNumber,
      data.accountName,
      data.amount,
      data.description,
    );

    return this.generateQRCode(qrContent, options);
  }

  /**
   * Generate a simple QR code from any text content
   */
  async generateSimpleQR(
    content: string,
    options?: QRGenerateOptions,
  ): Promise<string> {
    return this.generateQRCode(content, options);
  }

  /**
   * Generate QR code for payment with custom format
   */
  async generatePaymentQR(
    bankName: string,
    accountNumber: string,
    accountHolder: string,
    amount: number,
    description?: string,
  ): Promise<string> {
    // Create a readable payment info string
    const paymentInfo = [
      `Bank: ${bankName}`,
      `STK: ${accountNumber}`,
      `CTK: ${accountHolder}`,
      `Amount: ${amount.toLocaleString('vi-VN')} VND`,
      description ? `ND: ${description}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return this.generateQRCode(paymentInfo, {
      width: 300,
      margin: 2,
    });
  }

  /**
   * Build VietQR content string following EMV QR Code standard
   */
  private buildVietQRContent(
    bankBin: string,
    accountNumber: string,
    accountName: string,
    amount?: number,
    description?: string,
  ): string {
    // VietQR EMV format
    // This is a simplified version - production should follow full EMV spec
    const parts: string[] = [];

    // Payload Format Indicator
    parts.push('000201');

    // Point of Initiation (12 = Dynamic QR)
    parts.push('010212');

    // Merchant Account Information for VietQR
    const merchantAccInfo = this.buildMerchantAccountInfo(
      bankBin,
      accountNumber,
    );
    parts.push(`38${this.padLength(merchantAccInfo.length)}${merchantAccInfo}`);

    // Transaction Currency (704 = VND)
    parts.push('5303704');

    // Transaction Amount (if provided)
    if (amount && amount > 0) {
      const amountStr = amount.toString();
      parts.push(`54${this.padLength(amountStr.length)}${amountStr}`);
    }

    // Country Code
    parts.push('5802VN');

    // Additional Data Field (description)
    if (description) {
      const additionalData = `08${this.padLength(description.length)}${description}`;
      parts.push(`62${this.padLength(additionalData.length)}${additionalData}`);
    }

    // Build content without CRC
    const contentWithoutCRC = parts.join('') + '6304';

    // Calculate CRC16
    const crc = this.calculateCRC16(contentWithoutCRC);

    return contentWithoutCRC + crc;
  }

  /**
   * Build Merchant Account Information (Tag 38)
   */
  private buildMerchantAccountInfo(
    bankBin: string,
    accountNumber: string,
  ): string {
    // GUID for NAPAS
    const napasGuid = 'A000000727';
    const guid = `00${this.padLength(napasGuid.length)}${napasGuid}`;

    // Bank BIN
    const bin = `01${this.padLength(bankBin.length)}${bankBin}`;

    // Account Number
    const acc = `02${this.padLength(accountNumber.length)}${accountNumber}`;

    return guid + bin + acc;
  }

  /**
   * Get bank BIN code from bank name/id
   */
  private getBankBin(bankId: string): string {
    const normalizedBankId = bankId.toLowerCase().replace(/\s+/g, '');

    // Check if it's already a BIN code (6 digits)
    if (/^\d{6}$/.test(bankId)) {
      return bankId;
    }

    // Look up in our bank codes
    for (const [key, bin] of Object.entries(this.bankBinCodes)) {
      if (normalizedBankId.includes(key) || key.includes(normalizedBankId)) {
        return bin;
      }
    }

    // Default to Vietcombank if not found
    this.logger.warn(`Bank BIN not found for: ${bankId}, using default`);
    return '970436';
  }

  /**
   * Pad length to 2 digits
   */
  private padLength(length: number): string {
    return length.toString().padStart(2, '0');
  }

  /**
   * Calculate CRC16-CCITT checksum
   */
  private calculateCRC16(content: string): string {
    let crc = 0xffff;
    const polynomial = 0x1021;

    for (let i = 0; i < content.length; i++) {
      crc ^= content.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ polynomial) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Generate QR code as base64 data URL
   */
  private async generateQRCode(
    content: string,
    options?: QRGenerateOptions,
  ): Promise<string> {
    const qrOptions: QRCode.QRCodeToDataURLOptions = {
      width: options?.width || 256,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#000000',
        light: options?.color?.light || '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    };

    try {
      const dataUrl = await QRCode.toDataURL(content, qrOptions);
      return dataUrl;
    } catch (error) {
      this.logger.error(`Failed to generate QR code: ${error}`);
      throw error;
    }
  }

  /**
   * Generate QR code as SVG string
   */
  async generateQRCodeSVG(
    content: string,
    options?: QRGenerateOptions,
  ): Promise<string> {
    const qrOptions: QRCode.QRCodeToStringOptions = {
      type: 'svg',
      width: options?.width || 256,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#000000',
        light: options?.color?.light || '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    };

    try {
      return await QRCode.toString(content, qrOptions);
    } catch (error) {
      this.logger.error(`Failed to generate QR code SVG: ${error}`);
      throw error;
    }
  }
}
