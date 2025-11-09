import dotenv from 'dotenv';
import { AppConfig } from '../types/index.js';

dotenv.config();

export function loadConfig(): AppConfig {
  return {
    couchdb: {
      url: process.env.COUCHDB_URL || 'http://localhost:5984',
      username: process.env.COUCHDB_USERNAME || 'admin',
      password: process.env.COUCHDB_PASSWORD || 'password',
      database: process.env.COUCHDB_DATABASE || 'obsidian-livesync',
      passphrase: process.env.COUCHDB_PASSPHRASE,
    },
    sync: {
      interval: parseInt(process.env.SYNC_INTERVAL || '60000', 10),
      autoSyncEnabled: process.env.AUTO_SYNC_ENABLED === 'true',
    },
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
    },
  };
}
