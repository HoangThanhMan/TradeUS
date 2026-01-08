import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, SortOrder } from 'mongoose';
import { AbstractRepository, User, UserDocument } from '@tradex/database';

// UsersRepository handles data operations related to User documents in MongoDB
@Injectable()
export class UsersRepository extends AbstractRepository<UserDocument> {
  protected readonly logger: Logger;

  // Initialize the repository with the User model
  constructor(@InjectModel(User.name) userModel: Model<UserDocument>) {
    super(userModel);
    this.logger = new Logger(UsersRepository.name);
  }

  // Find a user by their email address
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.findOne({
      email: email.toLowerCase(),
    } as FilterQuery<UserDocument>);
  }

  // Find a user by their username
  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.findOne({ username } as FilterQuery<UserDocument>);
  }

  // Check if a user exists with the given email
  async existsByEmail(email: string): Promise<boolean> {
    return this.exists({
      email: email.toLowerCase(),
    } as FilterQuery<UserDocument>);
  }

  // Check if a user exists with the given username
  async existsByUsername(username: string): Promise<boolean> {
    return this.exists({ username } as FilterQuery<UserDocument>);
  }

  // Find users with pagination support
  async findWithPagination(
    filterQuery: FilterQuery<UserDocument>,
    skip: number,
    limit: number,
    sort: Record<string, SortOrder> = { createdAt: -1 },
  ): Promise<UserDocument[]> {
    return this.model
      .find(filterQuery)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean<UserDocument[]>();
  }

  // Count users matching a specific filter
  async findByRole(role: string): Promise<UserDocument[]> {
    return this.find({ role } as FilterQuery<UserDocument>);
  }

  // Find all VIP users
  async findVipUsers(): Promise<UserDocument[]> {
    return this.find({ role: 'vip' } as FilterQuery<UserDocument>);
  }

  // Find VIP users whose VIP status has expired
  async findExpiredVipUsers(): Promise<UserDocument[]> {
    return this.find({
      role: 'vip',
      vipExpiry: { $lt: new Date() },
    } as FilterQuery<UserDocument>);
  }

  // Update a user's VIP status and role
  async updateVipStatus(
    userId: string,
    vipExpiry: Date | null,
    role: string,
  ): Promise<UserDocument> {
    return this.findByIdAndUpdate(userId, {
      $set: { vipExpiry, role },
    });
  }

  // Search users by email, username, or name with pagination
  async searchUsers(
    searchTerm: string,
    skip: number,
    limit: number,
  ): Promise<UserDocument[]> {
    const regex = new RegExp(searchTerm, 'i');
    return this.model
      .find({
        $or: [{ email: regex }, { username: regex }, { name: regex }],
      })
      .skip(skip)
      .limit(limit)
      .lean<UserDocument[]>();
  }

  // Count the number of users matching a search term
  async countSearchResults(searchTerm: string): Promise<number> {
    const regex = new RegExp(searchTerm, 'i');
    return this.model.countDocuments({
      $or: [{ email: regex }, { username: regex }, { name: regex }],
    });
  }
}
