import { Logger, NotFoundException } from '@nestjs/common';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';

export abstract class AbstractRepository<TDocument> {
  protected abstract readonly logger: Logger;

  constructor(protected readonly model: Model<TDocument>) {}

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
    const document = await this.model.findById(id).lean<TDocument>();
    return document;
  }

  async findByIdAndUpdate(
    id: string,
    update: UpdateQuery<TDocument>,
  ): Promise<TDocument> {
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
