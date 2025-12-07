import { Module, DynamicModule, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { User, userSchema } from './schemas/user.schema';

export interface DatabaseModuleOptions {
  uri?: string;
  connectionName?: string;
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(uri: string): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        MongooseModule.forRoot(uri, {
          autoIndex: true,
          retryAttempts: 3,
          retryDelay: 1000,
        }),
        MongooseModule.forFeature([{ name: User.name, schema: userSchema }]),
      ],
      exports: [MongooseModule],
    };
  }

  static forRootAsync(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        MongooseModule.forRootAsync({
          useFactory: (configService: ConfigService) => ({
            uri:
              configService.get<string>('MONGODB_URI') ||
              'mongodb://localhost:27017/tradex',
            autoIndex: true,
            retryAttempts: 3,
            retryDelay: 1000,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
          }),
          inject: [ConfigService],
        }),
        MongooseModule.forFeature([{ name: User.name, schema: userSchema }]),
      ],
      exports: [MongooseModule],
    };
  }

  static forFeature(schemas: { name: string; schema: any }[]): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [MongooseModule.forFeature(schemas)],
      exports: [MongooseModule],
    };
  }
}
