import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';
import { open, Database as SQLiteDatabase } from 'sqlite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Interface for database operations
export interface DBConnection {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<any>;
  close(): Promise<void>;
  isSqlite: boolean;
}

class DatabaseManager {
  private connection: DBConnection | null = null;

  async getConnection(): Promise<DBConnection> {
    if (this.connection) return this.connection;

    const useMySQL = process.env.DB_HOST && process.env.DB_USER;

    if (useMySQL) {
      try {
        console.log('Attempting to connect to MySQL database...');
        const pool = mysql.createPool({
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE,
          port: parseInt(process.env.DB_PORT || '3306'),
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0
        });

        // Test connection
        const conn = await pool.getConnection();
        conn.release();
        console.log('Successfully connected to MySQL database.');

        this.connection = {
          query: async <T>(sql: string, params?: any[]) => {
            const [rows] = await pool.query(sql, params);
            return rows as T[];
          },
          execute: async (sql: string, params?: any[]) => {
            const [result] = await pool.execute(sql, params);
            return result;
          },
          close: async () => {
            await pool.end();
          },
          isSqlite: false
        };
        return this.connection;
      } catch (err: any) {
        console.warn(`MySQL connection failed: ${err.message}. Falling back to SQLite...`);
      }
    } else {
      console.log('MySQL configuration missing. Using SQLite database...');
    }

    // SQLite Fallback
    try {
      const dbPath = path.resolve(__dirname, '../forecast_ai.db');
      console.log(`Initializing SQLite at: ${dbPath}`);
      
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      this.connection = {
        query: async <T>(sql: string, params?: any[]) => {
          // Translate some MySQL syntax to SQLite if needed
          let translatedSql = sql;
          return await db.all<T[]>(translatedSql, params || []);
        },
        execute: async (sql: string, params?: any[]) => {
          return await db.run(sql, params || []);
        },
        close: async () => {
          await db.close();
        },
        isSqlite: true
      };

      console.log('SQLite database initialized successfully.');
      return this.connection;
    } catch (err: any) {
      console.error('Failed to initialize SQLite fallback database:', err);
      throw err;
    }
  }

  async initializeTables(): Promise<void> {
    const db = await this.getConnection();
    
    console.log('Initializing database tables...');
    
    // SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT
    // MySQL uses INT AUTO_INCREMENT PRIMARY KEY
    const autoIncrementType = db.isSqlite 
      ? 'INTEGER PRIMARY KEY AUTOINCREMENT' 
      : 'INT AUTO_INCREMENT PRIMARY KEY';

    // 1. Users Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id ${autoIncrementType},
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Marketing Data Table (aggregated daily stats)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS marketing_data (
        id ${autoIncrementType},
        date TEXT NOT NULL,
        google_spend REAL DEFAULT 0,
        google_revenue REAL DEFAULT 0,
        meta_spend REAL DEFAULT 0,
        meta_revenue REAL DEFAULT 0,
        msft_spend REAL DEFAULT 0,
        msft_revenue REAL DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        total_revenue REAL DEFAULT 0,
        total_roas REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Campaign Performance Table (detailed breakdown)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS campaign_performance (
        id ${autoIncrementType},
        campaign_name VARCHAR(255) NOT NULL,
        campaign_type VARCHAR(100) NOT NULL,
        spend REAL DEFAULT 0,
        revenue REAL DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Forecast Runs Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS forecast_runs (
        id ${autoIncrementType},
        run_date TEXT NOT NULL,
        forecast_period INTEGER NOT NULL,
        google_budget REAL DEFAULT 0,
        meta_budget REAL DEFAULT 0,
        msft_budget REAL DEFAULT 0,
        expected_revenue REAL DEFAULT 0,
        expected_roas REAL DEFAULT 0,
        min_revenue REAL DEFAULT 0,
        max_revenue REAL DEFAULT 0,
        confidence_interval REAL DEFAULT 0.95,
        accuracy REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables verified/created successfully.');
  }
}

export const dbManager = new DatabaseManager();
