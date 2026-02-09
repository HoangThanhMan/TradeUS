import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, catchError, map } from 'rxjs';
import { AxiosError, AxiosRequestConfig, Method } from 'axios';

export interface ProxyRequestOptions {
  method: Method;
  path: string;
  data?: any;
  headers?: Record<string, string>;
  query?: Record<string, any>;
}

export enum ServiceName {
  USER = 'userService',
  SENTIMENT = 'sentimentService',
  PREDICTION = 'predictionService',
  SUBSCRIPTION = 'subscriptionService',
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly serviceUrls: Record<ServiceName, string>;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.serviceUrls = {
      [ServiceName.USER]: this.configService.get<string>(
        'services.userService',
      )!,
      [ServiceName.SENTIMENT]: this.configService.get<string>(
        'services.sentimentService',
      )!,
      [ServiceName.PREDICTION]: this.configService.get<string>(
        'services.predictionService',
      )!,
      [ServiceName.SUBSCRIPTION]: this.configService.get<string>(
        'services.subscriptionService',
      )!,
    };
  }

  async forward(
    service: ServiceName,
    options: ProxyRequestOptions,
  ): Promise<any> {
    const baseUrl = this.serviceUrls[service];

    if (!baseUrl) {
      throw new HttpException(
        `Service ${service} is not configured`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const url = `${baseUrl}${options.path}`;

    const config: AxiosRequestConfig = {
      method: options.method,
      url,
      data: options.data,
      headers: this.filterHeaders(options.headers || {}),
      params: options.query,
    };

    this.logger.debug(`Proxying ${options.method} request to ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.request(config).pipe(
          map((res) => res.data),
          catchError((error: AxiosError) => {
            this.handleAxiosError(error, service);
            throw error;
          }),
        ),
      );

      return response;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Internal proxy error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private filterHeaders(
    headers: Record<string, string>,
  ): Record<string, string> {
    // Remove headers that shouldn't be forwarded
    const blacklist = ['host', 'content-length', 'connection'];
    const filtered: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (!blacklist.includes(key.toLowerCase())) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  private handleAxiosError(error: AxiosError, service: ServiceName): never {
    const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      (error.response?.data as any)?.message ||
      error.message ||
      'Service unavailable';

    this.logger.error(
      `Error proxying to ${service}: ${status} - ${message}`,
      error.stack,
    );

    if (error.code === 'ECONNREFUSED') {
      throw new HttpException(
        `Service ${service} is unavailable`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    throw new HttpException({ message, service }, status);
  }

  getServiceUrl(service: ServiceName): string {
    return this.serviceUrls[service];
  }

  async healthCheck(service: ServiceName): Promise<boolean> {
    try {
      await this.forward(service, {
        method: 'GET',
        path: '/health',
      });
      return true;
    } catch {
      return false;
    }
  }
}
