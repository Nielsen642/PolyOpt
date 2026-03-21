import { db } from "./db";
import {
  users,
  portfolios,
  positions,
  userAlertState,
  type User,
  type InsertUser,
  type Portfolio,
  type InsertPortfolio,
  type Position,
  type InsertPosition,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserWallet(userId: number, walletAddress: string | null): Promise<User | undefined>;

  getPortfolios(userId: number): Promise<Portfolio[]>;
  getPortfolio(userId: number, id: number): Promise<Portfolio | undefined>;
  createPortfolio(userId: number, portfolio: Omit<InsertPortfolio, "userId">): Promise<Portfolio>;
  
  getAllPositions(userId: number): Promise<Position[]>;
  getPositions(userId: number, portfolioId: number): Promise<Position[]>;
  createPosition(userId: number, portfolioId: number, position: Omit<InsertPosition, 'portfolioId'>): Promise<Position>;

  getAlertState(userId: number): Promise<{
    rulesJson: string;
    eventsJson: string;
    updatedAt: string;
  } | null>;
  upsertAlertState(
    userId: number,
    payload: { rulesJson: string; eventsJson: string },
  ): Promise<{ rulesJson: string; eventsJson: string; updatedAt: string }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [createdUser] = await db.insert(users).values(user).returning();
    return createdUser;
  }

  async updateUserWallet(userId: number, walletAddress: string | null): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ walletAddress })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async getPortfolios(userId: number): Promise<Portfolio[]> {
    return await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  }

  async getPortfolio(userId: number, id: number): Promise<Portfolio | undefined> {
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)));
    return portfolio;
  }

  async createPortfolio(userId: number, portfolio: Omit<InsertPortfolio, "userId">): Promise<Portfolio> {
    const [newPortfolio] = await db
      .insert(portfolios)
      .values({ ...portfolio, userId })
      .returning();
    return newPortfolio;
  }

  async getAllPositions(userId: number): Promise<Position[]> {
    return await db
      .select({ position: positions })
      .from(positions)
      .innerJoin(portfolios, eq(positions.portfolioId, portfolios.id))
      .where(eq(portfolios.userId, userId))
      .then((rows) => rows.map((row) => row.position));
  }

  async getPositions(userId: number, portfolioId: number): Promise<Position[]> {
    return await db
      .select({ position: positions })
      .from(positions)
      .innerJoin(portfolios, eq(positions.portfolioId, portfolios.id))
      .where(and(eq(positions.portfolioId, portfolioId), eq(portfolios.userId, userId)))
      .then((rows) => rows.map((row) => row.position));
  }

  async createPosition(userId: number, portfolioId: number, position: Omit<InsertPosition, 'portfolioId'>): Promise<Position> {
    const portfolio = await this.getPortfolio(userId, portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found for user");
    }

    const [newPosition] = await db.insert(positions).values({
      ...position,
      portfolioId
    }).returning();
    return newPosition;
  }

  async getAlertState(userId: number) {
    const [row] = await db.select().from(userAlertState).where(eq(userAlertState.userId, userId));
    if (!row) return null;
    return {
      rulesJson: row.rulesJson,
      eventsJson: row.eventsJson,
      updatedAt: row.updatedAt,
    };
  }

  async upsertAlertState(
    userId: number,
    payload: { rulesJson: string; eventsJson: string },
  ) {
    const updatedAt = new Date().toISOString();
    const [row] = await db
      .insert(userAlertState)
      .values({
        userId,
        rulesJson: payload.rulesJson,
        eventsJson: payload.eventsJson,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: userAlertState.userId,
        set: {
          rulesJson: payload.rulesJson,
          eventsJson: payload.eventsJson,
          updatedAt,
        },
      })
      .returning();
    return {
      rulesJson: row.rulesJson,
      eventsJson: row.eventsJson,
      updatedAt: row.updatedAt,
    };
  }
}

export const storage = new DatabaseStorage();