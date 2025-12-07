import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { AbstractRepository, User, UserDocument } from '@tradex/database';

@Injectable()
export class UsersRepository extends AbstractRepository<UserDocument> {
  protected readonly logger: any;

  constructor(@InjectModel(User.name) userModel: Model<UserDocument>) {
    super(userModel);
    this.logger = new Logger(UsersRepository.name);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.findOne({ email } as FilterQuery<UserDocument>);
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.findOne({ username } as FilterQuery<UserDocument>);
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.exists({ email } as FilterQuery<UserDocument>);
  }

  async existsByUsername(username: string): Promise<boolean> {
    return this.exists({ username } as FilterQuery<UserDocument>);
  }
}
