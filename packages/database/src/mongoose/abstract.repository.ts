import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';

// Interface for logger to avoid version conflicts between packages
export interface ILogger {
  warn(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export abstract class AbstractRepository<TDocument> {
  protected abstract readonly logger: ILogger;

  constructor(protected readonly model: Model<TDocument>) {}

  private isValidObjectId(id: string): boolean {
    return (
      Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id
    );
  }

  async create(document: Omit<TDocument, '_id'>): Promise<TDocument> {
    const createdDocument = new this.model({
      ...document,
      _id: new Types.ObjectId(),
    });
    return (await createdDocument.save()) as unknown as TDocument;
  }

  async findOne(
    filterQuery: FilterQuery<TDocument>,
  ): Promise<TDocument | null> {
    const document = await this.model.findOne(filterQuery).lean<TDocument>();
    return document;
  }

  async findOneAndUpdate(
    filterQuery: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
  ): Promise<TDocument> {
    const document = await this.model
      .findOneAndUpdate(filterQuery, update, { new: true })
      .lean<TDocument>();

    if (!document) {
      this.logger.warn(`Document not found with filterQuery:`, filterQuery);
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async find(filterQuery: FilterQuery<TDocument>): Promise<TDocument[]> {
    return this.model.find(filterQuery).lean<TDocument[]>();
  }

  async findById(id: string): Promise<TDocument | null> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const document = await this.model.findById(id).lean<TDocument>();
    return document;
  }

  async findByIdAndUpdate(
    id: string,
    update: UpdateQuery<TDocument>,
  ): Promise<TDocument> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const document = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .lean<TDocument>();

    if (!document) {
      this.logger.warn(`Document not found with id: ${id}`);
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async delete(filterQuery: FilterQuery<TDocument>): Promise<boolean> {
    const { deletedCount } = await this.model.deleteOne(filterQuery);
    return deletedCount > 0;
  }

  async deleteById(id: string): Promise<boolean> {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const { deletedCount } = await this.model.deleteOne({
      _id: id,
    } as FilterQuery<TDocument>);
    return deletedCount > 0;
  }

  async exists(filterQuery: FilterQuery<TDocument>): Promise<boolean> {
    const count = await this.model.countDocuments(filterQuery);
    return count > 0;
  }

  async count(filterQuery: FilterQuery<TDocument>): Promise<number> {
    return this.model.countDocuments(filterQuery);
  }
}
